import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { executionTransportFixture } from "../e2e/execution-transport-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { localSystem } from "../e2e/local-helper";
import { quoteSession } from "../e2e/quote-helper";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import {
  captureFixtureFinancialObservation,
  queryFixtureFinancialObservation,
  allocateFixtureFinancialQuery,
  startFixtureFinancialQuery,
  finishFixtureFinancialQuery,
  financialQueryProtocol,
} from "@/modules/payments/financial-worker";
import { createDurableAsaasFixturePort } from "@/modules/payments/asaas/fixture-port";
import { fixturePaymentGetRequest } from "@/modules/payments/asaas/fixture-protocol";
import { paymentIntentReceiptSchema } from "@/modules/payments/intents";
let fixture: Awaited<ReturnType<typeof executionTransportFixture>>;
let origin: string, charge: string, payment: string;
const get = () => queryFixtureFinancialObservation(charge, randomUUID());
const latest = () =>
  JSON.parse(
    sql(
      `select json_build_object('facts',facts,'proof',proof,'order',source_order,'reason',reason,'source',source_id,'receipt',receipt_id,'hash',body_hash) from private.payment_financial_observations where charge_id='${charge}' order by recorded_at desc limit 1;`,
    ),
  );
const counters = () =>
  JSON.parse(
    sql(
      `select json_build_object('credits',(select count(*) from public.payments where order_id='${fixture.sample.order_id}'),'notices',(select count(*) from public.notifications where data->>'order_id'='${fixture.sample.order_id}'),'state',(select status from public.orders where id='${fixture.sample.order_id}'),'reservation',(select count(*) from private.payment_intent_reservations where intent_id='${fixture.intentId}'),'posts',(select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${fixture.intentId}'));`,
    ),
  );
const change = (patch: string) =>
  sql(
    `update private.payment_fixture_payments set ${patch} where scope_id='${fixture.scopeId}' and id='${payment}';`,
  );
const transport = async (
  q: Awaited<ReturnType<typeof allocateFixtureFinancialQuery>>,
) => {
  const port = await createDurableAsaasFixturePort({
    scopeId: q.scopeId,
    clientId: q.clientId,
    slotId: q.queryId,
  });
  await port.send(
    fixturePaymentGetRequest(q.expectation.scope, q.expectation.paymentId!),
  );
};
const fault = (behavior: string) =>
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','${behavior}') on conflict(scope_id,client_id,operation) do update set behavior=excluded.behavior,calls_left=1;`,
  );
const cb = (reversals: number[] = [], status = "DONE") => {
  const proof = {
    schemaVersion: 1,
    semantics: "fixture_chargeback_cumulative",
    paymentId: payment,
    reference: fixture.intentId,
    caseId: "case_fixture",
    debit: {
      id: "debit_fixture",
      value: 20.01,
      effectedAt: "2026-10-12T10:00:00-03:00",
    },
    reversals: reversals.map((value, i) => ({
      id: "rev_fixture_" + i,
      reversesDebitId: "debit_fixture",
      value,
      effectedAt: "2026-10-12T11:00:00-03:00",
    })),
  };
  return JSON.stringify({ status, fixtureProof: proof });
};
beforeEach(async () => {
  fixture = await executionTransportFixture();
  await advanceFixturePaymentExecution(fixture.requestId);
  origin = sql(
    `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${fixture.intentId}' order by o.recorded_at desc limit 1;`,
  );
  const captured = await captureFixtureFinancialObservation(origin);
  charge = captured.chargeId;
  payment = sql(
    `select provider_payment_id from private.payment_financial_charges where id='${charge}';`,
  );
});
afterEach(async () => {
  if (fixture) await fixture.cleanup();
});
it("origem R/N, replay e duas fontes iguais conservam journal sem efeito", async () => {
  const before = counters(),
    prior = await captureFixtureFinancialObservation(origin);
  expect(prior.kind).toBe("replay");
  const a = await get(),
    b = await get();
  expect(a.observationId).not.toBe(b.observationId);
  expect(
    sql(
      `select count(*) from private.payment_financial_observations where charge_id='${charge}';`,
    ),
  ).toBe("3");
  expect(counters()).toEqual(before);
  expect(latest().order).toBe(1);
});
it("consulta fresca e replay de slot são operações distintas", async () => {
  const request = randomUUID(),
    a = await queryFixtureFinancialObservation(charge, request);
  change("status='RECEIVED',net_cents=value_cents-100,refunds='[]'");
  const replay = await queryFixtureFinancialObservation(charge, request);
  expect(replay.observationId).toBe(a.observationId);
  expect(latest().facts.status).toBe("PENDING");
  await get();
  expect(latest()).toMatchObject({
    order: 2,
    facts: { status: "RECEIVED", amounts: { feeCents: 100 } },
  });
  expect(counters()).toMatchObject({ credits: 0, reservation: 1, posts: 1 });
});
it("resposta perdida do GET é retomada por outro processo", async () => {
  const request = randomUUID(),
    q = await allocateFixtureFinancialQuery(charge, request);
  expect(await startFixtureFinancialQuery(q)).toBe(true);
  await transport(q);
  change("status='RECEIVED'");
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import {queryFixtureFinancialObservation} from './src/modules/payments/financial-worker.ts'; const r=await queryFixtureFinancialObservation(${JSON.stringify(charge)},${JSON.stringify(request)});process.stdout.write(JSON.stringify({pid:process.pid,id:r.observationId}));`,
      ],
      {
        env: process.env,
        encoding: "utf8",
        timeout: 10000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  expect(result.pid).not.toBe(process.pid);
  expect(latest().facts.status).toBe("PENDING");
  expect((await finishFixtureFinancialQuery(q)).observationId).toBe(result.id);
});
it("finalização antiga preserva fonte sem limpar a consulta corrente", async () => {
  const a = await allocateFixtureFinancialQuery(charge, randomUUID());
  await startFixtureFinancialQuery(a);
  await transport(a);
  change("status='RECEIVED'");
  const b = await allocateFixtureFinancialQuery(charge, randomUUID());
  await startFixtureFinancialQuery(b);
  await transport(b);
  const old = await finishFixtureFinancialQuery(a);
  expect(old.current).toBe(false);
  expect(
    sql(
      `select current_query from private.payment_financial_charges where id='${charge}';`,
    ),
  ).toBe(b.queryId);
  const fresh = await finishFixtureFinancialQuery(b);
  expect(fresh.current).toBe(true);
  expect(
    sql(
      `select current_query from private.payment_financial_charges where id='${charge}';`,
    ),
  ).toBe("");
});
it("start antigo não consumido é recusado por fencing", async () => {
  const a = await allocateFixtureFinancialQuery(charge, randomUUID());
  await allocateFixtureFinancialQuery(charge, randomUUID());
  expect(await startFixtureFinancialQuery(a)).toBe(false);
});
it("mesma fonte com fatos diferentes registra conflito durável", async () => {
  const q = await allocateFixtureFinancialQuery(charge, randomUUID());
  await startFixtureFinancialQuery(q);
  await transport(q);
  const a = await finishFixtureFinancialQuery(q),
    o = latest();
  const changed = { ...o.facts, status: "OVERDUE" };
  const args = {
    target_query: q.queryId,
    worker_id: q.workerId,
    body_hash: o.hash,
    facts: changed,
    proof: o.proof,
    source_order: o.order,
  };
  const r = await localSystem().rpc("finish_financial_query", args);
  expect(r.error).toBeNull();
  expect(r.data.kind).toBe("conflict");
  const twice = await localSystem().rpc("finish_financial_query", args);
  expect(twice.error).toBeNull();
  expect(twice.data.conflictId).toBe(r.data.conflictId);
  expect(latest().facts.status).toBe("PENDING");
  expect(
    sql(
      `select count(*) from private.payment_financial_conflicts where observation_id='${a.observationId}';`,
    ),
  ).toBe("1");
});
it.each(["not_found", "unavailable", "indeterminate_before", "not_dispatched"])(
  "%s conserva conciliação sem soltar reserva",
  async (behavior) => {
    const before = counters();
    fault(behavior);
    await get();
    expect(latest().facts).toBeNull();
    expect(latest().reason).toBeTruthy();
    expect(counters()).toEqual(before);
  },
);
it("deleted recebido é fato incerto, sem restauração ou liberação", async () => {
  change("status='RECEIVED',deleted=true,net_cents=value_cents,refunds='[]'");
  await get();
  expect(latest().facts.reasons).toContain("deleted_financial_observation");
  expect(counters().reservation).toBe(1);
});
it("chargeback desconhecido, efetivado e revertido ficam vinculados a fontes imutáveis", async () => {
  change(
    "status='RECEIVED',net_cents=value_cents,refunds='[]',chargeback='{\"status\":\"DONE\"}'",
  );
  await get();
  expect(latest().proof.kind).toBe("unknown");
  change(`chargeback='${cb()}'`);
  await get();
  expect(latest().proof).toMatchObject({
    kind: "proven",
    outstandingCents: 2001,
  });
  const debited = latest();
  change(`chargeback='${cb([5.01])}'`);
  await get();
  expect(latest().proof).toMatchObject({
    reversedCents: 501,
    outstandingCents: 1500,
  });
  change(`chargeback='${cb([5.01, 15], "REVERSED")}'`);
  await get();
  expect(latest().proof.outstandingCents).toBe(0);
  expect(
    JSON.parse(
      sql(
        `select proof from private.payment_financial_observations where source_id='${debited.source}';`,
      ),
    ).outstandingCents,
  ).toBe(2001);
  expect(counters()).toMatchObject({ credits: 0, posts: 1, reservation: 1 });
});
it("prova excedente não se transforma em zero conhecido", async () => {
  change(`status='RECEIVED',chargeback='${cb([21])}'`);
  await get();
  expect(latest().proof).toEqual({ kind: "invalid" });
});
it("observação sobrevive ao rollback da futura aplicação", async () => {
  const result = await get();
  expect(() => sql("begin; select 1/0; commit;")).toThrow();
  expect(
    sql(
      `select count(*) from private.payment_financial_observations where id='${result.observationId}';`,
    ),
  ).toBe("1");
});
it("consulta conserva autoridade histórica depois da reserva/configuração", async () => {
  sql(
    `delete from private.payment_intent_reservations where intent_id='${fixture.intentId}';delete from private.payment_provider_configuration where singleton;`,
  );
  change(
    "status='REFUNDED',net_cents=value_cents,refunds=jsonb_build_array(jsonb_build_object('status','DONE','value',(value_cents::numeric/100)::numeric(18,2),'dateCreated','2026-10-12 10:00:00'))",
  );
  await get();
  expect(latest().facts).toMatchObject({
    status: "REFUNDED",
    refunds: { completedCents: 12501 },
  });
  expect(counters()).toMatchObject({ credits: 0, posts: 1, reservation: 0 });
});
it("sistema recusa worker/protocolo/payload/fatos de outra identidade", async () => {
  const q = await allocateFixtureFinancialQuery(charge, randomUUID()),
    p = financialQueryProtocol(q),
    db = localSystem();
  expect(
    (
      await db.rpc("start_financial_query", {
        target_query: q.queryId,
        worker_id: randomUUID(),
        protocol: p,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await db.rpc("start_financial_query", {
        target_query: q.queryId,
        worker_id: q.workerId,
        protocol: { ...p, payload: { paymentId: "other" } },
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await db.rpc("start_financial_query", {
        target_query: q.queryId,
        worker_id: q.workerId,
        protocol: null,
      })
    ).error,
  ).not.toBeNull();
  await startFixtureFinancialQuery(q);
  await transport(q);
  const facts = latest().facts;
  expect(
    (
      await db.rpc("finish_financial_query", {
        target_query: q.queryId,
        worker_id: q.workerId,
        body_hash: "a".repeat(64),
        facts,
        proof: { kind: "unknown" },
        source_order: 1,
      })
    ).error,
  ).not.toBeNull();
  expect(
    sql(
      `select count(*) from private.payment_financial_observations where source_id='${q.queryId}';`,
    ),
  ).toBe("0");
});
it("journal/identidade são imutáveis e ID não pode ser reutilizado", async () => {
  const r = await get();
  expect(() =>
    sql(
      `update private.payment_financial_observations set reason='alterado' where id='${r.observationId}';`,
    ),
  ).toThrow();
  expect(() => change("id='other'")).toThrow();
  expect(() =>
    sql(
      `delete from private.payment_fixture_payments where scope_id='${fixture.scopeId}' and id='${payment}';`,
    ),
  ).toThrow();
  expect(() => change("fixture_revision=10")).toThrow();
});
it("papéis humanos não podem consultar nem gravar journal privado", async () => {
  const db = await quoteSession();
  try {
    expect(
      (await db.rpc("get_financial_origin", { target_observation: origin }))
        .error,
    ).not.toBeNull();
    expect(
      (
        await db.rpc("allocate_financial_query", {
          target_charge: charge,
          request_id: randomUUID(),
        })
      ).error,
    ).not.toBeNull();
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  expect(
    sql(
      "select count(*) from pg_tables t join pg_class c on c.relname=t.tablename join pg_namespace n on n.oid=c.relnamespace and n.nspname=t.schemaname where t.schemaname='private' and t.tablename in('payment_financial_charges','payment_financial_queries','payment_financial_observations','payment_financial_conflicts') and c.relrowsecurity;",
    ),
  ).toBe("4");
  expect(
    sql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name like 'payment_financial_%' and grantee in('anon','authenticated','service_role');",
    ),
  ).toBe("0");
});
it("mesmo paymentID em outra conta não mistura cobrança ou posição", async () => {
  fixture.scope(fixture.otherScopeId);
  // O segundo vínculo usa o mesmo cliente local, mas outra conta declarada.
  sql(
    `insert into private.payment_fixture_customers(id,scope_id,client_id,kind,document,name) select customer_id,'${fixture.otherScopeId}',client_id,'person','11144477735','Cliente fictício' from private.payment_provider_customers where id='${fixture.otherBindingId}';`,
  );
  const sample = await fixture.create(),
    db = await quoteSession(),
    request = randomUUID();
  let intent: string;
  try {
    const context = await fixture.prepare(sample, db);
    const result = await db.rpc("reserve_payment_intent", {
      target_context: context.id,
      request_id: request,
    });
    expect(result.error).toBeNull();
    intent = paymentIntentReceiptSchema.parse(result.data).snapshot.intent.id;
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.otherScopeId}','${fixture.owner.id}','payment_create','lost_after_create');`,
  );
  expect((await advanceFixturePaymentExecution(request)).state).toBe("held");
  const otherPayment = sql(
    `select id from private.payment_fixture_payments where intent_id='${intent}';`,
  );
  sql(
    `update private.payment_fixture_payments set id='${payment}' where scope_id='${fixture.otherScopeId}' and id='${otherPayment}';`,
  );
  await advanceFixturePaymentExecution(request);
  const second = sql(
    `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${intent}' and o.facts->>'paymentId'='${payment}' order by o.recorded_at desc limit 1;`,
  );
  expect(
    sql(
      `select count(*) from private.payment_fixture_payments where id='${payment}';`,
    ),
  ).toBe("2");
  expect(second).not.toBe("");
  const otherCharge = await captureFixtureFinancialObservation(second);
  expect(otherCharge.chargeId).not.toBe(charge);
  expect(
    (await queryFixtureFinancialObservation(otherCharge.chargeId, randomUUID()))
      .chargeId,
  ).toBe(otherCharge.chargeId);
  expect((await get()).chargeId).toBe(charge);
  expect(
    sql(
      `select count(*) from private.payment_financial_charges where provider_payment_id='${payment}';`,
    ),
  ).toBe("2");
});
it.each([10000, 14000])(
  "parcial/excesso de %s preserva original e taxa, sem crédito",
  async (value) => {
    change(
      `status='RECEIVED',original_cents=value_cents,value_cents=${value},net_cents=${value}-2,refunds='[]'`,
    );
    await get();
    expect(latest().facts.amounts).toMatchObject({
      contractedCents: 12501,
      currentValueCents: value,
      providerOriginalCents: 12501,
      feeCents: 2,
    });
    expect(counters()).toMatchObject({ credits: 0, reservation: 1 });
  },
);
it.each(["missing", "0", "1.2", '"invalid"', "9007199254740992"])(
  "receipt com ordem %s conserva fato e incerteza",
  async (order) => {
    const q = await allocateFixtureFinancialQuery(charge, randomUUID());
    await startFixtureFinancialQuery(q);
    const p = financialQueryProtocol(q);
    const field =
      order === "missing"
        ? "'{}'::jsonb"
        : `jsonb_build_object('fixtureStateRevision','${order}'::jsonb)`;
    sql(`insert into private.payment_fixture_requests(id,slot_id,scope_id,client_id,operation,fingerprint,payload,outcome)
 select '${p.requestId}','${q.queryId}','${q.scopeId}','${q.clientId}','payment_get','${p.fingerprint}','${JSON.stringify(p.payload)}'::jsonb,
 jsonb_build_object('kind','response','scope',n.outcome->'scope','status',200,'bodyText',(((n.outcome->>'bodyText')::jsonb-'fixtureStateRevision')||${field})::text)
 from private.payment_fixture_requests n join private.payment_execution_observations o on o.receipt_id=n.id where o.id='${origin}';`);
    await finishFixtureFinancialQuery(q);
    expect(latest().order).toBeNull();
    expect(latest().facts.status).toBe("PENDING");
  },
);
it("reversão divergente da fonte é recusada antes de gravar", async () => {
  change(`chargeback='${cb([5.01])}'`);
  const q = await allocateFixtureFinancialQuery(charge, randomUUID());
  await startFixtureFinancialQuery(q);
  await transport(q);
  // A fonte fixa gera uma prova válida; um DTO interno divergente não pode substituir IDs.
  const { getDurableFixtureTransportReceipt } =
    await import("@/modules/payments/asaas/fixture-port");
  const { normalizeAsaasPaymentSnapshot } =
    await import("@/modules/payments/asaas/financial");
  const { readFixtureFinancialProof } =
    await import("@/modules/payments/asaas/fixture-financial-proof");
  const { createHash } = await import("node:crypto");
  const receipt = await getDurableFixtureTransportReceipt({
    scopeId: q.scopeId,
    clientId: q.clientId,
    slotId: q.queryId,
    operation: "payment_get",
  });
  if (receipt?.outcome.kind !== "response")
    throw new Error("Receipt fictício ausente.");
  const text = receipt.outcome.bodyText,
    facts = normalizeAsaasPaymentSnapshot(
      text,
      q.expectation.scope,
      q.expectation,
    ),
    proof = readFixtureFinancialProof(text, facts);
  if (proof.chargeback.kind !== "proven")
    throw new Error("Prova fictícia ausente.");
  const r = await localSystem().rpc("finish_financial_query", {
    target_query: q.queryId,
    worker_id: q.workerId,
    body_hash: createHash("sha256").update(text).digest("hex"),
    facts,
    proof: {
      ...proof.chargeback,
      reversals: [{ ...proof.chargeback.reversals[0], id: "other_reversal" }],
      reversedCents: 0,
      outstandingCents: 2001,
    },
    source_order: proof.sourceOrder,
  });
  expect(r.error).not.toBeNull();
  expect(
    sql(
      `select count(*) from private.payment_financial_observations where source_id='${q.queryId}';`,
    ),
  ).toBe("0");
  await finishFixtureFinancialQuery(q);
  expect(latest().proof.reversedCents).toBe(501);
});

it("UUID equivalente na prova mantém a mesma identidade", async () => {
  const raw = JSON.parse(cb());
  raw.fixtureProof.reference = fixture.intentId.toUpperCase();
  change(`chargeback='${JSON.stringify(raw)}'`);
  await get();
  expect(latest().proof.kind).toBe("proven");
});

it.each(["missing", "null"])(
  "referência %s na fonte não aceita DTO proven",
  async (kind) => {
    const raw = JSON.parse(cb());
    if (kind === "missing") delete raw.fixtureProof.reference;
    else raw.fixtureProof.reference = null;
    change(`chargeback='${JSON.stringify(raw)}'`);
    const q = await allocateFixtureFinancialQuery(charge, randomUUID());
    await startFixtureFinancialQuery(q);
    await transport(q);
    const { getDurableFixtureTransportReceipt } =
      await import("@/modules/payments/asaas/fixture-port");
    const { normalizeAsaasPaymentSnapshot } =
      await import("@/modules/payments/asaas/financial");
    const { createHash } = await import("node:crypto");
    const receipt = await getDurableFixtureTransportReceipt({
      scopeId: q.scopeId,
      clientId: q.clientId,
      slotId: q.queryId,
      operation: "payment_get",
    });
    if (receipt?.outcome.kind !== "response")
      throw new Error("Receipt fictício ausente.");
    const text = receipt.outcome.bodyText,
      facts = normalizeAsaasPaymentSnapshot(
        text,
        q.expectation.scope,
        q.expectation,
      );
    const proof = {
      kind: "proven",
      caseId: "case_fixture",
      debit: {
        id: "debit_fixture",
        amountCents: 2001,
        effectedAt: "2026-10-12T10:00:00-03:00",
      },
      reversals: [],
      debitedCents: 2001,
      reversedCents: 0,
      outstandingCents: 2001,
    };
    const result = await localSystem().rpc("finish_financial_query", {
      target_query: q.queryId,
      worker_id: q.workerId,
      body_hash: createHash("sha256").update(text).digest("hex"),
      facts,
      proof,
      source_order: 2,
    });
    expect(result.error).not.toBeNull();
    await finishFixtureFinancialQuery(q);
    expect(latest().proof.kind).toBe("invalid");
  },
);
