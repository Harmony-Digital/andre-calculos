import "server-only";
import { z } from "zod";
import { scopeSchema } from "./asaas/scope-data";
import { asaasFinancialReasons } from "./asaas/financial";
export const financialId = z.uuid().transform((v) => v.toLowerCase());
export const cents = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const code = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const presence = z.enum(["missing", "null", "empty", "present"]);
export const financialSnapshotSchema = z.strictObject({
  semantics: z.literal("cumulative_snapshot"),
  effects: z.literal("none"),
  identityProof: z.literal("declared_unverified"),
  disposition: z.enum(["observed", "reconcile"]),
  reasons: z.array(z.enum(asaasFinancialReasons)),
  classification: z.enum([
    "obligation",
    "authorization",
    "confirmed_unavailable",
    "received",
    "refund",
    "chargeback",
    "non_receipt_event",
    "unknown",
  ]),
  scope: scopeSchema,
  paymentId: code.brand<"AsaasPaymentId">(),
  customerId: code.brand<"AsaasCustomerId">(),
  reference: financialId,
  expectedBillingType: code.nullable(),
  billingType: code,
  status: code,
  deleted: z.boolean(),
  dueDate: z.iso.date(),
  presence: z.strictObject({
    originalValue: presence,
    netValue: presence,
    refunds: presence,
    chargeback: presence,
  }),
  amounts: z.strictObject({
    contractedCents: cents.positive(),
    currentValueCents: cents.positive(),
    providerOriginalCents: cents.nullable(),
    netCents: z
      .number()
      .int()
      .min(-Number.MAX_SAFE_INTEGER)
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    feeCents: cents.nullable(),
    receivedCents: cents.nullable(),
    relationToContract: z.enum(["equal", "below_contract", "above_contract"]),
    grossLessCompletedRefundsCents: cents.nullable(),
  }),
  refunds: z.strictObject({
    items: z
      .array(
        z.strictObject({
          valueCents: cents,
          status: code,
          providerCreatedAt: z.string().min(1).max(50),
        }),
      )
      .max(1000)
      .nullable(),
    completedCents: cents.nullable(),
    pendingCents: cents.nullable(),
    cancelledCents: cents.nullable(),
    unknownCents: cents.nullable(),
  }),
  chargeback: z.strictObject({ status: code }).nullable(),
});
const effect = z.strictObject({
  id: code,
  amountCents: cents.positive(),
  effectedAt: z.iso.datetime({ offset: true }),
});
export const chargebackProofSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.enum(["unknown", "invalid"]) }),
  z
    .strictObject({
      kind: z.literal("proven"),
      caseId: code,
      debit: effect,
      reversals: z.array(effect.extend({ reversesDebitId: code })).max(100),
      debitedCents: cents.positive(),
      reversedCents: cents,
      outstandingCents: cents,
    })
    .superRefine((p, ctx) => {
      const ids = new Set([p.debit.id]);
      let sum = BigInt(0);
      for (const r of p.reversals) {
        if (
          ids.has(r.id) ||
          r.reversesDebitId !== p.debit.id ||
          Date.parse(r.effectedAt) < Date.parse(p.debit.effectedAt)
        )
          ctx.addIssue({ code: "custom", message: "Prova indisponível." });
        ids.add(r.id);
        sum += BigInt(r.amountCents);
      }
      if (
        p.debitedCents !== p.debit.amountCents ||
        sum !== BigInt(p.reversedCents) ||
        sum > BigInt(p.debitedCents) ||
        BigInt(p.outstandingCents) !== BigInt(p.debitedCents) - sum
      )
        ctx.addIssue({ code: "custom", message: "Prova indisponível." });
    }),
]);
export const financialObservationSchema = z.strictObject({
  id: financialId,
  sourceOrder: cents.positive().nullable(),
  facts: financialSnapshotSchema.nullable(),
  proof: chargebackProofSchema,
});
export const financialPositionSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    semantics: z.literal("cumulative_position"),
    certainty: z.enum(["known", "reconcile"]),
    observationId: financialId,
    sourceOrder: cents.positive().nullable(),
    snapshot: financialSnapshotSchema.nullable(),
    proof: chargebackProofSchema,
    receivedGrossCents: cents.nullable(),
    completedRefundCents: cents.nullable(),
    pendingRefundCents: cents.nullable(),
    chargebackOutstandingCents: cents.nullable(),
    creditCents: cents.nullable(),
    lastKnownCreditCents: cents.nullable(),
    remainingCents: cents.nullable(),
    excessCents: cents.nullable(),
    feeCents: cents.nullable(),
    reasons: z.array(z.string().regex(/^[a-z_]{1,100}$/)).max(50),
    resolutionCandidate: z.enum(["received", "refunded"]).nullable(),
  })
  .superRefine((p, ctx) => {
    const invalid = () =>
      ctx.addIssue({
        code: "custom",
        message: "Posição financeira indisponível.",
      });
    const f = p.snapshot;
    if (p.certainty === "reconcile" && p.resolutionCandidate !== null)
      invalid();
    if (
      p.certainty === "known" &&
      (f === null ||
        p.sourceOrder === null ||
        f.deleted ||
        p.receivedGrossCents === null ||
        p.completedRefundCents === null ||
        p.pendingRefundCents !== 0 ||
        p.chargebackOutstandingCents === null ||
        p.creditCents === null ||
        p.lastKnownCreditCents !== p.creditCents ||
        p.remainingCents === null ||
        p.excessCents === null ||
        p.reasons.some((r) => r !== "fee_unknown") ||
        (f.chargeback !== null &&
          ["REQUESTED", "IN_DISPUTE"].includes(f.chargeback.status)))
    )
      invalid();
    if (p.creditCents === null) return;
    if (
      !f ||
      p.receivedGrossCents === null ||
      p.completedRefundCents === null ||
      p.pendingRefundCents === null ||
      p.chargebackOutstandingCents === null
    ) {
      invalid();
      return;
    }
    const gross = BigInt(p.receivedGrossCents),
      done = BigInt(p.completedRefundCents),
      cb = BigInt(p.chargebackOutstandingCents),
      credit = BigInt(p.creditCents),
      contracted = BigInt(f.amounts.contractedCents);
    if (
      gross <= BigInt(0) ||
      credit !== gross - done - cb ||
      p.completedRefundCents !== f.refunds.completedCents ||
      p.pendingRefundCents !== f.refunds.pendingCents ||
      p.feeCents !== f.amounts.feeCents ||
      (f.chargeback === null
        ? f.presence.chargeback !== "null" || cb !== BigInt(0)
        : p.proof.kind !== "proven" ||
          p.proof.outstandingCents !== p.chargebackOutstandingCents) ||
      p.remainingCents === null ||
      BigInt(p.remainingCents) !==
        (contracted > credit ? contracted - credit : BigInt(0)) ||
      p.excessCents === null ||
      BigInt(p.excessCents) !==
        (credit > contracted ? credit - contracted : BigInt(0))
    )
      invalid();
    const candidate =
      p.certainty !== "known"
        ? null
        : credit >= contracted && done === BigInt(0) && cb === BigInt(0)
          ? "received"
          : done === gross && cb === BigInt(0) && credit === BigInt(0)
            ? "refunded"
            : null;
    if (p.resolutionCandidate !== candidate) invalid();
  });
export type FinancialPosition = z.infer<typeof financialPositionSchema>;
export type FinancialObservation = z.infer<typeof financialObservationSchema>;
