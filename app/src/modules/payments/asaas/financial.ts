import "server-only";
import {
  readAsaasEvent,
  readAsaasPayment,
  readAsaasPaymentExpectation,
  isValidatedAsaasPaymentObservation,
  type AsaasPaymentObservation,
} from "./contracts";
import { AsaasContractError } from "./errors";

const reasons = [
  "unknown_event",
  "unknown_payment_status",
  "unknown_billing_type",
  "expected_method_unknown",
  "billing_type_mismatch",
  "incompatible_event_status",
  "manual_receipt",
  "pix_confirmation_pending",
  "net_unknown",
  "invalid_net",
  "refunds_unknown",
  "unknown_refund_status",
  "refund_amount_unknown",
  "refund_exceeds_gross",
  "pending_refund_exceeds_gross",
  "chargeback_unknown",
  "unknown_chargeback_status",
  "chargeback_amount_unknown",
  "excess_gross",
  "deleted_financial_observation",
  "arithmetic_out_of_range",
  "event_requires_query",
] as const;
export type AsaasFinancialReason = (typeof reasons)[number];
type Classification =
  | "obligation"
  | "authorization"
  | "confirmed_unavailable"
  | "received"
  | "refund"
  | "chargeback"
  | "non_receipt_event"
  | "unknown";
const methods = new Set(["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"]);
const statuses = new Set([
  "PENDING",
  "RECEIVED",
  "CONFIRMED",
  "OVERDUE",
  "REFUNDED",
  "RECEIVED_IN_CASH",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_REQUESTED",
  "DUNNING_RECEIVED",
  "AWAITING_RISK_ANALYSIS",
  "AUTHORIZED",
]);
const chargebackStatuses = new Set([
  "REQUESTED",
  "IN_DISPUTE",
  "DISPUTE_LOST",
  "REVERSED",
  "DONE",
]);
const eventPolicy: Record<
  string,
  { classification: Classification; statuses?: readonly string[]; query?: true }
> = {
  PAYMENT_CREATED: { classification: "obligation", statuses: ["PENDING"] },
  PAYMENT_RECEIVED: { classification: "received", statuses: ["RECEIVED"] },
  PAYMENT_CONFIRMED: {
    classification: "confirmed_unavailable",
    statuses: ["CONFIRMED"],
  },
  PAYMENT_AUTHORIZED: {
    classification: "authorization",
    statuses: ["AUTHORIZED"],
  },
  PAYMENT_OVERDUE: { classification: "obligation", statuses: ["OVERDUE"] },
  PAYMENT_REFUNDED: { classification: "refund", statuses: ["REFUNDED"] },
  PAYMENT_PARTIALLY_REFUNDED: {
    classification: "refund",
    statuses: ["RECEIVED", "CONFIRMED"],
  },
  PAYMENT_REFUND_IN_PROGRESS: {
    classification: "refund",
    statuses: [
      "REFUND_IN_PROGRESS",
      "REFUND_REQUESTED",
      "RECEIVED",
      "CONFIRMED",
    ],
  },
  PAYMENT_REFUND_DENIED: {
    classification: "refund",
    statuses: ["RECEIVED", "CONFIRMED"],
  },
  PAYMENT_CHARGEBACK_REQUESTED: {
    classification: "chargeback",
    statuses: ["CHARGEBACK_REQUESTED"],
  },
  PAYMENT_CHARGEBACK_DISPUTE: {
    classification: "chargeback",
    statuses: ["CHARGEBACK_DISPUTE"],
  },
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: {
    classification: "chargeback",
    statuses: ["AWAITING_CHARGEBACK_REVERSAL"],
  },
  PAYMENT_UPDATED: { classification: "non_receipt_event", query: true },
  PAYMENT_DELETED: { classification: "non_receipt_event" },
  PAYMENT_RESTORED: { classification: "non_receipt_event", query: true },
  PAYMENT_BANK_SLIP_VIEWED: { classification: "non_receipt_event" },
  PAYMENT_CHECKOUT_VIEWED: { classification: "non_receipt_event" },
  PAYMENT_BANK_SLIP_CANCELLED: {
    classification: "non_receipt_event",
    query: true,
  },
  PAYMENT_RECEIVED_IN_CASH_UNDONE: {
    classification: "non_receipt_event",
    query: true,
  },
  PAYMENT_AWAITING_RISK_ANALYSIS: {
    classification: "non_receipt_event",
    query: true,
  },
  PAYMENT_APPROVED_BY_RISK_ANALYSIS: {
    classification: "non_receipt_event",
    query: true,
  },
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: {
    classification: "non_receipt_event",
    query: true,
  },
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: {
    classification: "non_receipt_event",
    query: true,
  },
  PAYMENT_ANTICIPATED: { classification: "non_receipt_event", query: true },
  PAYMENT_DUNNING_REQUESTED: {
    classification: "non_receipt_event",
    query: true,
  },
  PAYMENT_DUNNING_RECEIVED: {
    classification: "non_receipt_event",
    query: true,
  },
  PAYMENT_SPLIT_CANCELLED: { classification: "non_receipt_event", query: true },
  PAYMENT_SPLIT_DIVERGENCE_BLOCK: {
    classification: "non_receipt_event",
    query: true,
  },
  PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED: {
    classification: "non_receipt_event",
    query: true,
  },
  PAYMENT_SPLIT_DONE: { classification: "non_receipt_event", query: true },
};
const paidStatuses = new Set([
  "RECEIVED",
  "CONFIRMED",
  "REFUNDED",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
]);

function normalize(
  payment: AsaasPaymentObservation,
  expectedMethod: string | undefined,
  eventType: string | null,
) {
  const found = new Set<AsaasFinancialReason>();
  const add = (reason: AsaasFinancialReason) => found.add(reason);
  const policy = eventType === null ? undefined : eventPolicy[eventType];
  let classification: Classification =
    eventType === null
      ? payment.status === "RECEIVED"
        ? "received"
        : payment.status === "CONFIRMED"
          ? "confirmed_unavailable"
          : payment.status === "AUTHORIZED"
            ? "authorization"
            : payment.status === "REFUNDED" ||
                ["REFUND_REQUESTED", "REFUND_IN_PROGRESS"].includes(
                  payment.status,
                )
              ? "refund"
              : [
                    "CHARGEBACK_REQUESTED",
                    "CHARGEBACK_DISPUTE",
                    "AWAITING_CHARGEBACK_REVERSAL",
                  ].includes(payment.status)
                ? "chargeback"
                : ["PENDING", "OVERDUE"].includes(payment.status)
                  ? "obligation"
                  : "unknown"
      : (policy?.classification ?? "unknown");
  if (eventType !== null && policy === undefined) add("unknown_event");
  if (!statuses.has(payment.status)) add("unknown_payment_status");
  if (policy?.statuses && !policy.statuses.includes(payment.status))
    add("incompatible_event_status");
  if (policy?.query) add("event_requires_query");
  if (
    eventType === null &&
    [
      "DUNNING_REQUESTED",
      "DUNNING_RECEIVED",
      "AWAITING_RISK_ANALYSIS",
    ].includes(payment.status)
  ) {
    classification = "non_receipt_event";
    add("event_requires_query");
  }
  if (eventType === "PAYMENT_DELETED" && !payment.deleted)
    add("incompatible_event_status");
  if (eventType === "PAYMENT_RESTORED" && payment.deleted)
    add("incompatible_event_status");
  const manual =
    payment.billingType === "RECEIVED_IN_CASH" ||
    payment.status === "RECEIVED_IN_CASH";
  if (manual) add("manual_receipt");
  else if (!methods.has(payment.billingType)) add("unknown_billing_type");
  if (expectedMethod === undefined || !methods.has(expectedMethod))
    add("expected_method_unknown");
  else if (
    expectedMethod !== "UNDEFINED" &&
    payment.billingType !== expectedMethod
  )
    add("billing_type_mismatch");
  if (paidStatuses.has(payment.status) && payment.billingType === "UNDEFINED")
    add("unknown_billing_type");
  if (
    classification === "authorization" &&
    payment.billingType !== "CREDIT_CARD"
  )
    add("incompatible_event_status");
  if (eventType === "PAYMENT_REFUND_DENIED" && payment.billingType !== "BOLETO")
    add("incompatible_event_status");
  if (payment.status === "CONFIRMED" && payment.billingType === "PIX")
    add("pix_confirmation_pending");
  if (payment.valueCents > payment.contractedCents) add("excess_gross");
  if (
    payment.deleted &&
    (paidStatuses.has(payment.status) || classification === "chargeback")
  )
    add("deleted_financial_observation");

  let feeCents: number | null = null;
  if (payment.netCents === null) {
    if (paidStatuses.has(payment.status)) add("net_unknown");
  } else if (payment.netCents < 0 || payment.netCents > payment.valueCents) {
    add("invalid_net");
  } else {
    feeCents = Number(BigInt(payment.valueCents) - BigInt(payment.netCents));
  }

  const totals = {
    DONE: BigInt(0),
    PENDING: BigInt(0),
    CANCELLED: BigInt(0),
    UNKNOWN: BigInt(0),
  };
  if (payment.refunds === null) {
    if (paidStatuses.has(payment.status) || classification === "refund")
      add("refunds_unknown");
  } else {
    for (const refund of payment.refunds) {
      const group =
        refund.status === "DONE" ||
        refund.status === "PENDING" ||
        refund.status === "CANCELLED"
          ? refund.status
          : "UNKNOWN";
      totals[group] += BigInt(refund.valueCents);
      if (group === "UNKNOWN") add("unknown_refund_status");
    }
  }
  const safeTotal = (value: bigint): number | null => {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      add("arithmetic_out_of_range");
      return null;
    }
    return Number(value);
  };
  const knownRefunds = payment.refunds !== null;
  const completedCents = knownRefunds ? safeTotal(totals.DONE) : null;
  const pendingCents = knownRefunds ? safeTotal(totals.PENDING) : null;
  const cancelledCents = knownRefunds ? safeTotal(totals.CANCELLED) : null;
  const unknownCents = knownRefunds ? safeTotal(totals.UNKNOWN) : null;
  if (knownRefunds && totals.DONE > BigInt(payment.valueCents))
    add("refund_exceeds_gross");
  if (knownRefunds && totals.DONE + totals.PENDING > BigInt(payment.valueCents))
    add("pending_refund_exceeds_gross");
  if (
    knownRefunds &&
    totals.DONE > BigInt(0) &&
    !paidStatuses.has(payment.status)
  )
    add("incompatible_event_status");
  if (eventType === "PAYMENT_REFUNDED" || payment.status === "REFUNDED") {
    if (!knownRefunds || totals.DONE !== BigInt(payment.valueCents))
      add("refund_amount_unknown");
  }
  if (
    knownRefunds &&
    totals.DONE === BigInt(payment.valueCents) &&
    totals.DONE > BigInt(0) &&
    payment.status !== "REFUNDED"
  )
    add("incompatible_event_status");
  if (eventType === "PAYMENT_PARTIALLY_REFUNDED") {
    if (
      !knownRefunds ||
      totals.DONE <= BigInt(0) ||
      totals.DONE >= BigInt(payment.valueCents)
    )
      add("refund_amount_unknown");
  }
  if (
    (eventType === "PAYMENT_REFUND_IN_PROGRESS" ||
      ["REFUND_REQUESTED", "REFUND_IN_PROGRESS"].includes(payment.status)) &&
    (!knownRefunds || totals.PENDING === BigInt(0))
  )
    add("refund_amount_unknown");
  if (
    eventType === "PAYMENT_REFUND_DENIED" &&
    (!knownRefunds || totals.CANCELLED === BigInt(0))
  )
    add("refund_amount_unknown");

  if (payment.chargeback !== null) {
    add("chargeback_amount_unknown");
    if (!chargebackStatuses.has(payment.chargeback.status))
      add("unknown_chargeback_status");
    // Objeto presente exige conciliação, inclusive REVERSED/DONE, sem montante.
  } else if (
    payment.presence.chargeback === "missing" &&
    paidStatuses.has(payment.status)
  ) {
    add("chargeback_unknown");
  }
  if (classification === "chargeback") {
    add("chargeback_amount_unknown");
    if (payment.chargeback === null) add("chargeback_unknown");
    const compatible =
      eventType === "PAYMENT_CHARGEBACK_REQUESTED"
        ? ["REQUESTED"]
        : eventType === "PAYMENT_CHARGEBACK_DISPUTE"
          ? ["IN_DISPUTE", "DISPUTE_LOST"]
          : eventType === "PAYMENT_AWAITING_CHARGEBACK_REVERSAL"
            ? ["REVERSED"]
            : null;
    if (
      compatible &&
      payment.chargeback &&
      !compatible.includes(payment.chargeback.status)
    )
      add("incompatible_event_status");
  }
  if (manual) classification = "non_receipt_event";
  const orderedReasons = Object.freeze(
    reasons.filter((reason) => found.has(reason)),
  );
  const receivedCents =
    classification === "received" && payment.status === "RECEIVED" && !manual
      ? payment.valueCents
      : null;
  const grossLessCompletedRefundsCents =
    knownRefunds &&
    !found.has("refund_amount_unknown") &&
    !found.has("incompatible_event_status") &&
    totals.UNKNOWN === BigInt(0) &&
    totals.DONE <= BigInt(payment.valueCents) &&
    payment.chargeback === null &&
    payment.presence.chargeback === "null" &&
    paidStatuses.has(payment.status) &&
    !manual
      ? Number(BigInt(payment.valueCents) - totals.DONE)
      : null;
  return Object.freeze({
    semantics: "cumulative_snapshot" as const,
    effects: "none" as const,
    identityProof: "declared_unverified" as const,
    disposition:
      orderedReasons.length === 0
        ? ("observed" as const)
        : ("reconcile" as const),
    reasons: orderedReasons,
    classification,
    scope: payment.scope,
    paymentId: payment.paymentId,
    customerId: payment.customerId,
    reference: payment.reference,
    expectedBillingType: expectedMethod ?? null,
    billingType: payment.billingType,
    status: payment.status,
    deleted: payment.deleted,
    dueDate: payment.dueDate,
    presence: payment.presence,
    amounts: Object.freeze({
      contractedCents: payment.contractedCents,
      currentValueCents: payment.valueCents,
      providerOriginalCents: payment.providerOriginalCents,
      netCents: payment.netCents,
      feeCents,
      receivedCents,
      relationToContract:
        payment.valueCents === payment.contractedCents
          ? ("equal" as const)
          : payment.valueCents < payment.contractedCents
            ? ("below_contract" as const)
            : ("above_contract" as const),
      grossLessCompletedRefundsCents,
    }),
    refunds: Object.freeze({
      items: payment.refunds,
      completedCents,
      pendingCents,
      cancelledCents,
      unknownCents,
    }),
    chargeback: payment.chargeback,
  });
}
export type AsaasFinancialSnapshot = ReturnType<typeof normalize>;

function context(value: unknown) {
  const expected = readAsaasPaymentExpectation(value);
  if (expected.phase !== "observation")
    throw new AsaasContractError("invalid_data");
  // O método observado pode ter mudado (ex.: baixa manual). Preservar o fato e
  // marcar divergência; não relaxar IDs, referência, original ou vencimento.
  const { billingType, ...binding } = expected;
  return { expectedMethod: billingType, binding };
}
/** Somente objetos imutáveis dos leitores lossless; nunca DTO/body de usuário. */
export function normalizeValidatedAsaasPaymentObservation(
  payment: AsaasPaymentObservation,
  expectedBillingType: string | undefined,
) {
  if (!isValidatedAsaasPaymentObservation(payment))
    throw new AsaasContractError("invalid_data");
  return normalize(payment, expectedBillingType, null);
}
export function normalizeAsaasPaymentSnapshot(
  text: string,
  sourceScope: unknown,
  expectedInput: unknown,
) {
  const expected = context(expectedInput);
  return normalize(
    readAsaasPayment(text, sourceScope, expected.binding),
    expected.expectedMethod,
    null,
  );
}
export function normalizeAsaasFinancialEvent(
  text: string,
  sourceScope: unknown,
  expectedInput: unknown,
) {
  const expected = context(expectedInput);
  const event = readAsaasEvent(text, sourceScope, expected.binding);
  return Object.freeze({
    eventId: event.eventId,
    eventType: event.eventType,
    providerCreatedAt: event.providerCreatedAt,
    snapshot: normalize(
      event.payment,
      expected.expectedMethod,
      event.eventType,
    ),
  });
}
