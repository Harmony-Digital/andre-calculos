import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normalizeAsaasPaymentSnapshot } from "./financial";
import { readFixtureFinancialProof } from "./fixture-financial-proof";
import { compareFixtureFinancialObservations } from "./fixture-financial-comparison";
const scope = {
  provider: "asaas",
  environment: "sandbox",
  accountId: "account_fixture",
  walletId: "wallet_fixture",
};
const reference = "00000000-0000-4000-8000-000000000002";
const expected = {
  scope,
  phase: "observation",
  paymentId: "pay_fixture",
  customerId: "cus_fixture",
  reference,
  contractedCents: 12501,
  billingType: "PIX",
  dueDate: "2026-10-20",
};
const proof = () => ({
  schemaVersion: 1,
  semantics: "fixture_chargeback_cumulative",
  paymentId: "pay_fixture",
  reference,
  caseId: "case_fixture",
  debit: {
    id: "debit_fixture",
    value: 20.01,
    effectedAt: "2026-10-12T10:00:00-03:00",
  },
  reversals: [] as Record<string, unknown>[],
});
function observe(patch: Record<string, unknown> = {}) {
  const text = JSON.stringify({
    id: "pay_fixture",
    customer: "cus_fixture",
    externalReference: reference,
    value: 125.01,
    originalValue: 125.01,
    netValue: 123.01,
    billingType: "PIX",
    dueDate: "2026-10-20",
    status: "RECEIVED",
    deleted: false,
    refunds: [],
    chargeback: null,
    fixtureStateRevision: 1,
    ...patch,
  });
  const facts = normalizeAsaasPaymentSnapshot(text, scope, expected);
  return { text, facts, ...readFixtureFinancialProof(text, facts) };
}
const reverse = (value = 5.01) => ({
  id: "reversal_fixture",
  reversesDebitId: "debit_fixture",
  value,
  effectedAt: "2026-10-12T11:00:00-03:00",
});
it.each(["REQUESTED", "DONE", "REVERSED"])(
  "%s isolado não prova chargeback",
  (status) => {
    const o = observe({ chargeback: { status } });
    expect(o.chargeback).toEqual({ kind: "unknown" });
    expect(o.facts.reasons).toContain("chargeback_amount_unknown");
  },
);
it.each([0, 5.01, 20.01])("prova conserva débito e reversão de %s", (value) => {
  const p = proof();
  if (value) p.reversals.push(reverse(value));
  const o = observe({
    chargeback: {
      status: value === 20.01 ? "REVERSED" : "DONE",
      fixtureProof: p,
    },
  });
  expect(o.chargeback).toMatchObject({
    kind: "proven",
    debitedCents: 2001,
    reversedCents: Math.round(value * 100),
    outstandingCents: 2001 - Math.round(value * 100),
  });
  expect(o.facts.reasons).toContain("chargeback_amount_unknown");
});
it.each([
  { schemaVersion: 2 },
  { paymentId: "other" },
  { reference: "00000000-0000-4000-8000-000000000003" },
  { reversals: [reverse(21)] },
  { reversals: [reverse(), reverse()] },
  { reversals: [{ ...reverse(), reversesDebitId: "other" }] },
  { reversals: [{ ...reverse(), effectedAt: "2026-10-11T11:00:00-03:00" }] },
  { debit: { ...proof().debit, value: 0 } },
  { debit: { ...proof().debit, value: 126 } },
  { debit: { ...proof().debit, value: 20.001 } },
  { unexpected: true },
])("prova incoerente permanece inválida %j", (patch) => {
  expect(
    observe({
      chargeback: { status: "DONE", fixtureProof: { ...proof(), ...patch } },
    }).chargeback,
  ).toEqual({ kind: "invalid" });
});
it("REVERSED sem reversão integral mantém incerteza", () => {
  expect(
    observe({ chargeback: { status: "REVERSED", fixtureProof: proof() } })
      .chargeback.kind,
  ).toBe("invalid");
});
it.each([undefined, null, 0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1])(
  "revisão %s não é ordem conhecida",
  (fixtureStateRevision) => {
    expect(observe({ fixtureStateRevision }).sourceOrder).toBeNull();
  },
);
it("ordem menor e ordem igual divergente não escolhem vencedor", () => {
  const p = observe({ fixtureStateRevision: 4 });
  expect(
    compareFixtureFinancialObservations(p, observe({ fixtureStateRevision: 3 }))
      .reasons,
  ).toContain("older_fixture_source");
  expect(
    compareFixtureFinancialObservations(
      p,
      observe({ fixtureStateRevision: 4, deleted: true }),
    ).reasons,
  ).toContain("fixture_order_conflict");
});
it("prova e reversões participam da comparação cumulativa", () => {
  const p = proof();
  p.reversals.push(reverse());
  const prior = observe({
    chargeback: { status: "DONE", fixtureProof: p },
    fixtureStateRevision: 2,
  });
  const next = observe({
    chargeback: { status: "DONE", fixtureProof: proof() },
    fixtureStateRevision: 3,
  });
  expect(compareFixtureFinancialObservations(prior, next).reasons).toContain(
    "chargeback_reversal_history_changed",
  );
  expect(
    compareFixtureFinancialObservations(
      prior,
      observe({ fixtureStateRevision: 4 }),
    ).reasons,
  ).toContain("chargeback_proof_regression");
});
it("receipts antigos sem revisão permanecem compatíveis e incertos", () => {
  const o = observe({ fixtureStateRevision: undefined });
  expect(compareFixtureFinancialObservations(o, observe()).reasons).toContain(
    "source_order_unknown",
  );
});
it("candidato GET conserva multiplicidade de estornos e regressão", () => {
  const refund = {
    value: 1,
    status: "DONE",
    dateCreated: "2026-10-12 11:00:00",
  };
  const prior = observe({ refunds: [refund, refund], fixtureStateRevision: 2 });
  const next = observe({ refunds: [refund], fixtureStateRevision: 3 });
  const r = compareFixtureFinancialObservations(prior, next);
  expect(r.reasons).toContain("completed_refund_history_changed");
  expect(r.reasons).toContain("completed_refund_regression");
});
