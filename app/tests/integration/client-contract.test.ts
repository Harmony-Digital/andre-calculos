import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clientContractFixture } from "../e2e/client-contract-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql } from "../e2e/notification-helper";
import {
  contractReceiptSchema,
  clientContractContextSchema,
} from "@/modules/clients/contract";
let fixture: Awaited<ReturnType<typeof clientContractFixture>>;
const sessions: Record<string, SupabaseClient> = {};
type Sample = Awaited<ReturnType<typeof fixture.create>>;
async function whileLocked<T>(
  sql: string,
  operation: () => PromiseLike<T>,
  release?: { sql: string; exitCode: number },
) {
  const name = "contract-lock-" + randomUUID();
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_andre-calculos",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { env: process.env, stdio: ["pipe", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", () => {});
  const done = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  let pending: Promise<T> | undefined;
  try {
    child.stdin.write(
      `set application_name='${name}'; begin; ${sql}\n\\echo CONTRACT_LOCK_HELD\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("CONTRACT_LOCK_HELD");
    pending = Promise.resolve(operation());
    await expect
      .poll(
        () =>
          localNotificationSql(
            `select count(*) from pg_stat_activity b where b.wait_event_type='Lock' and exists(select 1 from pg_stat_activity a where a.application_name='${name}' and a.pid=any(pg_blocking_pids(b.pid)));`,
          ),
        { timeout: 3000 },
      )
      .toBe("1");
    child.stdin.end(`${release?.sql ?? "commit;"}\n\\q\n`);
    expect(await done).toBe(release?.exitCode ?? 0);
    return await pending;
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (pending) await pending;
  }
}
const accept = async (sample: Sample) => {
  const result = await fixture.db.rpc("accept_quote_system", sample.args());
  expect(result.error).toBeNull();
  return result.data;
};
const status = async (sample: Sample) =>
  (
    await fixture.db
      .from("orders")
      .select("status")
      .eq("id", sample.order_id)
      .single()
  ).data!.status;
const setContract = async (patch: Parameters<typeof fixture.args>[0] = {}) =>
  sessions.calculator.rpc("set_client_contract", await fixture.args(patch));
const contexts = async () => {
  const result = await sessions.calculator.rpc("get_client_contract_context", {
    target_clients: [fixture.owner.id],
  });
  expect(result.error).toBeNull();
  return clientContractContextSchema.array().parse(result.data)[0];
};
const doc = async (
  sample: Sample,
  options: { folder?: "case" | "triage"; hash?: string } = {},
) => {
  const id = randomUUID();
  expect(
    (
      await fixture.db.from("files").insert({
        id,
        process_id: sample.process_id,
        order_id: sample.order_id,
        folder: options.folder ?? "case",
        uploaded_by: sample.actor,
        name: "Processo exclusivamente inventado.pdf",
        mime: "application/pdf",
        path: `${sample.actor}/${sample.process_id}/${id}/contrato-ficticio.pdf`,
        size_bytes: 100,
        expected_sha256: "0".repeat(64),
        upload_status: "pending",
      })
    ).error,
  ).toBeNull();
  return {
    id,
    complete: () =>
      fixture.db.rpc("complete_file_system", {
        actor: sample.actor,
        target_file: id,
        observed_size: 100,
        observed_hash: options.hash ?? "0".repeat(64),
      }),
  };
};
beforeAll(async () => {
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
});
afterAll(async () => {
  await Promise.all(
    Object.values(sessions).map((db) => db.auth.signOut({ scope: "local" })),
  );
});
beforeEach(async () => {
  fixture = await clientContractFixture();
});
afterEach(async () => {
  if (fixture) await fixture.cleanup();
});

it("somente calculista altera e consulta; API de serviço não escreve condição/revisão", async () => {
  const request = await fixture.args();
  const anonymous = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  for (const db of [
    sessions.client,
    sessions.clientB,
    sessions.admin,
    anonymous,
    fixture.db,
  ]) {
    expect((await db.rpc("set_client_contract", request)).error).not.toBeNull();
    expect(
      (
        await db.rpc("get_client_contract_context", {
          target_clients: [fixture.owner.id],
        })
      ).error,
    ).not.toBeNull();
  }
  for (const patch of [{ has_contract: true }, { contract_revision: 7 }])
    expect(
      (
        await fixture.db
          .from("clients")
          .update(patch)
          .eq("id", fixture.owner.id)
      ).error,
    ).not.toBeNull();
  expect(
    (
      await fixture.db.from("clients").insert({
        id: randomUUID(),
        owner_id: fixture.owner.owner_id,
        kind: "person",
        has_contract: true,
      })
    ).error,
  ).not.toBeNull();
  expect(
    localNotificationSql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name='client_contract_changes' and grantee in ('anon','authenticated','service_role');",
    ),
  ).toBe("0");
  const invalidOwner = (
    await fixture.db
      .from("clients")
      .select("id")
      .eq("owner_id", fixture.calculator.id)
      .maybeSingle()
  ).data;
  if (invalidOwner)
    expect(
      (await setContract({ target_client: invalidOwner.id })).error,
    ).not.toBeNull();
  expect((await contexts()).hasContract).toBe(false);
});
it("motivo obrigatório, revisão, condição efetiva e UUID são validados sem gravar", async () => {
  const base = await fixture.args();
  for (const patch of [
    { reason: "  " },
    { reason: "\n\t\r" },
    { reason: "\u00a0\u00a0\u00a0" },
    { reason: "a".repeat(1001) },
    { expected_revision: -1 },
    { request_id: null },
    { has_contract: null },
    { has_contract: false },
    { expected_revision: base.expected_revision + 1 },
  ])
    expect(
      (
        await sessions.calculator.rpc("set_client_contract", {
          ...base,
          ...patch,
        } as typeof base)
      ).error,
    ).not.toBeNull();
  expect((await contexts()).revision).toBe(fixture.owner.contract_revision);
  expect(
    localNotificationSql(
      `select count(*) from private.client_contract_changes where client_id='${fixture.owner.id}'::uuid;`,
    ),
  ).toBe("0");
});
it("contrato anterior ao aceite exige documento; registro não cria pagamento nem aceite", async () => {
  const sample = await fixture.create();
  const changed = await setContract({
    reason: "  Contrato fictício antes do aceite.  ",
  });
  expect(changed.error).toBeNull();
  const receipt = contractReceiptSchema.parse(changed.data);
  expect(receipt).toMatchObject({
    hasContract: true,
    priorHasContract: false,
    reason: "Contrato fictício antes do aceite.",
    changedBy: fixture.calculator.id,
    effects: [],
  });
  expect(await status(sample)).toBe("quoted");
  const accepted = await accept(sample);
  expect(accepted).toMatchObject({
    hasContract: true,
    status: "awaiting_documents",
  });
  const file = await doc(sample);
  expect((await file.complete()).error).toBeNull();
  expect(await status(sample)).toBe("queued");
  expect(
    (
      await fixture.db
        .from("payments")
        .select("id")
        .eq("order_id", sample.order_id)
    ).data,
  ).toEqual([]);
});
it("contrato posterior ao aceite comum e documento anterior libera fila sem alterar recibo", async () => {
  const sample = await fixture.create({ documents: true });
  const original = await accept(sample);
  expect(original).toMatchObject({ hasContract: false });
  const before = localNotificationSql(
    `select to_jsonb(a) from private.quote_acceptances a where quote_id='${sample.id}'::uuid;`,
  );
  const request = await fixture.args({
    reason: "Motivo administrativo privado fictício.",
  });
  const results = await Promise.all([
    sessions.calculator.rpc("set_client_contract", request),
    sessions.calculator.rpc("set_client_contract", request),
  ]);
  expect(results.map((r) => r.error)).toEqual([null, null]);
  expect(results[0].data).toEqual(results[1].data);
  expect(contractReceiptSchema.parse(results[0].data).effects).toEqual([
    {
      orderId: sample.order_id,
      processId: sample.process_id,
      from: "awaiting_payment",
      to: "queued",
    },
  ]);
  expect(await status(sample)).toBe("queued");
  expect(
    localNotificationSql(
      `select to_jsonb(a) from private.quote_acceptances a where quote_id='${sample.id}'::uuid;`,
    ),
  ).toBe(before);
  const notice = await fixture.db
    .from("notifications")
    .select("data,status,attempts")
    .eq("dedup_key", `queued:${sample.order_id}:email`);
  expect(notice.data).toHaveLength(1);
  expect(notice.data![0]).toMatchObject({ status: "pending", attempts: 0 });
  expect(JSON.stringify(notice.data)).not.toContain(request.reason);
  const timeline = await fixture.db
    .from("timeline_events")
    .select("data")
    .eq("order_id", sample.order_id);
  expect(JSON.stringify(timeline.data)).not.toContain(request.reason);
  expect(
    (
      await fixture.db
        .from("payments")
        .select("id")
        .eq("order_id", sample.order_id)
    ).data,
  ).toEqual([]);
  expect((await contexts()).canRemove).toBe(false);
});
it("documento posterior ao novo contrato revalida aceite e metadados", async () => {
  const sample = await fixture.create();
  const original = await accept(sample);
  const changed = await setContract();
  expect(changed.error).toBeNull();
  expect(await status(sample)).toBe("awaiting_documents");
  const technical = await doc(sample, { folder: "triage" });
  expect((await technical.complete()).error).toBeNull();
  expect(await status(sample)).toBe("awaiting_documents");
  const invalid = await doc(sample, { hash: "1".repeat(64) });
  expect((await invalid.complete()).error).not.toBeNull();
  expect(await status(sample)).toBe("awaiting_documents");
  const file = await doc(sample);
  expect((await file.complete()).error).toBeNull();
  expect(await status(sample)).toBe("queued");
  expect(original).toMatchObject({ hasContract: false });
});
it("simulação e pedido sem aceite nunca entram na fila", async () => {
  const legacy = await fixture.create({ context: false, documents: true });
  expect(
    (
      await fixture.db
        .from("quotes")
        .update({
          is_simulation: true,
          proposal_snapshot: { ...legacy.proposal, mode: "fixture" },
        })
        .eq("id", legacy.id)
    ).error,
  ).toBeNull();
  const pending = await fixture.create({ documents: true });
  expect((await setContract()).error).toBeNull();
  expect(await status(legacy)).toBe("quoted");
  expect(await status(pending)).toBe("quoted");
  expect(
    (
      await fixture.db
        .from("quotes")
        .select("accepted_at")
        .in("id", [legacy.id, pending.id])
    ).data?.every((q) => q.accepted_at === null),
  ).toBe(true);
});
it("replay antigo recupera histórico depois de retirada sem desfazer condição atual", async () => {
  const sample = await fixture.create();
  await accept(sample);
  const request = await fixture.args();
  const first = await sessions.calculator.rpc("set_client_contract", request);
  expect(first.error).toBeNull();
  expect(() =>
    localNotificationSql(
      `update private.client_contract_changes set reason='Motivo adulterado' where id='${request.request_id}'::uuid;`,
    ),
  ).toThrow();
  expect(await status(sample)).toBe("awaiting_documents");
  const removed = await setContract({
    has_contract: false,
    reason: "Retirada fictícia antes de começar o trabalho.",
  });
  expect(removed.error).toBeNull();
  expect(await status(sample)).toBe("awaiting_payment");
  const old = await sessions.calculator.rpc("set_client_contract", request);
  expect(old.data).toEqual(first.data);
  expect((await contexts()).hasContract).toBe(false);
  const otherClient = (
    await fixture.db
      .from("clients")
      .select("id,profile:profiles!clients_owner_id_fkey!inner(role)")
      .eq("profile.role", "client")
      .neq("id", fixture.owner.id)
      .limit(1)
      .single()
  ).data!;
  expect(
    (
      await sessions.calculator.rpc("set_client_contract", {
        ...request,
        target_client: otherClient.id,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await sessions.calculator.rpc("set_client_contract", {
        ...request,
        reason: "Mudou o motivo desta tentativa.",
      })
    ).error?.code,
  ).toBe("PT409");
  const file = await doc(sample);
  expect((await file.complete()).error).toBeNull();
  expect(await status(sample)).toBe("awaiting_payment");
});
it("duas intenções concorrentes: uma revisão vence e a outra não sobrescreve", async () => {
  await fixture.create();
  const request = await fixture.args();
  const other = await fixture.args({
    expected_revision: request.expected_revision,
    reason: "Outra intenção fictícia simultânea.",
  });
  const results = await Promise.all([
    sessions.calculator.rpc("set_client_contract", request),
    sessions.calculator.rpc("set_client_contract", other),
  ]);
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  expect(results.find((r) => r.error)?.error?.code).toBe("PT409");
  expect((await contexts()).revision).toBe(request.expected_revision + 1);
});
it("não retira condição de pedidos na fila nem altera pagamento parcial histórico", async () => {
  const sample = await fixture.create({ documents: true });
  await accept(sample);
  const paymentId = randomUUID();
  expect(
    (
      await fixture.db.from("payments").insert({
        id: paymentId,
        order_id: sample.order_id,
        kind: "deposit",
        amount_cents: 100,
        status: "confirmed",
        method: "pix_manual",
        confirmed_by: fixture.calculator.id,
        confirmed_at: new Date().toISOString(),
      })
    ).error,
  ).toBeNull();
  const paid = (
    await fixture.db.from("payments").select("*").eq("id", paymentId)
  ).data;
  expect((await setContract()).error).toBeNull();
  expect(await status(sample)).toBe("queued");
  expect((await setContract({ has_contract: false })).error?.code).toBe(
    "PT409",
  );
  expect((await contexts()).hasContract).toBe(true);
  expect(
    (await fixture.db.from("payments").select("*").eq("id", paymentId)).data,
  ).toEqual(paid);
});
it("retirada antes do trabalho preserva sinal já cumprido e exige documento", async () => {
  const sample = await fixture.create();
  await accept(sample);
  expect(
    (
      await sessions.calculator.rpc("confirm_manual_deposit", {
        target_quote: sample.id,
        expected_context: sample.contextHash,
        expected_remaining_cents: sample.proposal.depositCents,
        request_id: randomUUID(),
        confirmed: true,
      })
    ).error,
  ).toBeNull();
  expect((await setContract()).error).toBeNull();
  expect(
    (
      await setContract({
        has_contract: false,
        reason: "Retirada fictícia com sinal já confirmado.",
      })
    ).error,
  ).toBeNull();
  expect(await status(sample)).toBe("awaiting_documents");
  const file = await doc(sample);
  expect((await file.complete()).error).toBeNull();
  expect(await status(sample)).toBe("queued");
});
it("vários pedidos: falha no último aviso reverte condição, fila, recibo e auditoria", async () => {
  const a = await fixture.create({ documents: true });
  const b = await fixture.create({ documents: true });
  await accept(a);
  await accept(b);
  const request = await fixture.args();
  const lastId = [a.order_id, b.order_id].sort()[1];
  localNotificationSql(
    `create function private.fixture_fail_contract_notice() returns trigger language plpgsql set search_path='' as $$ begin if new.dedup_key='queued:${lastId}:email' then raise exception 'Falha sintética no último aviso'; end if; return new; end $$; create trigger fixture_fail_contract_notice before insert on public.notifications for each row execute function private.fixture_fail_contract_notice();`,
  );
  try {
    expect(
      (await sessions.calculator.rpc("set_client_contract", request)).error,
    ).not.toBeNull();
    expect((await contexts()).hasContract).toBe(false);
    expect(await status(a)).toBe("awaiting_payment");
    expect(await status(b)).toBe("awaiting_payment");
    expect(
      localNotificationSql(
        `select count(*) from private.client_contract_changes where id='${request.request_id}'::uuid;`,
      ),
    ).toBe("0");
    expect(
      (
        await fixture.db
          .from("notifications")
          .select("id")
          .in("dedup_key", [
            `queued:${a.order_id}:email`,
            `queued:${b.order_id}:email`,
          ])
      ).data,
    ).toEqual([]);
  } finally {
    localNotificationSql(
      "drop trigger fixture_fail_contract_notice on public.notifications; drop function private.fixture_fail_contract_notice();",
    );
  }
  const success = await sessions.calculator.rpc("set_client_contract", request);
  expect(success.error).toBeNull();
  expect(contractReceiptSchema.parse(success.data).effects).toHaveLength(2);
});
it("contrato concorrente com confirmação de upload ou sinal gera uma única entrada na fila", async () => {
  const sample = await fixture.create();
  await accept(sample);
  const file = await doc(sample);
  const results = await Promise.all([setContract(), file.complete()]);
  expect(results.map((r) => r.error)).toEqual([null, null]);
  expect(await status(sample)).toBe("queued");
  expect(
    (
      await fixture.db
        .from("notifications")
        .select("id")
        .eq("dedup_key", `queued:${sample.order_id}:email`)
    ).data,
  ).toHaveLength(1);
  // A confirmação já em voo pode perder para o contrato; nenhum novo recebimento é presumido.
  const another = await fixture.create({ documents: true });
  await accept(another);
  const concurrent = await Promise.all([
    setContract(),
    sessions.calculator.rpc("confirm_manual_deposit", {
      target_quote: another.id,
      expected_context: another.contextHash,
      expected_remaining_cents: another.proposal.depositCents,
      request_id: randomUUID(),
      confirmed: true,
    }),
  ]);
  expect(concurrent[0].error).toBeNull();
  expect(await status(another)).toBe("queued");
  expect(
    (
      await fixture.db
        .from("payments")
        .select("id")
        .eq("order_id", another.order_id)
    ).data!.length,
  ).toBeLessThanOrEqual(1);
  expect(
    (
      await fixture.db
        .from("notifications")
        .select("id")
        .eq("dedup_key", `queued:${another.order_id}:email`)
    ).data,
  ).toHaveLength(1);
});
it("papel do dono alterado sob lock é reconferido antes de gravar contrato", async () => {
  await fixture.create();
  const request = await fixture.args();
  try {
    const result = await whileLocked(
      `update public.profiles set role='admin' where id='${fixture.owner.owner_id}'::uuid;`,
      () => sessions.calculator.rpc("set_client_contract", request),
    );
    expect(result.error).not.toBeNull();
    expect(
      localNotificationSql(
        `select has_contract::text from public.clients where id='${fixture.owner.id}'::uuid;`,
      ),
    ).toBe("false");
    expect(
      localNotificationSql(
        `select count(*) from private.client_contract_changes where id='${request.request_id}'::uuid;`,
      ),
    ).toBe("0");
  } finally {
    localNotificationSql(
      `update public.profiles set role='client' where id='${fixture.owner.owner_id}'::uuid;`,
    );
  }
}, 12000);
it("retirada vê parcela confirmada durante lock e mantém a espera de documento", async () => {
  const sample = await fixture.create({ contract: true });
  await accept(sample);
  const id = randomUUID();
  expect(
    (
      await fixture.db.from("payments").insert({
        id,
        order_id: sample.order_id,
        kind: "deposit",
        method: "pix_manual",
        amount_cents: sample.proposal.depositCents,
        status: "pending",
      })
    ).error,
  ).toBeNull();
  const request = await fixture.args({
    has_contract: false,
    reason: "Retirada fictícia com sinal concorrente.",
  });
  const result = await whileLocked(
    `update public.payments set status='confirmed' where id='${id}'::uuid;`,
    () => sessions.calculator.rpc("set_client_contract", request),
  );
  expect(result.error).toBeNull();
  expect(contractReceiptSchema.parse(result.data).effects).toEqual([]);
  expect(await status(sample)).toBe("awaiting_documents");
  expect((await contexts()).hasContract).toBe(false);
  expect(
    (
      await fixture.db
        .from("payments")
        .select("id,status,amount_cents")
        .eq("order_id", sample.order_id)
    ).data,
  ).toEqual([
    { id, status: "confirmed", amount_cents: sample.proposal.depositCents },
  ]);
}, 12000);
it("parcela pendente não troca de pedido durante cadastro concorrente de contrato", async () => {
  const a = await fixture.create();
  const b = await fixture.create();
  await accept(a);
  await accept(b);
  const id = randomUUID();
  expect(
    (
      await fixture.db.from("payments").insert({
        id,
        order_id: a.order_id,
        kind: "deposit",
        method: "pix_manual",
        amount_cents: 100,
        status: "pending",
      })
    ).error,
  ).toBeNull();
  const request = await fixture.args();
  const result = await whileLocked(
    `select id from public.payments where id='${id}'::uuid for update;`,
    () => sessions.calculator.rpc("set_client_contract", request),
    {
      sql: `update public.payments set order_id='${b.order_id}'::uuid where id='${id}'::uuid;`,
      exitCode: 3,
    },
  );
  expect(result.error).toBeNull();
  expect(await status(a)).toBe("awaiting_documents");
  expect(await status(b)).toBe("awaiting_documents");
  expect(
    (
      await fixture.db
        .from("payments")
        .select("order_id,status,amount_cents")
        .eq("id", id)
        .single()
    ).data,
  ).toEqual({ order_id: a.order_id, status: "pending", amount_cents: 100 });
  expect(
    (
      await fixture.db
        .from("payments")
        .update({ order_id: b.order_id })
        .eq("id", id)
    ).error,
  ).not.toBeNull();
}, 12000);
