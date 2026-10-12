import "server-only";
import { readAsaasPaymentExpectation, readAsaasScope } from "./contracts";
import {
  normalizeAsaasFinancialEvent,
  type AsaasFinancialSnapshot,
} from "./financial";

const comparisonReasons = [
  "conflicting_replay",
  "declared_older",
  "equal_timestamp_conflict",
  "completed_refund_regression",
  "completed_refund_history_changed",
  "received_amount_regression",
  "received_state_regression",
  "chargeback_history_disappeared",
  "incomparable_refunds",
  "observations_require_reconciliation",
] as const;
export type AsaasComparisonReason = (typeof comparisonReasons)[number];
type Relation =
  | "replay"
  | "same_cumulative_view"
  | "declared_older"
  | "cumulative_candidate"
  | "reconcile";
function refundKey(
  item: NonNullable<AsaasFinancialSnapshot["refunds"]["items"]>[number],
) {
  return JSON.stringify([item.providerCreatedAt, item.valueCents, item.status]);
}
function cumulativeView(snapshot: AsaasFinancialSnapshot) {
  // Apenas a projeção validada, em centavos; não reserializar JSON do provedor.
  // Ordenação conserva multiplicidade: dois estornos iguais continuam dois.
  return JSON.stringify({
    scope: snapshot.scope,
    paymentId: snapshot.paymentId,
    customerId: snapshot.customerId,
    reference: snapshot.reference,
    expectedBillingType: snapshot.expectedBillingType,
    billingType: snapshot.billingType,
    status: snapshot.status,
    classification: snapshot.classification,
    receivedCents: snapshot.amounts.receivedCents,
    deleted: snapshot.deleted,
    dueDate: snapshot.dueDate,
    presence: snapshot.presence,
    amounts: {
      contractedCents: snapshot.amounts.contractedCents,
      currentValueCents: snapshot.amounts.currentValueCents,
      providerOriginalCents: snapshot.amounts.providerOriginalCents,
      netCents: snapshot.amounts.netCents,
    },
    refunds:
      snapshot.refunds.items === null
        ? null
        : snapshot.refunds.items.map(refundKey).sort(),
    chargeback: snapshot.chargeback,
  });
}
function completedHistory(snapshot: AsaasFinancialSnapshot) {
  const counts = new Map<string, number>();
  for (const item of snapshot.refunds.items ?? []) {
    if (item.status !== "DONE") continue;
    const key = refundKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Comparação de fatos, sem vencedor, delta aplicável ou efeito de domínio. */
export function compareAsaasFinancialEvents(
  previousText: string,
  currentText: string,
  sourceScope: unknown,
  expectedInput: unknown,
) {
  // Cada leitura valida conta, ambiente, cliente, ID, referência e original
  // contra o mesmo contexto. Uma referência do Asaas nunca vira orderId.
  const expected = readAsaasPaymentExpectation(expectedInput);
  const scope = readAsaasScope(sourceScope);
  const previous = normalizeAsaasFinancialEvent(previousText, scope, expected);
  const current = normalizeAsaasFinancialEvent(currentText, scope, expected);
  const found = new Set<AsaasComparisonReason>();
  let relation: Relation;
  const sameView =
    cumulativeView(previous.snapshot) === cumulativeView(current.snapshot);
  const incomplete =
    previous.snapshot.disposition === "reconcile" ||
    current.snapshot.disposition === "reconcile";
  if (incomplete) found.add("observations_require_reconciliation");
  if (previous.eventId === current.eventId) {
    if (
      sameView &&
      previous.eventType === current.eventType &&
      previous.providerCreatedAt === current.providerCreatedAt
    ) {
      relation = "replay";
    } else {
      relation = "reconcile";
      found.add("conflicting_replay");
    }
  } else if (current.providerCreatedAt < previous.providerCreatedAt) {
    relation = "declared_older";
    found.add("declared_older");
  } else if (sameView) {
    relation = "same_cumulative_view";
  } else {
    relation = "cumulative_candidate";
    if (current.providerCreatedAt === previous.providerCreatedAt)
      found.add("equal_timestamp_conflict");
    const priorDone = previous.snapshot.refunds.completedCents;
    const nextDone = current.snapshot.refunds.completedCents;
    if (priorDone === null || nextDone === null)
      found.add("incomparable_refunds");
    else if (nextDone < priorDone) found.add("completed_refund_regression");
    const priorHistory = completedHistory(previous.snapshot);
    const nextHistory = completedHistory(current.snapshot);
    for (const [key, count] of priorHistory) {
      if ((nextHistory.get(key) ?? 0) < count)
        found.add("completed_refund_history_changed");
    }
    if (
      [
        "RECEIVED",
        "CONFIRMED",
        "REFUNDED",
        "REFUND_REQUESTED",
        "REFUND_IN_PROGRESS",
      ].includes(previous.snapshot.status)
    ) {
      if (
        current.snapshot.amounts.currentValueCents <
        previous.snapshot.amounts.currentValueCents
      )
        found.add("received_amount_regression");
      if (
        !(
          previous.snapshot.status === "CONFIRMED" &&
          current.snapshot.status === "CONFIRMED"
        ) &&
        ![
          "RECEIVED",
          "REFUNDED",
          "REFUND_REQUESTED",
          "REFUND_IN_PROGRESS",
          "CHARGEBACK_REQUESTED",
          "CHARGEBACK_DISPUTE",
          "AWAITING_CHARGEBACK_REVERSAL",
        ].includes(current.snapshot.status)
      )
        found.add("received_state_regression");
    }
    if (
      previous.snapshot.chargeback !== null &&
      current.snapshot.chargeback === null
    )
      found.add("chargeback_history_disappeared");
    if (found.size > 0) relation = "reconcile";
  }
  const orderedReasons = Object.freeze(
    comparisonReasons.filter((reason) => found.has(reason)),
  );
  return Object.freeze({
    semantics: "cumulative_snapshot" as const,
    effects: "none" as const,
    relation,
    reasons: orderedReasons,
    // Mesmo um horário posterior não certifica ordem causal. A persistência
    // deve consultar o provedor antes de aplicar mudanças em M3.01b/c.
    requiresAuthoritativeQuery:
      incomplete ||
      relation === "cumulative_candidate" ||
      relation === "declared_older" ||
      relation === "reconcile",
    previous,
    current,
  });
}
