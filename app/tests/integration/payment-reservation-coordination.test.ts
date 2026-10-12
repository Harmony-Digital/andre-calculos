import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  expect,
  it,
  vi,
} from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { paymentObligationFixture } from "../e2e/payment-obligation-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { quoteSession } from "../e2e/quote-helper";
import { paymentIntentReceiptSchema } from "@/modules/payments/intents";
import { depositReceiptSchema } from "@/modules/payments/deposit";
let fixture: Awaited<ReturnType<typeof paymentObligationFixture>>;
type Sample = Awaited<ReturnType<typeof fixture.create>>;
const sessions: Record<string, SupabaseClient> = {};
const contractRequests = new Set<string>();
const reserve = (contextId: string) =>
  sessions.client.rpc("reserve_payment_intent", {
    target_context: contextId,
    request_id: randomUUID(),
  });
const reserved = async (contextId: string) => {
  const result = await reserve(contextId);
  expect(result.error).toBeNull();
  return paymentIntentReceiptSchema.parse(result.data).snapshot.intent.id;
};
const withdraw = (id: string) =>
  sessions.calculator.rpc("withdraw_payment_intent", {
    target_intent: id,
    expected_revision: 0,
    request_id: randomUUID(),
  });
const manualArgs = (s: Sample, remaining = s.proposal.depositCents) => ({
  target_quote: s.id,
  expected_context: s.contextHash,
  expected_remaining_cents: remaining,
  request_id: randomUUID(),
  confirmed: true,
});
const manual = (s: Sample, remaining = s.proposal.depositCents) =>
  sessions.calculator.rpc("confirm_manual_deposit", manualArgs(s, remaining));
const contractArgs = (flag = true) => {
  const id = randomUUID();
  contractRequests.add(id);
  return {
    target_client: fixture.owner.id,
    has_contract: flag,
    reason: "Contrato fictício exclusivo do ensaio local.",
    expected_revision: Number(
      sql(
        `select contract_revision from public.clients where id='${fixture.owner.id}';`,
      ),
    ),
    request_id: id,
  };
};
const contract = (flag = true) =>
  sessions.calculator.rpc("set_client_contract", contractArgs(flag));
const make = async () => {
  const sample = await fixture.create(),
    context = await fixture.prepare(sample, sessions.client);
  return { sample, context };
};
const state = (s: Sample) =>
  JSON.parse(
    sql(`select json_build_object(
 'payments',(select count(*) from public.payments where order_id='${s.order_id}'),
 'receipts',(select count(*) from private.manual_deposit_receipts where order_id='${s.order_id}'),
 'manual_requests',(select count(*) from private.manual_deposit_requests where quote_id='${s.id}'),
 'notices',(select count(*) from public.notifications where template='payment_confirmed' and data->>'order_id'='${s.order_id}'),
 'events',(select count(*) from public.timeline_events where order_id='${s.order_id}'),
 'status',(select status from public.orders where id='${s.order_id}'),
 'contract',(select has_contract from public.clients where id='${fixture.owner.id}'),
 'revision',(select contract_revision from public.clients where id='${fixture.owner.id}'),
 'contract_receipts',(select count(*) from private.client_contract_changes where client_id='${fixture.owner.id}'),
 'audits',(select count(*) from public.audit_log where action in('manual_deposit_confirmed','client_contract_changed') and (target_id in(select id from private.manual_deposit_receipts where order_id='${s.order_id}') or target_id in(select id from private.client_contract_changes where client_id='${fixture.owner.id}'))),
 'reservations',(select count(*) from private.payment_intent_reservations where order_id='${s.order_id}'),
 'intents',(select count(*) from private.payment_intents where order_id='${s.order_id}'));
`),
  );
const jwt = () =>
  `select set_config('request.jwt.claims','{"sub":"${fixture.calculator.id}","role":"authenticated"}',true);`;
const manualSql = (s: Sample, request = randomUUID()) =>
  `select public.confirm_manual_deposit('${s.id}','${s.contextHash}',${s.proposal.depositCents},'${request}',true);`;
const reserveSql = (contextId: string) =>
  `select public.reserve_payment_intent('${contextId}','${randomUUID()}');`;
const contractSql = (a: ReturnType<typeof contractArgs>) =>
  `select public.set_client_contract('${a.target_client}',${a.has_contract},'${a.reason}',${a.expected_revision},'${a.request_id}');`;
async function whileLocked<T>(
  lockSql: string,
  operation: () => PromiseLike<T>,
  releaseSql = "commit;",
) {
  const name = "intent-lock-" + randomUUID();
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
  let output = "",
    pending: Promise<T> | undefined;
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", () => {});
  const done = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  try {
    child.stdin.write(
      `set application_name='${name}'; set statement_timeout=8000; set idle_in_transaction_session_timeout=8000; begin; ${lockSql}\n\\echo INTENT_LOCK_HELD\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("INTENT_LOCK_HELD");
    pending = Promise.resolve(operation());
    await expect
      .poll(
        () =>
          sql(
            `select count(*) from pg_stat_activity b where b.wait_event_type='Lock' and exists(select 1 from pg_stat_activity a where a.application_name='${name}' and a.pid=any(pg_blocking_pids(b.pid)));`,
          ),
        { timeout: 3000 },
      )
      .toBe("1");
    child.stdin.end(`${releaseSql}\n\\q\n`);
    expect(await done).toBe(0);
    return await pending;
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (pending) await pending;
  }
}

beforeAll(async () => {
  for (const role of ["client", "calculator"] as const)
    sessions[role] = await quoteSession(role);
});
beforeEach(async () => {
  contractRequests.clear();
  fixture = await paymentObligationFixture();
});
afterEach(async () => {
  try {
    if (contractRequests.size) {
      const ids = [...contractRequests]
        .map((id) => "'" + id + "'::uuid")
        .join(",");
      sql(
        `delete from public.audit_log where action='client_contract_changed' and target_id=any(array[${ids}]); delete from private.client_contract_changes where id=any(array[${ids}]);`,
      );
    }
  } finally {
    if (fixture) await fixture.cleanup();
  }
});
afterAll(async () => {
  await Promise.all(
    Object.values(sessions).map((db) => db.auth.signOut({ scope: "local" })),
  );
});

it.each(["pending", "refunded", "confirmed"])(
  "reserva impede novo Pix com histórico %s sem efeitos parciais",
  async (status) => {
    const { sample, context } = await make();
    await reserved(context.id);
    expect(
      (
        await fixture.db.from("payments").insert({
          order_id: sample.order_id,
          kind: "deposit",
          method: "pix_manual",
          amount_cents: 5000,
          status,
        })
      ).error,
    ).toBeNull();
    const before = state(sample),
      remaining =
        sample.proposal.depositCents - (status === "confirmed" ? 5000 : 0);
    const result = await manual(sample, remaining);
    expect(result.error?.code).toBe("PT423");
    expect(result.status).toBe(423);
    expect(state(sample)).toEqual(before);
  },
);
it("reserva de sinal também impede contrato sem alterar flag/revisão ou fila", async () => {
  const { sample, context } = await make();
  await reserved(context.id);
  const before = state(sample),
    result = await contract();
  expect(result.error?.code).toBe("PT423");
  expect(result.status).toBe(423);
  expect(state(sample)).toEqual(before);
});
it.each([false, true])(
  "contrato atual %s: reserva de saldo completed em outra conta e claim antigo bloqueia mudança",
  async (flag) => {
    const sample = await fixture.create({ contract: flag });
    await fixture.deliver(sample);
    expect(
      (
        await fixture.db
          .from("orders")
          .update({ status: "completed" })
          .eq("id", sample.order_id)
      ).error,
    ).toBeNull();
    const context = await fixture.prepare(sample, sessions.client, "balance"),
      id = await reserved(context.id);
    sql(
      `insert into private.payment_intent_dispatch_claims(intent_id,run_id,claimed_at) values('${id}','${randomUUID()}','2000-01-01T00:00:00Z');`,
    );
    fixture.scope(fixture.otherScopeId);
    const before = state(sample),
      result = await contract(!flag);
    expect(result.error?.code).toBe("PT423");
    expect(state(sample)).toEqual(before);
  },
);
it("reserva de saldo em outro pedido do cliente bloqueia contrato", async () => {
  const old = await fixture.create();
  await fixture.deliver(old);
  const balance = await fixture.prepare(old, sessions.client, "balance");
  await reserved(balance.id);
  const fresh = await fixture.create(),
    before = state(fresh);
  expect((await contract()).error?.code).toBe("PT423");
  expect(state(fresh)).toEqual(before);
  expect(state(old).reservations).toBe(1);
});
it("retirada pré-despacho permite Pix posterior sem reutilizar a reserva", async () => {
  const { sample, context } = await make(),
    id = await reserved(context.id);
  expect((await withdraw(id)).error).toBeNull();
  const result = await manual(sample);
  expect(result.error).toBeNull();
  expect(depositReceiptSchema.parse(result.data).amountCents).toBe(12501);
  expect(state(sample)).toMatchObject({
    payments: 1,
    receipts: 1,
    notices: 1,
    reservations: 0,
    intents: 1,
  });
});
it("retirada pré-despacho permite contrato e invalidou o contexto anterior", async () => {
  const { sample, context } = await make(),
    id = await reserved(context.id);
  expect((await withdraw(id)).error).toBeNull();
  expect((await contract()).error).toBeNull();
  expect((await reserve(context.id)).error?.code).toBe("PT409");
  expect(state(sample)).toMatchObject({
    contract: true,
    contract_receipts: 1,
    reservations: 0,
    intents: 1,
  });
});
it("claim conserva a reserva e bloqueia retirada, Pix e contrato", async () => {
  const { sample, context } = await make(),
    id = await reserved(context.id);
  sql(
    `insert into private.payment_intent_dispatch_claims(intent_id,run_id) values('${id}','${randomUUID()}');`,
  );
  const before = state(sample);
  expect((await withdraw(id)).error?.code).toBe("PT409");
  expect((await manual(sample)).error?.code).toBe("PT423");
  expect((await contract()).error?.code).toBe("PT423");
  expect(state(sample)).toEqual(before);
});
it("replay e reconciliação manual retornam recibo antigo com reserva de saldo ativa", async () => {
  const sample = await fixture.create(),
    args = manualArgs(sample),
    first = await sessions.calculator.rpc("confirm_manual_deposit", args);
  expect(first.error).toBeNull();
  await fixture.deliver(sample);
  const balance = await fixture.prepare(sample, sessions.client, "balance");
  await reserved(balance.id);
  const before = state(sample);
  expect(
    (await sessions.calculator.rpc("confirm_manual_deposit", args)).data,
  ).toEqual(first.data);
  expect(state(sample)).toEqual(before);
  const zero = await manual(sample, 0);
  expect(zero.error).toBeNull();
  expect(zero.data).toEqual(first.data);
  expect(state(sample)).toEqual({
    ...before,
    manual_requests: before.manual_requests + 1,
  });
});
it("conciliação zero sem recibo prévio preserva reserva sem pagamento/aviso novo", async () => {
  const sample = await fixture.create();
  expect(
    (
      await fixture.db.from("payments").insert({
        order_id: sample.order_id,
        kind: "deposit",
        method: "pix_manual",
        amount_cents: 12501,
        status: "confirmed",
      })
    ).error,
  ).toBeNull();
  await fixture.deliver(sample);
  const balance = await fixture.prepare(sample, sessions.client, "balance");
  await reserved(balance.id);
  expect(
    (
      await fixture.db
        .from("orders")
        .update({ status: "awaiting_documents" })
        .eq("id", sample.order_id)
    ).error,
  ).toBeNull();
  const before = state(sample),
    result = await manual(sample, 0);
  expect(result.error).toBeNull();
  expect(depositReceiptSchema.parse(result.data)).toMatchObject({
    amountCents: 0,
    paymentId: null,
  });
  expect(state(sample)).toMatchObject({
    payments: before.payments,
    notices: before.notices,
    reservations: 1,
    receipts: 1,
    manual_requests: 1,
    audits: 1,
  });
});
it("replay contratual antigo preserva recibo e reserva", async () => {
  const sample = await fixture.create(),
    args = contractArgs(),
    first = await sessions.calculator.rpc("set_client_contract", args);
  expect(first.error).toBeNull();
  await fixture.deliver(sample);
  const balance = await fixture.prepare(sample, sessions.client, "balance");
  await reserved(balance.id);
  const before = state(sample),
    replay = await sessions.calculator.rpc("set_client_contract", args);
  expect(replay.error).toBeNull();
  expect(replay.data).toEqual(first.data);
  expect(state(sample)).toEqual(before);
});
it("rollback da retirada e Pix restaura reserva e reverte crédito, recibo, evento, aviso e auditoria", async () => {
  const { sample, context } = await make(),
    id = await reserved(context.id),
    before = state(sample);
  const inside = sql(
    `begin; ${jwt()} select public.withdraw_payment_intent('${id}',0,'${randomUUID()}'); ${manualSql(sample)} select json_build_object('inside_payments',(select count(*) from public.payments where order_id='${sample.order_id}'),'inside_reservations',(select count(*) from private.payment_intent_reservations where order_id='${sample.order_id}'),'inside_notices',(select count(*) from public.notifications where template='payment_confirmed' and data->>'order_id'='${sample.order_id}')); rollback;`,
  );
  expect(inside).toContain('"inside_payments" : 1');
  expect(inside).toContain('"inside_reservations" : 0');
  expect(inside).toContain('"inside_notices" : 1');
  expect(state(sample)).toEqual(before);
  expect(
    sql(
      `select count(*) from private.payment_intent_withdrawals where intent_id='${id}';`,
    ),
  ).toBe("0");
});
it("rollback da retirada e contrato restaura flag/revisão, reserva e efeitos", async () => {
  const { sample, context } = await make(),
    id = await reserved(context.id),
    before = state(sample),
    args = contractArgs();
  const inside = sql(
    `begin; ${jwt()} select public.withdraw_payment_intent('${id}',0,'${randomUUID()}'); ${contractSql(args)} select json_build_object('inside_flag',(select has_contract from public.clients where id='${fixture.owner.id}'),'inside_receipts',(select count(*) from private.client_contract_changes where id='${args.request_id}')); rollback;`,
  );
  expect(inside).toContain('"inside_flag" : true');
  expect(inside).toContain('"inside_receipts" : 1');
  expect(state(sample)).toEqual(before);
});
it("reserva vence Pix concorrente: espera observada e nenhum recebimento", async () => {
  const { sample, context } = await make(),
    before = state(sample);
  const result = await whileLocked(jwt() + reserveSql(context.id), () =>
    manual(sample),
  );
  expect(result.error?.code).toBe("PT423");
  expect(state(sample)).toEqual({ ...before, reservations: 1, intents: 1 });
});
it("Pix vence reserva concorrente: espera observada e contexto antigo rejeitado", async () => {
  const { sample, context } = await make();
  const result = await whileLocked(jwt() + manualSql(sample), () =>
    reserve(context.id),
  );
  expect(result.error?.code).toBe("PT409");
  expect(state(sample)).toMatchObject({
    payments: 1,
    receipts: 1,
    notices: 1,
    intents: 0,
    reservations: 0,
  });
});
it("reserva vence contrato concorrente: espera observada e flag intacta", async () => {
  const { sample, context } = await make(),
    before = state(sample);
  const result = await whileLocked(jwt() + reserveSql(context.id), () =>
    contract(),
  );
  expect(result.error?.code).toBe("PT423");
  expect(state(sample)).toEqual({ ...before, reservations: 1, intents: 1 });
});
it("contrato vence reserva concorrente: espera observada e contexto antigo rejeitado", async () => {
  const { sample, context } = await make(),
    args = contractArgs();
  const result = await whileLocked(jwt() + contractSql(args), () =>
    reserve(context.id),
  );
  expect(result.error?.code).toBe("PT409");
  expect(state(sample)).toMatchObject({
    contract: true,
    contract_receipts: 1,
    payments: 0,
    notices: 0,
    intents: 0,
    reservations: 0,
  });
});
it("RPCs continuam restritas ao papel autenticado sem grants amplos", () => {
  for (const signature of [
    "public.confirm_manual_deposit(uuid,text,bigint,uuid,boolean)",
    "public.set_client_contract(uuid,boolean,text,integer,uuid)",
  ]) {
    for (const role of ["anon", "service_role"])
      expect(
        sql(
          `select has_function_privilege('${role}','${signature}','execute');`,
        ),
      ).toBe("f");
    expect(
      sql(
        `select has_function_privilege('authenticated','${signature}','execute');`,
      ),
    ).toBe("t");
  }
});
