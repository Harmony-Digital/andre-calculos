import { beforeAll, afterAll, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { acceptanceFixture } from "../e2e/acceptance-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql } from "../e2e/notification-helper";
import {
  depositInfoSchema,
  depositReceiptSchema,
} from "@/modules/payments/deposit";
let fixture: Awaited<ReturnType<typeof acceptanceFixture>>;
const sessions: Record<string, SupabaseClient> = {};
type Sample = Awaited<ReturnType<typeof fixture.create>>;
const args = (sample: Sample, patch: Record<string, unknown> = {}) => ({
  target_quote: sample.id,
  expected_context: sample.contextHash,
  expected_remaining_cents: sample.proposal.depositCents,
  request_id: randomUUID(),
  confirmed: true,
  ...patch,
});
const confirm = (sample: Sample, patch: Record<string, unknown> = {}) =>
  sessions.calculator.rpc("confirm_manual_deposit", args(sample, patch));
const accept = async (sample: Sample) =>
  expect(
    (await fixture.db.rpc("accept_quote_system", sample.args())).error,
  ).toBeNull();
const info = async (sample: Sample, db = sessions.client) => {
  const r = await db.rpc("get_process_deposit_instructions", {
    target_process: sample.process_id,
  });
  expect(r.error).toBeNull();
  return depositInfoSchema.array().parse(r.data);
};
const status = async (sample: Sample) =>
  (
    await fixture.db
      .from("orders")
      .select("status")
      .eq("id", sample.order_id)
      .single()
  ).data?.status;
const payments = async (sample: Sample) =>
  (
    await fixture.db
      .from("payments")
      .select("id,amount_cents,status,kind,confirmed_by,confirmed_at")
      .eq("order_id", sample.order_id)
  ).data!;
beforeAll(async () => {
  fixture = await acceptanceFixture();
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
});
afterAll(async () => {
  try {
    await Promise.all(
      Object.values(sessions).map((db) => db.auth.signOut({ scope: "local" })),
    );
  } finally {
    if (fixture) await fixture.cleanup();
  }
});
it("somente calculista confirma; dados privados ficam restritos ao processo", async () => {
  const sample = await fixture.create();
  await accept(sample);
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
  ])
    expect(
      (await db.rpc("confirm_manual_deposit", args(sample))).error,
    ).not.toBeNull();
  for (const db of [sessions.clientB, sessions.admin, anonymous, fixture.db])
    expect(
      (
        await db.rpc("get_process_deposit_instructions", {
          target_process: sample.process_id,
        })
      ).error,
    ).not.toBeNull();
  expect((await info(sample))[0]).toMatchObject({
    canConfirm: false,
    requiredCents: 12501,
    remainingCents: 12501,
  });
  expect((await info(sample, sessions.calculator))[0]).toMatchObject({
    canConfirm: true,
  });
  expect(
    localNotificationSql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name in ('manual_deposit_receipts','manual_deposit_requests') and grantee in ('anon','authenticated','service_role');",
    ),
  ).toBe("0");
});
it("sem aceite/contexto ou hash/valor divergente não registra recebimento", async () => {
  const sample = await fixture.create();
  expect(await info(sample)).toEqual([]);
  expect((await confirm(sample)).error).not.toBeNull();
  await accept(sample);
  for (const patch of [
    { expected_context: "0".repeat(64) },
    { expected_remaining_cents: 1 },
    { confirmed: false },
    { request_id: null },
  ])
    expect((await confirm(sample, patch)).error).not.toBeNull();
  expect(await payments(sample)).toEqual([]);
  expect(await status(sample)).toBe("awaiting_payment");
  const legacy = await fixture.create({ context: false });
  expect((await confirm(legacy)).error).not.toBeNull();
});
it("documento anterior: confirma sinal ímpar e enfileira entrega uma vez", async () => {
  const sample = await fixture.create({ documents: true });
  await accept(sample);
  const request = args(sample);
  const results = await Promise.all([
    sessions.calculator.rpc("confirm_manual_deposit", request),
    confirm(sample),
  ]);
  expect(results.map((r) => r.error)).toEqual([null, null]);
  expect(results[0].data).toEqual(results[1].data);
  const receipt = depositReceiptSchema.parse(results[0].data);
  expect(receipt).toMatchObject({
    amountCents: 12501,
    creditedBeforeCents: 0,
    status: "queued",
    confirmedBy: fixture.calculator.id,
  });
  expect(await payments(sample)).toEqual([
    expect.objectContaining({
      id: receipt.paymentId,
      amount_cents: 12501,
      status: "confirmed",
      confirmed_by: receipt.confirmedBy,
      confirmed_at: receipt.confirmedAt,
    }),
  ]);
  expect(await status(sample)).toBe("queued");
  expect(sample.proposal.totalCents - receipt.amountCents).toBe(12500);
  const events = await fixture.db
    .from("timeline_events")
    .select("kind,data")
    .eq("order_id", sample.order_id)
    .eq("kind", "payment_confirmed");
  expect(events.data).toHaveLength(1);
  const notice = await fixture.db
    .from("notifications")
    .select("template,data,status,attempts")
    .eq("dedup_key", `queued:${sample.order_id}:email`)
    .single();
  expect(notice.data).toMatchObject({
    template: "order_queued",
    status: "pending",
    attempts: 0,
    data: {
      code: expect.stringMatching(/^P-/),
      delivery_date: sample.proposal.deliveryDate,
      path: `/painel/processos/${sample.process_id}`,
    },
  });
  const original = await sessions.calculator.rpc(
    "confirm_manual_deposit",
    request,
  );
  expect(original.data).toEqual(receipt);
  await fixture.db
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", sample.order_id);
  expect(
    (await sessions.calculator.rpc("confirm_manual_deposit", request)).data,
  ).toEqual(receipt);
  expect(await status(sample)).toBe("cancelled");
  expect((await info(sample))[0]).toMatchObject({
    pixKey: null,
    canConfirm: false,
  });
  expect(
    (
      await sessions.calculator.rpc("confirm_manual_deposit", {
        ...request,
        expected_remaining_cents: 0,
      })
    ).error?.code,
  ).toBe("PT409");
});
it("sinal antes do documento espera integridade; upload posterior libera fila uma vez", async () => {
  const sample = await fixture.create();
  await accept(sample);
  const result = await confirm(sample);
  expect(result.error).toBeNull();
  expect(await status(sample)).toBe("awaiting_documents");
  expect((await info(sample))[0]).toMatchObject({
    confirmedCents: 12501,
    remainingCents: 0,
    pixKey: null,
  });
  for (const folder of ["deliverables", "triage", "case"] as const) {
    const id = randomUUID();
    expect(
      (
        await fixture.db.from("files").insert({
          id,
          process_id: sample.process_id,
          order_id: sample.order_id,
          folder,
          uploaded_by: sample.actor,
          name: "Documento fictício.pdf",
          mime: "application/pdf",
          path: `${sample.actor}/${sample.process_id}/${id}/pagamento.pdf`,
          size_bytes: 100,
          expected_sha256: "0".repeat(64),
          upload_status: "pending",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await fixture.db.rpc("complete_file_system", {
          target_file: id,
          actor: sample.actor,
          observed_hash: "1".repeat(64),
          observed_size: 100,
        })
      ).error,
    ).not.toBeNull();
    expect(await status(sample)).toBe("awaiting_documents");
    const completed = {
      target_file: id,
      actor: sample.actor,
      observed_hash: "0".repeat(64),
      observed_size: 100,
    };
    expect(
      (await fixture.db.rpc("complete_file_system", completed)).error,
    ).toBeNull();
    expect(await status(sample)).toBe(
      folder === "case" ? "queued" : "awaiting_documents",
    );
    expect(
      (await fixture.db.rpc("complete_file_system", completed)).error,
    ).toBeNull();
  }
  expect(
    (
      await fixture.db
        .from("notifications")
        .select("id")
        .eq("dedup_key", `queued:${sample.order_id}:email`)
    ).data,
  ).toHaveLength(1);
});
it("parcelas existentes contam somente deposit confirmed; sinal completo não duplica crédito", async () => {
  const sample = await fixture.create({ documents: true });
  await accept(sample);
  expect(
    (
      await fixture.db.from("payments").insert([
        {
          order_id: sample.order_id,
          kind: "deposit",
          method: "pix_manual",
          amount_cents: 5000,
          status: "confirmed",
        },
        {
          order_id: sample.order_id,
          kind: "deposit",
          method: "pix_manual",
          amount_cents: 4000,
          status: "refunded",
        },
        {
          order_id: sample.order_id,
          kind: "deposit",
          method: "pix_manual",
          amount_cents: 3000,
          status: "pending",
        },
        {
          order_id: sample.order_id,
          kind: "triage",
          method: "pix_manual",
          amount_cents: 2000,
          status: "confirmed",
        },
        {
          order_id: sample.order_id,
          kind: "balance",
          method: "pix_manual",
          amount_cents: 1000,
          status: "confirmed",
        },
      ])
    ).error,
  ).toBeNull();
  expect((await info(sample))[0]).toMatchObject({
    confirmedCents: 5000,
    remainingCents: 7501,
  });
  expect((await confirm(sample)).error?.code).toBe("PT409");
  const result = await confirm(sample, { expected_remaining_cents: 7501 });
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({
    amountCents: 7501,
    creditedBeforeCents: 5000,
    status: "queued",
  });
  expect(await payments(sample)).toHaveLength(6);
  const fullyPaid = await fixture.create({ documents: true });
  await accept(fullyPaid);
  await fixture.db.from("payments").insert({
    order_id: fullyPaid.order_id,
    kind: "deposit",
    method: "pix_manual",
    amount_cents: 12501,
    status: "confirmed",
  });
  const reconciled = await confirm(fullyPaid, { expected_remaining_cents: 0 });
  expect(reconciled.error).toBeNull();
  expect(reconciled.data).toMatchObject({
    paymentId: null,
    amountCents: 0,
    creditedBeforeCents: 12501,
    status: "queued",
  });
  expect(await payments(fullyPaid)).toHaveLength(1);
});
it("recibo conserva estorno e projeção financeira; nova tentativa revalida faltante", async () => {
  const sample = await fixture.create();
  await accept(sample);
  const request = args(sample);
  const result = await sessions.calculator.rpc(
    "confirm_manual_deposit",
    request,
  );
  expect(result.error).toBeNull();
  const receipt = depositReceiptSchema.parse(result.data);
  for (const patch of [
    { amount_cents: 1 },
    { confirmed_by: sample.actor },
    { kind: "balance" },
    { status: "pending" },
  ])
    expect(
      (
        await fixture.db
          .from("payments")
          .update(patch)
          .eq("id", receipt.paymentId!)
      ).error,
    ).not.toBeNull();
  expect(
    (await fixture.db.from("payments").delete().eq("id", receipt.paymentId!))
      .error,
  ).not.toBeNull();
  expect(
    (
      await fixture.db
        .from("payments")
        .update({ status: "refunded" })
        .eq("id", receipt.paymentId!)
    ).error,
  ).toBeNull();
  expect(
    (await sessions.calculator.rpc("confirm_manual_deposit", request)).data,
  ).toEqual(receipt);
  expect((await info(sample))[0]).toMatchObject({
    confirmedCents: 0,
    remainingCents: 12501,
    paymentStatus: "refunded",
  });
  expect(
    (
      await fixture.db
        .from("payments")
        .update({ status: "confirmed" })
        .eq("id", receipt.paymentId!)
    ).error,
  ).not.toBeNull();
  const fresh = await confirm(sample);
  expect(fresh.error).toBeNull();
  expect(fresh.data).toMatchObject({
    amountCents: 12501,
    status: "awaiting_documents",
  });
  expect(fresh.data).not.toEqual(receipt);
  expect((await payments(sample)).map((p) => p.status).sort()).toEqual([
    "confirmed",
    "refunded",
  ]);
});
it("contrato dispensa confirmação; falta de Pix não impede registro conferido pelo André", async () => {
  const contract = await fixture.create({ contract: true });
  await accept(contract);
  expect((await info(contract, sessions.calculator))[0]).toMatchObject({
    hasContract: true,
    pixKey: null,
    canConfirm: false,
  });
  expect((await confirm(contract)).error?.message).toBe(
    "Contrato dispensa sinal",
  );
  const sample = await fixture.create();
  await accept(sample);
  await fixture.db
    .from("settings")
    .update({ pix_key: null, approved_terms_version: null })
    .eq("singleton", true);
  expect((await info(sample))[0]).toMatchObject({ pixKey: null });
  expect((await confirm(sample)).error).toBeNull();
  await fixture.db
    .from("settings")
    .update({ approved_terms_version: fixture.terms })
    .eq("singleton", true);
});
it("falha no aviso da fila reverte sinal, recibo, estado e todos os efeitos", async () => {
  const sample = await fixture.create({ documents: true });
  await accept(sample);
  localNotificationSql(
    `create function private.fixture_fail_deposit_notice() returns trigger language plpgsql set search_path='' as $$begin if new.template='order_queued' and new.data->>'order_id'='${sample.order_id}' then raise exception 'falha sintética'; end if; return new; end;$$; create trigger fixture_fail_deposit_notice before insert on public.notifications for each row execute function private.fixture_fail_deposit_notice();`,
  );
  try {
    expect((await confirm(sample)).error).not.toBeNull();
    expect(await payments(sample)).toEqual([]);
    expect(await status(sample)).toBe("awaiting_payment");
    expect(
      localNotificationSql(
        `select count(*) from private.manual_deposit_receipts where order_id='${sample.order_id}'::uuid;`,
      ),
    ).toBe("0");
    expect(
      (
        await fixture.db
          .from("timeline_events")
          .select("id")
          .eq("order_id", sample.order_id)
          .eq("kind", "payment_confirmed")
      ).data,
    ).toEqual([]);
  } finally {
    localNotificationSql(
      "drop trigger fixture_fail_deposit_notice on public.notifications; drop function private.fixture_fail_deposit_notice();",
    );
  }
  expect((await confirm(sample)).error).toBeNull();
});
it("contrato histórico não libera primeiro documento depois de perder condição atual", async () => {
  const sample = await fixture.create({ contract: true });
  await accept(sample);
  localNotificationSql(
    `update public.clients set has_contract=false where id='${fixture.owner.id}'::uuid;`,
  );
  const id = randomUUID();
  await fixture.db.from("files").insert({
    id,
    process_id: sample.process_id,
    order_id: sample.order_id,
    folder: "case",
    uploaded_by: sample.actor,
    name: "Processo inventado.pdf",
    mime: "application/pdf",
    path: `${sample.actor}/${sample.process_id}/${id}/contrato-revogado.pdf`,
    size_bytes: 100,
    expected_sha256: "0".repeat(64),
    upload_status: "pending",
  });
  expect(
    (
      await fixture.db.rpc("complete_file_system", {
        target_file: id,
        actor: sample.actor,
        observed_hash: "0".repeat(64),
        observed_size: 100,
      })
    ).error,
  ).toBeNull();
  expect(await status(sample)).toBe("awaiting_documents");
  expect((await info(sample, sessions.calculator))[0]).toMatchObject({
    hasContract: false,
    canConfirm: true,
    remainingCents: 12501,
  });
  expect(
    localNotificationSql(
      `select has_contract::text from private.quote_acceptances where quote_id='${sample.id}'::uuid;`,
    ),
  ).toBe("true");
});
it("sinal zero exige conferência; não cria crédito nem entrada presumida na fila", async () => {
  const sample = await fixture.create({ zero: true, documents: true });
  await accept(sample);
  expect((await info(sample, sessions.calculator))[0]).toMatchObject({
    requiredCents: 0,
    canConfirm: false,
    pixKey: null,
  });
  expect((await confirm(sample)).error?.message).toBe(
    "Confira os valores da proposta",
  );
  expect(await payments(sample)).toEqual([]);
  expect(await status(sample)).toBe("awaiting_payment");
});
it.each([false, true])(
  "corrida sinal/upload: upload inicia primeiro=%s",
  async (uploadFirst) => {
    const sample = await fixture.create();
    await accept(sample);
    const id = randomUUID();
    await fixture.db.from("files").insert({
      id,
      process_id: sample.process_id,
      order_id: sample.order_id,
      folder: "client",
      uploaded_by: sample.actor,
      name: "Documento inventado.pdf",
      mime: "application/pdf",
      path: `${sample.actor}/${sample.process_id}/${id}/corrida.pdf`,
      size_bytes: 100,
      expected_sha256: "0".repeat(64),
      upload_status: "pending",
    });
    const upload = () =>
      fixture.db.rpc("complete_file_system", {
        target_file: id,
        actor: sample.actor,
        observed_hash: "0".repeat(64),
        observed_size: 100,
      });
    const results = await Promise.all(
      uploadFirst ? [upload(), confirm(sample)] : [confirm(sample), upload()],
    );
    expect(results.map((r) => r.error)).toEqual([null, null]);
    expect(await status(sample)).toBe("queued");
    expect(await payments(sample)).toHaveLength(1);
    expect(
      (
        await fixture.db
          .from("notifications")
          .select("id")
          .eq("dedup_key", `queued:${sample.order_id}:email`)
      ).data,
    ).toHaveLength(1);
  },
);
it("promoção concorrente de parcela pending é vista antes de confirmar restante", async () => {
  const sample = await fixture.create();
  await accept(sample);
  const id = randomUUID();
  await fixture.db.from("payments").insert({
    id,
    order_id: sample.order_id,
    kind: "deposit",
    method: "pix_manual",
    amount_cents: 5000,
    status: "pending",
  });
  const name = "deposit-lock-" + randomUUID();
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
  let pending: Promise<Awaited<ReturnType<typeof confirm>>> | undefined;
  try {
    child.stdin.write(
      `set application_name='${name}'; begin; update public.payments set status='confirmed' where id='${id}'::uuid;\n\\echo PAYMENT_HELD\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("PAYMENT_HELD");
    pending = Promise.resolve(confirm(sample));
    await expect
      .poll(
        () =>
          localNotificationSql(
            `select count(*) from pg_stat_activity b where b.wait_event_type='Lock' and exists(select 1 from pg_stat_activity a where a.application_name='${name}' and a.pid=any(pg_blocking_pids(b.pid)));`,
          ),
        { timeout: 3000 },
      )
      .toBe("1");
    child.stdin.end("commit;\n\\q\n");
    expect(await done).toBe(0);
    expect((await pending).error?.code).toBe("PT409");
    expect(await payments(sample)).toEqual([
      expect.objectContaining({ id, amount_cents: 5000, status: "confirmed" }),
    ]);
    expect((await info(sample))[0]).toMatchObject({
      confirmedCents: 5000,
      remainingCents: 7501,
    });
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (pending) await pending;
  }
}, 12000);
