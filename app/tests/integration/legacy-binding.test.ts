import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { executionTransportFixture } from "../e2e/execution-transport-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { localSystem } from "../e2e/local-helper";
import { quoteSession } from "../e2e/quote-helper";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import {
  captureFixtureFinancialObservation,
  queryFixtureFinancialObservation,
  allocateFixtureFinancialQuery,
} from "@/modules/payments/financial-worker";
import { applyFixtureFinancialObservation } from "@/modules/payments/financial-application";
import {
  createFixtureLegacyOrigin,
  bindFixtureLegacyPayment,
} from "@/modules/payments/legacy-binding";
import { resolveFixtureFinancialApplication } from "@/modules/payments/financial-resolution";
import { paymentIntentReceiptSchema } from "@/modules/payments/intents";
let fixture: Awaited<ReturnType<typeof executionTransportFixture>>,
  charge: string,
  payment: string,
  received: string,
  pending: string;
let prior: {
  recipient: string | null;
  prefs: { channel: string; enabled: boolean; revision: number }[];
};
const change = (patch: string) =>
  sql(
    `update private.payment_fixture_payments set ${patch} where scope_id='${fixture.scopeId}' and id='${payment}';`,
  );
const observe = async () =>
  (await queryFixtureFinancialObservation(charge, randomUUID())).observationId;
const origin = (observationId = received, requestId = randomUUID()) =>
  createFixtureLegacyOrigin({ observationId, requestId });
const apply = (observationId = received) =>
  applyFixtureFinancialObservation({ observationId, requestId: randomUUID() });
type Origin = Awaited<ReturnType<typeof origin>>;
type Application = Awaited<ReturnType<typeof apply>>;
const bind = (o: Origin, a: Application, requestId = randomUUID()) =>
  bindFixtureLegacyPayment({
    originRequestId: o.requestId,
    applicationRequestId: a.requestId,
    requestId,
  });
const rawBind = (o: Origin, a: Application, requestId = randomUUID()) =>
  localSystem().rpc("bind_fixture_legacy_payment", {
    target_origin: o.requestId,
    target_application: a.requestId,
    request_id: requestId,
  });
const state = () =>
  JSON.parse(
    sql(`select json_build_object(
 'origins',(select count(*) from private.payment_legacy_origins where charge_id='${charge}'),
 'bindings',(select count(*) from private.payment_legacy_bindings where charge_id='${charge}'),
 'receipts',(select count(*) from private.payment_legacy_binding_receipts where charge_id='${charge}'),
 'payments',(select count(*) from public.payments where order_id='${fixture.sample.order_id}'),
 'originAudits',(select count(*) from public.audit_log where action='payment_legacy_origin_created' and target_id in(select request_id from private.payment_legacy_origins where charge_id='${charge}')),
 'bindingAudits',(select count(*) from public.audit_log where action='payment_legacy_bound' and target_id in(select request_id from private.payment_legacy_binding_receipts where charge_id='${charge}')),
 'queuedAudits',(select count(*) from public.audit_log where action='order_queued' and target_id='${fixture.sample.order_id}'),
 'run',(select row_to_json(r) from private.payment_execution_runs r where intent_id='${fixture.intentId}'),
 'claim',(select row_to_json(c) from private.payment_intent_dispatch_claims c where intent_id='${fixture.intentId}'),
 'reservation',(select row_to_json(v) from private.payment_intent_reservations v where intent_id='${fixture.intentId}'),
 'posts',(select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${fixture.intentId}'),
 'events',(select count(*) from public.timeline_events where order_id='${fixture.sample.order_id}'),
 'notices',(select count(*) from public.notifications where data->>'order_id'='${fixture.sample.order_id}'),
 'noticeRows',(select json_agg(row_to_json(n) order by n.id) from public.notifications n where data->>'order_id'='${fixture.sample.order_id}'),
 'status',(select status from public.orders where id='${fixture.sample.order_id}'));`),
  );
const role = `select set_config('request.jwt.claims','{"role":"service_role"}',true);`;
beforeEach(async () => {
  fixture = await executionTransportFixture();
  prior = JSON.parse(
    sql(
      `select json_build_object('recipient',(select profile_id from private.calculator_notification_recipient where singleton),'prefs',coalesce((select json_agg(json_build_object('channel',channel,'enabled',enabled,'revision',revision)) from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated'),'[]'::json));`,
    ),
  );
  sql(
    `update private.calculator_notification_recipient set profile_id='${fixture.calculator.id}' where singleton;delete from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated';`,
  );
  await advanceFixturePaymentExecution(fixture.requestId);
  const executionOrigin = sql(
    `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${fixture.intentId}' limit 1;`,
  );
  pending = (await captureFixtureFinancialObservation(executionOrigin))
    .observationId;
  charge = sql(
    `select charge_id from private.payment_financial_observations where id='${pending}';`,
  );
  payment = sql(
    `select provider_payment_id from private.payment_financial_charges where id='${charge}';`,
  );
  change("status='RECEIVED',net_cents=value_cents-100,refunds='[]'");
  received = await observe();
});
afterEach(async () => {
  if (fixture)
    try {
      sql(
        `update private.calculator_notification_recipient set profile_id=${prior.recipient ? "'" + prior.recipient + "'" : "null"} where singleton;delete from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated';`,
      );
      for (const p of prior.prefs)
        sql(
          `insert into public.notification_preferences(profile_id,event,channel,enabled,revision) values('${fixture.calculator.id}','payment_updated','${p.channel}',${p.enabled},${p.revision});`,
        );
    } finally {
      await fixture.cleanup();
    }
});
it("produtor cria origem e linha histórica por bruto, sem crédito ou efeitos", async () => {
  const before = state(),
    o = await origin();
  expect(o.amountCents).toBe(12501);
  expect(o.snapshot.providerReference).toBe(payment);
  expect(o.scopeId).toBe(fixture.scopeId);
  expect(o.executionOriginId).not.toBe(received);
  expect(state()).toEqual({
    ...before,
    origins: 1,
    payments: 1,
    originAudits: 1,
  });
  const db = await quoteSession();
  try {
    const p = (
      await db.rpc("get_order_financial_projection", {
        target_order: fixture.sample.order_id,
      })
    ).data as Record<string, unknown>;
    expect(p.unlinkedLegacyCount).toBe(1);
    expect(p.depositCreditCents).toBeNull();
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
});
it("produtor recusa origem ausente ou sem recebimento", async () => {
  const before = state();
  await expect(origin(randomUUID())).rejects.toThrow();
  await expect(origin(pending)).rejects.toThrow();
  expect(state()).toEqual(before);
});
it("replay de origem precede marker e outra solicitação não duplica linha", async () => {
  const request = randomUUID(),
    o = await origin(received, request),
    before = state();
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  expect(await origin(received, request)).toEqual(o);
  expect(
    (
      await localSystem().rpc("get_fixture_legacy_origin_receipt", {
        target_observation: pending,
        request_id: request,
      })
    ).error?.code,
  ).toBe("PT409");
  sql(
    "update private.payment_fixture_environment set enabled=true where singleton;",
  );
  expect(
    (
      await localSystem().rpc("create_fixture_legacy_origin", {
        target_observation: received,
        request_id: randomUUID(),
      })
    ).error?.code,
  ).toBe("PT409");
  expect(state()).toEqual(before);
});
it("Y antes do vínculo torna W conhecida uma vez sem novo RECEIVED", async () => {
  const o = await origin(),
    a = await apply(),
    before = state(),
    r = await bind(o, a);
  expect(a.orderStatus).toBe("awaiting_payment");
  expect(r.projection.depositCreditCents).toBe(12501);
  expect(r.projection.unlinkedLegacyCount).toBe(0);
  expect(r.orderStatus).toBe("awaiting_documents");
  const after = state();
  expect(after.bindings).toBe(1);
  expect(after.receipts).toBe(1);
  expect(after.bindingAudits).toBe(1);
  expect(after.notices).toBe(before.notices);
  expect(after.events).toBe(before.events + 1);
  for (const key of ["run", "claim", "reservation", "posts"])
    expect(after[key]).toEqual(before[key]);
  expect(
    sql(
      `select count(*) from public.timeline_events where order_id='${fixture.sample.order_id}' and kind='payment_confirmed';`,
    ),
  ).toBe("1");
});
it("vínculo com aplicação UNKNOWN não concede crédito; nova Y recebido avança", async () => {
  const o = await origin();
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found');`,
  );
  const a = await apply(await observe()),
    before = state(),
    r = await bind(o, a);
  expect(r.projection.depositCreditCents).toBeNull();
  expect(r.projection.depositUncertain).toBe(true);
  expect(r.orderStatus).toBe("awaiting_payment");
  expect(state().events).toBe(before.events);
  const fresh = await apply(await observe());
  expect(fresh.orderStatus).toBe("awaiting_documents");
  expect(fresh.position?.creditCents).toBe(12501);
});
it("replay do vínculo conserva recibo depois de refund/marker e conflita IDs", async () => {
  const o = await origin(),
    a = await apply(),
    request = randomUUID(),
    r = await bind(o, a, request);
  change(
    "status='REFUNDED',refunds=jsonb_build_array(jsonb_build_object('value',125.01,'status','DONE','dateCreated','2026-10-12 10:00:00'))",
  );
  await apply(await observe());
  const before = state();
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  expect(await bind(o, a, request)).toEqual(r);
  expect(
    (
      await localSystem().rpc("get_fixture_legacy_binding_receipt", {
        target_origin: o.requestId,
        target_application: randomUUID(),
        request_id: request,
      })
    ).error?.code,
  ).toBe("PT409");
  expect(state()).toEqual(before);
});
it.each(["query", "application", "unknown", "fingerprint"])(
  "fence de %s posterior recusa vínculo antigo sem efeitos",
  async (kind) => {
    const o = await origin(),
      a = await apply();
    if (kind === "query") await observe();
    if (kind === "application") {
      change("net_cents=value_cents-200");
      await apply(await observe());
    }
    if (kind === "unknown") {
      sql(
        `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found');`,
      );
      await observe();
    }
    if (kind === "fingerprint")
      sql(
        `insert into private.payment_financial_conflicts(observation_id,attempt_hash) values('${received}','${"b".repeat(64)}');`,
      );
    const before = state();
    expect((await rawBind(o, a)).error?.code).toBe("PT412");
    expect(state()).toEqual(before);
  },
  30000,
);
it.each([true, false])(
  "rollback nativo do produtor, erro=%s, não deixa linha/origem",
  async (error) => {
    const before = state(),
      request = randomUUID(),
      command = `begin;${role}select public.create_fixture_legacy_origin('${received}','${request}');${error ? "select 1/0;" : "rollback;"}`;
    if (error) expect(() => sql(command)).toThrow();
    else sql(command);
    expect(state()).toEqual(before);
  },
);
it.each([true, false])(
  "rollback após vínculo/fila/recibo, erro=%s, preserva T/Y",
  async (error) => {
    const o = await origin(),
      a = await apply(),
      before = state(),
      request = randomUUID(),
      command = `begin;${role}select public.bind_fixture_legacy_payment('${o.requestId}','${a.requestId}','${request}');${error ? "select 1/0;" : "rollback;"}`;
    if (error) expect(() => sql(command)).toThrow();
    else sql(command);
    expect(state()).toEqual(before);
  },
);
it.each([true, false])(
  "concorrência de origem, mesmo request=%s, cria uma representação",
  async (same) => {
    const request = randomUUID(),
      result = await Promise.all([
        localSystem().rpc("create_fixture_legacy_origin", {
          target_observation: received,
          request_id: request,
        }),
        localSystem().rpc("create_fixture_legacy_origin", {
          target_observation: received,
          request_id: same ? request : randomUUID(),
        }),
      ]);
    expect(result.filter((r) => !r.error)).toHaveLength(same ? 2 : 1);
    if (same) expect(result[0].data).toEqual(result[1].data);
    expect(state().origins).toBe(1);
    expect(state().payments).toBe(1);
    expect(state().originAudits).toBe(1);
  },
);
it.each([true, false])(
  "concorrência de vínculo, mesmo request=%s, cria um recibo/efeito",
  async (same) => {
    const o = await origin(),
      a = await apply(),
      before = state(),
      request = randomUUID(),
      result = await Promise.all([
        rawBind(o, a, request),
        rawBind(o, a, same ? request : randomUUID()),
      ]);
    expect(result.filter((r) => !r.error)).toHaveLength(same ? 2 : 1);
    if (same) expect(result[0].data).toEqual(result[1].data);
    const after = state();
    expect(after.bindings).toBe(1);
    expect(after.receipts).toBe(1);
    expect(after.bindingAudits).toBe(1);
    expect(after.events).toBe(before.events + 1);
    expect(after.notices).toBe(before.notices);
  },
);
it("identidade da linha/origem/vínculo não pode virar manual ou perder proteção", async () => {
  const o = await origin(),
    a = await apply(),
    r = await bind(o, a),
    before = state();
  for (const patch of [
    "method='pix_manual'",
    "kind='balance'",
    "amount_cents=1",
    "provider_ref='pay_outro'",
    "status='refunded'",
  ])
    expect(() =>
      sql(`update public.payments set ${patch} where id='${o.paymentId}';`),
    ).toThrow();
  for (const table of [
    "payment_legacy_origins",
    "payment_legacy_bindings",
    "payment_legacy_binding_receipts",
  ])
    expect(() =>
      sql(
        `update private.${table} set ${table === "payment_legacy_bindings" ? "created_at=clock_timestamp()" : table === "payment_legacy_origins" ? "recorded_at=clock_timestamp()" : "bound_at=clock_timestamp()"};`,
      ),
    ).toThrow();
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  for (const command of [
    `delete from public.payments where id='${o.paymentId}'`,
    `delete from private.payment_legacy_bindings where payment_id='${o.paymentId}'`,
    `delete from private.payment_legacy_binding_receipts where request_id='${r.requestId}'`,
  ])
    expect(() => sql(command)).toThrow();
  expect(state()).toEqual(before);
});
it("vínculo depois do terminal não reabre execução nem altera claim", async () => {
  const o = await origin(),
    a = await apply(),
    terminal = await resolveFixtureFinancialApplication({
      applicationRequestId: a.requestId,
      requestId: randomUUID(),
    }),
    before = state();
  expect(terminal?.reason).toBe("financial_received");
  await bind(o, a);
  const after = state();
  for (const key of ["run", "claim", "reservation", "posts"])
    expect(after[key]).toEqual(before[key]);
});

async function document(uploaded = true) {
  const id = randomUUID();
  expect(
    (
      await fixture.db.from("files").insert({
        id,
        process_id: fixture.sample.process_id,
        order_id: fixture.sample.order_id,
        folder: "case",
        uploaded_by: fixture.owner.owner_id,
        name: "Processo inventado.pdf",
        mime: "application/pdf",
        path: `${fixture.owner.owner_id}/${fixture.sample.process_id}/${id}/ficticio.pdf`,
        size_bytes: 100,
        sha256: uploaded ? "0".repeat(64) : null,
        expected_sha256: "0".repeat(64),
        upload_status: uploaded ? "uploaded" : "pending",
      })
    ).error,
  ).toBeNull();
}
it.each([true, false])(
  "Y antes de vínculo e documento uploaded=%s avança somente quando permitido",
  async (uploaded) => {
    const o = await origin();
    await document(uploaded);
    const a = await apply(),
      before = state(),
      r = await bind(o, a);
    expect(r.orderStatus).toBe(uploaded ? "queued" : "awaiting_documents");
    expect(
      sql(
        `select count(*) from public.timeline_events where order_id='${fixture.sample.order_id}' and kind='payment_confirmed';`,
      ),
    ).toBe("1");
    expect(state().notices).toBe(before.notices + (uploaded ? 1 : 0));
  },
);
it("contrato permite fila com documento mesmo com crédito em conciliação", async () => {
  const o = await origin();
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found');`,
  );
  const a = await apply(await observe());
  await document();
  const priorContract = sql(
    `select has_contract from public.clients where id='${fixture.owner.id}';`,
  );
  try {
    sql(
      `update public.clients set has_contract=true where id='${fixture.owner.id}';`,
    );
    const r = await bind(o, a);
    expect(r.projection.depositCreditCents).toBeNull();
    expect(r.orderStatus).toBe("queued");
  } finally {
    sql(
      `update public.clients set has_contract=${priorContract === "t"} where id='${fixture.owner.id}';`,
    );
  }
});
it("erro nativo após vínculo/fila/aviso reverte todos os efeitos sem perder T/Y", async () => {
  const o = await origin();
  await document();
  const a = await apply(),
    before = state();
  const command = `begin;${role}select public.bind_fixture_legacy_payment('${o.requestId}','${a.requestId}','${randomUUID()}');
  do $probe$begin
   if (select status from public.orders where id='${fixture.sample.order_id}')<>'queued'
    or not exists(select 1 from public.notifications where dedup_key='queued:${fixture.sample.order_id}:email')
    or not exists(select 1 from private.payment_legacy_bindings where payment_id='${o.paymentId}')
    or not exists(select 1 from private.payment_legacy_binding_receipts where origin_request_id='${o.requestId}')
    then raise exception 'Fila e aviso nao foram exercitados';end if;
   perform 1/0;end;$probe$;`;
  try {
    execFileSync(
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
      {
        env: process.env,
        input: command,
        encoding: "utf8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    throw new Error("A transação deveria abortar");
  } catch (error) {
    expect((error as { stderr?: Buffer }).stderr?.toString()).toContain(
      "division by zero",
    );
  }
  expect(state()).toEqual(before);
});
it.each(["origin", "binding"])(
  "outro processo recupera resposta perdida de %s sem efeitos duplicados",
  async (kind) => {
    const request = randomUUID();
    let first: unknown;
    let code: string;
    if (kind === "origin") {
      first = await origin(received, request);
      code = `import {createFixtureLegacyOrigin} from './src/modules/payments/legacy-binding.ts';const receipt=await createFixtureLegacyOrigin(${JSON.stringify({ observationId: received, requestId: request })});process.stdout.write(JSON.stringify({pid:process.pid,receipt}));`;
    } else {
      const o = await origin(),
        a = await apply();
      first = await bind(o, a, request);
      code = `import {bindFixtureLegacyPayment} from './src/modules/payments/legacy-binding.ts';const receipt=await bindFixtureLegacyPayment(${JSON.stringify({ originRequestId: o.requestId, applicationRequestId: a.requestId, requestId: request })});process.stdout.write(JSON.stringify({pid:process.pid,receipt}));`;
    }
    const before = state(),
      recovered = JSON.parse(
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
    expect(recovered.pid).not.toBe(process.pid);
    expect(recovered.receipt).toEqual(first);
    expect(state()).toEqual(before);
  },
);
it("origem/linha já são imutáveis antes do vínculo; exceção não atende session_user authenticator", async () => {
  const o = await origin(),
    before = state();
  expect(() =>
    sql(
      `update public.payments set method='pix_manual' where id='${o.paymentId}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `update private.payment_legacy_origins set amount_cents=1 where request_id='${o.requestId}';`,
    ),
  ).toThrow();
  // A função do trigger executa como proprietária; a sessão continua authenticator.
  const probe = `begin;set session authorization authenticator;set role service_role;do $probe$begin
   if session_user<>'authenticator' then raise exception 'Sessao incorreta';end if;
   begin delete from public.payments where id='${o.paymentId}';raise exception 'Remocao indevida';
   exception when others then if sqlerrm<>'Identidade da linha legada imutavel' then raise;end if;end;
   end;$probe$;rollback;`;
  // Apenas o administrador do PostgreSQL local pode preparar essa sessão de ensaio.
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_andre-calculos",
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      env: process.env,
      input: probe,
      encoding: "utf8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  expect(() =>
    sql(
      `delete from private.payment_legacy_origins where request_id='${o.requestId}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(`delete from public.payments where id='${o.paymentId}';`),
  ).toThrow();
  expect(state()).toEqual(before);
});
it("ambiguidade residual não é conciliada por referência igual", async () => {
  const o = await origin(),
    a = await apply();
  // Segunda representação sem manifesto explícito: preparação negativa local.
  sql(
    `insert into public.payments(order_id,kind,method,amount_cents,status,provider_ref) values('${fixture.sample.order_id}','deposit','asaas',12501,'confirmed','${payment}');`,
  );
  const r = await bind(o, a);
  expect(r.projection.unlinkedLegacyCount).toBe(1);
  expect(r.projection.depositCreditCents).toBeNull();
  expect(r.orderStatus).toBe("awaiting_payment");
});
it("conflito corrente não se torna crédito conhecido por vínculo de identidade", async () => {
  const o = await origin();
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found');`,
  );
  const observation = await observe();
  sql(
    `insert into private.payment_financial_conflicts(observation_id,attempt_hash) values('${observation}','${"c".repeat(64)}');`,
  );
  const a = await apply(observation),
    r = await bind(o, a);
  expect(r.projection.depositCreditCents).toBeNull();
  expect(r.projection.conflictedChargeCount).toBe(1);
  expect(r.orderStatus).toBe("awaiting_payment");
});
it("históricos G/I/R/N/T/Y e posição W permanecem idênticos no vínculo", async () => {
  const histories = () =>
    sql(`select json_build_object(
   'context',(select row_to_json(c) from private.payment_obligation_contexts c where id=(select context_id from private.payment_intents where id='${fixture.intentId}')),
   'intent',(select row_to_json(i) from private.payment_intents i where id='${fixture.intentId}'),
   'intentRequests',(select json_agg(row_to_json(q) order by q.id) from private.payment_intent_requests q where intent_id='${fixture.intentId}'),
   'execution',(select row_to_json(r) from private.payment_execution_runs r where intent_id='${fixture.intentId}'),
   'observations',(select json_agg(row_to_json(o) order by o.id) from private.payment_financial_observations o where charge_id='${charge}'),
   'native',(select json_agg(row_to_json(n) order by n.id) from private.payment_fixture_requests n where scope_id='${fixture.scopeId}'),
   'applications',(select json_agg(row_to_json(a) order by a.request_id) from private.payment_financial_applications a where charge_id='${charge}'),
   'position',(select row_to_json(p) from private.payment_financial_positions p where charge_id='${charge}'));`);
  const beforeOrigin = histories(),
    o = await origin();
  expect(histories()).toBe(beforeOrigin);
  const a = await apply(),
    beforeBinding = histories();
  const receipt = await bind(o, a);
  expect(histories()).toBe(beforeBinding);
  expect(
    sql(
      `select count(*) from public.audit_log where action in('payment_legacy_origin_created','payment_legacy_bound') and actor_id is not null and target_id in('${o.requestId}','${receipt.requestId}');`,
    ),
  ).toBe("0");
});

async function newExecution(
  sample: Awaited<ReturnType<typeof fixture.create>>,
  phase: "deposit" | "balance",
  scopeId = fixture.scopeId,
  find = false,
) {
  fixture.scope(scopeId);
  if (scopeId === fixture.otherScopeId)
    sql(
      `insert into private.payment_fixture_customers(id,scope_id,client_id,kind,document,name) select customer_id,'${scopeId}',client_id,'person','11144477735','Cliente fictício' from private.payment_provider_customers where id='${fixture.otherBindingId}';`,
    );
  const db = await quoteSession(),
    request = randomUUID();
  let intent: string;
  try {
    const context = await fixture.prepare(sample, db, phase),
      r = await db.rpc("reserve_payment_intent", {
        target_context: context.id,
        request_id: request,
      });
    expect(r.error).toBeNull();
    intent = paymentIntentReceiptSchema.parse(r.data).snapshot.intent.id;
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  if (find)
    sql(
      `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${scopeId}','${fixture.owner.id}','payment_create','lost_after_create');`,
    );
  expect((await advanceFixturePaymentExecution(request)).state).toBe(
    find ? "held" : "identified",
  );
  const nativePayment = sql(
    `select id from private.payment_fixture_payments where intent_id='${intent}';`,
  );
  sql(
    `update private.payment_fixture_payments set ${find ? `id='${payment}',` : ""}status='RECEIVED',net_cents=value_cents-100,refunds='[]' where scope_id='${scopeId}' and id='${nativePayment}';`,
  );
  if (find)
    expect((await advanceFixturePaymentExecution(request)).state).toBe(
      "identified",
    );
  const executionOrigin = sql(
      `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${intent}' and o.facts is not null order by o.recorded_at desc limit 1;`,
    ),
    captured = await captureFixtureFinancialObservation(executionOrigin);
  const observationId = find
    ? captured.observationId
    : (await queryFixtureFinancialObservation(captured.chargeId, randomUUID()))
        .observationId;
  return {
    intent,
    request,
    chargeId: captured.chargeId,
    observationId,
    scopeId,
  };
}
it("referência igual em duas contas e R/find recebido não cruzam origem ou request concorrente", async () => {
  const second = await newExecution(
      await fixture.create(),
      "deposit",
      fixture.otherScopeId,
      true,
    ),
    sharedOriginRequest = randomUUID();
  const sources = [received, second.observationId];
  const producer = await Promise.all(
    sources.map((observation) =>
      localSystem().rpc("create_fixture_legacy_origin", {
        target_observation: observation,
        request_id: sharedOriginRequest,
      }),
    ),
  );
  expect(producer.filter((r) => !r.error)).toHaveLength(1);
  expect(producer.find((r) => r.error)?.error?.code).toBe("PT409");
  const existing = (chargeId: string) =>
    sql(
      `select result from private.payment_legacy_origins where charge_id='${chargeId}';`,
    );
  const firstExisting = existing(charge),
    secondExisting = existing(second.chargeId);
  const firstOrigin: Origin = firstExisting
    ? JSON.parse(firstExisting)
    : await origin();
  const secondOrigin: Origin = secondExisting
    ? JSON.parse(secondExisting)
    : await origin(second.observationId);
  expect(firstOrigin.snapshot.providerReference).toBe(
    secondOrigin.snapshot.providerReference,
  );
  expect(firstOrigin.scopeId).toBe(fixture.scopeId);
  expect(secondOrigin.scopeId).toBe(fixture.otherScopeId);
  const firstApplication = await apply(),
    secondApplication = await apply(second.observationId),
    sharedBindingRequest = randomUUID();
  const before = state();
  expect((await rawBind(firstOrigin, secondApplication)).error).not.toBeNull();
  expect(state()).toEqual(before);
  const bindings = await Promise.all([
    rawBind(firstOrigin, firstApplication, sharedBindingRequest),
    rawBind(secondOrigin, secondApplication, sharedBindingRequest),
  ]);
  expect(bindings.filter((r) => !r.error)).toHaveLength(1);
  expect(bindings.find((r) => r.error)?.error?.code).toBe("PT409");
  for (const [o, a] of [
    [firstOrigin, firstApplication],
    [secondOrigin, secondApplication],
  ] as const) {
    const current = sql(
      `select count(*) from private.payment_legacy_bindings where payment_id='${o.paymentId}';`,
    );
    if (current === "0") await bind(o, a);
    expect(
      sql(
        `select scope_id from private.payment_legacy_bindings where payment_id='${o.paymentId}';`,
      ),
    ).toBe(o.scopeId);
  }
  expect(
    sql(
      `select count(*) from private.payment_legacy_origins where scope_id in('${fixture.scopeId}','${fixture.otherScopeId}');`,
    ),
  ).toBe("2");
});
it("origem/vínculo do saldo conserva fase e recusa aplicação do sinal", async () => {
  const o = await origin(),
    a = await apply();
  await bind(o, a);
  await resolveFixtureFinancialApplication({
    applicationRequestId: a.requestId,
    requestId: randomUUID(),
  });
  await fixture.deliver(fixture.sample);
  const next = await newExecution(fixture.sample, "balance"),
    balanceOrigin = await origin(next.observationId),
    balanceApplication = await apply(next.observationId);
  expect(balanceOrigin.phase).toBe("balance");
  expect(balanceOrigin.snapshot.kind).toBe("balance");
  expect((await rawBind(balanceOrigin, a)).error).not.toBeNull();
  const r = await bind(balanceOrigin, balanceApplication);
  expect(r.phase).toBe("balance");
  expect(r.projection.depositCreditCents).toBe(12501);
  expect(r.projection.totalCreditCents).toBe(r.projection.totalCents);
  expect(r.projection.totalCreditCents).toBe(
    o.amountCents + balanceOrigin.amountCents,
  );
  expect(r.orderStatus).toBe("delivered");
});
it("vínculo concorre com manual sem atribuir recebimento ao calculista", async () => {
  const o = await origin(),
    a = await apply(),
    db = await quoteSession("calculator");
  try {
    const results = await Promise.all([
      rawBind(o, a),
      db.rpc("confirm_manual_deposit", {
        target_quote: fixture.sample.id,
        expected_context: fixture.sample.contextHash,
        expected_remaining_cents: 0,
        request_id: randomUUID(),
        confirmed: true,
      }),
    ]);
    expect(results[0].error).toBeNull();
    expect(results[1].error?.code).toBe("PT409");
    expect(
      sql(
        `select count(*) from private.manual_deposit_receipts where quote_id='${fixture.sample.id}';`,
      ),
    ).toBe("0");
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
});
it("consulta T durante espera do vínculo exige releitura da fence sob locks", async () => {
  const o = await origin(),
    a = await apply(),
    name = "legacy-lock-" + randomUUID(),
    before = state();
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
    errors = "";
  child.stdout.on("data", (v: Buffer) => (output += v.toString()));
  child.stderr.on("data", (v: Buffer) => (errors += v.toString()));
  const done = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  let pendingResult: Promise<Awaited<ReturnType<typeof rawBind>>> | undefined;
  try {
    child.stdin.write(
      `set application_name='${name}';set statement_timeout=8000;set idle_in_transaction_session_timeout=8000;begin;select id from public.clients where id='${fixture.owner.id}' for update;\n\\echo LEGACY_LOCK\n`,
    );
    await expect.poll(() => output, { timeout: 3000 }).toContain("LEGACY_LOCK");
    // Supabase RPCs são lazy: iniciar a Promise antes de inspecionar a espera real.
    pendingResult = Promise.resolve(rawBind(o, a));
    const running = pendingResult;
    await expect
      .poll(
        () =>
          sql(
            `select count(*) from pg_stat_activity b where b.wait_event_type='Lock' and exists(select 1 from pg_stat_activity l where l.application_name='${name}' and l.pid=any(pg_blocking_pids(b.pid)));`,
          ),
        { timeout: 3000 },
      )
      .toBe("1");
    // A alocação T trava só a charge e já invalida a cobertura. N, depois,
    // também precisaria do lock do cliente que esta barreira conserva.
    const allocated = await allocateFixtureFinancialQuery(charge, randomUUID());
    expect(allocated.chargeId).toBe(charge);
    child.stdin.end("commit;\n\\q\n");
    expect(await done, errors).toBe(0);
    expect((await running).error?.code).toBe("PT412");
    expect(state()).toEqual(before);
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (pendingResult) await pendingResult;
  }
}, 15000);
it("Y equivalente concorre com vínculo sem crédito, evento ou fila duplicados", async () => {
  const o = await origin(),
    a = await apply(),
    before = state(),
    result = await Promise.all([rawBind(o, a), apply(received)]);
  expect(result[0].error).toBeNull();
  expect(result[1].action).toBe("same");
  expect(result[1].effects).toEqual([]);
  const after = state();
  expect(after.events).toBe(before.events + 1);
  expect(after.notices).toBe(before.notices);
  expect(after.bindings).toBe(1);
  expect(after.receipts).toBe(1);
  for (const key of ["run", "claim", "reservation", "posts"])
    expect(after[key]).toEqual(before[key]);
  expect(
    (
      await localSystem().rpc("get_financial_application_receipt", {
        target_observation: a.observationId,
        request_id: a.requestId,
      })
    ).data,
  ).toEqual(a);
});
it("grants/RLS limitam RPCs e getters ao sistema sem acesso direto privado", async () => {
  expect(
    sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in('payment_legacy_origins','payment_legacy_binding_receipts') and c.relrowsecurity;",
    ),
  ).toBe("2");
  expect(
    sql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name in('payment_legacy_origins','payment_legacy_binding_receipts') and grantee in('anon','authenticated','service_role');",
    ),
  ).toBe("0");
  const functions = [
    "get_fixture_legacy_origin_receipt",
    "create_fixture_legacy_origin",
    "get_fixture_legacy_binding_receipt",
    "bind_fixture_legacy_payment",
  ] as const;
  for (const name of functions) {
    const signature = `public.${name}(${name.includes("binding") || name === "bind_fixture_legacy_payment" ? "uuid,uuid,uuid" : "uuid,uuid"})`;
    expect(
      sql(
        `select has_function_privilege('service_role','${signature}','execute') and not has_function_privilege('anon','${signature}','execute') and not has_function_privilege('authenticated','${signature}','execute');`,
      ),
    ).toBe("t");
  }
  for (const signature of [
    "private.fixture_legacy_charge_origin(uuid)",
    "private.fixture_legacy_received_source(uuid)",
    "private.preserve_fixture_legacy_record()",
    "private.guard_fixture_legacy_payment()",
  ])
    expect(
      sql(
        `select has_function_privilege('service_role','${signature}','execute') or has_function_privilege('authenticated','${signature}','execute') or has_function_privilege('anon','${signature}','execute');`,
      ),
    ).toBe("f");
  const anonymous = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    ),
    sessions = [
      anonymous,
      await quoteSession(),
      await quoteSession("calculator"),
    ];
  try {
    for (const db of sessions) {
      for (const name of functions) {
        const r = await db.rpc(
          name,
          name.includes("binding") || name === "bind_fixture_legacy_payment"
            ? {
                target_origin: randomUUID(),
                target_application: randomUUID(),
                request_id: randomUUID(),
              }
            : { target_observation: received, request_id: randomUUID() },
        );
        expect(r.error).not.toBeNull();
      }
    }
  } finally {
    for (const db of sessions.slice(1))
      await db.auth.signOut({ scope: "local" });
  }
});
