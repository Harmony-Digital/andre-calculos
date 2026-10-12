import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { executionTransportFixture } from "../e2e/execution-transport-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import {
  allocateFixturePaymentExecution,
  prepareFixturePaymentExecution,
  startFixturePaymentExecution,
} from "@/modules/payments/execution-system";
import {
  createDurableAsaasFixturePort,
  getDurableFixtureTransportReceipt,
} from "@/modules/payments/asaas/fixture-port";
import { readAsaasPayment } from "@/modules/payments/asaas/contracts";
import { normalizeValidatedAsaasPaymentObservation } from "@/modules/payments/asaas/financial";
import { quoteSession } from "../e2e/quote-helper";
import { createAsaasFixtureAdapter } from "@/modules/payments/asaas/adapter";
let fixture: Awaited<ReturnType<typeof executionTransportFixture>>;
const advance = () => advanceFixturePaymentExecution(fixture.requestId);
const stats = () =>
  JSON.parse(
    sql(`select json_build_object(
 'posts',(select count(*) from private.payment_fixture_invocations i join private.payment_fixture_requests r on r.id=i.request_id where r.operation='payment_create' and r.payload->>'reference'='${fixture.intentId}'),
 'payments',(select count(*) from private.payment_fixture_payments where intent_id='${fixture.intentId}'),
 'observations',(select count(*) from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${fixture.intentId}'),
 'claims',(select count(*) from private.payment_intent_dispatch_claims where intent_id='${fixture.intentId}'),
 'active',(select count(*) from private.payment_intent_reservations where intent_id='${fixture.intentId}'),
 'credits',(select count(*) from public.payments where order_id='${fixture.sample.order_id}'),
 'notices',(select count(*) from public.notifications where template='payment_confirmed' and data->>'order_id'='${fixture.sample.order_id}'));`),
  );
const fault = (operation: string, behavior: string) =>
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior,calls_left) values('${fixture.scopeId}','${fixture.owner.id}','${operation}','${behavior}',1) on conflict(scope_id,client_id,operation) do update set behavior=excluded.behavior,calls_left=1;`,
  );
const latest = () =>
  JSON.parse(
    sql(
      `select json_build_object('id',o.step_id,'facts',o.facts,'receipt',o.receipt_id,'hash',o.body_hash,'reason',o.reason) from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${fixture.intentId}' order by o.recorded_at desc limit 1;`,
    ),
  );
beforeEach(async () => {
  fixture = await executionTransportFixture();
});
afterEach(async () => {
  if (fixture) await fixture.cleanup();
});
it("falha de preparação restaura marker, dados e lease da fixture", async () => {
  await fixture.cleanup();
  try {
    await expect(executionTransportFixture("INVALID")).rejects.toThrow(
      "Contexto da fixture indisponível.",
    );
    expect(
      sql(
        "select enabled from private.payment_fixture_environment where singleton;",
      ),
    ).toBe("f");
    expect(sql("select count(*) from private.payment_provider_scopes;")).toBe(
      "0",
    );
    expect(sql("select count(*) from private.payment_customer_work;")).toBe(
      "0",
    );
    expect(sql("select count(*) from private.payment_fixture_requests;")).toBe(
      "0",
    );
  } finally {
    fixture = await executionTransportFixture();
  }
});
it("cliente→G→L→I emite uma cobrança e persiste fonte/fatos sem crédito/fila", async () => {
  expect((await advance()).state).toBe("identified");
  expect(stats()).toMatchObject({
    posts: 1,
    payments: 1,
    observations: 1,
    claims: 1,
    active: 1,
    credits: 0,
    notices: 0,
  });
  const observation = latest();
  expect(observation.facts).toMatchObject({
    effects: "none",
    billingType: "PIX",
    amounts: { contractedCents: 12501, currentValueCents: 12501 },
  });
  expect(observation.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(
    sql(
      `select status from public.orders where id='${fixture.sample.order_id}';`,
    ),
  ).toBe("awaiting_payment");
  expect(
    sql(
      `select count(*) from private.payment_execution_protocols p join private.payment_execution_steps s on s.id=p.step_id join private.payment_execution_runs r on r.id=s.run_id join public.audit_log a on a.target_id=s.id and a.action='payment_execution_step_started' where r.intent_id='${fixture.intentId}' and p.created_at<=a.created_at;`,
    ),
  ).toBe("2");
});
it.each(["lost_after_create", "invalid_after_create"])(
  "%s retoma por consulta, sem novo POST",
  async (behavior) => {
    fault("payment_create", behavior);
    expect((await advance()).state).toBe("held");
    expect((await advance()).state).toBe("identified");
    expect(stats()).toMatchObject({
      posts: 1,
      payments: 1,
      observations: 2,
      active: 1,
    });
  },
);
it("resposta perdida é retomada por outro processo servidor", async () => {
  fault("payment_create", "lost_after_create");
  await advance();
  const r = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import {advanceFixturePaymentExecution} from './src/modules/payments/execution-worker.ts'; const v=await advanceFixturePaymentExecution(${JSON.stringify(fixture.requestId)}); process.stdout.write(JSON.stringify({pid:process.pid,intentId:v.intentId,state:v.state}));`,
      ],
      {
        env: process.env,
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 4096,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  expect(r).toMatchObject({ intentId: fixture.intentId, state: "identified" });
  expect(r.pid).not.toBe(process.pid);
  expect(stats().posts).toBe(1);
});
it.each(["indeterminate_before", "not_dispatched"])(
  "%s seguido de zero conserva reserva e nunca reenvia",
  async (behavior) => {
    fault("payment_create", behavior);
    expect((await advance()).state).toBe("held");
    for (let i = 0; i < 2; i++) expect((await advance()).state).toBe("held");
    expect(stats()).toMatchObject({
      posts: 1,
      payments: 0,
      claims: 1,
      active: 1,
    });
  },
);
it("preflight de cliente404 sem receiptpayment_create não prova não despacho", async () => {
  fault("customer_get", "not_found");
  expect((await advance()).state).toBe("held");
  expect(latest()).toMatchObject({
    receipt: null,
    facts: null,
    reason: "unavailable",
  });
  await advance();
  expect(stats()).toMatchObject({
    posts: 0,
    payments: 0,
    active: 1,
    claims: 1,
  });
});
it.each(["not_found", "unavailable", "incomplete_list"])(
  "consulta %s conserva claim/reserva",
  async (behavior) => {
    fault("payment_create", "lost_after_create");
    await advance();
    fault("payment_find", behavior);
    expect((await advance()).state).toBe("held");
    expect(stats()).toMatchObject({ posts: 1, active: 1, credits: 0 });
  },
);
it("workers concorrentes nunca produzem outro POST", async () => {
  await Promise.allSettled([advance(), advance()]);
  if (stats().posts === 0) await advance();
  await advance();
  expect(stats()).toMatchObject({
    posts: 1,
    payments: 1,
    claims: 1,
    active: 1,
  });
});
it("UNDEFINED registra método conhecido escolhido sem mudar o contrato original", async () => {
  await fixture.cleanup();
  fixture = await executionTransportFixture("UNDEFINED");
  await advance();
  sql(
    `update private.payment_fixture_payments set billing_type='BOLETO' where intent_id='${fixture.intentId}';`,
  );
  expect((await advance()).state).toBe("identified");
  expect(latest().facts).toMatchObject({
    expectedBillingType: "UNDEFINED",
    billingType: "BOLETO",
  });
  expect(fixture.context.snapshot.billingType).toBe("UNDEFINED");
  expect(stats().posts).toBe(1);
});
it.each(["amount", "date", "method"])(
  "%s divergente bloqueia observação",
  async (field) => {
    await advance();
    sql(
      `update private.payment_fixture_payments set ${field === "amount" ? "value_cents=12502" : field === "date" ? "due_date='2026-10-21'" : "billing_type='BOLETO'"} where intent_id='${fixture.intentId}';`,
    );
    expect((await advance()).state).toBe("held");
    expect(stats()).toMatchObject({ posts: 1, active: 1, credits: 0 });
  },
);
it("recebimento/estorno preservam valores exatos, mas não aplicam crédito", async () => {
  await advance();
  sql(
    `update private.payment_fixture_payments set status='RECEIVED',net_cents=12251,refunds='[{"value":1.01,"status":"DONE","dateCreated":"2026-10-11 10:00:00"}]',chargeback=null where intent_id='${fixture.intentId}';`,
  );
  expect((await advance()).state).toBe("identified");
  expect(latest().facts).toMatchObject({
    amounts: {
      currentValueCents: 12501,
      netCents: 12251,
      feeCents: 250,
      grossLessCompletedRefundsCents: 12400,
    },
    refunds: { completedCents: 101 },
  });
  expect(stats()).toMatchObject({ credits: 0, notices: 0, active: 1 });
});
it("start sem protocolo ou protocolo alterado não permite transporte", async () => {
  const c = await allocateFixturePaymentExecution(fixture.requestId),
    step = c.step!;
  expect(
    (
      await fixture.db.rpc("start_payment_execution_step", {
        target_step: step.id,
        worker_id: step.workerId,
      })
    ).data,
  ).toBe(false);
  expect(
    await prepareFixturePaymentExecution({
      stepId: step.id,
      workerId: step.workerId,
    }),
  ).toBe(true);
  expect(
    sql(
      `select count(*) from private.payment_execution_protocols where step_id='${step.id}';`,
    ),
  ).toBe("2");
  const wrong = await fixture.db.rpc("prepare_payment_execution_protocol", {
    target_step: step.id,
    worker_id: step.workerId,
    protocols: [],
  });
  expect(wrong.error).not.toBeNull();
  expect(stats().posts).toBe(0);
});
it("queda após transporte e antes da finalização é consultada; resultado antigo não sobrescreve", async () => {
  const c = await allocateFixturePaymentExecution(fixture.requestId),
    step = c.step!,
    o = step.snapshot.obligation,
    b = o.binding!;
  expect(
    await startFixturePaymentExecution({
      stepId: step.id,
      workerId: step.workerId,
    }),
  ).toBe(true);
  const port = await createDurableAsaasFixturePort({
    scopeId: step.scopeId,
    clientId: step.clientId,
    slotId: step.id,
  });
  await createAsaasFixtureAdapter(step.scope, port).createPayment({
    customer: {
      scope: step.scope,
      customerId: b.customerId,
      clientId: step.clientId,
      ...step.snapshot.customer,
    },
    reference: step.intentId,
    contractedCents: o.remainingCents!,
    dueDate: o.dueDate,
    billingType: o.billingType,
  });
  expect((await advance()).state).toBe("identified");
  const old = await fixture.db.rpc("finish_payment_execution_step", {
    target_step: step.id,
    worker_id: step.workerId,
    body_hash: null,
    normalizer_version: 1,
    facts: null,
  });
  expect(old.error).toBeNull();
  expect((old.data as { state: string }).state).toBe("identified");
  expect(stats()).toMatchObject({ posts: 1, observations: 2 });
});
it("replay da finalização é idempotente e fatos distintos conflitam", async () => {
  await advance();
  const observation = latest(),
    worker = sql(
      `select worker_id from private.payment_execution_steps where id='${observation.id}';`,
    );
  const input = {
    target_step: observation.id,
    worker_id: worker,
    body_hash: observation.hash,
    normalizer_version: 1,
    facts: observation.facts,
  };
  expect(
    (await fixture.db.rpc("finish_payment_execution_step", input)).error,
  ).toBeNull();
  expect(stats().observations).toBe(1);
  expect(
    (
      await fixture.db.rpc("finish_payment_execution_step", {
        ...input,
        body_hash: "a".repeat(64),
      })
    ).error?.code,
  ).toBe("PT409");
});
it("estado desconhecido e campos financeiros ausentes conservam conciliação", async () => {
  await advance();
  sql(
    `update private.payment_fixture_payments set status='FUTURE_STATUS' where intent_id='${fixture.intentId}';`,
  );
  expect((await advance()).state).toBe("held");
  expect(latest().facts.reasons).toContain("unknown_payment_status");
  expect(stats().credits).toBe(0);
});
it("candidatos múltiplos permanecem visíveis e não provocam terceiro POST", async () => {
  await advance();
  const o = fixture.context.snapshot,
    b = o.binding!,
    port = await createDurableAsaasFixturePort({
      scopeId: fixture.scopeId,
      clientId: fixture.owner.id,
      slotId: randomUUID(),
    });
  await createAsaasFixtureAdapter(port.scope, port).createPayment({
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
  expect(stats().posts).toBe(2);
  expect((await advance()).state).toBe("held");
  expect(latest().reason).toBe("multiple_candidates");
  expect(stats()).toMatchObject({
    posts: 2,
    payments: 2,
    active: 1,
    credits: 0,
  });
});
it("rollback da finalização preserva transporte/claim e reverte fato/estado/auditoria", async () => {
  const c = await allocateFixturePaymentExecution(fixture.requestId),
    step = c.step!,
    o = step.snapshot.obligation,
    b = o.binding!;
  await startFixturePaymentExecution({
    stepId: step.id,
    workerId: step.workerId,
  });
  const port = await createDurableAsaasFixturePort({
    scopeId: step.scopeId,
    clientId: step.clientId,
    slotId: step.id,
  });
  await createAsaasFixtureAdapter(step.scope, port).createPayment({
    customer: {
      scope: step.scope,
      customerId: b.customerId,
      clientId: step.clientId,
      ...step.snapshot.customer,
    },
    reference: step.intentId,
    contractedCents: o.remainingCents!,
    billingType: o.billingType,
    dueDate: o.dueDate,
  });
  const receipt = await getDurableFixtureTransportReceipt({
    scopeId: step.scopeId,
    clientId: step.clientId,
    slotId: step.id,
    operation: "payment_create",
  });
  if (!receipt || receipt.outcome.kind !== "response")
    throw new Error("Fonte fictícia ausente.");
  const observed = readAsaasPayment(receipt.outcome.bodyText, step.scope, {
    scope: step.scope,
    phase: "creation",
    customerId: b.customerId,
    reference: step.intentId,
    contractedCents: o.remainingCents!,
    billingType: o.billingType,
    dueDate: o.dueDate,
  });
  const facts = normalizeValidatedAsaasPaymentObservation(
      observed,
      o.billingType,
    ),
    hash = createHash("sha256").update(receipt.outcome.bodyText).digest("hex");
  sql(
    `begin;set local request.jwt.claims='{"role":"service_role"}';select public.finish_payment_execution_step('${step.id}','${step.workerId}','${hash}',1,'${JSON.stringify(facts).replaceAll("'", "''")}'::jsonb);rollback;`,
  );
  expect(stats()).toMatchObject({
    posts: 1,
    payments: 1,
    claims: 1,
    observations: 0,
    active: 1,
  });
  expect(
    sql(
      `select finished_at is null from private.payment_execution_steps where id='${step.id}';`,
    ),
  ).toBe("t");
  expect(
    sql(
      `select count(*) from public.audit_log where action='payment_execution_observed' and target_id='${step.id}';`,
    ),
  ).toBe("0");
  const saved = await fixture.db.rpc("finish_payment_execution_step", {
    target_step: step.id,
    worker_id: step.workerId,
    body_hash: hash,
    normalizer_version: 1,
    facts,
  });
  expect(saved.error).toBeNull();
  expect(stats()).toMatchObject({ posts: 1, observations: 1, credits: 0 });
});
it("RPCs do transporte negadas ao cliente e helper antigo não inicia pelo serviço", async () => {
  const c = await allocateFixturePaymentExecution(fixture.requestId),
    step = c.step!,
    db = await quoteSession();
  try {
    for (const [name, args] of [
      [
        "get_payment_execution_step",
        { target_step: step.id, worker_id: step.workerId },
      ],
      [
        "prepare_payment_execution_protocol",
        { target_step: step.id, worker_id: step.workerId, protocols: [] },
      ],
      [
        "finish_payment_execution_step",
        {
          target_step: step.id,
          worker_id: step.workerId,
          body_hash: null,
          normalizer_version: 1,
          facts: null,
        },
      ],
    ] as const)
      expect((await db.rpc(name, args)).error).not.toBeNull();
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  expect(
    (
      await fixture.db.rpc("start_payment_execution_step_before_protocol", {
        target_step: step.id,
        worker_id: step.workerId,
      })
    ).error,
  ).not.toBeNull();
  for (const table of [
    "payment_execution_protocols",
    "payment_execution_observations",
  ]) {
    expect(
      sql(
        `select relrowsecurity from pg_class where oid='private.${table}'::regclass;`,
      ),
    ).toBe("t");
    for (const role of ["anon", "authenticated", "service_role"])
      expect(
        sql(
          `select has_table_privilege('${role}','private.${table}','SELECT');`,
        ),
      ).toBe("f");
  }
});
