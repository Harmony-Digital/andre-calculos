import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { executionTransportFixture } from "../e2e/execution-transport-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { quoteSession } from "../e2e/quote-helper";
import {
  currentPaymentIntentSchema,
  paymentIntentReceiptSchema,
} from "@/modules/payments/intents";
import {
  resolveFixturePaymentExecution,
  resumeFixturePaymentExecution,
} from "@/modules/payments/execution-resolution";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import {
  allocateFixturePaymentExecution,
  startFixturePaymentExecution,
} from "@/modules/payments/execution-system";
import { createDurableAsaasFixturePort } from "@/modules/payments/asaas/fixture-port";
import { createAsaasFixtureAdapter } from "@/modules/payments/asaas/adapter";
let fixture: Awaited<ReturnType<typeof executionTransportFixture>>;
let resolutionId: string;
const input = () => ({
  executionRequestId: fixture.requestId,
  requestId: resolutionId,
});
const resolve = () => resolveFixturePaymentExecution(input());
const fault = (behavior: string, operation = "payment_create") =>
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior,calls_left) values('${fixture.scopeId}','${fixture.owner.id}','${operation}','${behavior}',1) on conflict(scope_id,client_id,operation) do update set behavior=excluded.behavior,calls_left=1;`,
  );
const stats = () =>
  JSON.parse(
    sql(`select json_build_object(
 'resolutions',(select count(*) from private.payment_intent_resolutions where intent_id='${fixture.intentId}'),
 'audits',(select count(*) from public.audit_log where action='payment_execution_resolved' and target_id='${fixture.intentId}'),
 'claims',(select count(*) from private.payment_intent_dispatch_claims where intent_id='${fixture.intentId}'),
 'active',(select count(*) from private.payment_intent_reservations where intent_id='${fixture.intentId}'),
 'posts',(select count(*) from private.payment_fixture_invocations i join private.payment_fixture_requests r on r.id=i.request_id where r.operation='payment_create' and r.payload->>'reference'='${fixture.intentId}'),
 'payments',(select count(*) from private.payment_fixture_payments where intent_id='${fixture.intentId}'),
 'credits',(select count(*) from public.payments where order_id='${fixture.sample.order_id}'),
 'notices',(select count(*) from public.notifications where template='payment_confirmed' and data->>'order_id'='${fixture.sample.order_id}'));`),
  );
const noDispatch = async () => {
  fault("not_dispatched");
  expect((await advanceFixturePaymentExecution(fixture.requestId)).reason).toBe(
    "not_dispatched",
  );
};
const sourceId = () =>
  sql(
    `select r.id from private.payment_fixture_requests r where r.operation='payment_create' and r.payload->>'reference'='${fixture.intentId}' limit 1;`,
  );
const corruptSource = (change: string) => {
  const source = sourceId();
  sql(`delete from private.payment_execution_observations where receipt_id='${source}'; delete from private.payment_fixture_invocations where request_id='${source}';
 with prior as(delete from private.payment_fixture_requests where id='${source}' returning *)
 insert into private.payment_fixture_requests(id,slot_id,scope_id,client_id,operation,fingerprint,payload,outcome,effect_id,execution_mode,recorded_at)
 select id,${change.includes("slot_id=") ? change.split("=")[1] : "slot_id"},scope_id,client_id,operation,fingerprint,payload,
 ${change.startsWith("outcome=") ? change.slice(8) : "outcome"},${change.startsWith("effect_id=") ? change.slice(10) : "effect_id"},execution_mode,recorded_at from prior;`);
};
const createAt = async (slotId: string) => {
  const o = fixture.context.snapshot,
    b = o.binding!,
    port = await createDurableAsaasFixturePort({
      scopeId: fixture.scopeId,
      clientId: fixture.owner.id,
      slotId,
    });
  return createAsaasFixtureAdapter(port.scope, port).createPayment({
    customer: {
      scope: port.scope,
      customerId: b.customerId,
      clientId: fixture.owner.id,
      kind: "person",
      document: "11144477735",
    },
    reference: fixture.intentId,
    contractedCents: o.remainingCents!,
    billingType: o.billingType,
    dueDate: o.dueDate,
  });
};
const reserveAgain = async () => {
  const db = await quoteSession(),
    requestId = randomUUID();
  try {
    const r = await db.rpc("reserve_payment_intent", {
      target_context: fixture.context.id,
      request_id: requestId,
    });
    expect(r.error).toBeNull();
    return { requestId, receipt: paymentIntentReceiptSchema.parse(r.data) };
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
};
beforeEach(async () => {
  fixture = await executionTransportFixture();
  resolutionId = randomUUID();
});
afterEach(async () => {
  if (fixture) await fixture.cleanup();
});
it("jornada cliente→G→L→I resolve prova explícita e emite nova intenção", async () => {
  const db = await quoteSession();
  try {
    const old = (
      await db.rpc("reserve_payment_intent", {
        target_context: fixture.context.id,
        request_id: fixture.requestId,
      })
    ).data;
    await noDispatch();
    const result = await resolve();
    expect(result?.view).toMatchObject({
      state: "resolved",
      reason: "no_dispatch_proven",
      dispatchClaimed: true,
      reservationActive: false,
    });
    expect(stats()).toMatchObject({
      resolutions: 1,
      audits: 1,
      claims: 1,
      active: 0,
      posts: 1,
      payments: 0,
      credits: 0,
      notices: 0,
    });
    const current = await db.rpc("get_payment_intent", {
      target_intent: fixture.intentId,
    });
    expect(current.error).toBeNull();
    expect(currentPaymentIntentSchema.parse(current.data)).toMatchObject({
      state: "resolved",
      revision: 2,
      claimedAt: expect.any(String),
      withdrawnAt: null,
      withdrawnBy: null,
      resolutionReason: "no_dispatch_proven",
    });
    expect(JSON.stringify(current.data)).not.toMatch(
      /receiptId|bodyText|fingerprint|document|invoiceUrl/,
    );
    expect(
      (
        await db.rpc("get_order_payment_reservation", {
          target_order: fixture.sample.order_id,
        })
      ).data,
    ).toBeNull();
    expect(
      (
        await db.rpc("reserve_payment_intent", {
          target_context: fixture.context.id,
          request_id: fixture.requestId,
        })
      ).data,
    ).toEqual(old);
    expect(paymentIntentReceiptSchema.parse(old).snapshot.state).toBe(
      "reserved",
    );
    const newer = await reserveAgain();
    expect(newer.receipt.snapshot.intent.id).not.toBe(fixture.intentId);
    expect(await resolve()).toEqual(result);
    expect((await resumeFixturePaymentExecution(fixture.requestId)).state).toBe(
      "resolved",
    );
    expect(
      sql(
        `select intent_id from private.payment_intent_reservations where order_id='${fixture.sample.order_id}';`,
      ),
    ).toBe(newer.receipt.snapshot.intent.id);
    expect((await resumeFixturePaymentExecution(newer.requestId)).state).toBe(
      "identified",
    );
    expect(
      sql(
        `select count(*) from private.payment_fixture_payments where intent_id='${newer.receipt.snapshot.intent.id}';`,
      ),
    ).toBe("1");
    expect(
      sql(
        `select status from public.orders where id='${fixture.sample.order_id}';`,
      ),
    ).toBe("awaiting_payment");
    expect(
      (
        await db.rpc("get_order_payment_reservation", {
          target_order: fixture.sample.order_id,
        })
      ).data,
    ).toMatchObject({
      reservationActive: true,
      intent: { id: newer.receipt.snapshot.intent.id },
    });
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
});
it("worker integrado resolve e retomadas não invocam outro transporte", async () => {
  fault("not_dispatched");
  expect((await resumeFixturePaymentExecution(fixture.requestId)).state).toBe(
    "resolved",
  );
  for (let i = 0; i < 2; i++)
    expect((await resumeFixturePaymentExecution(fixture.requestId)).state).toBe(
      "resolved",
    );
  expect(stats()).toMatchObject({
    resolutions: 1,
    posts: 1,
    claims: 1,
    active: 0,
    payments: 0,
  });
});
it("prova explícita continua válida após consulta zero; consulta isolada nunca é prova", async () => {
  await noDispatch();
  expect((await advanceFixturePaymentExecution(fixture.requestId)).reason).toBe(
    "not_located",
  );
  expect((await resolve())?.view.state).toBe("resolved");
  expect(stats().posts).toBe(1);
});
it.each([
  "indeterminate_before",
  "lost_after_create",
  "invalid_after_create",
  "unavailable",
  "not_found",
])("%s não resolve nem libera", async (behavior) => {
  fault(behavior);
  await advanceFixturePaymentExecution(fixture.requestId);
  expect(await resolve()).toBeNull();
  await advanceFixturePaymentExecution(fixture.requestId);
  expect(await resolve()).toBeNull();
  expect(stats()).toMatchObject({
    resolutions: 0,
    audits: 0,
    claims: 1,
    active: 1,
    posts: 1,
    credits: 0,
  });
});
it("cliente404 sem receipt payment_create não resolve", async () => {
  fault("not_found", "customer_get");
  await advanceFixturePaymentExecution(fixture.requestId);
  expect(await resolve()).toBeNull();
  expect(stats()).toMatchObject({ active: 1, claims: 1, posts: 0 });
});
it("sem start consumido ou sem receipt mantém a reserva", async () => {
  const claim = await allocateFixturePaymentExecution(fixture.requestId);
  expect(await resolve()).toBeNull();
  expect(
    await startFixturePaymentExecution({
      stepId: claim.step!.id,
      workerId: claim.step!.workerId,
    }),
  ).toBe(true);
  expect(await resolve()).toBeNull();
  expect(stats()).toMatchObject({ active: 1, resolutions: 0, posts: 0 });
});
it.each([
  ["kind ausente", "outcome='{}'::jsonb"],
  [
    "kind null",
    "outcome=jsonb_build_object('kind',null,'scope',outcome->'scope')",
  ],
  [
    "kind tipo errado",
    "outcome=jsonb_build_object('kind',true,'scope',outcome->'scope')",
  ],
  ["scope ausente", "outcome=jsonb_build_object('kind','not_dispatched')"],
  [
    "scope errado",
    "outcome=jsonb_set(outcome,'{scope,accountId}','\"outra-conta\"'::jsonb)",
  ],
  ["effect preenchido", "effect_id='pay_fixture_contradiction'"],
  ["slot errado", `slot_id='${randomUUID()}'::uuid`],
])("%s na fonte não constitui prova negativa", async (_name, change) => {
  await noDispatch();
  corruptSource(change);
  expect(await resolve()).toBeNull();
  expect(stats()).toMatchObject({ active: 1, resolutions: 0, claims: 1 });
});
it.each(["payload", "fingerprint", "customer_get"])(
  "protocolo %s divergente/incompleto conserva pendência",
  async (field) => {
    await noDispatch();
    const source = sourceId();
    if (field === "customer_get")
      sql(
        `delete from private.payment_execution_protocols where operation='customer_get' and run_id in(select id from private.payment_execution_runs where intent_id='${fixture.intentId}');`,
      );
    else
      sql(
        `with prior as(delete from private.payment_execution_protocols where request_id='${source}' returning *) insert into private.payment_execution_protocols(step_id,run_id,operation,version,request_id,fingerprint,payload,scope_id,client_id,created_at) select step_id,run_id,operation,version,request_id,${field === "fingerprint" ? "repeat('f',64)" : "fingerprint"},${field === "payload" ? "jsonb_set(payload,'{amountCents}','1'::jsonb)" : "payload"},scope_id,client_id,created_at from prior;`,
      );
    expect(await resolve()).toBeNull();
    expect(stats().active).toBe(1);
  },
);
it.each(["indeterminate", "missing_kind", "different_scope"])(
  "outro POST %s pela referência bloqueia resolução",
  async (kind) => {
    await noDispatch();
    sql(
      `insert into private.payment_fixture_requests(id,slot_id,scope_id,client_id,operation,fingerprint,payload,outcome) select '${randomUUID()}','${randomUUID()}',${kind === "different_scope" ? `'${fixture.otherScopeId}'::uuid` : "scope_id"},client_id,operation,fingerprint,payload,${kind === "missing_kind" ? "'{}'::jsonb" : kind === "indeterminate" ? "jsonb_build_object('kind','indeterminate','scope',outcome->'scope')" : "outcome"} from private.payment_fixture_requests where id='${sourceId()}';`,
    );
    expect(await resolve()).toBeNull();
    expect(stats().active).toBe(1);
  },
);
it("outra autorização create consumida sem receipt é incerta", async () => {
  await noDispatch();
  sql(
    `insert into private.payment_execution_steps(run_id,worker_id,action,revision,started) select id,'${randomUUID()}','create',revision+1,true from private.payment_execution_runs where intent_id='${fixture.intentId}';`,
  );
  expect(await resolve()).toBeNull();
  expect(stats().active).toBe(1);
});
it("efeito positivo contraditório, mesmo deleted, não resolve", async () => {
  await noDispatch();
  await createAt(randomUUID());
  sql(
    `update private.payment_fixture_payments set deleted=true where intent_id='${fixture.intentId}';`,
  );
  expect(await resolve()).toBeNull();
  expect(stats()).toMatchObject({
    active: 1,
    posts: 2,
    payments: 1,
    resolutions: 0,
    credits: 0,
  });
});
it("resoluções concorrentes produzem um journal e uma liberação", async () => {
  await noDispatch();
  const both = await Promise.all([resolve(), resolve()]);
  expect(both[0]).toEqual(both[1]);
  expect(stats()).toMatchObject({
    resolutions: 1,
    audits: 1,
    active: 0,
    claims: 1,
  });
});
it("outro UUID e reutilização da solicitação em outra intenção conflitam", async () => {
  await noDispatch();
  await resolve();
  await expect(
    resolveFixturePaymentExecution({ ...input(), requestId: randomUUID() }),
  ).rejects.toThrow("Resolução fictícia indisponível.");
  const next = await reserveAgain();
  const r = await fixture.db.rpc("resolve_payment_execution_no_dispatch", {
    target_request: next.requestId,
    request_id: resolutionId,
  });
  expect(r.error?.code).toBe("PT409");
  expect(
    sql(
      `select intent_id from private.payment_intent_reservations where order_id='${fixture.sample.order_id}';`,
    ),
  ).toBe(next.receipt.snapshot.intent.id);
});
it("resposta de resolução perdida é recuperada por outro processo", async () => {
  await noDispatch();
  const first = await resolve();
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import {resolveFixturePaymentExecution} from './src/modules/payments/execution-resolution.ts'; const receipt=await resolveFixturePaymentExecution(${JSON.stringify(input())}); process.stdout.write(JSON.stringify({pid:process.pid,receipt}));`,
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
  expect(stats()).toMatchObject({ resolutions: 1, audits: 1, posts: 1 });
});
it("rollback reverte journal/terminal/liberação/auditoria e conserva receipt/claim", async () => {
  await noDispatch();
  sql(
    `begin; set local request.jwt.claim.role='service_role'; select public.resolve_payment_execution_no_dispatch('${fixture.requestId}','${resolutionId}'); rollback;`,
  );
  expect(stats()).toMatchObject({
    resolutions: 0,
    audits: 0,
    claims: 1,
    active: 1,
    posts: 1,
  });
  expect(
    sql(
      `select state from private.payment_execution_runs where intent_id='${fixture.intentId}';`,
    ),
  ).toBe("held");
  expect((await resolve())?.view.state).toBe("resolved");
  expect(stats()).toMatchObject({ resolutions: 1, audits: 1, active: 0 });
});
it("resolução antes de finish conserva observação tardia sem sair do terminal", async () => {
  const claim = await allocateFixturePaymentExecution(fixture.requestId),
    step = claim.step!;
  await startFixturePaymentExecution({
    stepId: step.id,
    workerId: step.workerId,
  });
  fault("not_dispatched");
  await createAt(step.id);
  expect((await resolve())?.view.state).toBe("resolved");
  const late = await fixture.db.rpc("finish_payment_execution_step", {
    target_step: step.id,
    worker_id: step.workerId,
    body_hash: null,
    normalizer_version: 1,
    facts: null,
  });
  expect(late.error).toBeNull();
  expect(late.data).toMatchObject({
    state: "resolved",
    reason: "no_dispatch_proven",
    reservationActive: false,
  });
  expect(
    sql(
      `select count(*) from private.payment_execution_observations where step_id='${step.id}';`,
    ),
  ).toBe("1");
  expect(
    await startFixturePaymentExecution({
      stepId: step.id,
      workerId: step.workerId,
    }),
  ).toBe(false);
  expect(
    (await allocateFixturePaymentExecution(fixture.requestId)).step,
  ).toBeNull();
});
it("retomada concorrente não desfaz terminal nem repete POST", async () => {
  await noDispatch();
  const results = await Promise.allSettled([
    resolve(),
    advanceFixturePaymentExecution(fixture.requestId),
  ]);
  expect(results[0].status).toBe("fulfilled");
  expect(
    (await allocateFixturePaymentExecution(fixture.requestId)).view.state,
  ).toBe("resolved");
  expect(stats()).toMatchObject({
    resolutions: 1,
    posts: 1,
    active: 0,
    claims: 1,
  });
});
it("produtor permite receipt antigo mas recusa novo slot da intenção resolvida", async () => {
  await noDispatch();
  const slot = sql(
    `select slot_id from private.payment_fixture_requests where id='${sourceId()}';`,
  );
  await resolve();
  await createAt(slot);
  expect(stats()).toMatchObject({ posts: 2, payments: 0 });
  fault("not_dispatched");
  const freshSlot = randomUUID();
  expect((await createAt(freshSlot)).kind).toBe("indeterminate");
  expect(
    sql(
      `select count(*) from private.payment_fixture_requests where slot_id='${freshSlot}' and operation='payment_create';`,
    ),
  ).toBe("0");
  expect(stats()).toMatchObject({ posts: 2, payments: 0 });
});
it("withdraw histórico é byte-equivalente e não toca reserva posterior", async () => {
  const db = await quoteSession(),
    withdrawId = randomUUID();
  try {
    const args = {
      target_intent: fixture.intentId,
      expected_revision: 0,
      request_id: withdrawId,
    };
    const first = await db.rpc("withdraw_payment_intent", args);
    expect(first.error).toBeNull();
    expect(paymentIntentReceiptSchema.parse(first.data).snapshot.state).toBe(
      "withdrawn",
    );
    const next = await reserveAgain();
    expect((await db.rpc("withdraw_payment_intent", args)).data).toEqual(
      first.data,
    );
    expect(
      sql(
        `select intent_id from private.payment_intent_reservations where order_id='${fixture.sample.order_id}';`,
      ),
    ).toBe(next.receipt.snapshot.intent.id);
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
});
it("resolução não é RPC humana e journal fica privado com RLS", async () => {
  const db = await quoteSession();
  try {
    expect(
      (
        await db.rpc("resolve_payment_execution_no_dispatch", {
          target_request: fixture.requestId,
          request_id: resolutionId,
        })
      ).error,
    ).not.toBeNull();
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  expect(
    sql(
      "select relrowsecurity from pg_class where oid='private.payment_intent_resolutions'::regclass;",
    ),
  ).toBe("t");
  expect(
    sql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name='payment_intent_resolutions' and grantee in('anon','authenticated','service_role');",
    ),
  ).toBe("0");
  await noDispatch();
  await resolve();
  expect(() =>
    sql(
      `update private.payment_intent_resolutions set reason='no_dispatch_proven' where intent_id='${fixture.intentId}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `update private.payment_execution_runs set state='held' where intent_id='${fixture.intentId}';`,
    ),
  ).toThrow();
});

it.each(["uppercase", "braces", "compact"])(
  "receipt histórico %s da mesma UUID bloqueia liberação",
  async (variant) => {
    await noDispatch();
    const reference =
      variant === "uppercase"
        ? fixture.intentId.toUpperCase()
        : variant === "braces"
          ? `{${fixture.intentId}}`
          : fixture.intentId.replaceAll("-", "");
    sql(
      `insert into private.payment_fixture_requests(id,slot_id,scope_id,client_id,operation,fingerprint,payload,outcome) select '${randomUUID()}','${randomUUID()}',scope_id,client_id,operation,fingerprint,jsonb_set(payload,'{reference}',to_jsonb('${reference}'::text)),jsonb_build_object('kind','indeterminate','scope',outcome->'scope') from private.payment_fixture_requests where id='${sourceId()}';`,
    );
    expect(await resolve()).toBeNull();
    expect(stats().active).toBe(1);
  },
);
it("produtor recusa referência não canônica antes de registrar fault", async () => {
  await noDispatch();
  fault("indeterminate_before");
  const r = await fixture.db.rpc("send_payment_fixture_request", {
    target_scope: fixture.scopeId,
    target_client: fixture.owner.id,
    slot_id: randomUUID(),
    request_id: randomUUID(),
    operation: "payment_create",
    fingerprint: "a".repeat(64),
    payload: { reference: `{${fixture.intentId.toUpperCase()}}` },
  });
  expect(r.error).not.toBeNull();
  expect((await resolve())?.view.state).toBe("resolved");
  expect(stats().posts).toBe(1);
});
const legacyUncertainPost = () =>
  sql(
    `insert into private.payment_fixture_requests(id,slot_id,scope_id,client_id,operation,fingerprint,payload,outcome) values('${randomUUID()}','${randomUUID()}','${fixture.scopeId}','${fixture.owner.id}','payment_create',repeat('a',64),jsonb_build_object('reference','{${fixture.intentId}}'),jsonb_build_object('kind','indeterminate','scope',(select outcome->'scope' from private.payment_fixture_requests where scope_id='${fixture.scopeId}' limit 1)));`,
  );
it("histórico com UUID equivalente antes de alocar exige consulta", async () => {
  legacyUncertainPost();
  const claim = await allocateFixturePaymentExecution(fixture.requestId);
  expect(claim.step?.action).toBe("find");
  expect((await advanceFixturePaymentExecution(fixture.requestId)).state).toBe(
    "held",
  );
  expect(await resolve()).toBeNull();
  expect(stats()).toMatchObject({
    active: 1,
    posts: 0,
    payments: 0,
    claims: 0,
  });
});
it("histórico com UUID equivalente entre alocação e start impede criação", async () => {
  const claim = await allocateFixturePaymentExecution(fixture.requestId);
  expect(claim.step?.action).toBe("create");
  legacyUncertainPost();
  expect(
    await startFixturePaymentExecution({
      stepId: claim.step!.id,
      workerId: claim.step!.workerId,
    }),
  ).toBe(false);
  expect((await advanceFixturePaymentExecution(fixture.requestId)).state).toBe(
    "held",
  );
  expect(stats()).toMatchObject({
    active: 1,
    posts: 0,
    payments: 0,
    claims: 0,
  });
});

const otherScopeUncertainPost = () =>
  sql(
    `insert into private.payment_fixture_requests(id,slot_id,scope_id,client_id,operation,fingerprint,payload,outcome) values('${randomUUID()}','${randomUUID()}','${fixture.otherScopeId}','${fixture.owner.id}','payment_create',repeat('a',64),jsonb_build_object('reference','${fixture.intentId}'),jsonb_build_object('kind','indeterminate','scope',jsonb_build_object('provider','asaas','environment','sandbox','accountId','fixture-${fixture.otherScopeId}')));`,
  );
it("histórico em outro escopo antes de alocar exige consulta no escopo capturado", async () => {
  otherScopeUncertainPost();
  const claim = await allocateFixturePaymentExecution(fixture.requestId);
  expect(claim.step).toMatchObject({
    action: "find",
    scopeId: fixture.scopeId,
  });
  expect((await advanceFixturePaymentExecution(fixture.requestId)).state).toBe(
    "held",
  );
  expect(await resolve()).toBeNull();
  expect(stats()).toMatchObject({ active: 1, posts: 0, payments: 0 });
});
it("histórico em outro escopo entre alocação e start impede novo POST", async () => {
  const claim = await allocateFixturePaymentExecution(fixture.requestId);
  otherScopeUncertainPost();
  expect(
    await startFixturePaymentExecution({
      stepId: claim.step!.id,
      workerId: claim.step!.workerId,
    }),
  ).toBe(false);
  expect((await advanceFixturePaymentExecution(fixture.requestId)).state).toBe(
    "held",
  );
  expect(stats()).toMatchObject({
    active: 1,
    posts: 0,
    payments: 0,
    claims: 0,
  });
});

const rawPostArgs = () => ({
  target_scope: fixture.scopeId,
  target_client: fixture.owner.id,
  slot_id: randomUUID(),
  request_id: randomUUID(),
  operation: "payment_create",
  fingerprint: "b".repeat(64),
  payload: {
    customerId: fixture.context.snapshot.binding!.customerId,
    reference: fixture.intentId,
    amountCents: fixture.context.snapshot.remainingCents!,
    billingType: fixture.context.snapshot.billingType,
    dueDate: fixture.context.snapshot.dueDate,
  },
});
const withdrawNow = async () => {
  const db = await quoteSession();
  try {
    return await db.rpc("withdraw_payment_intent", {
      target_intent: fixture.intentId,
      expected_revision: 0,
      request_id: randomUUID(),
    });
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
};
it.each(["canonical", "other_scope", "uuid_variant"])(
  "retirada préclaim bloqueia histórico incerto %s",
  async (kind) => {
    if (kind === "other_scope") otherScopeUncertainPost();
    else if (kind === "uuid_variant") legacyUncertainPost();
    else {
      fault("indeterminate_before");
      expect(
        (await fixture.db.rpc("send_payment_fixture_request", rawPostArgs()))
          .error,
      ).toBeNull();
    }
    expect((await withdrawNow()).error?.code).toBe("PT409");
    expect(stats()).toMatchObject({ active: 1, claims: 0, resolutions: 0 });
  },
);
it("retirada préclaim permite não despacho coerente mesmo com configuração obsoleta/markerfalse", async () => {
  fault("not_dispatched");
  expect(
    (await fixture.db.rpc("send_payment_fixture_request", rawPostArgs())).error,
  ).toBeNull();
  sql(
    `update private.payment_fixture_environment set enabled=false where singleton; update private.payment_provider_configuration set scope_id='${fixture.otherScopeId}' where singleton;`,
  );
  const result = await withdrawNow();
  expect(result.error).toBeNull();
  expect(paymentIntentReceiptSchema.parse(result.data).snapshot.state).toBe(
    "withdrawn",
  );
  expect(stats().active).toBe(0);
});
it("retirada com claim ainda exige resolução S mesmo com prova de não despacho", async () => {
  await noDispatch();
  expect((await withdrawNow()).error?.code).toBe("PT409");
  expect(stats().active).toBe(1);
  expect((await resolve())?.view.state).toBe("resolved");
});
it("corrida entre N e retirada não deixa incerteza com reserva liberada", async () => {
  fault("indeterminate_before");
  const outcomes = await Promise.all([
    fixture.db.rpc("send_payment_fixture_request", rawPostArgs()),
    withdrawNow(),
  ]);
  const nWon = outcomes[0].error === null;
  expect(outcomes[1].error === null).toBe(!nWon);
  expect(stats()).toMatchObject({
    active: nWon ? 1 : 0,
    posts: nWon ? 1 : 0,
    payments: 0,
    claims: 0,
  });
  if (!nWon) expect(outcomes[0].error?.code).toBe("PT409");
  else expect(outcomes[1].error?.code).toBe("PT409");
});
it("outra prova explícita com UUID equivalente não bloqueia resolução segura", async () => {
  await noDispatch();
  sql(
    `insert into private.payment_fixture_requests(id,slot_id,scope_id,client_id,operation,fingerprint,payload,outcome) select '${randomUUID()}','${randomUUID()}',scope_id,client_id,operation,fingerprint,jsonb_set(payload,'{reference}',to_jsonb('{${fixture.intentId}}'::text)),outcome from private.payment_fixture_requests where id='${sourceId()}';`,
  );
  expect((await resolve())?.view.state).toBe("resolved");
  expect(stats()).toMatchObject({ active: 0, claims: 1, payments: 0 });
});
it("retirada concluída impede novo fault N sem consumir controle ou criar receipt", async () => {
  fault("indeterminate_before");
  expect((await withdrawNow()).error).toBeNull();
  const args = rawPostArgs();
  const refused = await fixture.db.rpc("send_payment_fixture_request", args);
  expect(refused.error?.code).toBe("PT409");
  expect(
    sql(
      `select count(*) from private.payment_fixture_requests where id='${args.request_id}';`,
    ),
  ).toBe("0");
  expect(
    sql(
      `select calls_left from private.payment_fixture_controls where scope_id='${fixture.scopeId}' and operation='payment_create';`,
    ),
  ).toBe("1");
  expect(stats()).toMatchObject({
    active: 0,
    posts: 0,
    payments: 0,
    credits: 0,
  });
});
