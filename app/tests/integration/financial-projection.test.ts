import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
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
import {
  deriveFixtureFinancialDecision,
  orderCreditProjectionSchema,
} from "@/modules/payments/financial-projection";
let fixture: Awaited<ReturnType<typeof executionTransportFixture>>,
  charge: string,
  payment: string,
  source: string;
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
async function seedPosition() {
  const o = await queryFixtureFinancialObservation(charge, randomUUID());
  source = o.observationId;
  const d = await deriveFixtureFinancialDecision(source);
  const row = JSON.parse(
    sql(
      `select coalesce((select revision from private.payment_financial_positions where charge_id='${charge}'),0);`,
    ),
  );
  sql(
    `insert into private.payment_financial_positions(charge_id,observation_id,revision,value) values('${charge}','${d.position.observationId}',${row + 1},${literal(d.position)}) on conflict(charge_id) do update set observation_id=excluded.observation_id,revision=excluded.revision,value=excluded.value;`,
  );
  return d;
}
function ledger(
  amount: number,
  kind = "deposit",
  method = "pix_manual",
  status = "confirmed",
  ref: string | null = null,
  order = fixture.sample.order_id,
) {
  const id = randomUUID();
  sql(
    `insert into public.payments(id,order_id,kind,method,amount_cents,status,provider_ref) values('${id}','${order}','${kind}','${method}',${amount},'${status}',${ref === null ? "null" : "'" + ref + "'"});`,
  );
  return id;
}
function bind(id: string, scope = fixture.scopeId, obs = source) {
  sql(
    `insert into private.payment_legacy_bindings(payment_id,charge_id,scope_id,observation_id,identity_proof) values('${id}','${charge}','${scope}','${obs}','fixture_explicit_source');`,
  );
}
beforeEach(async () => {
  reads.clear();
  fixture = await executionTransportFixture();
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
    if (fixture) await fixture.cleanup();
  }
});
it("fonte privada deriva posição sem aplicar crédito/avisos/fila", async () => {
  const o = await queryFixtureFinancialObservation(charge, randomUUID()),
    d = await deriveFixtureFinancialDecision(o.observationId);
  expect(d).toMatchObject({
    chargeId: charge,
    phase: "deposit",
    expectedRevision: 0,
    action: "replace",
    position: { creditCents: 12501 },
  });
  expect(
    sql(
      `select count(*) from private.payment_financial_positions where charge_id='${charge}';`,
    ),
  ).toBe("0");
  expect(
    sql(
      `select count(*) from public.payments where order_id='${fixture.sample.order_id}';`,
    ),
  ).toBe("0");
  expect(
    sql(
      `select status from public.orders where id='${fixture.sample.order_id}';`,
    ),
  ).toBe("awaiting_payment");
  expect(
    sql(
      `select count(*) from private.payment_intent_reservations where intent_id='${fixture.intentId}';`,
    ),
  ).toBe("1");
});
it("posição ausente é desconhecida, nunca zero disponível", async () => {
  const p = await project();
  expect(p).toMatchObject({
    depositCreditCents: null,
    totalCreditCents: null,
    depositUncertain: true,
    uncertain: true,
    missingPositionCount: 1,
  });
});
it("posição cumulativa e recibos repetidos não somam cobranças", async () => {
  await seedPosition();
  await queryFixtureFinancialObservation(charge, randomUUID());
  const p = await project();
  expect(p).toMatchObject({
    depositCreditCents: 12501,
    totalCreditCents: 12501,
    providerObservedDepositCents: 12501,
    manualDepositCents: 0,
    depositUncertain: false,
  });
  expect(
    sql(
      `select count(*) from private.payment_financial_positions where charge_id='${charge}';`,
    ),
  ).toBe("1");
});
it("manual sem recibo compõe com provedor, taxa não reduz crédito", async () => {
  change("original_cents=value_cents,value_cents=10501,net_cents=10301");
  await seedPosition();
  ledger(2000);
  const p = await project();
  expect(p).toMatchObject({
    manualDepositCents: 2000,
    providerObservedDepositCents: 10501,
    depositCreditCents: 12501,
    remainingDepositCents: 0,
    depositExcessCents: 0,
  });
});
it("manual com recibo conta só a linha, inclusive após estorno", async () => {
  const sample = await fixture.create(),
    db = await quoteSession("calculator"),
    request = randomUUID();
  try {
    const r = await db.rpc("confirm_manual_deposit", {
      target_quote: sample.id,
      expected_context: sample.contextHash,
      expected_remaining_cents: 12501,
      request_id: request,
      confirmed: true,
    });
    expect(r.error).toBeNull();
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  const before = await project(sample.order_id);
  expect(before.manualDepositCents).toBe(12501);
  expect(before.depositCreditCents).toBe(12501);
  sql(
    `update public.payments set status='refunded' where order_id='${sample.order_id}';`,
  );
  expect((await project(sample.order_id)).manualDepositCents).toBe(0);
});
it.each(["pending", "refunded"])(
  "manual %s não concede crédito",
  async (status) => {
    await seedPosition();
    ledger(2000, "deposit", "pix_manual", status);
    expect((await project()).manualDepositCents).toBe(0);
  },
);
it.each([10000, 12501, 13000])(
  "parcial/excesso total de %s fica separado",
  async (value) => {
    change(
      `original_cents=value_cents,value_cents=${value},net_cents=${value}-1`,
    );
    await seedPosition();
    const p = await project();
    expect(p.depositCreditCents).toBe(value);
    expect(p.partial).toBe(value < 12501);
    expect(p.remainingDepositCents).toBe(Math.max(12501 - value, 0));
    expect(p.depositExcessCents).toBe(Math.max(value - 12501, 0));
  },
);
it("saldo manual não é transferido automaticamente ao sinal", async () => {
  change("original_cents=value_cents,value_cents=10000,net_cents=9900");
  await seedPosition();
  ledger(3000, "balance");
  expect(await project()).toMatchObject({
    depositCreditCents: 10000,
    totalCreditCents: 13000,
    remainingDepositCents: 2501,
    manualTotalCents: 3000,
    manualDepositCents: 0,
  });
});
it("legado Asaas sem conta comprovada mantém incerteza, mesmo provider_ref igual", async () => {
  await seedPosition();
  ledger(12501, "deposit", "asaas", "confirmed", payment);
  expect(await project()).toMatchObject({
    unlinkedLegacyCount: 1,
    depositCreditCents: null,
    uncertain: true,
    providerObservedDepositCents: 12501,
  });
});
it("legado explicitamente ligado usa posição uma vez e preserva linha", async () => {
  await seedPosition();
  const id = ledger(12501, "deposit", "asaas", "confirmed", payment);
  bind(id);
  expect(await project()).toMatchObject({
    unlinkedLegacyCount: 0,
    depositCreditCents: 12501,
    totalCreditCents: 12501,
  });
  expect(
    sql(`select amount_cents from public.payments where id='${id}';`),
  ).toBe("12501");
});
it("devolução da posição não revive valor do legado confirmado", async () => {
  await seedPosition();
  const receivedSource = source,
    id = ledger(12501, "deposit", "asaas", "confirmed", payment);
  bind(id, fixture.scopeId, receivedSource);
  change(
    "status='REFUNDED',refunds=jsonb_build_array(jsonb_build_object('value',125.01,'status','DONE','dateCreated','2026-10-12 10:00:00'))",
  );
  await seedPosition();
  expect(await project()).toMatchObject({
    depositCreditCents: 0,
    totalCreditCents: 0,
    depositUncertain: false,
  });
  expect(sql(`select status from public.payments where id='${id}';`)).toBe(
    "confirmed",
  );
});
it("vínculo do legado recusa outra conta/fase/pedido/referência/fonte", async () => {
  await seedPosition();
  const id = ledger(12501, "deposit", "asaas", "confirmed", payment);
  expect(() => bind(id, fixture.otherScopeId)).toThrow();
  const other = ledger(12501, "balance", "asaas", "confirmed", payment);
  expect(() => bind(other)).toThrow();
  const wrong = ledger(12501, "deposit", "asaas", "confirmed", "pay_other");
  expect(() => bind(wrong)).toThrow();
  const origin = sql(
    `select id from private.payment_financial_observations where charge_id='${charge}' and source_kind='execution';`,
  );
  expect(() => bind(id, fixture.scopeId, origin)).toThrow();
});
it("incerteza nova conserva subtotal, mas não libera crédito pela leitura", async () => {
  await seedPosition();
  change("deleted=true");
  const d = await seedPosition();
  expect(d.position.certainty).toBe("reconcile");
  expect(await project()).toMatchObject({
    providerObservedDepositCents: 12501,
    depositCreditCents: null,
    uncertain: true,
  });
});
it("observação não aplicada com débito no journal não desaparece", async () => {
  await seedPosition();
  const cb = {
    status: "DONE",
    fixtureProof: {
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
      reversals: [],
    },
  };
  change(`chargeback=${literal(cb)}`);
  await queryFixtureFinancialObservation(charge, randomUUID());
  expect(await project()).toMatchObject({
    providerObservedDepositCents: 12501,
    depositCreditCents: null,
    uncertain: true,
    pendingChargeCount: 1,
  });
  change("chargeback=null");
  const o = await queryFixtureFinancialObservation(charge, randomUUID()),
    d = await deriveFixtureFinancialDecision(o.observationId);
  expect(d.position.creditCents).toBe(12501);
  expect(d.position.reasons).toContain("chargeback_proof_regression");
});
it("histórico tardio/consulta superseded impedem motor de aplicar fonte velha", async () => {
  const old = await queryFixtureFinancialObservation(charge, randomUUID());
  change(
    "refunds=jsonb_build_array(jsonb_build_object('value',10.01,'status','DONE','dateCreated','2026-10-12 10:00:00'))",
  );
  await queryFixtureFinancialObservation(charge, randomUUID());
  const d = await deriveFixtureFinancialDecision(old.observationId);
  expect(d.position.certainty).toBe("reconcile");
  expect(d.position.reasons).toContain("newer_observation_exists");
});
it("overflow da soma não vira número arredondado ou zero", async () => {
  const sample = await fixture.create();
  ledger(
    Number.MAX_SAFE_INTEGER,
    "deposit",
    "pix_manual",
    "confirmed",
    null,
    sample.order_id,
  );
  ledger(1, "deposit", "pix_manual", "confirmed", null, sample.order_id);
  expect(await project(sample.order_id)).toMatchObject({
    unsafeAmount: true,
    manualDepositCents: null,
    depositCreditCents: null,
    totalCreditCents: null,
    partial: null,
  });
});
it("leitura autoriza dono/calculista e audita cada acesso", async () => {
  await seedPosition();
  await project();
  await project();
  expect(
    sql(
      `select count(*) from public.audit_log where action='payment_projection_read' and target_id='${fixture.sample.order_id}';`,
    ),
  ).toBe("2");
  const foreign = await quoteSession("clientB");
  try {
    expect(
      (
        await foreign.rpc("get_order_financial_projection", {
          target_order: fixture.sample.order_id,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await foreign.rpc("get_financial_projection_source", {
          target_observation: source,
        })
      ).error,
    ).not.toBeNull();
  } finally {
    await foreign.auth.signOut({ scope: "local" });
  }
  expect(
    (
      await localSystem().rpc("get_order_financial_projection", {
        target_order: fixture.sample.order_id,
      })
    ).error,
  ).not.toBeNull();
});
it("tabelas privadas têm RLS e sem grants diretos", async () => {
  expect(
    sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in('payment_financial_positions','payment_legacy_bindings') and c.relrowsecurity;",
    ),
  ).toBe("2");
  expect(
    sql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name in('payment_financial_positions','payment_legacy_bindings') and grantee in('anon','authenticated','service_role');",
    ),
  ).toBe("0");
});
it("posições inválidas/fonte cruzada/revisão errada são recusadas", async () => {
  const d = await seedPosition();
  expect(() =>
    sql(
      `update private.payment_financial_positions set revision=revision+2 where charge_id='${charge}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `update private.payment_financial_positions set revision=revision+1,value=jsonb_set(value,'{creditCents}','-1') where charge_id='${charge}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `update private.payment_financial_positions set revision=revision+1,value=jsonb_set(value,'{snapshot,status}','"OVERDUE"') where charge_id='${charge}';`,
    ),
  ).toThrow();
  expect(d.position.creditCents).toBe(12501);
});
it.each(["refund", "deleted", "not_found"])(
  "nova fonte %s protege crédito ainda não aplicado",
  async (kind) => {
    await seedPosition();
    if (kind === "refund")
      change(
        "refunds=jsonb_build_array(jsonb_build_object('value',10.01,'status','DONE','dateCreated','2026-10-12 10:00:00'))",
      );
    if (kind === "deleted") change("deleted=true");
    if (kind === "not_found")
      sql(
        `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found');`,
      );
    await queryFixtureFinancialObservation(charge, randomUUID());
    expect(await project()).toMatchObject({
      providerObservedTotalCents: 12501,
      depositCreditCents: null,
      totalCreditCents: null,
      pendingChargeCount: 1,
      uncertain: true,
    });
  },
);
it("consulta alocada protege crédito antes da resposta e muda fence", async () => {
  await seedPosition();
  const before = await deriveFixtureFinancialDecision(source);
  await allocateFixtureFinancialQuery(charge, randomUUID());
  const after = await deriveFixtureFinancialDecision(source);
  expect(after.expectedChargeRevision).toBe(before.expectedChargeRevision + 1);
  expect(after.expectedRevision).toBe(before.expectedRevision);
  expect(after.action).toBe("same");
  expect(after.position.certainty).toBe("known");
  expect(after.canConfirmKnownCoverage).toBe(false);
  expect(await project()).toMatchObject({
    uncertain: true,
    pendingChargeCount: 1,
    providerObservedTotalCents: 12501,
    totalCreditCents: null,
  });
});
it.each(["not_found", "open"])(
  "replay antigo não confirma cobertura após consulta %s",
  async (kind) => {
    await seedPosition();
    const old = source;
    if (kind === "open")
      await allocateFixtureFinancialQuery(charge, randomUUID());
    else {
      sql(
        `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found');`,
      );
      await queryFixtureFinancialObservation(charge, randomUUID());
    }
    const d = await deriveFixtureFinancialDecision(old);
    expect(d.action).toBe("same");
    expect(d.canConfirmKnownCoverage).toBe(false);
    expect(() =>
      sql(
        `update private.payment_financial_positions set revision=revision+1 where charge_id='${charge}';`,
      ),
    ).toThrow();
    expect((await project()).uncertain).toBe(true);
    const fresh = await seedPosition();
    expect(fresh.canConfirmKnownCoverage).toBe(true);
    expect((await project()).uncertain).toBe(false);
    expect(
      (await deriveFixtureFinancialDecision(old)).canConfirmKnownCoverage,
    ).toBe(false);
  },
);
it("conflito durável bloqueia motor e leitura até resolução explícita", async () => {
  await seedPosition();
  const o = JSON.parse(
    sql(
      `select json_build_object('source',source_id,'hash',body_hash,'facts',facts,'proof',proof,'ord',source_order) from private.payment_financial_observations where id='${source}';`,
    ),
  );
  const worker = sql(
    `select worker_id from private.payment_financial_queries where id='${o.source}';`,
  );
  const r = await localSystem().rpc("finish_financial_query", {
    target_query: o.source,
    worker_id: worker,
    body_hash: o.hash,
    facts: { ...o.facts, status: "OVERDUE" },
    proof: o.proof,
    source_order: o.ord,
  });
  expect(r.error).toBeNull();
  expect(r.data).toMatchObject({ kind: "conflict" });
  const d = await deriveFixtureFinancialDecision(source);
  expect(d.position).toMatchObject({
    certainty: "reconcile",
    resolutionCandidate: null,
  });
  expect(d.position.reasons).toContain("durable_source_conflict");
  expect(await project()).toMatchObject({
    uncertain: true,
    conflictedChargeCount: 1,
    providerObservedTotalCents: 12501,
    totalCreditCents: null,
  });
  // O hash alternativo não prova que uma nova consulta resolveu o conflito.
  const fresh = await queryFixtureFinancialObservation(charge, randomUUID());
  expect(
    (await deriveFixtureFinancialDecision(fresh.observationId)).position
      .certainty,
  ).toBe("reconcile");
});
it("falha anterior coberta e replay antigo não rebaixam posição nova", async () => {
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found');`,
  );
  const failed = await queryFixtureFinancialObservation(charge, randomUUID());
  await seedPosition();
  const d = await deriveFixtureFinancialDecision(failed.observationId);
  expect(d.action).toBe("ignore_old");
  expect(d.position.certainty).toBe("known");
  expect((await project()).uncertain).toBe(false);
});
it("fingerprint ignora só ordem de arrays, conserva duplicatas", async () => {
  const a = {
      valueCents: 100,
      status: "DONE",
      providerCreatedAt: "2026-10-12 10:00:00",
    },
    b = { ...a, valueCents: 200 };
  const x = { refunds: { items: [a, b] } },
    y = { refunds: { items: [b, a] } },
    z = { refunds: { items: [a, b, a] } };
  expect(
    sql(
      `select (private.financial_canonical_facts(${literal(x)})=private.financial_canonical_facts(${literal(y)}))::text;`,
    ),
  ).toBe("true");
  expect(
    sql(
      `select (private.financial_canonical_facts(${literal(x)})=private.financial_canonical_facts(${literal(z)}))::text;`,
    ),
  ).toBe("false");
});
it("guardas privadas recusam valores arbitrários mesmo dentro da faixa", async () => {
  await seedPosition();
  for (const key of [
    "creditCents",
    "remainingCents",
    "excessCents",
    "lastKnownCreditCents",
    "completedRefundCents",
  ])
    expect(() =>
      sql(
        `update private.payment_financial_positions set revision=revision+1,value=jsonb_set(value,'{${key}}','1') where charge_id='${charge}';`,
      ),
    ).toThrow();
  expect(() =>
    sql(
      `update private.payment_financial_positions set revision=revision+1,value=jsonb_set(value,'{resolutionCandidate}','"refunded"') where charge_id='${charge}';`,
    ),
  ).toThrow();
});

it("fonte mantém snapshot coerente enquanto outra consulta é alocada", async () => {
  await seedPosition();
  const before = await deriveFixtureFinancialDecision(source);
  const tag = `andre-financial-snapshot-${randomUUID()}`;
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
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  const done = new Promise<string>((resolve, reject) => {
    child.once("error", () =>
      reject(new Error("Leitura concorrente indisponível.")),
    );
    child.once("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error("Leitura concorrente indisponível.")),
    );
  });
  child.stdin
    .end(`begin;set local application_name='${tag}';set local request.jwt.claims='{"role":"service_role"}';
  with gate as materialized(select pg_sleep(2)) select public.get_financial_projection_source('${source}') from gate;rollback;`);
  try {
    let sleeping = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      sleeping =
        sql(
          `select exists(select 1 from pg_stat_activity where application_name='${tag}' and wait_event='PgSleep')::text;`,
        ) === "true";
      if (sleeping) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(sleeping).toBe(true);
    await allocateFixtureFinancialQuery(charge, randomUUID());
    const text = await done;
    const captured = JSON.parse(
      text.split("\n").find((line) => line.startsWith("{"))!,
    );
    expect(captured.chargeRevision).toBe(before.expectedChargeRevision);
    expect(captured.journalFingerprint).toBe(before.expectedJournalFingerprint);
    expect(captured.captureIsCurrent).toBe(true);
    const after = await deriveFixtureFinancialDecision(source);
    expect(after.expectedChargeRevision).toBe(
      before.expectedChargeRevision + 1,
    );
    expect(after.canConfirmKnownCoverage).toBe(false);
  } finally {
    await done.catch(() => {});
  }
});
