import "server-only";
import { z } from "zod";
import {
  financialObservationSchema,
  financialPositionSchema,
  type FinancialPosition,
} from "./financial-position-data";
import { compareFixtureFinancialObservations } from "./asaas/fixture-financial-comparison";
import { asaasCumulativeView } from "./asaas/comparison";
const inputSchema = z.strictObject({
  observation: financialObservationSchema,
  previous: financialPositionSchema.nullable(),
  history: z.array(financialObservationSchema).default([]),
  captureIsCurrent: z.boolean().default(true),
  capturePrecedesPrevious: z.boolean().default(false),
  sourceConflictCount: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
});
const safe = (value: bigint) =>
  value >= BigInt(0) && value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : null;
/** Decide uma posição cumulativa. Não escreve banco, recibo, fila ou aviso. */
export function deriveFinancialPosition(input: unknown) {
  const {
      observation: o,
      previous,
      history,
      captureIsCurrent,
      capturePrecedesPrevious,
      sourceConflictCount,
    } = inputSchema.parse(input),
    f = o.facts;
  const reasons: string[] = [];
  const priorKnown =
    previous?.certainty === "known"
      ? previous.creditCents
      : (previous?.lastKnownCreditCents ?? null);
  function held(why: string[]) {
    const value: FinancialPosition = previous
      ? {
          ...previous,
          certainty: "reconcile",
          lastKnownCreditCents: priorKnown,
          reasons: [...new Set(why)],
          resolutionCandidate: null,
        }
      : {
          schemaVersion: 1,
          semantics: "cumulative_position",
          certainty: "reconcile",
          observationId: o.id,
          sourceOrder: o.sourceOrder,
          snapshot: f,
          proof: o.proof,
          receivedGrossCents: null,
          completedRefundCents: null,
          pendingRefundCents: null,
          chargebackOutstandingCents: null,
          creditCents: null,
          lastKnownCreditCents: null,
          remainingCents: null,
          excessCents: null,
          feeCents: f?.amounts.feeCents ?? null,
          reasons: [...new Set(why)],
          resolutionCandidate: null,
        };
    return Object.freeze({
      action: "hold" as const,
      observationId: o.id,
      position: financialPositionSchema.parse(value),
      effects: "none" as const,
    });
  }
  const ignored = () =>
    Object.freeze({
      action: "ignore_old" as const,
      observationId: o.id,
      position: previous!,
      effects: "none" as const,
    });
  if (sourceConflictCount > 0) return held(["durable_source_conflict"]);
  if (!f)
    return previous && capturePrecedesPrevious
      ? ignored()
      : held(["observation_unavailable"]);
  if (previous?.snapshot) {
    const p = previous.snapshot;
    if (
      JSON.stringify(p.scope) !== JSON.stringify(f.scope) ||
      p.paymentId !== f.paymentId ||
      p.customerId !== f.customerId ||
      p.reference !== f.reference ||
      p.amounts.contractedCents !== f.amounts.contractedCents ||
      p.expectedBillingType !== f.expectedBillingType ||
      p.dueDate !== f.dueDate
    )
      throw new Error("Identidade financeira divergente.");
  }
  if (o.sourceOrder === null) return held(["source_order_unknown"]);
  if (previous?.sourceOrder != null && o.sourceOrder < previous.sourceOrder)
    return ignored();
  let samePrevious = false;
  for (const h of history) {
    if (!h.facts) continue;
    const p = h.facts;
    if (
      JSON.stringify(p.scope) !== JSON.stringify(f.scope) ||
      p.paymentId !== f.paymentId ||
      p.customerId !== f.customerId ||
      p.reference !== f.reference ||
      p.amounts.contractedCents !== f.amounts.contractedCents
    )
      throw new Error("Identidade financeira divergente.");
    if (h.sourceOrder !== null && h.sourceOrder > o.sourceOrder) {
      if (previous) return ignored();
      return Object.freeze({
        ...held(["newer_observation_exists"]),
        action: "ignore_old" as const,
      });
    }
    if (
      h.sourceOrder === o.sourceOrder &&
      (asaasCumulativeView(p) !== asaasCumulativeView(f) ||
        canonicalProof(h.proof) !== canonicalProof(o.proof))
    )
      return held(["source_order_conflict"]);
  }
  if (previous?.sourceOrder !== null && previous?.sourceOrder !== undefined) {
    if (o.sourceOrder < previous.sourceOrder)
      return Object.freeze({
        action: "ignore_old" as const,
        observationId: o.id,
        position: previous,
        effects: "none" as const,
      });
    if (o.sourceOrder === previous.sourceOrder) {
      const same =
        previous.snapshot &&
        asaasCumulativeView(previous.snapshot) === asaasCumulativeView(f) &&
        canonicalProof(previous.proof) === canonicalProof(o.proof);
      samePrevious = Boolean(same && previous.certainty === "known");
      if (!same) return held(["source_order_conflict"]);
    }
  }
  const completed = f.refunds.completedCents,
    pending = f.refunds.pendingCents;
  let gross =
    f.status === "RECEIVED" && f.classification === "received"
      ? f.amounts.receivedCents
      : null;
  const receipts = history.filter(
    (h) =>
      h.facts?.status === "RECEIVED" &&
      h.facts.classification === "received" &&
      !h.facts.deleted &&
      !h.facts.reasons.some((r) =>
        [
          "unknown_billing_type",
          "billing_type_mismatch",
          "manual_receipt",
          "incompatible_event_status",
        ].includes(r),
      ),
  );
  const historicalGross = receipts.reduce<number | null>(
    (value, h) =>
      h.facts!.amounts.receivedCents !== null
        ? Math.max(value ?? 0, h.facts!.amounts.receivedCents)
        : value,
    null,
  );
  const paidHistory = previous?.receivedGrossCents ?? historicalGross;
  const continued = [
    "REFUNDED",
    "REFUND_REQUESTED",
    "REFUND_IN_PROGRESS",
    "CHARGEBACK_REQUESTED",
    "CHARGEBACK_DISPUTE",
    "AWAITING_CHARGEBACK_REVERSAL",
  ].includes(f.status);
  // O valor corrente pode refletir devolução. O bruto vem da prova anterior,
  // nunca do subtotal F nem da diferença inferida no novo status.
  const refundAdjusted =
    paidHistory !== null &&
    completed !== null &&
    completed > 0 &&
    BigInt(f.amounts.currentValueCents) + BigInt(completed) ===
      BigInt(paidHistory);
  if (continued && paidHistory !== null) gross = paidHistory;
  if (f.status === "RECEIVED" && refundAdjusted) gross = paidHistory;
  if (gross === null) reasons.push("received_gross_unproven");
  if (completed === null || pending === null || f.refunds.items === null)
    reasons.push("refunds_unknown");
  let outstanding: number | null = null;
  if (f.chargeback === null && f.presence.chargeback === "null")
    outstanding = 0;
  else if (o.proof.kind === "proven" && f.chargeback !== null)
    outstanding = o.proof.outstandingCents;
  else
    reasons.push(
      o.proof.kind === "invalid"
        ? "invalid_chargeback_proof"
        : "chargeback_unproven",
    );
  for (const reason of f.reasons) {
    if (reason === "net_unknown" || reason === "excess_gross") continue;
    if (
      reason === "chargeback_amount_unknown" &&
      o.proof.kind === "proven" &&
      f.chargeback !== null
    )
      continue;
    // F compara refunds com value corrente. Só o bruto RECEIVED histórico
    // e a igualdade exata autorizam reinterpretar esse limite como ajuste.
    if (
      refundAdjusted &&
      paidHistory !== null &&
      completed !== null &&
      pending !== null &&
      BigInt(completed) + BigInt(pending) <= BigInt(paidHistory) &&
      (reason === "refund_exceeds_gross" ||
        reason === "pending_refund_exceeds_gross" ||
        (reason === "incompatible_event_status" &&
          f.status === "RECEIVED" &&
          completed === f.amounts.currentValueCents &&
          completed < paidHistory))
    )
      continue;
    reasons.push(reason);
  }
  const comparisons = [
    ...history,
    ...(previous?.snapshot
      ? [
          {
            id: previous.observationId,
            facts: previous.snapshot,
            proof: previous.proof,
            sourceOrder: previous.sourceOrder,
          },
        ]
      : []),
  ];
  for (const prior of comparisons) {
    if (
      !prior.facts ||
      (prior.sourceOrder !== null && prior.sourceOrder > o.sourceOrder)
    )
      continue;
    const comparison = compareFixtureFinancialObservations(
      {
        facts: prior.facts!,
        sourceOrder: prior.sourceOrder,
        chargeback: prior.proof,
      },
      { facts: f, sourceOrder: o.sourceOrder, chargeback: o.proof },
    );
    for (const reason of comparison.reasons) {
      if (reason === "observations_require_reconciliation") continue;
      if (
        reason === "source_order_unknown" &&
        prior.facts!.amounts.receivedCents === null &&
        (prior.facts!.refunds.completedCents === null ||
          prior.facts!.refunds.completedCents === 0) &&
        prior.facts!.chargeback === null &&
        prior.proof.kind !== "proven"
      )
        continue;
      if (
        reason === "incomparable_refunds" &&
        prior.facts!.amounts.receivedCents === null &&
        prior.facts!.refunds.items === null
      )
        continue;
      if (reason === "received_amount_regression" && refundAdjusted) continue;
      reasons.push(reason);
    }
  }
  if (gross !== null && continued && f.amounts.currentValueCents > gross)
    reasons.push("received_gross_changed_without_receipt");
  if (
    gross !== null &&
    completed !== null &&
    outstanding !== null &&
    BigInt(completed) + BigInt(outstanding) > BigInt(gross)
  )
    reasons.push("reductions_exceed_received_gross");
  if (reasons.length) return held(reasons);
  // Replay também deve validar todo o histórico: uma prova tardia não some.
  if (samePrevious)
    return Object.freeze({
      action: "same" as const,
      observationId: o.id,
      position: previous!,
      effects: "none" as const,
    });
  if (!captureIsCurrent) return held(["query_superseded"]);
  if (
    gross === null ||
    completed === null ||
    pending === null ||
    outstanding === null
  )
    return held(["financial_amount_unknown"]);
  const credit = safe(BigInt(gross) - BigInt(completed) - BigInt(outstanding));
  if (credit === null) return held(["arithmetic_out_of_range"]);
  const pendingDispute =
    f.chargeback !== null &&
    ["REQUESTED", "IN_DISPUTE"].includes(f.chargeback.status);
  if (pending > 0) reasons.push("refund_pending");
  if (pendingDispute) reasons.push("chargeback_dispute");
  const certainty = reasons.length ? "reconcile" : "known";
  if (f.amounts.netCents === null) reasons.push("fee_unknown");
  const contracted = f.amounts.contractedCents;
  const resolutionCandidate =
    certainty === "known"
      ? credit >= contracted && completed === 0 && outstanding === 0
        ? "received"
        : completed === gross && outstanding === 0 && credit === 0
          ? "refunded"
          : null
      : null;
  const position = financialPositionSchema.parse({
    schemaVersion: 1,
    semantics: "cumulative_position",
    certainty,
    observationId: o.id,
    sourceOrder: o.sourceOrder,
    snapshot: f,
    proof: o.proof,
    receivedGrossCents: gross,
    completedRefundCents: completed,
    pendingRefundCents: pending,
    chargebackOutstandingCents: outstanding,
    creditCents: credit,
    lastKnownCreditCents: certainty === "known" ? credit : priorKnown,
    remainingCents: safe(BigInt(Math.max(contracted - credit, 0))),
    excessCents: safe(BigInt(Math.max(credit - contracted, 0))),
    feeCents: f.amounts.feeCents,
    reasons: [...new Set(reasons)],
    resolutionCandidate,
  });
  return Object.freeze({
    action: "replace" as const,
    observationId: o.id,
    position,
    effects: "none" as const,
  });
}
function canonicalProof(proof: FinancialPosition["proof"]) {
  return proof.kind !== "proven"
    ? proof.kind
    : JSON.stringify({
        ...proof,
        reversals: [...proof.reversals].sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
      });
}
