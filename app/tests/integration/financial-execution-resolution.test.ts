import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import type { Json } from "@/lib/supabase/database.types";
import { executionTransportFixture } from "../e2e/execution-transport-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { localSystem } from "../e2e/local-helper";
import { quoteSession } from "../e2e/quote-helper";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import {
  allocateFixturePaymentExecution,
  startFixturePaymentExecution,
  prepareFixturePaymentExecution,
} from "@/modules/payments/execution-system";
import {
  captureFixtureFinancialObservation,
  queryFixtureFinancialObservation,
  allocateFixtureFinancialQuery,
} from "@/modules/payments/financial-worker";
import {
  deriveFixtureFinancialDecision,
  orderCreditProjectionSchema,
} from "@/modules/payments/financial-projection";
import { applyFixtureFinancialObservation } from "@/modules/payments/financial-application";
import {
  resolveFixtureFinancialApplication,
  getFixtureFinancialExecutionResolution,
  financialResolutionReceiptSchema,
} from "@/modules/payments/financial-resolution";
import {
  resumeFixturePaymentExecution,
  getFixturePaymentExecutionResolution,
  paymentResolutionReceiptSchema,
} from "@/modules/payments/execution-resolution";
import {
  currentPaymentIntentSchema,
  paymentIntentReceiptSchema,
} from "@/modules/payments/intents";
import { currentPaymentExecutionViewSchema } from "@/modules/payments/execution-data";
let fixture: Awaited<ReturnType<typeof executionTransportFixture>>,
  charge: string,
  payment: string;
type Application = Awaited<ReturnType<typeof applyFixtureFinancialObservation>>;
let priorNotice: {
  recipient: string | null;
  prefs: { channel: string; enabled: boolean; revision: number }[];
};
const literal = (value: unknown) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const change = (patch: string) =>
  sql(
    `update private.payment_fixture_payments set ${patch} where scope_id='${fixture.scopeId}' and id='${payment}';`,
  );
const observe = async () =>
  (await queryFixtureFinancialObservation(charge, randomUUID())).observationId;
const apply = async () =>
  applyFixtureFinancialObservation({
    observationId: await observe(),
    requestId: randomUUID(),
  });
const resolve = (a: Application, requestId: string = randomUUID()) =>
  resolveFixtureFinancialApplication({
    applicationRequestId: a.requestId,
    requestId,
  });
const raw = (a: Application, requestId: string = randomUUID()) =>
  localSystem().rpc("resolve_financial_execution", {
    target_application: a.requestId,
    request_id: requestId,
  });
const state = () =>
  JSON.parse(
    sql(`select json_build_object(
 'run',(select json_build_object('id',id,'state',state,'reason',reason,'revision',revision,'step',current_step,'payment',selected_payment_id) from private.payment_execution_runs where intent_id='${fixture.intentId}'),
 'claim',(select row_to_json(c) from private.payment_intent_dispatch_claims c where c.intent_id='${fixture.intentId}'),
 'active',(select count(*) from private.payment_intent_reservations where intent_id='${fixture.intentId}'),
 'resolutions',(select count(*) from private.payment_financial_resolutions where intent_id='${fixture.intentId}'),
 'sResolutions',(select count(*) from private.payment_intent_resolutions where intent_id='${fixture.intentId}'),
 'audits',(select count(*) from public.audit_log where action='payment_financial_resolved' and target_id in(select request_id from private.payment_financial_resolutions where intent_id='${fixture.intentId}')),
 'posts',(select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${fixture.intentId}'),
 'position',(select row_to_json(p) from private.payment_financial_positions p where charge_id='${charge}'),
 'applications',(select count(*) from private.payment_financial_applications where charge_id='${charge}'),
 'events',(select count(*) from public.timeline_events where order_id='${fixture.sample.order_id}'),
 'notices',(select count(*) from public.notifications where data->>'order_id'='${fixture.sample.order_id}'));`),
  );
const refund = (value = 125.01, status = "DONE") => ({
  value,
  status,
  dateCreated: "2026-10-12 10:00:00",
});
const fault = () =>
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior,calls_left) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found',1) on conflict(scope_id,client_id,operation) do update set behavior='not_found',calls_left=1;`,
  );
const sqlRole = `select set_config('request.jwt.claims','{"role":"service_role"}',true);`;
async function whileLocked<T>(
  lockSql: string,
  operation: () => PromiseLike<T>,
  releaseSql = "commit;",
) {
  const name = "financial-terminal-" + randomUUID(),
    child = spawn(
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
  child.stdout.on("data", (v: Buffer) => {
    output += v.toString();
  });
  child.stderr.on("data", (v: Buffer) => {
    errors += v.toString();
  });
  const done = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  try {
    child.stdin.write(
      `set application_name='${name}';set statement_timeout=8000;set idle_in_transaction_session_timeout=8000;begin;${lockSql}\n\\echo FINANCIAL_TERMINAL_LOCK\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("FINANCIAL_TERMINAL_LOCK");
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
  fixture = await executionTransportFixture();
  priorNotice = JSON.parse(
    sql(
      `select json_build_object('recipient',(select profile_id from private.calculator_notification_recipient where singleton),'prefs',coalesce((select json_agg(json_build_object('channel',channel,'enabled',enabled,'revision',revision)) from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated'),'[]'::json));`,
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
  if (fixture)
    try {
      sql(
        `update private.calculator_notification_recipient set profile_id=${priorNotice.recipient ? "'" + priorNotice.recipient + "'" : "null"} where singleton;delete from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated';`,
      );
      for (const pref of priorNotice.prefs)
        sql(
          `insert into public.notification_preferences(profile_id,event,channel,enabled,revision) values('${fixture.calculator.id}','payment_updated','${pref.channel}',${pref.enabled},${pref.revision});`,
        );
    } finally {
      await fixture.cleanup();
    }
});

it("recebimento integral resolve uma execução e libera somente sua própria reserva", async () => {
  const a = await apply(),
    before = state(),
    requestId = randomUUID(),
    result = await raw(a, requestId);
  expect(result.error).toBeNull();
  const r = await resolve(a, requestId);
  expect(r).not.toBeNull();
  expect(r).toMatchObject({
    reason: "financial_received",
    applicationRequestId: a.requestId,
    positionRevision: a.positionRevision,
    chargeRevision: a.chargeRevision,
    journalFingerprint: a.journalFingerprint,
    expectedRunRevision: before.run.revision,
    appliedRunRevision: before.run.revision + 1,
  });
  expect(state()).toMatchObject({
    active: 0,
    resolutions: 1,
    sResolutions: 0,
    audits: 1,
    posts: 1,
    claim: before.claim,
    run: {
      state: "resolved",
      reason: "financial_received",
      step: null,
      revision: before.run.revision + 1,
    },
    position: before.position,
    events: before.events,
    notices: before.notices,
  });
  expect(
    await getFixtureFinancialExecutionResolution(fixture.requestId),
  ).toEqual(r);
  expect(
    await getFixturePaymentExecutionResolution(fixture.requestId),
  ).toBeNull();
  const db = await quoteSession();
  try {
    const intent = await db.rpc("get_payment_intent", {
      target_intent: fixture.intentId,
    });
    expect(intent.error).toBeNull();
    expect(currentPaymentIntentSchema.parse(intent.data)).toMatchObject({
      state: "resolved",
      revision: 2,
      reservationActive: false,
      resolutionReason: "financial_received",
    });
    const view = await db.rpc("get_payment_execution", {
      target_intent: fixture.intentId,
    });
    expect(view.error).toBeNull();
    expect(currentPaymentExecutionViewSchema.parse(view.data)).toEqual(r!.view);
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
});
it("devolução integral conhecida usa terminal financeiro separado de S", async () => {
  await apply();
  change(`status='REFUNDED',refunds=${literal([refund()])}`);
  const a = await apply(),
    before = state(),
    r = await resolve(a);
  expect(a.position?.resolutionCandidate).toBe("refunded");
  expect(r?.reason).toBe("financial_refunded");
  expect(state()).toMatchObject({
    active: 0,
    resolutions: 1,
    sResolutions: 0,
    claim: before.claim,
    posts: 1,
  });
  expect(paymentResolutionReceiptSchema.safeParse(r).success).toBe(false);
});
it.each(["partial", "partial_refund", "pending_refund", "dispute"])(
  "%s conserva run/reserva sem terminal financeiro",
  async (kind) => {
    if (kind !== "partial") await apply();
    if (kind === "partial")
      change("original_cents=value_cents,value_cents=10000,net_cents=9900");
    if (kind === "partial_refund")
      change(`refunds=${literal([refund(10.01)])}`);
    if (kind === "pending_refund")
      change(`refunds=${literal([refund(10.01, "PENDING")])}`);
    if (kind === "dispute")
      change(
        `status='CHARGEBACK_DISPUTE',chargeback=${literal({ status: "IN_DISPUTE", fixtureProof: { schemaVersion: 1, semantics: "fixture_chargeback_cumulative", paymentId: payment, reference: fixture.intentId, caseId: "case_fixture", debit: { id: "debit_fixture", value: 20.01, effectedAt: "2026-10-12T10:00:00-03:00" }, reversals: [] } })}`,
      );
    const a = await apply(),
      before = state();
    expect(a.position?.resolutionCandidate).toBeNull();
    expect(await resolve(a)).toBeNull();
    expect(state()).toEqual(before);
  },
);
it.each(["open", "unknown", "unknown_applied", "conflict"])(
  "%s depois de Y impede resolução com recibo antigo",
  async (kind) => {
    const a = await apply();
    if (kind === "open")
      await allocateFixtureFinancialQuery(charge, randomUUID());
    if (kind === "unknown" || kind === "unknown_applied") {
      fault();
      const o = await observe();
      if (kind === "unknown_applied")
        await applyFixtureFinancialObservation({
          observationId: o,
          requestId: randomUUID(),
        });
    }
    if (kind === "conflict")
      sql(
        `insert into private.payment_financial_conflicts(observation_id,attempt_hash) values('${a.observationId}','${"b".repeat(64)}');`,
      );
    const before = state();
    expect(await resolve(a)).toBeNull();
    expect(state()).toEqual(before);
  },
);
it("same antigo com três fences coincidentes não confirma captura atual", async () => {
  const first = await apply();
  change("net_cents=value_cents-200");
  await apply();
  const d = await deriveFixtureFinancialDecision(first.observationId);
  const stale = await localSystem().rpc("apply_financial_observation", {
    target_observation: first.observationId,
    request_id: randomUUID(),
    expected_position_revision: d.expectedRevision,
    expected_charge_revision: d.expectedChargeRevision,
    expected_journal_fingerprint: d.expectedJournalFingerprint,
    decision_action: "same",
    position_value: d.position as unknown as Json,
  });
  expect(stale.error).toBeNull();
  const a = stale.data as unknown as Application,
    before = state();
  expect(a.positionRevision).toBe(before.position.revision);
  expect(a.chargeRevision).toBe(before.position.charge_revision);
  expect(a.journalFingerprint).toBe(before.position.journal_fingerprint);
  expect(await resolve(a)).toBeNull();
  expect(state()).toEqual(before);
});
it("consulta corrente equivalente permite resolver same conhecido", async () => {
  await apply();
  fault();
  await observe();
  const current = await apply();
  expect(current.action).toBe("same");
  expect(current.position?.certainty).toBe("known");
  expect((await resolve(current))?.reason).toBe("financial_received");
});
it.each(["missing", "different"])(
  "primeira reserva %s falha sem terminal ou liberação alheia",
  async (kind) => {
    const a = await apply(),
      other = kind === "different" ? fixture.sample : await fixture.create();
    // Preparação negativa local: a origem antiga não tem mais sua reserva.
    sql(
      `delete from private.payment_intent_reservations where intent_id='${fixture.intentId}';`,
    );
    if (kind === "different") await fixture.deliver(other);
    const db = await quoteSession();
    let otherIntent: string;
    try {
      const context = await fixture.prepare(
          other,
          db,
          kind === "different" ? "balance" : "deposit",
        ),
        receipt = await db.rpc("reserve_payment_intent", {
          target_context: context.id,
          request_id: randomUUID(),
        });
      expect(receipt.error).toBeNull();
      otherIntent = paymentIntentReceiptSchema.parse(receipt.data).snapshot
        .intent.id;
    } finally {
      await db.auth.signOut({ scope: "local" });
    }
    const before = state(),
      r = await raw(a);
    expect(r.error?.code).toBe("PT409");
    expect(state()).toEqual(before);
    expect(
      sql(
        `select count(*) from private.payment_intent_reservations where intent_id='${otherIntent}';`,
      ),
    ).toBe("1");
  },
);
it("replay precede marker/cobertura e request divergente não cria segundo terminal", async () => {
  const a = await apply(),
    requestId = randomUUID(),
    first = await resolve(a, requestId),
    before = state();
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  expect(await resolve(a, requestId)).toEqual(first);
  expect(
    await getFixtureFinancialExecutionResolution(fixture.requestId),
  ).toEqual(first);
  const invalid = await localSystem().rpc("get_financial_resolution_receipt", {
    target_application: randomUUID(),
    request_id: requestId,
  });
  expect(invalid.error?.code).toBe("PT409");
  expect(state()).toEqual(before);
  sql(
    "update private.payment_fixture_environment set enabled=true where singleton;",
  );
  expect((await raw(a)).error?.code).toBe("PT409");
  expect(state()).toEqual(before);
});
it("rollback depois de terminal/DELETE/journal/auditoria recompõe tudo", async () => {
  const a = await apply(),
    before = state();
  sql(
    `begin;${sqlRole}select public.resolve_financial_execution('${a.requestId}','${randomUUID()}');do $$begin if exists(select 1 from private.payment_intent_reservations where intent_id='${fixture.intentId}') then raise exception 'Reserva nao removida no ensaio';end if;end;$$;rollback;`,
  );
  expect(state()).toEqual(before);
  expect((await resolve(a))?.reason).toBe("financial_received");
});
it("falha da transação após liberação não deixa terminal parcial", async () => {
  const a = await apply(),
    before = state();
  expect(() =>
    sql(
      `begin;${sqlRole}select public.resolve_financial_execution('${a.requestId}','${randomUUID()}');select 1/0;commit;`,
    ),
  ).toThrow("Consulta das fixtures de aviso não concluída.");
  expect(state()).toEqual(before);
});
it("resoluções concorrentes com o mesmo request recuperam um receipt e um DELETE", async () => {
  const a = await apply(),
    requestId = randomUUID();
  const result = await Promise.all([
    resolve(a, requestId),
    resolve(a, requestId),
  ]);
  expect(result[0]).toEqual(result[1]);
  expect(state()).toMatchObject({
    resolutions: 1,
    audits: 1,
    active: 0,
    posts: 1,
  });
});
it("resoluções concorrentes com requests diferentes não duplicam terminal", async () => {
  const a = await apply(),
    result = await Promise.allSettled([resolve(a), resolve(a)]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(state()).toMatchObject({
    resolutions: 1,
    audits: 1,
    active: 0,
    posts: 1,
  });
});

it("outro processo recupera o receipt exato sem nova liberação", async () => {
  const a = await apply(),
    requestId = randomUUID(),
    first = await resolve(a, requestId),
    before = state();
  const code = `import {resolveFixtureFinancialApplication} from './src/modules/payments/financial-resolution.ts'; const receipt=await resolveFixtureFinancialApplication(${JSON.stringify({ applicationRequestId: a.requestId, requestId })});process.stdout.write(JSON.stringify({pid:process.pid,receipt}));`;
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        code,
      ],
      {
        env: process.env,
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 8192,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  expect(result.pid).not.toBe(process.pid);
  expect(result.receipt).toEqual(first);
  expect(state()).toEqual(before);
});

it("claim/start/prepare/finish atrasados não reabrem execução financeira", async () => {
  const a = await apply(),
    claim = await allocateFixturePaymentExecution(fixture.requestId),
    step = claim.step!;
  expect(step.action).toBe("find");
  expect(
    await startFixturePaymentExecution({
      stepId: step.id,
      workerId: step.workerId,
    }),
  ).toBe(true);
  const receipt = await resolve(a),
    before = state();
  expect(
    (await allocateFixturePaymentExecution(fixture.requestId)).step,
  ).toBeNull();
  expect(
    await prepareFixturePaymentExecution({
      stepId: step.id,
      workerId: step.workerId,
    }),
  ).toBe(false);
  expect(
    await startFixturePaymentExecution({
      stepId: step.id,
      workerId: step.workerId,
    }),
  ).toBe(false);
  const frame = await localSystem().rpc("get_payment_execution_step", {
    target_step: step.id,
    worker_id: step.workerId,
  });
  expect(frame.error).toBeNull();
  expect(frame.data).toBeNull();
  const late = await localSystem().rpc("finish_payment_execution_step", {
    target_step: step.id,
    worker_id: step.workerId,
    body_hash: null,
    normalizer_version: 1,
    facts: null,
  });
  expect(late.error).toBeNull();
  expect(late.data).toEqual(receipt!.view);
  expect(await advanceFixturePaymentExecution(fixture.requestId)).toEqual(
    receipt!.view,
  );
  expect(await resumeFixturePaymentExecution(fixture.requestId)).toEqual(
    receipt!.view,
  );
  expect(state()).toEqual(before);
  expect(
    sql(
      `select count(*) from private.payment_execution_observations where step_id='${step.id}';`,
    ),
  ).toBe("1");
});

it("contextos e receipts v1/Y permanecem exatos depois de terminal e estorno", async () => {
  const a = await apply(),
    saved = sql(
      `select json_build_object('context',(select row_to_json(c) from private.payment_obligation_contexts c where c.id='${fixture.context.id}'),'intent',(select result from private.payment_intent_requests where id='${fixture.requestId}'),'application',(select result from private.payment_financial_applications where request_id='${a.requestId}'));`,
    );
  await resolve(a);
  change(`status='REFUNDED',refunds=${literal([refund()])}`);
  await apply();
  expect(
    sql(
      `select json_build_object('context',(select row_to_json(c) from private.payment_obligation_contexts c where c.id='${fixture.context.id}'),'intent',(select result from private.payment_intent_requests where id='${fixture.requestId}'),'application',(select result from private.payment_financial_applications where request_id='${a.requestId}'));`,
    ),
  ).toBe(saved);
  const db = await quoteSession();
  try {
    const repeated = await db.rpc("reserve_payment_intent", {
      target_context: fixture.context.id,
      request_id: fixture.requestId,
    });
    expect(repeated.error).toBeNull();
    expect(paymentIntentReceiptSchema.parse(repeated.data).snapshot.state).toBe(
      "reserved",
    );
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
});

it("terminal financeiro recusa N novo antes de fault mesmo com reserva sintética reinserida", async () => {
  const args = JSON.parse(
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
  const original = (
    await localSystem().rpc("send_payment_fixture_request", args)
  ).data;
  await resolve(await apply());
  // Negativo exclusivo local: journal terminal não pode depender só do DELETE.
  sql(
    `insert into private.payment_intent_reservations(order_id,intent_id) values('${fixture.sample.order_id}','${fixture.intentId}');insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_create','not_dispatched');`,
  );
  expect(
    (await localSystem().rpc("send_payment_fixture_request", args)).data,
  ).toEqual(original);
  const requestId = randomUUID(),
    r = await localSystem().rpc("send_payment_fixture_request", {
      ...args,
      slot_id: randomUUID(),
      request_id: requestId,
    });
  expect(r.error?.code).toBe("PT409");
  expect(r.error?.message).toBe("Intencao financeiramente resolvida");
  expect(
    sql(
      `select count(*) from private.payment_fixture_requests where id='${requestId}';`,
    ),
  ).toBe("0");
  expect(
    sql(
      `select calls_left from private.payment_fixture_controls where scope_id='${fixture.scopeId}' and operation='payment_create';`,
    ),
  ).toBe("1");
});

it.each(["refund", "chargeback", "unknown"])(
  "%s tardio preserva terminal antigo e reserva/claim posteriores",
  async (kind) => {
    const a = await apply(),
      requestId = randomUUID(),
      old = await resolve(a, requestId),
      oldState = state();
    await fixture.deliver(fixture.sample);
    const db = await quoteSession();
    let fresh: string, executionRequest: string;
    try {
      const context = await fixture.prepare(fixture.sample, db, "balance");
      executionRequest = randomUUID();
      const result = await db.rpc("reserve_payment_intent", {
        target_context: context.id,
        request_id: executionRequest,
      });
      expect(result.error).toBeNull();
      fresh = paymentIntentReceiptSchema.parse(result.data).snapshot.intent.id;
    } finally {
      await db.auth.signOut({ scope: "local" });
    }
    expect((await advanceFixturePaymentExecution(executionRequest)).state).toBe(
      "identified",
    );
    const freshOrigin = sql(
      `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${fresh}' limit 1;`,
    );
    await captureFixtureFinancialObservation(freshOrigin);
    const newState = () =>
        sql(
          `select json_build_object('reservation',(select row_to_json(r) from private.payment_intent_reservations r where r.intent_id='${fresh}'),'claim',(select row_to_json(c) from private.payment_intent_dispatch_claims c where c.intent_id='${fresh}'),'run',(select row_to_json(x) from private.payment_execution_runs x where x.intent_id='${fresh}'),'posts',(select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${fresh}'));`,
        ),
      beforeNew = newState();
    if (kind === "refund")
      change(`status='REFUNDED',refunds=${literal([refund()])}`);
    if (kind === "chargeback")
      change(
        `status='CHARGEBACK_DISPUTE',chargeback=${literal({ status: "DONE", fixtureProof: { schemaVersion: 1, semantics: "fixture_chargeback_cumulative", paymentId: payment, reference: fixture.intentId, caseId: "case_fixture", debit: { id: "debit_fixture", value: 20.01, effectedAt: "2026-10-12T10:00:00-03:00" }, reversals: [] } })}`,
      );
    if (kind === "unknown") fault();
    const later = await apply();
    expect(later.effects).toContain(
      kind === "unknown" ? "reconcile" : "debited",
    );
    if (kind === "refund") expect(later.position?.creditCents).toBe(0);
    if (kind === "chargeback") expect(later.position?.creditCents).toBe(10500);
    if (kind === "unknown") expect(later.position?.certainty).toBe("reconcile");
    expect(state().run).toEqual(oldState.run);
    expect(state().claim).toEqual(oldState.claim);
    expect(state().active).toBe(0);
    expect(await resolve(a, requestId)).toEqual(old);
    expect(await resumeFixturePaymentExecution(fixture.requestId)).toEqual(
      old!.view,
    );
    expect(newState()).toBe(beforeNew);
    expect((await raw(later)).error?.code).toBe("PT409");
    const reader = await quoteSession();
    try {
      const r = await reader.rpc("get_order_financial_projection", {
        target_order: fixture.sample.order_id,
      });
      expect(r.error).toBeNull();
      const credit = orderCreditProjectionSchema.parse(r.data);
      expect(credit.depositCreditCents).toBe(
        kind === "unknown" ? null : kind === "refund" ? 0 : 10500,
      );
      expect(credit.totalCreditCents).toBeNull(); // A charge do saldo ainda nao tem posicao aplicada.
    } finally {
      await reader.auth.signOut({ scope: "local" });
    }
  },
);

it("resolução versus manual não atribui ao calculista um sinal recebido", async () => {
  const a = await apply(),
    db = await quoteSession("calculator");
  try {
    const result = await Promise.all([
      resolve(a),
      db.rpc("confirm_manual_deposit", {
        target_quote: fixture.sample.id,
        expected_context: fixture.sample.contextHash,
        expected_remaining_cents: 0,
        request_id: randomUUID(),
        confirmed: true,
      }),
    ]);
    expect(result[0]?.reason).toBe("financial_received");
    expect(result[1].error?.code).toBe("PT409");
    expect(
      sql(
        `select count(*) from private.manual_deposit_receipts where order_id='${fixture.sample.order_id}';`,
      ),
    ).toBe("0");
    expect(state()).toMatchObject({
      active: 0,
      resolutions: 1,
      audits: 1,
      posts: 1,
    });
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
});

it("resolução espera charge e relê consulta T concorrente antes de liberar", async () => {
  const a = await apply(),
    before = state(),
    query = randomUUID();
  const r = await whileLocked(
    `select id from private.payment_financial_charges where id='${charge}' for update;`,
    () => raw(a),
    `${sqlRole}select public.allocate_financial_query('${charge}','${query}');commit;`,
  );
  expect(r.error).toBeNull();
  expect(r.data).toBeNull();
  expect(state()).toEqual(before);
});

it("receipt surgido durante espera de lock é relido antes de reserva/terminal atuais", async () => {
  const a = await apply(),
    requestId = randomUUID();
  const r = await whileLocked(
    `select id from public.clients where id='${fixture.owner.id}' for update;`,
    () => raw(a, requestId),
    `${sqlRole}select public.resolve_financial_execution('${a.requestId}','${requestId}');commit;`,
  );
  expect(r.error).toBeNull();
  const receipt = financialResolutionReceiptSchema.parse(r.data);
  expect(receipt).toEqual(await resolve(a, requestId));
  expect(state()).toMatchObject({
    resolutions: 1,
    audits: 1,
    active: 0,
    posts: 1,
  });
});

it("journal e helper são privados; RPCs financeiras admitem somente serviço", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    expect(
      sql(
        `select has_table_privilege('${role}','private.payment_financial_resolutions','SELECT');`,
      ),
    ).toBe("f");
    expect(
      sql(
        `select has_table_privilege('${role}','private.payment_financial_resolutions','INSERT');`,
      ),
    ).toBe("f");
    expect(
      sql(
        `select has_function_privilege('${role}','private.financial_terminal_receipt(uuid)','EXECUTE');`,
      ),
    ).toBe("f");
  }
  for (const role of ["anon", "authenticated"]) {
    for (const signature of [
      "public.resolve_financial_execution(uuid,uuid)",
      "public.get_financial_resolution_receipt(uuid,uuid)",
      "public.get_financial_execution_resolution(uuid)",
    ])
      expect(
        sql(
          `select has_function_privilege('${role}','${signature}','EXECUTE');`,
        ),
      ).toBe("f");
  }
});
