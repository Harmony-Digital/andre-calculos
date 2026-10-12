import { z } from "zod";
import { isCivilDate } from "@/modules/deadlines/calendar";
import { orderStates } from "@/modules/orders/state-machine";
import { scopeSchema } from "./asaas/scope-data";
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const paymentPhaseSchema = z.enum(["deposit", "balance"]);
const bindingSchema = z
  .strictObject({
    id: z.uuid(),
    scopeId: z.uuid(),
    clientId: z.uuid(),
    customerId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    scope: z.unknown().transform((value, ctx) => {
      try {
        return Object.freeze(scopeSchema.parse(value));
      } catch {
        ctx.addIssue({ code: "custom", message: "Vínculo indisponível." });
        return z.NEVER;
      }
    }),
  })
  .refine((value) => value.scope.environment === "sandbox");
export const paymentObligationSchema = z
  .strictObject({
    mode: z.literal("fixture"),
    identityProof: z.literal("fixture_declared"),
    status: z.enum(["ready", "blocked", "waived", "settled"]),
    reason: z
      .enum([
        "contract_missing",
        "unsafe_amount",
        "legacy_provider_reconciliation",
        "financial_reconciliation",
        "credit_excess",
        "order_closed",
        "phase_unavailable",
        "scope_unconfigured",
        "customer_unbound",
        "customer_changed",
      ])
      .nullable(),
    orderId: z.uuid(),
    phase: paymentPhaseSchema,
    quoteId: z.uuid().nullable(),
    contextHash: hash.nullable(),
    processId: z.uuid(),
    clientId: z.uuid(),
    ownerId: z.uuid(),
    orderStatus: z.enum(orderStates),
    hasContract: z.boolean(),
    contractRevision: z.number().int().nonnegative(),
    totalCents: cents.nullable(),
    requiredCents: cents.nullable(),
    creditedCents: cents.nullable(),
    totalCreditedCents: cents.nullable(),
    remainingCents: cents.nullable(),
    binding: bindingSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const invalid = () =>
      ctx.addIssue({ code: "custom", message: "Obrigação indisponível." });
    if ((value.status === "blocked") !== (value.reason !== null)) invalid();
    if (value.binding !== null && value.binding.clientId !== value.clientId)
      invalid();
    if (value.status === "blocked") {
      if (value.remainingCents !== null) invalid();
      return;
    }
    if (["cancelled", "refunded"].includes(value.orderStatus)) invalid();
    if (
      value.quoteId === null ||
      value.contextHash === null ||
      value.totalCents === null ||
      value.requiredCents === null ||
      value.creditedCents === null ||
      value.totalCreditedCents === null
    ) {
      invalid();
      return;
    }
    if (
      value.requiredCents > value.totalCents ||
      value.totalCreditedCents > value.totalCents ||
      value.creditedCents > value.totalCreditedCents ||
      (value.phase === "deposit" && value.creditedCents > value.requiredCents)
    )
      invalid();
    if (
      value.phase === "balance" &&
      (value.requiredCents !== value.totalCents ||
        value.creditedCents !== value.totalCreditedCents)
    )
      invalid();
    if (
      value.phase === "deposit" &&
      BigInt(value.requiredCents) !==
        (BigInt(value.totalCents) + BigInt(1)) / BigInt(2)
    )
      invalid();
    if (
      value.status === "waived" &&
      (value.phase !== "deposit" ||
        !value.hasContract ||
        value.remainingCents !== 0)
    )
      invalid();
    if (
      value.status === "settled" &&
      (value.remainingCents !== 0 ||
        value.creditedCents < value.requiredCents ||
        (value.phase === "deposit" && value.hasContract))
    )
      invalid();
    if (value.status === "ready") {
      if (
        value.binding === null ||
        value.remainingCents === null ||
        value.remainingCents <= 0 ||
        value.remainingCents !== value.requiredCents - value.creditedCents ||
        (value.phase === "deposit" && value.hasContract)
      )
        invalid();
      if (
        value.phase === "deposit" &&
        !["awaiting_payment", "awaiting_documents"].includes(value.orderStatus)
      )
        invalid();
      if (
        value.phase === "balance" &&
        !["delivered", "completed"].includes(value.orderStatus)
      )
        invalid();
    }
  });
export type PaymentObligation = z.infer<typeof paymentObligationSchema>;
export const obligationPreparationSchema = z.strictObject({
  orderId: z.uuid(),
  phase: paymentPhaseSchema,
  contextHash: hash,
  remainingCents: cents.positive(),
  billingType: z.enum(["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"]),
  dueDate: z.string().refine(isCivilDate),
  requestId: z.uuid(),
});
export const paymentObligationReceiptSchema = z.strictObject({
  id: z.uuid(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  snapshot: paymentObligationSchema
    .safeExtend({
      billingType: obligationPreparationSchema.shape.billingType,
      dueDate: obligationPreparationSchema.shape.dueDate,
    })
    .refine((value) => value.status === "ready"),
});
export type PaymentObligationReceipt = z.infer<
  typeof paymentObligationReceiptSchema
>;
