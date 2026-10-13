import { z } from "zod";
import { currentOrderCreditSchema } from "./order-credit";
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const depositIntentSchema = z.strictObject({
  quoteId: z.uuid(),
  contextHash: hash,
  remainingCents: cents,
  requestId: z.uuid(),
  confirmed: z.literal(true),
});
export const depositReceiptSchema = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  quoteId: z.uuid(),
  paymentId: z.uuid().nullable(),
  contextHash: hash,
  confirmedBy: z.uuid(),
  confirmedAt: z.iso.datetime({ offset: true }),
  amountCents: cents,
  creditedBeforeCents: cents,
  requiredCents: cents.positive(),
  status: z.enum(["awaiting_documents", "queued"]),
});
export const depositInfoSchema = z
  .strictObject({
    orderId: z.uuid(),
    quoteId: z.uuid(),
    processId: z.uuid(),
    code: z.string(),
    status: z.string(),
    contextHash: hash,
    requiredCents: cents,
    confirmedCents: cents.nullable(),
    remainingCents: cents.nullable(),
    credit: currentOrderCreditSchema,
    hasContract: z.boolean(),
    pixKey: z.string().nullable(),
    canConfirm: z.boolean(),
    receipt: depositReceiptSchema.nullable(),
    confirmedName: z.string().nullable(),
    paymentStatus: z.enum(["confirmed", "refunded"]).nullable(),
  })
  .superRefine((v, ctx) => {
    const p = v.credit.projection;
    const active = ["awaiting_payment", "awaiting_documents"].includes(
      v.status,
    );
    const known =
      v.credit.collectionState !== "reconcile" &&
      v.credit.collectionState !== "excess";
    const positive = v.remainingCents !== null && v.remainingCents > 0;
    const zeroManual =
      v.remainingCents === 0 &&
      p.manualDepositCents !== null &&
      p.manualDepositCents >= v.requiredCents;
    if (
      v.orderId !== v.credit.orderId ||
      v.hasContract !== v.credit.hasContract ||
      v.requiredCents !== p.requiredDepositCents ||
      v.confirmedCents !== p.depositCreditCents ||
      v.remainingCents !== p.remainingDepositCents ||
      (v.pixKey !== null &&
        (v.hasContract ||
          !active ||
          v.requiredCents <= 0 ||
          !positive ||
          v.credit.collectionState !== "clear")) ||
      (v.canConfirm &&
        (v.hasContract ||
          !active ||
          v.requiredCents <= 0 ||
          !known ||
          !(zeroManual || (positive && !v.credit.activeReservation))))
    )
      ctx.addIssue({
        code: "custom",
        message: "Instruções do sinal indisponíveis.",
      });
  });
export type DepositReceipt = z.infer<typeof depositReceiptSchema>;
export type DepositInfo = z.infer<typeof depositInfoSchema>;
