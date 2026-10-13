import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
vi.mock("server-only", () => ({}));
import type { Json } from "@/lib/supabase/database.types";
import { executionTransportFixture } from "../e2e/execution-transport-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { localSystem } from "../e2e/local-helper";
import { quoteSession } from "../e2e/quote-helper";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import {
  captureFixtureFinancialObservation,
  queryFixtureFinancialObservation,
} from "@/modules/payments/financial-worker";
import { deriveFixtureFinancialDecision } from "@/modules/payments/financial-projection";
import { applyFixtureFinancialObservation } from "@/modules/payments/financial-application";
import { resolveFixtureFinancialApplication } from "@/modules/payments/financial-resolution";
import { receiveFixtureAsaasWebhook } from "@/modules/payments/webhook-receipt";
import {
  claimFixturePaymentWebhook,
  queryFixturePaymentWebhook,
  webhookRunSchema,
} from "@/modules/payments/webhook-worker";
import { finalizeFixturePaymentWebhook } from "@/modules/payments/webhook-finalization";
let f: Awaited<ReturnType<typeof executionTransportFixture>> | undefined;
let charge: string, payment: string;
let prior: {
  recipient: string | null;
  email: string | null;
  phone: string | null;
  prefs: { channel: string; enabled: boolean; revision: number }[];
};
const fixture = () => f!;
const token = "ficticio-webhook-finalizacao-somente-teste-2026";
const wire = (
  eventId = "evt_fixture_" + randomUUID(),
  patch: Record<string, unknown> = {},
) =>
  JSON.stringify({
    id: eventId,
    event: "PAYMENT_RECEIVED",
    dateCreated: "2026-10-12 10:00:00",
    account: { id: "fixture-" + fixture().scopeId },
    payment: {
      ...JSON.parse(
        sql(
          `select private.payment_fixture_payment_wire(p)::text from private.payment_fixture_payments p where scope_id='${fixture().scopeId}' and id='${payment}';`,
        ),
      ),
      ...patch,
    },
  });
const receive = (body = wire()) =>
  receiveFixtureAsaasWebhook(
    new Request("https://example.test/api/webhooks/asaas", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": token,
      },
      body,
    }),
  );
async function queried() {
  const e = await receive();
  const c = webhookRunSchema.parse(
    await claimFixturePaymentWebhook(e.eventId, randomUUID()),
  );
  return (await queryFixturePaymentWebhook(c)).run;
}
const credit = () =>
  JSON.parse(
    sql(`select private.order_payment_credit('${fixture().sample.order_id}');`),
  );
const state = () =>
  sql(
    `select json_build_object('positions',(select count(*) from private.payment_financial_positions where charge_id='${charge}'),'applications',(select count(*) from private.payment_financial_applications where charge_id='${charge}'),'resolutions',(select count(*) from private.payment_financial_resolutions where charge_id='${charge}'),'payments',(select count(*) from public.payments where order_id='${fixture().sample.order_id}'),'notices',(select count(*) from public.notifications where data->>'order_id'='${fixture().sample.order_id}'),'status',(select status from public.orders where id='${fixture().sample.order_id}'),'reservations',(select count(*) from private.payment_intent_reservations where intent_id='${fixture().intentId}'));`,
  );
const gets = () =>
  Number(
    sql(
      `select count(*) from private.payment_fixture_requests where scope_id='${fixture().scopeId}' and operation='payment_get';`,
    ),
  );
async function args(c: Awaited<ReturnType<typeof queried>>) {
  const d = await deriveFixtureFinancialDecision(c.observationId!);
  return {
    target_run: c.runId,
    worker_id: c.workerId,
    expected_epoch: c.epoch,
    expected_source_fingerprint: c.sourceFingerprint,
    expected_position_revision: d.expectedRevision,
    expected_charge_revision: d.expectedChargeRevision,
    expected_journal_fingerprint: d.expectedJournalFingerprint,
    decision_action: d.action,
    position_value: d.position as unknown as Json,
  };
}
beforeEach(async () => {
  f = await executionTransportFixture();
  prior = JSON.parse(
    sql(
      `select json_build_object('recipient',(select profile_id from private.calculator_notification_recipient where singleton),'email',contact_email,'phone',contact_phone,'prefs',coalesce((select json_agg(json_build_object('channel',channel,'enabled',enabled,'revision',revision)) from public.notification_preferences where profile_id='${f.calculator.id}' and event='payment_updated'),'[]'::json)) from public.settings where singleton;`,
    ),
  );
  sql(
    `update private.calculator_notification_recipient set profile_id='${f.calculator.id}' where singleton;update public.settings set contact_email='contador@exemplo.com',contact_phone=null where singleton;delete from public.notification_preferences where profile_id='${f.calculator.id}' and event='payment_updated';`,
  );
  await advanceFixturePaymentExecution(f.requestId);
  const origin = sql(
    `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${f.intentId}' and o.facts is not null limit 1;`,
  );
  charge = (await captureFixtureFinancialObservation(origin)).chargeId;
  payment = sql(
    `select provider_payment_id from private.payment_financial_charges where id='${charge}';`,
  );
  sql(
    `update private.payment_fixture_payments set status='RECEIVED',net_cents=value_cents-100,refunds='[]',chargeback=null where scope_id='${f.scopeId}' and id='${payment}';`,
  );
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_SCOPE_ID", f.scopeId);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID", "fixture-" + f.scopeId);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_TOKEN", token);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  if (!f) return;
  try {
    sql(
      "drop trigger if exists webhook_finalization_test_fault on public.audit_log;drop function if exists private.webhook_finalization_test_fault();",
    );
    const scopes = `'${f.scopeId}','${f.otherScopeId}'`;
    sql(`update private.payment_fixture_environment set enabled=true where singleton;
      delete from public.audit_log where action in('payment_webhook_claimed','payment_webhook_queried','payment_webhook_finalized') and target_id in(select request_id from private.payment_webhook_claims where run_id in(select id from private.payment_webhook_runs where scope_id in(${scopes})) union select id from private.payment_webhook_runs where scope_id in(${scopes}));
      delete from private.payment_webhook_claims where run_id in(select id from private.payment_webhook_runs where scope_id in(${scopes}));delete from private.payment_webhook_runs where scope_id in(${scopes});
      delete from public.audit_log where action in('payment_webhook_received','payment_webhook_conflict') and target_id in(select id from private.payment_webhook_events where scope_id in(${scopes}) union select x.id from private.payment_webhook_conflicts x join private.payment_webhook_events e on e.id=x.event_id where e.scope_id in(${scopes}));
      delete from private.payment_webhook_queue where event_id in(select id from private.payment_webhook_events where scope_id in(${scopes}));delete from private.payment_webhook_conflicts where event_id in(select id from private.payment_webhook_events where scope_id in(${scopes}));delete from private.payment_webhook_events where scope_id in(${scopes});`);
    const val = (v: string | null) =>
      v === null ? "null" : "'" + v.replaceAll("'", "''") + "'";
    sql(
      `update private.calculator_notification_recipient set profile_id=${val(prior.recipient)} where singleton;update public.settings set contact_email=${val(prior.email)},contact_phone=${val(prior.phone)} where singleton;delete from public.notification_preferences where profile_id='${f.calculator.id}' and event='payment_updated';`,
    );
    for (const p of prior.prefs)
      sql(
        `insert into public.notification_preferences(profile_id,event,channel,enabled,revision) values('${f.calculator.id}','payment_updated','${p.channel}',${p.enabled},${p.revision});`,
      );
  } finally {
    await f.cleanup();
    f = undefined;
  }
}, 60000);
it("recepção→GET→Y encerra fila/efeitos/reserva na mesma transação", async () => {
  const c = await queried();
  const before = JSON.parse(state());
  const r = await finalizeFixturePaymentWebhook(c);
  expect(r.application.position).toMatchObject({
    certainty: "known",
    creditCents: 12501,
  });
  expect(r.application.effects).toEqual(["received"]);
  expect(r.resolution?.reason).toBe("financial_received");
  expect(credit()).toMatchObject({
    depositCreditCents: 12501,
    uncertain: false,
  });
  expect(JSON.parse(state())).toMatchObject({
    positions: 1,
    applications: 1,
    resolutions: 1,
    payments: 0,
    notices: before.notices + 2,
    status: "awaiting_documents",
    reservations: 0,
  });
  expect(
    sql(
      `select state from private.payment_webhook_queue where event_id='${c.eventId}';`,
    ),
  ).toBe("done");
  expect(
    sql(
      `select stage from private.payment_webhook_runs where id='${c.runId}';`,
    ),
  ).toBe("complete");
  expect(await finalizeFixturePaymentWebhook(c)).toEqual(r);
  expect(gets()).toBe(1);
  expect(
    sql(
      `select count(*) from public.notifications where data->>'application_id'='${r.applicationRequestId}';`,
    ),
  ).toBe("2");
});
it("evento antes do claim invalida crédito conhecido sem alterar recibo histórico", async () => {
  const o = await queryFixtureFinancialObservation(charge, randomUUID());
  const old = await applyFixtureFinancialObservation({
    observationId: o.observationId,
    requestId: randomUUID(),
  });
  expect(credit().depositCreditCents).toBe(12501);
  const before = state();
  await receive();
  expect(credit()).toMatchObject({
    depositCreditCents: null,
    uncertain: true,
    pendingChargeCount: 1,
  });
  expect(state()).toBe(before);
  expect(
    (
      await localSystem().rpc("get_financial_application_receipt", {
        target_observation: o.observationId,
        request_id: old.requestId,
      })
    ).data,
  ).toEqual(old);
});
it("Y fora do worker não resolve reserva enquanto houver webhook pendente", async () => {
  await receive();
  const o = await queryFixtureFinancialObservation(charge, randomUUID());
  const a = await applyFixtureFinancialObservation({
    observationId: o.observationId,
    requestId: randomUUID(),
  });
  expect(a.position?.certainty).toBe("known");
  expect(credit().uncertain).toBe(true);
  expect(
    await resolveFixtureFinancialApplication({
      applicationRequestId: a.requestId,
      requestId: randomUUID(),
    }),
  ).toBeNull();
  expect(JSON.parse(state()).reservations).toBe(1);
});
it.each([
  "expected_position_revision",
  "expected_charge_revision",
  "expected_journal_fingerprint",
  "expected_source_fingerprint",
  "worker_id",
  "expected_epoch",
] as const)("fence antigo em %s não aplica nem fecha fila", async (field) => {
  const c = await queried(),
    a = await args(c),
    before = state();
  const patch =
    field === "worker_id"
      ? randomUUID()
      : field.endsWith("fingerprint")
        ? "0".repeat(64)
        : Number(a[field]) + 1;
  const r = await localSystem().rpc("finalize_fixture_payment_webhook", {
    ...a,
    [field]: patch,
  });
  expect(r.error?.code).toBe("PT412");
  expect(state()).toBe(before);
  expect(
    sql(
      `select state from private.payment_webhook_queue where event_id='${c.eventId}';`,
    ),
  ).toBe("processing");
});
it("auditoria final com falha reverte Y,fila,avisos e resolução;retry usa GET durável", async () => {
  const c = await queried(),
    before = state();
  sql(
    `create function private.webhook_finalization_test_fault() returns trigger language plpgsql as $$begin if new.action='payment_webhook_finalized' and new.target_id='${c.runId}' then raise exception 'Falha ficticia';end if;return new;end;$$;create trigger webhook_finalization_test_fault before insert on public.audit_log for each row execute function private.webhook_finalization_test_fault();`,
  );
  await expect(finalizeFixturePaymentWebhook(c)).rejects.toThrow(
    "Finalização de webhook indisponível.",
  );
  expect(state()).toBe(before);
  expect(
    sql(
      `select state from private.payment_webhook_queue where event_id='${c.eventId}';`,
    ),
  ).toBe("processing");
  sql(
    "drop trigger webhook_finalization_test_fault on public.audit_log;drop function private.webhook_finalization_test_fault();",
  );
  expect(
    (await finalizeFixturePaymentWebhook(c)).application.position?.creditCents,
  ).toBe(12501);
  expect(gets()).toBe(1);
});
it.each(["event", "conflict"])(
  "%s após consulta invalida finalização e conserva recepção",
  async (kind) => {
    const c = await queried(),
      a = await args(c),
      before = state();
    const eid = sql(
      `select provider_event_id from private.payment_webhook_events where id='${c.eventId}';`,
    );
    await receive(kind === "event" ? wire() : wire(eid, { value: 124.01 }));
    const r = await localSystem().rpc("finalize_fixture_payment_webhook", a);
    expect(r.error?.code).toBe("PT412");
    expect(state()).toBe(before);
    expect(
      sql(
        `select stage from private.payment_webhook_runs where id='${c.runId}';`,
      ),
    ).toBe("queried");
  },
);
it("consulta T mais recente impede usar observação anterior", async () => {
  const c = await queried(),
    a = await args(c);
  await queryFixtureFinancialObservation(charge, randomUUID());
  expect(
    (await localSystem().rpc("finalize_fixture_payment_webhook", a)).error
      ?.code,
  ).toBe("PT412");
  expect(JSON.parse(state()).positions).toBe(0);
});
it("reclaim troca worker/epoch e conserva consulta,callback antigo é recusado", async () => {
  const c = await queried();
  sql(
    `update private.payment_webhook_runs set lease_until=clock_timestamp()-interval '1 second' where id='${c.runId}';`,
  );
  const next = webhookRunSchema.parse(
    await claimFixturePaymentWebhook(c.eventId, randomUUID()),
  );
  expect(next).toMatchObject({
    runId: c.runId,
    queryId: c.queryId,
    epoch: c.epoch + 1,
  });
  await expect(finalizeFixturePaymentWebhook(c)).rejects.toThrow();
  expect(
    (await finalizeFixturePaymentWebhook(next)).application.position
      ?.creditCents,
  ).toBe(12501);
  expect(gets()).toBe(1);
});
it("status desconhecido fecha recepção mas não fabrica zero,crédito ou resolução", async () => {
  sql(
    `update private.payment_fixture_payments set status='UNKNOWN' where scope_id='${fixture().scopeId}' and id='${payment}';`,
  );
  const r = await finalizeFixturePaymentWebhook(await queried());
  expect(r.application.position).toMatchObject({
    certainty: "reconcile",
    creditCents: null,
    lastKnownCreditCents: null,
  });
  expect(r.resolution).toBeNull();
  expect(credit()).toMatchObject({ depositCreditCents: null, uncertain: true });
  expect(JSON.parse(state())).toMatchObject({ payments: 0, reservations: 1 });
});
it.each(["client", "calculator", "admin"] as const)(
  "%s não chama finalização ou lê receipt interno",
  async (role) => {
    const c = await queried(),
      a = await args(c),
      before = state(),
      db = await quoteSession(role);
    try {
      expect(
        (await db.rpc("finalize_fixture_payment_webhook", a)).error,
      ).not.toBeNull();
      expect(
        (
          await db.rpc("get_fixture_webhook_finalization_receipt", {
            target_run: c.runId,
            worker_id: c.workerId,
            expected_epoch: c.epoch,
          })
        ).error,
      ).not.toBeNull();
    } finally {
      await db.auth.signOut({ scope: "local" });
    }
    expect(state()).toBe(before);
  },
);
it("resposta perdida após commit retoma receipt sem novo efeito ou GET", async () => {
  const c = await queried(),
    originalFetch = globalThis.fetch;
  let lost = false;
  const interception = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (...a) => {
      const response = await originalFetch(...a),
        input = a[0];
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (
        !lost &&
        url.endsWith("/rpc/finalize_fixture_payment_webhook") &&
        response.ok
      ) {
        lost = true;
        throw new Error("Resposta ficticia perdida");
      }
      return response;
    });
  try {
    await expect(finalizeFixturePaymentWebhook(c)).rejects.toThrow();
    expect(lost).toBe(true);
  } finally {
    interception.mockRestore();
  }
  const before = state(),
    r = await finalizeFixturePaymentWebhook(c);
  expect(r.application.effects).toEqual(["received"]);
  expect(state()).toBe(before);
  expect(gets()).toBe(1);
});
it("marker desligado conserva fila e não aplica efeitos", async () => {
  const c = await queried(),
    before = state();
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  await expect(finalizeFixturePaymentWebhook(c)).rejects.toThrow();
  expect(state()).toBe(before);
});

it("finalizações concorrentes retornam o mesmo receipt e um único efeito", async () => {
  const c = await queried();
  const [a, b] = await Promise.all([
    finalizeFixturePaymentWebhook(c),
    finalizeFixturePaymentWebhook(c),
  ]);
  expect(a).toEqual(b);
  expect(JSON.parse(state())).toMatchObject({
    applications: 1,
    resolutions: 1,
  });
  expect(
    sql(
      `select count(*) from public.audit_log where action='payment_webhook_finalized' and target_id='${c.runId}';`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from public.notifications where data->>'application_id'='${a.applicationRequestId}';`,
    ),
  ).toBe("2");
});

it("receipt completo permanece válido depois de expirar lease e é imutável", async () => {
  const c = await queried();
  sql(
    `with changed as(update private.payment_webhook_runs set lease_until=clock_timestamp()+interval '2 seconds' where id='${c.runId}' returning lease_until,worker_id) update private.payment_webhook_queue q set lease_until=x.lease_until from changed x where q.worker_id=x.worker_id;`,
  );
  const r = await finalizeFixturePaymentWebhook(c),
    before = state();
  await expect
    .poll(
      () =>
        sql(
          `select lease_until<clock_timestamp() from private.payment_webhook_runs where id='${c.runId}';`,
        ),
      { timeout: 5000 },
    )
    .toBe("t");
  expect(await finalizeFixturePaymentWebhook(c)).toEqual(r);
  expect(state()).toBe(before);
  expect(() =>
    sql(
      `update private.payment_webhook_runs set finalization_result='{}' where id='${c.runId}';`,
    ),
  ).toThrow();
  expect(await finalizeFixturePaymentWebhook(c)).toEqual(r);
});

it("webhook pendente bloqueia sinal manual após parcial conhecido sem reserva", async () => {
  sql(
    `update private.payment_fixture_payments set original_cents=value_cents,value_cents=10000,net_cents=9900 where scope_id='${fixture().scopeId}' and id='${payment}';`,
  );
  const o = await queryFixtureFinancialObservation(charge, randomUUID());
  await applyFixtureFinancialObservation({
    observationId: o.observationId,
    requestId: randomUUID(),
  });
  // Isola a guarda de pendência do bloqueio prévio de reserva, no próprio ensaio.
  sql(
    `delete from private.payment_intent_reservations where intent_id='${fixture().intentId}' and order_id='${fixture().sample.order_id}';`,
  );
  expect(credit()).toMatchObject({
    depositCreditCents: 10000,
    remainingDepositCents: 2501,
    uncertain: false,
  });
  const client = await quoteSession();
  try {
    const p = await client.rpc("get_payment_obligation", {
      target_order: fixture().sample.order_id,
      target_phase: "deposit",
    });
    expect(p.error).toBeNull();
    expect(p.data).toMatchObject({
      status: "ready",
      creditedCents: 10000,
      remainingCents: 2501,
    });
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
  await receive();
  const before = state(),
    db = await quoteSession("calculator");
  try {
    const r = await db.rpc("confirm_manual_deposit", {
      target_quote: fixture().sample.id,
      expected_context: fixture().sample.contextHash,
      expected_remaining_cents: 2501,
      request_id: randomUUID(),
      confirmed: true,
    });
    expect(r.error?.code).toBe("PT409");
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  expect(state()).toBe(before);
  expect(credit().uncertain).toBe(true);
});

it("webhook recebido enquanto o sinal manual espera pedido revoga o saldo lido", async () => {
  sql(
    `update private.payment_fixture_payments set original_cents=value_cents,value_cents=10000,net_cents=9900 where scope_id='${fixture().scopeId}' and id='${payment}';`,
  );
  const o = await queryFixtureFinancialObservation(charge, randomUUID());
  await applyFixtureFinancialObservation({
    observationId: o.observationId,
    requestId: randomUUID(),
  });
  sql(
    `delete from private.payment_intent_reservations where intent_id='${fixture().intentId}' and order_id='${fixture().sample.order_id}';`,
  );
  expect(credit()).toMatchObject({
    depositCreditCents: 10000,
    remainingDepositCents: 2501,
    uncertain: false,
  });
  const before = state(),
    db = await quoteSession("calculator"),
    name = "webhook_manual_" + randomUUID().replaceAll("-", "");
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
  let pending: PromiseLike<{ error: { code?: string } | null }> | undefined;
  try {
    child.stdin.write(
      `set application_name='${name}';set statement_timeout=8000;set idle_in_transaction_session_timeout=8000;begin;select id from public.orders where id='${fixture().sample.order_id}' for update;\n\\echo WEBHOOK_MANUAL_HELD\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("WEBHOOK_MANUAL_HELD");
    pending = Promise.resolve(
      db.rpc("confirm_manual_deposit", {
        target_quote: fixture().sample.id,
        expected_context: fixture().sample.contextHash,
        expected_remaining_cents: 2501,
        request_id: randomUUID(),
        confirmed: true,
      }),
    );
    await expect
      .poll(
        () =>
          sql(
            `select count(*) from pg_stat_activity b where b.wait_event_type='Lock' and exists(select 1 from pg_stat_activity a where a.application_name='${name}' and a.pid=any(pg_blocking_pids(b.pid)));`,
          ),
        { timeout: 3000 },
      )
      .toBe("1");
    await receive();
    expect(credit().uncertain).toBe(true);
    child.stdin.end("commit;\n\\q\n");
    expect(await done).toBe(0);
    expect((await pending).error?.code).toBe("PT409");
    expect(state()).toBe(before);
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (pending) await pending;
    await db.auth.signOut({ scope: "local" });
  }
}, 30000);

it("observador não vê crédito antes do lote;recepção concorrente espera a transação", async () => {
  const c = await queried(),
    before = state(),
    name = "webhook_barrier_" + randomUUID().replaceAll("-", "");
  const barrier = "webhook-final-test:" + c.runId;
  sql(
    `create function private.webhook_finalization_test_fault() returns trigger language plpgsql as $$begin if new.action='payment_webhook_finalized' and new.target_id='${c.runId}' then perform pg_advisory_xact_lock(hashtextextended('${barrier}',0));end if;return new;end;$$;create trigger webhook_finalization_test_fault before insert on public.audit_log for each row execute function private.webhook_finalization_test_fault();`,
  );
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
    final:
      | Promise<Awaited<ReturnType<typeof finalizeFixturePaymentWebhook>>>
      | undefined,
    newEvent: ReturnType<typeof receive> | undefined;
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", () => {});
  const done = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  const waiters = () =>
    Number(
      sql(
        `with recursive blocked(pid) as(select pid from pg_stat_activity where application_name='${name}' union select b.pid from pg_stat_activity b join blocked p on p.pid=any(pg_blocking_pids(b.pid)) where b.wait_event_type='Lock') select count(*)-1 from blocked;`,
      ),
    );
  try {
    child.stdin.write(
      `set application_name='${name}';set statement_timeout=8000;set idle_in_transaction_session_timeout=8000;begin;select pg_advisory_xact_lock(hashtextextended('${barrier}',0));\n\\echo WEBHOOK_BARRIER_HELD\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("WEBHOOK_BARRIER_HELD");
    final = finalizeFixturePaymentWebhook(c);
    await expect.poll(waiters, { timeout: 3000 }).toBe(1);
    expect(state()).toBe(before);
    expect(
      sql(
        `select state from private.payment_webhook_queue where event_id='${c.eventId}';`,
      ),
    ).toBe("processing");
    newEvent = receive();
    await expect.poll(waiters, { timeout: 3000 }).toBe(2);
    expect(state()).toBe(before);
    child.stdin.end("commit;\n\\q\n");
    expect(await done).toBe(0);
    const [r, e] = await Promise.all([final, newEvent]);
    expect(r.application.position?.creditCents).toBe(12501);
    expect(
      sql(
        `select state from private.payment_webhook_queue where event_id='${e.eventId}';`,
      ),
    ).toBe("pending");
    expect(credit()).toMatchObject({
      depositCreditCents: null,
      uncertain: true,
    });
    expect(JSON.parse(state())).toMatchObject({
      applications: 1,
      resolutions: 1,
    });
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (final) await final;
    if (newEvent) await newEvent;
  }
}, 30000);
