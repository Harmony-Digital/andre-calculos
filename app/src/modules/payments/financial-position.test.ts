import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normalizeAsaasPaymentSnapshot } from "./asaas/financial";
import { readFixtureFinancialProof } from "./asaas/fixture-financial-proof";
import { deriveFinancialPosition } from "./financial-position";
import { financialPositionSchema } from "./financial-position-data";
const scope = {
  provider: "asaas",
  environment: "sandbox",
  accountId: "account_fixture",
  walletId: "wallet_fixture",
};
const reference = "00000000-0000-4000-8000-000000000001";
const expected = {
  phase: "observation",
  scope,
  paymentId: "pay_fixture",
  customerId: "cus_fixture",
  reference,
  contractedCents: 12501,
  billingType: "PIX",
  dueDate: "2026-10-20",
};
let sequence = 1;
const proof = (value = 20.01, reversals: number[] = []) => ({
  status: reversals.reduce((a, b) => a + b, 0) === value ? "REVERSED" : "DONE",
  fixtureProof: {
    schemaVersion: 1,
    semantics: "fixture_chargeback_cumulative",
    paymentId: "pay_fixture",
    reference,
    caseId: "case_fixture",
    debit: {
      id: "debit_fixture",
      value,
      effectedAt: "2026-10-12T10:00:00-03:00",
    },
    reversals: reversals.map((value, i) => ({
      id: "rev_fixture_" + i,
      reversesDebitId: "debit_fixture",
      value,
      effectedAt: "2026-10-12T11:00:00-03:00",
    })),
  },
});
const refund = (
  value = 10.01,
  status = "DONE",
  dateCreated = "2026-10-12 10:00:00",
) => ({ value, status, dateCreated });
function observation(
  patch: Record<string, unknown> = {},
  sourceOrder: number | null = 1,
) {
  const text = JSON.stringify({
    id: "pay_fixture",
    customer: "cus_fixture",
    externalReference: reference,
    value: 125.01,
    originalValue: 125.01,
    netValue: 123.01,
    status: "RECEIVED",
    billingType: "PIX",
    dueDate: "2026-10-20",
    deleted: false,
    refunds: [],
    chargeback: null,
    fixtureStateRevision: sourceOrder,
    ...patch,
  });
  const facts = normalizeAsaasPaymentSnapshot(text, scope, expected),
    extra = readFixtureFinancialProof(text, facts);
  return {
    id: `00000000-0000-4000-8000-${(sequence++).toString().padStart(12, "0")}`,
    sourceOrder,
    facts,
    proof: extra.chargeback,
  };
}
const decide = (
  o: ReturnType<typeof observation>,
  previous: unknown = null,
  history: ReturnType<typeof observation>[] = [],
) => deriveFinancialPosition({ observation: o, previous, history });
it("bruto recebido, taxa e crédito são separados", () => {
  const d = decide(observation());
  expect(d.action).toBe("replace");
  expect(d.position).toMatchObject({
    certainty: "known",
    receivedGrossCents: 12501,
    feeCents: 200,
    creditCents: 12501,
    remainingCents: 0,
    excessCents: 0,
    resolutionCandidate: "received",
  });
});
it.each(["PENDING", "OVERDUE", "CONFIRMED", "AUTHORIZED", "RECEIVED_IN_CASH"])(
  "%s não comprova bruto recebido",
  (status) => {
    const d = decide(observation({ status }));
    expect(d.position.creditCents).toBeNull();
    expect(d.position.certainty).toBe("reconcile");
    expect(d.position.resolutionCandidate).toBeNull();
  },
);
it.each([100, 125.01, 130])(
  "parcial/excesso de %s permanece explícito",
  (value) => {
    const p = decide(observation({ value, netValue: value - 1 })).position;
    expect(p.creditCents).toBe(Math.round(value * 100));
    expect(p.remainingCents).toBe(Math.max(12501 - Math.round(value * 100), 0));
    expect(p.excessCents).toBe(Math.max(Math.round(value * 100) - 12501, 0));
  },
);
it("taxa desconhecida não subtrai o bruto conhecido", () => {
  const d = decide(observation({ netValue: undefined }));
  expect(d.position.creditCents).toBe(12501);
  expect(d.position.certainty).toBe("known");
  expect(d.position.feeCents).toBeNull();
  expect(d.position.reasons).toContain("fee_unknown");
});
it.each([-1, 130])("líquido incompatível %s mantém conciliação", (netValue) => {
  expect(decide(observation({ netValue })).position.creditCents).toBeNull();
});
it.each([undefined, null])(
  "devoluções ausentes %s não viram zero",
  (refunds) => {
    const d = decide(observation({ refunds }));
    expect(d.position.creditCents).toBeNull();
    expect(d.position.reasons).toContain("refunds_unknown");
  },
);
it("DONE reduz crédito, PENDING protege e CANCELLED não debita", () => {
  const d = decide(
    observation({
      refunds: [refund(10.01), refund(5, "PENDING"), refund(2, "CANCELLED")],
    }),
  );
  expect(d.position).toMatchObject({
    creditCents: 11500,
    completedRefundCents: 1001,
    pendingRefundCents: 500,
    certainty: "reconcile",
    resolutionCandidate: null,
  });
  const cancelled = decide(observation({ refunds: [refund(2, "CANCELLED")] }));
  expect(cancelled.position.creditCents).toBe(12501);
});
it("status REFUNDED precisa de histórico de recebimento", () => {
  const o = observation({ status: "REFUNDED", refunds: [refund(125.01)] }, 2);
  expect(decide(o).position.creditCents).toBeNull();
  const previous = decide(observation()).position;
  expect(decide(o, previous).position).toMatchObject({
    creditCents: 0,
    receivedGrossCents: 12501,
    resolutionCandidate: "refunded",
  });
});
it("recebimento durável ainda não aplicado também prova bruto", () => {
  const old = observation(),
    o = observation({ status: "REFUNDED", refunds: [refund(125.01)] }, 2);
  expect(decide(o, null, [old]).position.creditCents).toBe(0);
});
it("valor corrente ajustado não desconta a mesma devolução duas vezes", () => {
  const prior = decide(observation()).position;
  const current = observation(
    { value: 115, netValue: 114, refunds: [refund(10.01)] },
    2,
  );
  expect(decide(current, prior).position).toMatchObject({
    receivedGrossCents: 12501,
    creditCents: 11500,
    completedRefundCents: 1001,
  });
});
it("bruto menos DONE e chargeback líquido é determinístico", () => {
  const d = decide(
    observation({ refunds: [refund(10.01)], chargeback: proof(20.01, [5.01]) }),
  );
  expect(d.position).toMatchObject({
    receivedGrossCents: 12501,
    completedRefundCents: 1001,
    chargebackOutstandingCents: 1500,
    creditCents: 10000,
  });
});
it.each(["DONE", "REVERSED", "REQUESTED"])(
  "chargeback %s sem prova mantém incerteza",
  (status) => {
    expect(
      decide(observation({ chargeback: { status } })).position.creditCents,
    ).toBeNull();
  },
);
it("disputa com débito comprovado mantém proteção", () => {
  const cb = proof();
  cb.status = "IN_DISPUTE";
  const p = decide(observation({ chargeback: cb })).position;
  expect(p.creditCents).toBe(10500);
  expect(p.certainty).toBe("reconcile");
  expect(p.resolutionCandidate).toBeNull();
});
it("reduções combinadas excedentes não são escondidas por zero", () => {
  const p = decide(
    observation({ refunds: [refund(110)], chargeback: proof(20) }),
  ).position;
  expect(p.creditCents).toBeNull();
  expect(p.reasons).toContain("reductions_exceed_received_gross");
});
it("reversão parcial/integral restaura somente seu débito", () => {
  const a = decide(observation({ chargeback: proof() })).position;
  const b = decide(
    observation({ chargeback: proof(20.01, [5.01]) }, 2),
    a,
  ).position;
  expect(b.creditCents).toBe(11001);
  const c = decide(
    observation({ chargeback: proof(20.01, [5.01, 15]) }, 3),
    b,
  ).position;
  expect(c.creditCents).toBe(12501);
  expect(c.resolutionCandidate).toBe("received");
});
it("prova/histórico desaparecidos não restauram crédito", () => {
  const prior = decide(
    observation({ chargeback: proof(20.01, [5.01]) }),
  ).position;
  const d = decide(observation({}, 2), prior);
  expect(d.action).toBe("hold");
  expect(d.position.creditCents).toBe(11001);
  expect(d.position.certainty).toBe("reconcile");
  expect(d.position.reasons).toContain("chargeback_proof_regression");
});
it("observação não aplicada com chargeback continua no histórico", () => {
  const old = observation({ chargeback: proof() });
  const d = decide(observation({}, 2), null, [old]);
  expect(d.position.creditCents).toBeNull();
  expect(d.position.reasons).toContain("chargeback_proof_regression");
});
it("DONE regredido/multiplicidade menor conservam posição anterior", () => {
  const prior = decide(
    observation({ refunds: [refund(1), refund(1)] }),
  ).position;
  const d = decide(observation({ refunds: [refund(1)] }, 2), prior);
  expect(d.position.creditCents).toBe(12301);
  expect(d.position.certainty).toBe("reconcile");
  expect(d.position.reasons).toContain("completed_refund_history_changed");
});
it("reordenação semântica na mesma revisão é replay", () => {
  const a = refund(1),
    b = refund(2, "DONE", "2026-10-12 11:00:00");
  const prior = decide(observation({ refunds: [a, b] })).position;
  expect(decide(observation({ refunds: [b, a] }), prior).action).toBe("same");
});
it("fonte antiga não reduz crédito nem escolhe novo vencedor", () => {
  const prior = decide(observation({}, 3)).position;
  const d = decide(observation({ refunds: [refund(10.01)] }, 2), prior);
  expect(d.action).toBe("ignore_old");
  expect(d.position).toEqual(prior);
});
it("mesma revisão divergente concilia, incluindo histórico não aplicado", () => {
  const prior = decide(observation()).position;
  expect(
    decide(observation({ refunds: [refund(1)] }), prior).position.reasons,
  ).toContain("source_order_conflict");
  const bad = observation({ refunds: [refund(2)] });
  expect(decide(observation(), prior, [bad]).position.reasons).toContain(
    "source_order_conflict",
  );
});
it("fonte mais nova no journal impede aplicação da antiga", () => {
  const d = decide(observation({}, 2), null, [observation({}, 3)]);
  expect(d.action).toBe("ignore_old");
  expect(d.position.creditCents).toBeNull();
});
it("404/ordem desconhecida preservam último crédito e explicitam incerteza", () => {
  const prior = decide(observation()).position;
  const d = deriveFinancialPosition({
    observation: { ...observation({}, null), facts: null },
    previous: prior,
  });
  expect(d.position.creditCents).toBe(12501);
  expect(d.position.lastKnownCreditCents).toBe(12501);
  expect(d.position.certainty).toBe("reconcile");
  expect(decide(observation({}, null), prior).position.reasons).toContain(
    "source_order_unknown",
  );
});
it("nova consulta autoritativa igual restaura certeza depois de falha", () => {
  const o = observation(),
    prior = decide(o).position;
  const held = deriveFinancialPosition({
    observation: { ...observation({}, null), facts: null },
    previous: prior,
  }).position;
  expect(decide(o, held).position.certainty).toBe("known");
});
it("coordenação superseded não transforma resposta antiga em atual", () => {
  const prior = decide(observation()).position;
  const d = deriveFinancialPosition({
    observation: observation({}, 2),
    previous: prior,
    captureIsCurrent: false,
  });
  expect(d.position.certainty).toBe("reconcile");
  expect(d.position.reasons).toContain("query_superseded");
});
it("identidades divergentes são recusadas", () => {
  const prior = decide(observation()).position,
    o = observation({}, 2);
  expect(() =>
    deriveFinancialPosition({
      observation: { ...o, facts: { ...o.facts, paymentId: "other" } },
      previous: prior,
    }),
  ).toThrow("Identidade financeira divergente.");
});
it("posição serializada conserva centavos e campos mínimos", () => {
  const p = decide(observation()).position;
  expect(financialPositionSchema.parse(JSON.parse(JSON.stringify(p)))).toEqual(
    p,
  );
  expect(() =>
    financialPositionSchema.parse({ ...p, bodyText: "sigilo" }),
  ).toThrow();
});
it.each([40, 50])(
  "devolução ajustada com saldo %s usa bruto histórico",
  (value) => {
    const prior = decide(observation({ value: 100, netValue: 99 })).position;
    const d = decide(
      observation(
        { value, netValue: value - 1, refunds: [refund(100 - value)] },
        2,
      ),
      prior,
    );
    expect(d.position).toMatchObject({
      certainty: "known",
      receivedGrossCents: 10000,
      completedRefundCents: (100 - value) * 100,
      creditCents: value * 100,
      resolutionCandidate: null,
    });
  },
);
it("replay só confirma certeza após avaliar prova inferior tardia", () => {
  const o = observation({}, 3),
    previous = decide(o).position;
  const d = decide(o, previous, [observation({ chargeback: proof() }, 2)]);
  expect(d.action).toBe("hold");
  expect(d.position.reasons).toContain("chargeback_proof_regression");
});
it("fonte antiga superseded preserva posição atual sem rebaixar certeza", () => {
  const previous = decide(observation({}, 3)).position;
  const d = deriveFinancialPosition({
    observation: observation({ refunds: [refund()] }, 2),
    previous,
    captureIsCurrent: false,
  });
  expect(d.action).toBe("ignore_old");
  expect(d.position).toEqual(previous);
});
it("replay superseded equivalente conserva certeza após validar histórico", () => {
  const o = observation(),
    previous = decide(o).position;
  const d = deriveFinancialPosition({
    observation: o,
    previous,
    captureIsCurrent: false,
  });
  expect(d.action).toBe("same");
  expect(d.position).toEqual(previous);
});
it("falha de consulta anterior comprovada não rebaixa posição atual", () => {
  const previous = decide(observation()).position;
  const d = deriveFinancialPosition({
    observation: { ...observation({}, null), facts: null },
    previous,
    captureIsCurrent: false,
    capturePrecedesPrevious: true,
  });
  expect(d.action).toBe("ignore_old");
  expect(d.position).toEqual(previous);
});
it("conflito durável impede candidato de resolução mesmo no replay", () => {
  const o = observation(),
    previous = decide(o).position;
  const d = deriveFinancialPosition({
    observation: o,
    previous,
    sourceConflictCount: 1,
  });
  expect(d.position).toMatchObject({
    certainty: "reconcile",
    creditCents: 12501,
    resolutionCandidate: null,
  });
  expect(d.position.reasons).toContain("durable_source_conflict");
  for (const observation of [
    { ...o, sourceOrder: 0 + 1 },
    { ...o, facts: null, sourceOrder: null },
  ]) {
    const later = decide({ ...o, sourceOrder: 3 }).position;
    const blocked = deriveFinancialPosition({
      observation,
      previous: later,
      capturePrecedesPrevious: true,
      captureIsCurrent: false,
      sourceConflictCount: 1,
    });
    expect(blocked.position).toMatchObject({
      certainty: "reconcile",
      resolutionCandidate: null,
    });
    expect(blocked.position.reasons).toContain("durable_source_conflict");
  }
});
it("ignorar alvo inferior ao journal não modifica posição existente", () => {
  const o = observation({}, 2),
    previous = decide(o).position;
  const d = decide(o, previous, [observation({ refunds: [refund()] }, 3)]);
  expect(d.action).toBe("ignore_old");
  expect(d.position).toEqual(previous);
});
it("limite inteiro seguro conserva o último centavo", () => {
  const o = observation(),
    max = Number.MAX_SAFE_INTEGER;
  o.facts = {
    ...o.facts,
    reasons: ["excess_gross", "net_unknown"],
    amounts: {
      ...o.facts.amounts,
      currentValueCents: max,
      receivedCents: max,
      netCents: null,
      feeCents: null,
      grossLessCompletedRefundsCents: max,
      relationToContract: "above_contract",
    },
  };
  const p = decide(o).position;
  expect(p.creditCents).toBe(max);
  expect(p.excessCents).toBe(max - 12501);
});
it.each([
  "creditCents",
  "remainingCents",
  "excessCents",
  "lastKnownCreditCents",
])("posição com %s aritmético adulterado é recusada", (field) => {
  const p = decide(observation()).position;
  expect(() => financialPositionSchema.parse({ ...p, [field]: 1 })).toThrow();
});
it("posição conhecida incompleta ou terminal falso é recusada", () => {
  const p = decide(observation()).position;
  expect(() =>
    financialPositionSchema.parse({ ...p, sourceOrder: null }),
  ).toThrow();
  expect(() =>
    financialPositionSchema.parse({ ...p, resolutionCandidate: "refunded" }),
  ).toThrow();
});
