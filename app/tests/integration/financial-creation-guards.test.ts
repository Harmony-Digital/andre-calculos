import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/database.types";

import { executionTransportFixture } from "../e2e/execution-transport-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { localSystem } from "../e2e/local-helper";
import { quoteSession } from "../e2e/quote-helper";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import {
  allocateFixturePaymentExecution,
  startFixturePaymentExecution,
} from "@/modules/payments/execution-system";
import { paymentIntentReceiptSchema } from "@/modules/payments/intents";
import { executionProtocols } from "@/modules/payments/execution-protocol";
import { depositReceiptSchema } from "@/modules/payments/deposit";
import {
  captureFixtureFinancialObservation,
  queryFixtureFinancialObservation,
  allocateFixtureFinancialQuery,
} from "@/modules/payments/financial-worker";
import {
  orderCreditProjectionSchema,
  deriveFixtureFinancialDecision,
} from "@/modules/payments/financial-projection";
import { applyFixtureFinancialObservation } from "@/modules/payments/financial-application";
import {
  paymentObligationSchema,
  paymentObligationReceiptSchema,
} from "@/modules/payments/obligation-data";
let fixture: Awaited<ReturnType<typeof executionTransportFixture>>,
  charge: string,
  payment: string;
let priorNotice: {
  recipient: string | null;
  email: string | null;
  phone: string | null;
  prefs: { channel: string; enabled: boolean; revision: number }[];
};
const reads = new Set<string>();
const literal = (value: unknown) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const change = (patch: string) =>
  sql(
    `update private.payment_fixture_payments set ${patch} where scope_id='${fixture.scopeId}' and id='${payment}';`,
  );
async function project(order = fixture.sample.order_id) {
  const db = await quoteSession();
  try {
    const r = await db.rpc("get_order_financial_projection", {
      target_order: order,
    });
    expect(r.error).toBeNull();
    reads.add(order);
    return orderCreditProjectionSchema.parse(r.data);
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
}
const apply = (observationId: string, requestId: string = randomUUID()) =>
  applyFixtureFinancialObservation({ observationId, requestId });
const observe = async () =>
  (await queryFixtureFinancialObservation(charge, randomUUID())).observationId;
async function session<T>(
  role: "client" | "calculator",
  operation: (db: SupabaseClient) => PromiseLike<T>,
) {
  const db = await quoteSession(role);
  try {
    return await operation(db);
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
}
const preview = (phase = "deposit") =>
  session("client", async (db) => {
    const r = await db.rpc("get_payment_obligation", {
      target_order: fixture.sample.order_id,
      target_phase: phase,
    });
    expect(r.error).toBeNull();
    return paymentObligationSchema.parse(r.data);
  });
const prepareArgs = (requestId: string = randomUUID(), remaining = 12501) => ({
  target_order: fixture.sample.order_id,
  target_phase: "deposit",
  expected_context: fixture.sample.contextHash,
  expected_remaining_cents: remaining,
  billing_type: "PIX",
  due_date: "2026-10-20",
  request_id: requestId,
});

const manualArgs = (remaining = 12501, requestId: string = randomUUID()) => ({
  target_quote: fixture.sample.id,
  expected_context: fixture.sample.contextHash,
  expected_remaining_cents: remaining,
  request_id: requestId,
  confirmed: true,
});
const manual = (remaining = 12501) =>
  session("calculator", (db) =>
    db.rpc("confirm_manual_deposit", manualArgs(remaining)),
  );
const reserve = (contextId: string, requestId: string = randomUUID()) =>
  session("client", (db) =>
    db.rpc("reserve_payment_intent", {
      target_context: contextId,
      request_id: requestId,
    }),
  );
// Setup exclusivo do ensaio: AB nao implementa terminal nem libera reservas.
// Remove a propria reserva apenas para provar a guarda sem o bloqueio antigo.
const releaseFixtureReservation = () =>
  sql(
    `delete from private.payment_intent_reservations where order_id='${fixture.sample.order_id}' and intent_id='${fixture.intentId}';`,
  );
const ledger = (amount: number, method = "pix_manual") =>
  sql(
    `insert into public.payments(order_id,kind,method,amount_cents,status,provider_ref) values('${fixture.sample.order_id}','deposit','${method}',${amount},'confirmed',${method === "asaas" ? "'" + payment + "'" : "null"}) returning id;`,
  );
const state = () =>
  JSON.parse(
    sql(`select json_build_object(
 'payments',(select count(*) from public.payments where order_id='${fixture.sample.order_id}'),
 'manualReceipts',(select count(*) from private.manual_deposit_receipts where order_id='${fixture.sample.order_id}'),
 'contexts',(select count(*) from private.payment_obligation_contexts where order_id='${fixture.sample.order_id}'),
 'intents',(select count(*) from private.payment_intents where order_id='${fixture.sample.order_id}'),
 'reservations',(select count(*) from private.payment_intent_reservations where order_id='${fixture.sample.order_id}'),
 'claims',(select count(*) from private.payment_intent_dispatch_claims where intent_id='${fixture.intentId}'),
 'posts',(select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${fixture.intentId}'),
 'events',(select count(*) from public.timeline_events where order_id='${fixture.sample.order_id}'),
 'notices',(select count(*) from public.notifications where data->>'order_id'='${fixture.sample.order_id}'),
 'orderStatus',(select status from public.orders where id='${fixture.sample.order_id}'));`),
  );
function transportArgs() {
  return JSON.parse(
    sql(
      `select json_build_object('target_scope',scope_id,'target_client',client_id,'slot_id',slot_id,'request_id',id,'operation',operation,'fingerprint',fingerprint,'payload',payload) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${fixture.intentId}';`,
    ),
  ) as {
    target_scope: string;
    target_client: string;
    slot_id: string;
    request_id: string;
    operation: string;
    fingerprint: string;
    payload: Json;
  };
}
async function whileLocked<T>(
  lockSql: string,
  operation: () => PromiseLike<T>,
  releaseSql = "commit;",
) {
  const name = "financial-guard-" + randomUUID();
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
    errors = "",
    pending: Promise<T> | undefined;
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    errors += chunk.toString();
  });
  const done = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  try {
    child.stdin.write(
      `set application_name='${name}'; set statement_timeout=8000; set idle_in_transaction_session_timeout=8000; begin; ${lockSql}\n\\echo FINANCIAL_LOCK_HELD\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("FINANCIAL_LOCK_HELD");
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
    expect(await done, errors).toBe(0);
    return await pending;
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (pending) await pending;
  }
}
beforeEach(async () => {
  reads.clear();
  fixture = await executionTransportFixture();
  priorNotice = JSON.parse(
    sql(
      `select json_build_object('recipient',(select profile_id from private.calculator_notification_recipient where singleton),'email',contact_email,'phone',contact_phone,'prefs',coalesce((select json_agg(json_build_object('channel',channel,'enabled',enabled,'revision',revision)) from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated'),'[]'::json)) from public.settings where singleton;`,
    ),
  );
  sql(
    `update private.calculator_notification_recipient set profile_id='${fixture.calculator.id}' where singleton;delete from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated';`,
  );
  await advanceFixturePaymentExecution(fixture.requestId);
  const origin = sql(
    `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${fixture.intentId}' limit 1;`,
  );
  charge = (await captureFixtureFinancialObservation(origin)).chargeId;
  payment = sql(
    `select provider_payment_id from private.payment_financial_charges where id='${charge}';`,
  );
  change("status='RECEIVED',net_cents=value_cents-100,refunds='[]'");
});
afterEach(async () => {
  try {
    if (reads.size)
      sql(
        `delete from public.audit_log where action='payment_projection_read' and target_id in(${[...reads].map((v) => "'" + v + "'").join(",")});`,
      );
  } finally {
    if (fixture) {
      try {
        const val = (v: string | null) =>
          v === null ? "null" : "'" + v.replaceAll("'", "''") + "'";
        sql(
          `update private.calculator_notification_recipient set profile_id=${val(priorNotice.recipient)} where singleton;update public.settings set contact_email=${val(priorNotice.email)},contact_phone=${val(priorNotice.phone)} where singleton;delete from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated';`,
        );
        for (const pref of priorNotice.prefs)
          sql(
            `insert into public.notification_preferences(profile_id,event,channel,enabled,revision) values('${fixture.calculator.id}','payment_updated','${pref.channel}',${pref.enabled},${pref.revision});`,
          );
      } finally {
        await fixture.cleanup();
      }
    }
  }
});

it("recebimento conhecido liquida sinal sem criar confirmação manual ou novo contexto", async () => {
  await apply(await observe());
  expect(await preview()).toMatchObject({
    status: "settled",
    creditedCents: 12501,
    totalCreditedCents: 12501,
    remainingCents: 0,
  });
  releaseFixtureReservation();
  const before = state();
  expect((await manual(0)).error?.code).toBe("PT409");
  expect(
    (
      await session("client", (db) =>
        db.rpc("prepare_payment_obligation", prepareArgs()),
      )
    ).error?.code,
  ).toBe("PT409");
  expect((await reserve(fixture.context.id)).error?.code).toBe("PT409");
  expect(state()).toEqual(before);
});

it.each([
  "missing",
  "open",
  "unknown",
  "unapplied",
  "reconcile",
  "legacy",
] as const)(
  "%s conserva incerteza sem novo manual/G/reserva nem zero inventado",
  async (mode) => {
    if (mode !== "missing") await apply(await observe());
    if (mode === "open")
      await allocateFixtureFinancialQuery(charge, randomUUID());
    if (mode === "unknown") {
      sql(
        `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found');`,
      );
      await apply(await observe());
    }
    if (mode === "unapplied") {
      change(
        "refunds=jsonb_build_array(jsonb_build_object('value',10.01,'status','DONE','dateCreated','2026-10-12 10:00:00'))",
      );
      await observe();
    }
    if (mode === "reconcile") {
      change("deleted=true");
      await apply(await observe());
    }
    if (mode === "legacy") ledger(12501, "asaas");
    const credit = await project();
    expect(credit.depositCreditCents).toBeNull();
    expect(credit.uncertain).toBe(true);
    expect(await preview()).toMatchObject({
      status: "blocked",
      reason:
        mode === "legacy"
          ? "legacy_provider_reconciliation"
          : "financial_reconciliation",
      creditedCents: null,
      totalCreditedCents: null,
      remainingCents: null,
    });
    releaseFixtureReservation();
    const before = state();
    expect((await manual()).error?.code).toBe("PT409");
    expect(
      (
        await session("client", (db) =>
          db.rpc("prepare_payment_obligation", prepareArgs()),
        )
      ).error?.code,
    ).toBe("PT409");
    expect((await reserve(fixture.context.id)).error?.code).toBe("PT409");
    expect(state()).toEqual(before);
  },
);

it("excesso explícito conserva valores e bloqueia outra cobrança sem capar o crédito", async () => {
  await apply(await observe());
  ledger(1);
  expect(await preview()).toMatchObject({
    status: "blocked",
    reason: "credit_excess",
    creditedCents: 12502,
    totalCreditedCents: 12502,
    remainingCents: null,
  });
  releaseFixtureReservation();
  const before = state();
  expect((await manual(0)).error?.code).toBe("PT409");
  expect((await reserve(fixture.context.id)).error?.code).toBe("PT409");
  expect(state()).toEqual(before);
});

it("parcial conhecido prepara somente o restante sem alterar contexto antigo", async () => {
  change("original_cents=value_cents,value_cents=10000,net_cents=9900");
  await apply(await observe());
  expect(await preview()).toMatchObject({
    status: "ready",
    creditedCents: 10000,
    totalCreditedCents: 10000,
    remainingCents: 2501,
  });
  releaseFixtureReservation();
  expect((await reserve(fixture.context.id)).error?.code).toBe("PT409");
  const r = await session("client", (db) =>
    db.rpc("prepare_payment_obligation", prepareArgs(randomUUID(), 2501)),
  );
  expect(r.error).toBeNull();
  const current = paymentObligationReceiptSchema.parse(r.data);
  expect(current.snapshot.remainingCents).toBe(2501);
  expect((await reserve(current.id)).error).toBeNull();
  expect(fixture.context.snapshot.remainingCents).toBe(12501);
  expect(
    sql(
      `select snapshot->>'remainingCents' from private.payment_obligation_contexts where id='${fixture.context.id}';`,
    ),
  ).toBe("12501");
});

it("Pix manual após parcial conhecido registra apenas o restante", async () => {
  change("original_cents=value_cents,value_cents=10000,net_cents=9900");
  await apply(await observe());
  releaseFixtureReservation();
  const r = await manual(2501);
  expect(r.error).toBeNull();
  expect(depositReceiptSchema.parse(r.data)).toMatchObject({
    amountCents: 2501,
    creditedBeforeCents: 10000,
  });
  expect(await preview()).toMatchObject({
    status: "settled",
    creditedCents: 12501,
    remainingCents: 0,
  });
  expect(state()).toMatchObject({ payments: 1, manualReceipts: 1, posts: 1 });
});

it.each([1001, 12501])(
  "devolução conhecida %s recompõe dívida exata conservando claim/reserva",
  async (amount) => {
    await apply(await observe());
    change(
      `status='${amount === 12501 ? "REFUNDED" : "RECEIVED"}',refunds=jsonb_build_array(jsonb_build_object('value',${(amount / 100).toFixed(2)},'status','DONE','dateCreated','2026-10-12 10:00:00'))`,
    );
    await apply(await observe());
    expect(await preview()).toMatchObject({
      status: "ready",
      creditedCents: 12501 - amount,
      remainingCents: amount,
    });
    expect(state()).toMatchObject({
      claims: 1,
      reservations: 1,
      posts: 1,
      manualReceipts: 0,
    });
    expect((await manual(amount)).error?.code).toBe("PT423");
  },
);

it("saldo considera sinal do provedor sem somá-lo duas vezes", async () => {
  await apply(await observe());
  await fixture.deliver(fixture.sample);
  expect(await preview("balance")).toMatchObject({
    status: "ready",
    requiredCents: fixture.sample.proposal.totalCents,
    creditedCents: 12501,
    totalCreditedCents: 12501,
    remainingCents: fixture.sample.proposal.totalCents - 12501,
  });
});

it("recibos G/reserva e snapshot v1 continuam exatos após pagamento e UNKNOWN", async () => {
  const original = await reserve(fixture.context.id, fixture.requestId);
  expect(original.error).toBeNull();
  await apply(await observe());
  await allocateFixtureFinancialQuery(charge, randomUUID());
  const before = state();
  const context = await session("client", (db) =>
    db.rpc("prepare_payment_obligation", prepareArgs(fixture.context.id)),
  );
  expect(context.error).toBeNull();
  expect(paymentObligationReceiptSchema.parse(context.data)).toEqual(
    fixture.context,
  );
  const receipt = await reserve(fixture.context.id, fixture.requestId);
  expect(receipt.error).toBeNull();
  expect(receipt.data).toEqual(original.data);
  expect(state()).toEqual(before);
});

it("recibo manual anterior continua exato com novo journal financeiro incerto", async () => {
  // Primeiro registra manual em um pedido novo, antes de existir uma charge.
  const sample = await fixture.create(),
    request = randomUUID();
  const args = {
    ...manualArgs(12501, request),
    target_quote: sample.id,
    expected_context: sample.contextHash,
  };
  const original = await session("calculator", (db) =>
    db.rpc("confirm_manual_deposit", args),
  );
  expect(original.error).toBeNull();
  // Legado sem origem explícita exige conciliação na leitura atual.
  sql(
    `insert into public.payments(order_id,kind,method,amount_cents,status,provider_ref) values('${sample.order_id}','deposit','asaas',12501,'confirmed','pay_legacy_fixture');`,
  );
  const repeated = await session("calculator", (db) =>
    db.rpc("confirm_manual_deposit", args),
  );
  expect(repeated.error).toBeNull();
  expect(repeated.data).toEqual(original.data);
  expect(
    sql(
      `select count(*) from private.manual_deposit_receipts where order_id='${sample.order_id}';`,
    ),
  ).toBe("1");
});

async function freshIntent() {
  const sample = await fixture.create();
  const context = await session("client", (db) => fixture.prepare(sample, db));
  const requestId = randomUUID(),
    result = await reserve(context.id, requestId);
  expect(result.error).toBeNull();
  return {
    sample,
    context,
    requestId,
    intentId: paymentIntentReceiptSchema.parse(result.data).snapshot.intent.id,
  };
}
it("reserva própria permite primeiro create sem falso positivo", async () => {
  const fresh = await freshIntent();
  expect((await advanceFixturePaymentExecution(fresh.requestId)).state).toBe(
    "identified",
  );
  expect(
    sql(
      `select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${fresh.intentId}';`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from private.payment_intent_reservations where intent_id='${fresh.intentId}';`,
    ),
  ).toBe("1");
});
it.each(["before_claim", "before_start"])(
  "crédito alterado %s não produz claim de despacho ou POST",
  async (when) => {
    const fresh = await freshIntent();
    const claim =
      when === "before_start"
        ? await allocateFixturePaymentExecution(fresh.requestId)
        : null;
    sql(
      `insert into public.payments(order_id,kind,method,amount_cents,status) values('${fresh.sample.order_id}','deposit','pix_manual',1000,'confirmed');`,
    );
    if (claim) {
      expect(claim.step?.action).toBe("create");
      expect(
        await startFixturePaymentExecution({
          stepId: claim.step!.id,
          workerId: claim.step!.workerId,
        }),
      ).toBe(false);
    } else {
      const current = await allocateFixturePaymentExecution(fresh.requestId);
      expect(current.step).toBeNull();
      expect(current.view.reason).toBe("context_changed");
    }
    expect(
      sql(
        `select count(*) from private.payment_intent_dispatch_claims where intent_id='${fresh.intentId}';`,
      ),
    ).toBe("0");
    expect(
      sql(
        `select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${fresh.intentId}';`,
      ),
    ).toBe("0");
    expect(
      sql(
        `select count(*) from private.payment_intent_reservations where intent_id='${fresh.intentId}';`,
      ),
    ).toBe("1");
  },
);

it.each(["not_dispatched", "indeterminate_before", "normal"])(
  "N novo recusa contexto pago antes de consumir fault %s",
  async (behavior) => {
    const args = transportArgs();
    await apply(await observe());
    sql(
      `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_create','${behavior}');`,
    );
    const before = state();
    const r = await localSystem().rpc("send_payment_fixture_request", {
      ...args,
      request_id: randomUUID(),
      slot_id: randomUUID(),
    });
    expect(r.error?.code).toBe("PT409");
    expect(
      sql(
        `select calls_left from private.payment_fixture_controls where scope_id='${fixture.scopeId}' and operation='payment_create';`,
      ),
    ).toBe("1");
    expect(state()).toEqual(before);
  },
);

it("mudança depois do start bloqueia N antes de fault e mantém proteção de despacho", async () => {
  const fresh = await freshIntent(),
    claim = await allocateFixturePaymentExecution(fresh.requestId),
    step = claim.step!;
  expect(
    await startFixturePaymentExecution({
      stepId: step.id,
      workerId: step.workerId,
    }),
  ).toBe(true);
  const protocol = executionProtocols(step).find(
    (p) => p.operation === "payment_create",
  )!;
  sql(`insert into public.payments(order_id,kind,method,amount_cents,status) values('${fresh.sample.order_id}','deposit','pix_manual',12501,'confirmed');
       insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_create','not_dispatched');`);
  const r = await localSystem().rpc("send_payment_fixture_request", {
    target_scope: fixture.scopeId,
    target_client: fixture.owner.id,
    slot_id: step.id,
    request_id: protocol.requestId,
    operation: protocol.operation,
    fingerprint: protocol.fingerprint,
    payload: protocol.payload,
  });
  expect(r.error?.code).toBe("PT409");
  expect(
    sql(
      `select count(*) from private.payment_fixture_requests where id='${protocol.requestId}';`,
    ),
  ).toBe("0");
  expect(
    sql(
      `select count(*) from private.payment_fixture_payments where intent_id='${fresh.intentId}';`,
    ),
  ).toBe("0");
  expect(
    sql(
      `select calls_left from private.payment_fixture_controls where scope_id='${fixture.scopeId}' and operation='payment_create';`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from private.payment_intent_dispatch_claims where intent_id='${fresh.intentId}';`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from private.payment_intent_reservations where intent_id='${fresh.intentId}';`,
    ),
  ).toBe("1");
  expect((await advanceFixturePaymentExecution(fresh.requestId)).state).toBe(
    "held",
  );
});

it("N conserva replay antigo e rejeita envelope divergente mesmo com incerteza", async () => {
  const args = transportArgs();
  const outcome = (
    await localSystem().rpc("send_payment_fixture_request", args)
  ).data;
  await allocateFixtureFinancialQuery(charge, randomUUID());
  const before = state();
  const repeated = await localSystem().rpc(
    "send_payment_fixture_request",
    args,
  );
  expect(repeated.error).toBeNull();
  expect(repeated.data).toEqual(outcome);
  expect(
    (
      await localSystem().rpc("send_payment_fixture_request", {
        ...args,
        fingerprint: "f".repeat(64),
      })
    ).error?.code,
  ).toBe("PT409");
  expect(state()).toEqual(before);
});

it("N relê receipt criado durante lock antes de recusar contexto financeiro alterado", async () => {
  const fresh = await freshIntent();
  const claim = await allocateFixturePaymentExecution(fresh.requestId),
    step = claim.step!;
  expect(
    await startFixturePaymentExecution({
      stepId: step.id,
      workerId: step.workerId,
    }),
  ).toBe(true);
  const protocol = executionProtocols(step).find(
    (p) => p.operation === "payment_create",
  )!;
  const args = {
    target_scope: fixture.scopeId,
    target_client: fixture.owner.id,
    slot_id: step.id,
    request_id: protocol.requestId,
    operation: protocol.operation,
    fingerprint: protocol.fingerprint,
    payload: protocol.payload as Json,
  };
  expect(
    sql(
      `select count(*) from private.payment_fixture_requests where id='${args.request_id}';`,
    ),
  ).toBe("0");
  const r = await whileLocked(
    `select id from public.clients where id='${fixture.owner.id}' for update;`,
    () => localSystem().rpc("send_payment_fixture_request", args),
    `select set_config('request.jwt.claims','{"role":"service_role"}',true);
     select public.send_payment_fixture_request('${args.target_scope}','${args.target_client}','${args.slot_id}','${args.request_id}','${args.operation}','${args.fingerprint}',${literal(args.payload)});
     insert into public.payments(order_id,kind,method,amount_cents,status) values('${fresh.sample.order_id}','deposit','pix_manual',1000,'confirmed');
     do $$ begin if private.payment_execution_context_current('${fresh.intentId}') then raise exception 'Contexto deveria estar invalido'; end if; end; $$;
     commit;`,
  );
  expect(r.error).toBeNull();
  expect(r.data).toEqual(
    JSON.parse(
      sql(
        `select outcome from private.payment_fixture_requests where id='${args.request_id}';`,
      ),
    ),
  );
  for (const replayed of [false, true])
    expect(
      sql(
        `select count(*) from private.payment_fixture_invocations where request_id='${args.request_id}' and replayed=${replayed};`,
      ),
    ).toBe("1");
  expect(
    sql(
      `select count(*) from private.payment_fixture_payments where intent_id='${fresh.intentId}';`,
    ),
  ).toBe("1");
});

it("manual espera Y concorrente e relê recebimento antes de confirmar Pix", async () => {
  const observation = await observe(),
    decision = await deriveFixtureFinancialDecision(observation),
    request = randomUUID();
  releaseFixtureReservation();
  const before = state();
  const r = await whileLocked(
    `select id from public.clients where id='${fixture.owner.id}' for update;`,
    () => manual(),
    `select set_config('request.jwt.claims','{"role":"service_role"}',true);
     select public.apply_financial_observation('${observation}','${request}',${decision.expectedRevision},${decision.expectedChargeRevision},'${decision.expectedJournalFingerprint}','${decision.action}',${literal(decision.position)});commit;`,
  );
  expect(r.error?.code).toBe("PT409");
  expect(r.error?.message).toBe("Sinal recebido pelo provedor");
  expect(state()).toMatchObject({
    payments: before.payments,
    manualReceipts: 0,
    posts: 1,
    reservations: 0,
  });
  expect(await preview()).toMatchObject({
    status: "settled",
    creditedCents: 12501,
  });
  expect(
    sql(
      `select count(*) from private.payment_financial_applications where request_id='${request}';`,
    ),
  ).toBe("1");
});

it("lock da charge coordena manual com consulta T aberta sem depender do lock do cliente", async () => {
  change("original_cents=value_cents,value_cents=10000,net_cents=9900");
  await apply(await observe());
  releaseFixtureReservation();
  const before = state(),
    query = randomUUID();
  const r = await whileLocked(
    `select id from private.payment_financial_charges where id='${charge}' for update;`,
    () => manual(2501),
    `select set_config('request.jwt.claims','{"role":"service_role"}',true);select public.allocate_financial_query('${charge}','${query}');commit;`,
  );
  expect(r.error?.code).toBe("PT409");
  expect(state()).toEqual(before);
  expect(await preview()).toMatchObject({
    status: "blocked",
    reason: "financial_reconciliation",
    creditedCents: null,
  });
});

it("helper e produtor privado não oferecem entrada direta a papéis da aplicação", async () => {
  for (const role of ["anon", "authenticated", "service_role"])
    for (const name of [
      "private.lock_order_financial_sources(uuid)",
      "private.send_payment_fixture_request(uuid,uuid,uuid,uuid,text,text,jsonb)",
    ])
      expect(
        sql(`select has_function_privilege('${role}','${name}','EXECUTE');`),
      ).toBe("f");
  const r = await session("client", (db) =>
    db.rpc("send_payment_fixture_request", transportArgs()),
  );
  expect(r.error).not.toBeNull();
});
