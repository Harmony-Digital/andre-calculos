import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  financialJourneyFixture,
  type FinancialScenario,
} from "../e2e/financial-journey-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { removeLocalUser } from "../e2e/local-helper";
import { contractReceiptSchema } from "@/modules/clients/contract";
let f: Awaited<ReturnType<typeof financialJourneyFixture>>;
let calculator: SupabaseClient;
const requests = new Set<string>();
const service = `select set_config('request.jwt.claims','{"role":"service_role"}',true);`;
beforeEach(async () => {
  requests.clear();
  f = await financialJourneyFixture();
  calculator = await quoteSession("calculator");
  await f.observe("received");
  await f.createOrigin();
  await f.apply();
  await f.bind();
  await f.resolve();
}, 60000);
afterEach(async () => {
  try {
    if (requests.size) {
      const ids = [...requests].map((id) => `'${id}'`).join(",");
      sql(
        `delete from public.audit_log where action='client_contract_changed' and target_id in(${ids});delete from private.client_contract_changes where id in(${ids});`,
      );
    }
    await calculator?.auth.signOut({ scope: "local" });
  } finally {
    if (f) await f.cleanup();
  }
}, 60000);
const snapshot = () =>
  sql(
    `select json_build_object('status',(select status from public.orders where id='${f.sample.order_id}'),'contract',(select has_contract from public.clients where id='${f.owner.id}'),'revision',(select contract_revision from public.clients where id='${f.owner.id}'),'queue',(select count(*) from public.audit_log where action='order_queued' and target_id='${f.sample.order_id}'),'notice',(select count(*) from public.notifications where dedup_key='queued:${f.sample.order_id}:email'),'files',(select coalesce(json_agg(json_build_object('id',id,'state',upload_status,'hash',sha256) order by id),'[]'::json) from public.files where process_id='${f.sample.process_id}'));`,
  );
async function document(sample = f.sample, folder = "case", bound = true) {
  const id = randomUUID();
  expect(
    (
      await f.db.from("files").insert({
        id,
        process_id: sample.process_id,
        order_id: bound ? sample.order_id : null,
        uploaded_by: f.owner.owner_id,
        name: "Documento fictício de coordenação.pdf",
        mime: "application/pdf",
        path: `${f.owner.owner_id}/${sample.process_id}/${id}/coordenacao.pdf`,
        folder,
        size_bytes: 100,
        expected_sha256: "0".repeat(64),
        upload_status: "pending",
      })
    ).error,
  ).toBeNull();
  return {
    id,
    args: {
      target_file: id,
      actor: f.owner.owner_id,
      observed_hash: "0".repeat(64),
      observed_size: 100,
    },
  };
}
async function complete(d: Awaited<ReturnType<typeof document>>) {
  return f.db.rpc("complete_file_system", d.args);
}
const contractArgs = (flag: boolean) => {
  const request_id = randomUUID();
  requests.add(request_id);
  return {
    target_client: f.owner.id,
    has_contract: flag,
    reason: "Condição fictícia para coordenação financeira.",
    expected_revision: Number(
      sql(
        `select contract_revision from public.clients where id='${f.owner.id}';`,
      ),
    ),
    request_id,
  };
};
async function contract(flag: boolean) {
  const args = contractArgs(flag);
  const r = await calculator.rpc("set_client_contract", args);
  expect(r.error).toBeNull();
  return { args, receipt: contractReceiptSchema.parse(r.data) };
}
async function move(scenario: FinancialScenario) {
  await f.observe(scenario);
  await f.apply();
}
it.each([
  ["current", 12501],
  ["refund_partial", 11500],
  ["refund_full", 0],
  ["refund_pending", null],
  ["unknown", null],
  ["chargeback_debit", 10500],
] as const)(
  "upload após %s usa crédito %s, preservando integridade e RF34",
  async (scenario, credit) => {
    await move(scenario);
    const d = await document();
    expect((await complete(d)).error).toBeNull();
    const state = JSON.parse(snapshot());
    expect(state.files).toEqual([
      { id: d.id, state: "uploaded", hash: "0".repeat(64) },
    ]);
    expect(f.view().projection.depositCreditCents).toBe(credit);
    expect(state.status).toBe(
      credit !== null && credit >= 12501 ? "queued" : "awaiting_documents",
    );
    expect(state.queue).toBe(credit !== null && credit >= 12501 ? 1 : 0);
    const before = snapshot();
    expect((await complete(d)).error).toBeNull();
    expect(snapshot()).toBe(before);
  },
  30000,
);
it.each(["refund_partial", "refund_full", "unknown"] as const)(
  "retirada de contrato após %s não reconta legado confirmado",
  async (scenario) => {
    await contract(true);
    await move(scenario);
    expect(
      (
        await f.db
          .from("payments")
          .select("status")
          .eq("order_id", f.sample.order_id)
      ).data,
    ).toEqual([{ status: "confirmed" }]);
    const result = await contract(false);
    expect(f.view().status).toBe("awaiting_payment");
    expect(result.receipt.effects).toHaveLength(1);
    const before = snapshot();
    expect(
      contractReceiptSchema.parse(
        (await calculator.rpc("set_client_contract", result.args)).data,
      ),
    ).toEqual(result.receipt);
    expect(snapshot()).toBe(before);
  },
  30000,
);
it("contrato vigente permite fila com documento mesmo em conciliação, sem alterar crédito", async () => {
  await contract(true);
  await move("unknown");
  const d = await document();
  expect((await complete(d)).error).toBeNull();
  expect(f.view().status).toBe("queued");
  expect(f.view().projection.depositCreditCents).toBeNull();
  expect(JSON.parse(snapshot()).queue).toBe(1);
  expect(
    (await calculator.rpc("set_client_contract", contractArgs(false))).error
      ?.code,
  ).toBe("PT409");
  expect(f.view().status).toBe("queued");
}, 30000);
it("documento posterior a estorno não retrocede trabalho nem repete fila/aviso", async () => {
  const first = await document();
  expect((await complete(first)).error).toBeNull();
  const history = f.receipts();
  await move("refund_full");
  const second = await document();
  expect((await complete(second)).error).toBeNull();
  const state = JSON.parse(snapshot());
  expect(state.status).toBe("queued");
  expect(state.queue).toBe(1);
  expect(state.notice).toBe(1);
  expect((await f.replay()).legacy).toEqual(history.legacy);
  expect((await f.replay()).binding).toEqual(history.binding);
  expect((await f.replay()).resolution).toEqual(history.resolution);
}, 30000);
it("hash divergente e pasta triagem não liberam fila; erro não produz efeito parcial", async () => {
  const d = await document();
  const before = snapshot();
  expect(
    (
      await f.db.rpc("complete_file_system", {
        ...d.args,
        observed_hash: "1".repeat(64),
      })
    ).error,
  ).not.toBeNull();
  expect(snapshot()).toBe(before);
  const triage = await document(f.sample, "triage");
  expect((await complete(triage)).error).toBeNull();
  expect(f.view().status).toBe("awaiting_documents");
  expect(JSON.parse(snapshot()).queue).toBe(0);
}, 30000);
it("arquivo compartilhado só libera pedidos elegíveis do mesmo processo", async () => {
  const sibling = randomUUID();
  expect(
    (
      await f.db.from("orders").insert({
        id: sibling,
        client_id: f.owner.id,
        process_id: f.sample.process_id,
        calc_type: "initial",
        status: "awaiting_documents",
        code: `P-SINTETICO-${sibling}`,
        total_cents: 25001,
        deposit_cents: 12501,
      })
    ).error,
  ).toBeNull();
  try {
    const d = await document(f.sample, "case", false);
    expect((await complete(d)).error).toBeNull();
    expect(f.view().status).toBe("queued");
    expect(JSON.parse(snapshot()).queue).toBe(1);
    expect(sql(`select status from public.orders where id='${sibling}';`)).toBe(
      "awaiting_documents",
    );
    expect(
      sql(
        `select count(*) from public.audit_log where action='order_queued' and target_id='${sibling}';`,
      ),
    ).toBe("0");
  } finally {
    expect(
      (await f.db.from("orders").delete().eq("id", sibling)).error,
    ).toBeNull();
  }
}, 30000);
it("retirada de contrato e Y após espera real deixam estado e crédito atuais", async () => {
  await contract(true);
  await f.observe("refund_full");
  const args = contractArgs(false);
  const [change, application] = await barrier(
    `select id from public.clients where id='${f.owner.id}' for no key update;`,
    () => Promise.all([calculator.rpc("set_client_contract", args), f.apply()]),
    "commit;",
    2,
  );
  expect(change.error).toBeNull();
  expect(application.effects).toContain("debited");
  expect(f.view().projection.depositCreditCents).toBe(0);
  expect(f.view().status).toBe("awaiting_payment");
  expect(JSON.parse(snapshot()).contract).toBe(false);
}, 30000);
it("rollback de contrato preserva condição, revisão, recibo e eventos", async () => {
  const before = snapshot(),
    args = contractArgs(true),
    events = sql(
      `select count(*) from public.timeline_events where process_id='${f.sample.process_id}';`,
    );
  sql(
    `begin;select set_config('request.jwt.claims','{"sub":"${f.calculator.id}","role":"authenticated"}',true);select public.set_client_contract('${args.target_client}',true,'${args.reason}',${args.expected_revision},'${args.request_id}');rollback;`,
  );
  expect(snapshot()).toBe(before);
  expect(
    sql(
      `select count(*) from private.client_contract_changes where id='${args.request_id}';`,
    ),
  ).toBe("0");
  expect(
    sql(
      `select count(*) from public.audit_log where action='client_contract_changed' and target_id='${args.request_id}';`,
    ),
  ).toBe("0");
  expect(
    sql(
      `select count(*) from public.timeline_events where process_id='${f.sample.process_id}';`,
    ),
  ).toBe(events);
}, 30000);
it("rollback do upload desfaz documento, fila, aviso e auditoria juntos", async () => {
  const d = await document(),
    before = snapshot(),
    events = sql(
      `select count(*) from public.timeline_events where process_id='${f.sample.process_id}';`,
    );
  sql(
    `begin;${service}select public.complete_file_system('${d.id}','${d.args.actor}','${d.args.observed_hash}',100);rollback;`,
  );
  expect(snapshot()).toBe(before);
  expect(
    sql(
      `select count(*) from public.audit_log where action='upload_verified' and target_id='${d.id}';`,
    ),
  ).toBe("0");
  expect(
    sql(
      `select count(*) from public.timeline_events where process_id='${f.sample.process_id}';`,
    ),
  ).toBe(events);
}, 30000);
it("dono alterado durante espera nega confirmação sem gravar documento", async () => {
  const d = await document(),
    owner = randomUUID();
  let created = false;
  sql(
    `insert into private.user_provisioning_grants(user_id,purpose) values('${owner}','Identidade fictícia para transferência concorrente');`,
  );
  try {
    const user = await f.db.auth.admin.createUser({
      id: owner,
      email: `ag-owner-${owner}@exemplo.com`,
      password: process.env.ANDRE_TEST_PASSWORD!,
      email_confirm: true,
      user_metadata: { full_name: "Dono fictício temporário" },
    });
    if (user.error || !user.data.user)
      throw new Error("Identidade fictícia não provisionada.");
    created = true;
    expect(
      (await f.db.from("profiles").select("role").eq("id", owner).single()).data
        ?.role,
    ).toBe("client");
    // Remove só o cadastro vazio recém-criado; owner_id permanece único e os
    // donos de todos os demais cadastros fictícios ficam inalterados.
    expect(
      (await f.db.from("clients").delete().eq("owner_id", owner)).error,
    ).toBeNull();
    const result = await barrier(
      `select id from public.clients where id='${f.owner.id}' for no key update;`,
      () => complete(d),
      `update public.clients set owner_id='${owner}' where id='${f.owner.id}';commit;`,
    );
    expect(result.error).not.toBeNull();
    expect(
      sql(`select upload_status from public.files where id='${d.id}';`),
    ).toBe("pending");
    expect(
      sql(
        `select count(*) from public.audit_log where action='upload_verified' and target_id='${d.id}';`,
      ),
    ).toBe("0");
  } finally {
    try {
      sql(
        `update public.clients set owner_id='${f.owner.owner_id}' where id='${f.owner.id}';`,
      );
      if (created) await removeLocalUser(owner);
    } finally {
      sql(
        `delete from private.user_provisioning_grants where user_id='${owner}';`,
      );
    }
  }
}, 30000);
it("replay contratual mantém recibo após crédito desconhecido e não mexe na proteção", async () => {
  const original = await contract(true);
  await move("unknown");
  const before = snapshot(),
    protection = sql(
      `select row_to_json(c) from private.payment_intent_dispatch_claims c where intent_id='${f.intentId}';`,
    );
  const replay = await calculator.rpc("set_client_contract", original.args);
  expect(replay.error).toBeNull();
  expect(contractReceiptSchema.parse(replay.data)).toEqual(original.receipt);
  expect(snapshot()).toBe(before);
  expect(
    sql(
      `select row_to_json(c) from private.payment_intent_dispatch_claims c where intent_id='${f.intentId}';`,
    ),
  ).toBe(protection);
}, 30000);
async function barrier<T>(
  lock: string,
  action: () => PromiseLike<T>,
  release = "commit;",
  waiters = 1,
) {
  const name = `ag-lock-${randomUUID()}`;
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_andre-calculos",
      "psql",
      "-U",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { env: process.env, stdio: ["pipe", "pipe", "pipe"] },
  );
  let output = "",
    pending: Promise<T> | undefined;
  child.stdout.on("data", (b: Buffer) => (output += b.toString()));
  child.stderr.resume();
  const done = new Promise<number | null>((resolve, reject) => {
    child.on("exit", resolve);
    child.on("error", reject);
  });
  try {
    child.stdin.write(
      `set application_name='${name}';set statement_timeout=12000;set idle_in_transaction_session_timeout=15000;begin;${service}${lock}\n\\echo AG_LOCK\n`,
    );
    await expect.poll(() => output, { timeout: 3000 }).toContain("AG_LOCK");
    pending = Promise.resolve(action());
    await expect
      .poll(
        () =>
          sql(
            `with recursive blocked(pid) as(select pid from pg_stat_activity where application_name='${name}' union select b.pid from pg_stat_activity b join blocked p on p.pid=any(pg_blocking_pids(b.pid)) where b.wait_event_type='Lock') select count(*)-1 from blocked;`,
          ),
        { timeout: 3000 },
      )
      .toBe(String(waiters));
    child.stdin.end(release + "\n\\q\n");
    expect(await done).toBe(0);
    return await pending;
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (pending) await pending;
  }
}
it("upload espera T antes do arquivo e relê nova query real como conciliação", async () => {
  const d = await document();
  const r = await barrier(
    `select id from private.payment_financial_charges where id='${f.chargeId}' for no key update;`,
    () => complete(d),
    `select id from public.files where id='${d.id}' for update nowait; select public.allocate_financial_query('${f.chargeId}','${randomUUID()}');commit;`,
  );
  expect(r.error).toBeNull();
  expect(f.view().projection.depositCreditCents).toBeNull();
  expect(f.view().status).toBe("awaiting_documents");
  expect(JSON.parse(snapshot()).queue).toBe(0);
}, 30000);
it("contrato espera fonte financeira e relê incerteza antes de retirar dispensa", async () => {
  await contract(true);
  const args = contractArgs(false);
  const r = await barrier(
    `select id from private.payment_financial_charges where id='${f.chargeId}' for no key update;`,
    () => calculator.rpc("set_client_contract", args),
    `select public.allocate_financial_query('${f.chargeId}','${randomUUID()}');commit;`,
  );
  expect(r.error).toBeNull();
  expect(f.view().status).toBe("awaiting_payment");
  expect(f.view().projection.depositCreditCents).toBeNull();
}, 30000);
it("upload e Y após espera real não usam crédito anterior nem repetem fila", async () => {
  const d = await document();
  await f.observe("refund_full");
  const [uploaded, application] = await barrier(
    `select id from public.clients where id='${f.owner.id}' for no key update;`,
    () => Promise.all([complete(d), f.apply()]),
    "commit;",
    2,
  );
  expect(uploaded.error).toBeNull();
  expect(application.effects).toContain("debited");
  expect(f.view().projection.depositCreditCents).toBe(0);
  const state = JSON.parse(snapshot());
  expect(state.status).toBe("awaiting_documents");
  expect(state.queue).toBe(0);
  expect(state.files[0].state).toBe("uploaded");
}, 30000);
it("manual e upload concorrentes de pedido novo entram na fila uma vez", async () => {
  const sample = await f.create(),
    d = await document(sample),
    requestId = randomUUID();
  const [uploaded, manual] = await barrier(
    `select id from public.clients where id='${f.owner.id}' for no key update;`,
    () =>
      Promise.all([
        complete(d),
        calculator.rpc("confirm_manual_deposit", {
          target_quote: sample.id,
          expected_context: sample.contextHash,
          expected_remaining_cents: 12501,
          request_id: requestId,
          confirmed: true,
        }),
      ]),
    "commit;",
    2,
  );
  expect(uploaded.error).toBeNull();
  expect(manual.error).toBeNull();
  expect(
    sql(`select status from public.orders where id='${sample.order_id}';`),
  ).toBe("queued");
  expect(
    sql(
      `select count(*) from public.audit_log where action='order_queued' and target_id='${sample.order_id}';`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from public.notifications where dedup_key='queued:${sample.order_id}:email';`,
    ),
  ).toBe("1");
}, 30000);
