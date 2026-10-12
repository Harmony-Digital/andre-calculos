import "server-only";
import { z } from "zod";
import { paymentObligationReceiptSchema } from "./obligations";
const id = z.uuid().transform((value) => value.toLowerCase());
const at = z.iso.datetime({ offset: true });
const revision = z.number().int().min(0).max(2147483646);
export const reservePaymentIntentInput = z.strictObject({
  contextId: id,
  requestId: id,
});
export const withdrawPaymentIntentInput = z.strictObject({
  intentId: id,
  expectedRevision: revision,
  requestId: id,
});
export const paymentIntentSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("fixture"),
    identityProof: z.literal("fixture_declared"),
    id,
    reference: id,
    contextId: id,
    createdBy: id,
    createdAt: at,
    obligation: paymentObligationReceiptSchema.shape.snapshot,
  })
  .refine((value) => value.reference === value.id);
export const paymentIntentViewSchema = z
  .strictObject({
    intent: paymentIntentSchema,
    currentOwnerId: id,
    state: z.enum(["reserved", "dispatch_claimed", "withdrawn"]),
    revision,
    reservationActive: z.boolean(),
    claimedAt: at.nullable(),
    withdrawnAt: at.nullable(),
    withdrawnBy: id.nullable(),
  })
  .superRefine((value, ctx) => {
    const invalid = () =>
      ctx.addIssue({ code: "custom", message: "Reserva indisponível." });
    if (
      value.state === "reserved" &&
      (value.revision !== 0 ||
        !value.reservationActive ||
        value.claimedAt !== null ||
        value.withdrawnAt !== null ||
        value.withdrawnBy !== null)
    )
      invalid();
    if (
      value.state === "dispatch_claimed" &&
      (value.revision !== 1 ||
        !value.reservationActive ||
        value.claimedAt === null ||
        value.withdrawnAt !== null ||
        value.withdrawnBy !== null)
    )
      invalid();
    if (
      value.state === "withdrawn" &&
      (value.revision !== 1 ||
        value.reservationActive ||
        value.claimedAt !== null ||
        value.withdrawnAt === null ||
        value.withdrawnBy === null)
    )
      invalid();
  });
// Recibos históricos continuam no schema anterior, sem campos novos.
export const currentPaymentIntentSchema = z.union([
  paymentIntentViewSchema.safeExtend({ semantics: z.literal("current_state") }),
  z.strictObject({
    semantics: z.literal("current_state"),
    intent: paymentIntentSchema,
    currentOwnerId: id,
    state: z.literal("resolved"),
    revision: z.literal(2),
    reservationActive: z.literal(false),
    claimedAt: at,
    withdrawnAt: z.null(),
    withdrawnBy: z.null(),
    resolvedAt: at,
    resolutionReason: z.literal("no_dispatch_proven"),
  }),
]);
export const paymentIntentReceiptSchema = z
  .strictObject({
    semantics: z.literal("receipt_snapshot"),
    requestId: id,
    action: z.enum(["reserve", "withdraw"]),
    actorId: id,
    recordedAt: at,
    expectedRevision: revision.nullable(),
    appliedRevision: revision,
    snapshot: paymentIntentViewSchema,
  })
  .superRefine((value, ctx) => {
    const invalid = () =>
      ctx.addIssue({ code: "custom", message: "Recibo indisponível." });
    if (value.appliedRevision !== value.snapshot.revision) invalid();
    if (
      value.action === "reserve" &&
      (value.expectedRevision !== null ||
        value.appliedRevision !== 0 ||
        value.snapshot.state !== "reserved" ||
        value.actorId !== value.snapshot.intent.createdBy)
    )
      invalid();
    if (
      value.action === "withdraw" &&
      (value.expectedRevision !== 0 ||
        value.appliedRevision !== 1 ||
        value.snapshot.state !== "withdrawn" ||
        value.snapshot.withdrawnBy !== value.actorId ||
        value.snapshot.withdrawnAt !== value.recordedAt)
    )
      invalid();
  });
export type PaymentIntent = z.infer<typeof paymentIntentSchema>;
export type PaymentIntentReceipt = z.infer<typeof paymentIntentReceiptSchema>;
