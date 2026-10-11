import { z } from "zod";
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
export const depositInfoSchema = z.strictObject({
  orderId: z.uuid(),
  quoteId: z.uuid(),
  processId: z.uuid(),
  code: z.string(),
  status: z.string(),
  contextHash: hash,
  requiredCents: cents,
  confirmedCents: cents,
  remainingCents: cents,
  hasContract: z.boolean(),
  pixKey: z.string().nullable(),
  canConfirm: z.boolean(),
  receipt: depositReceiptSchema.nullable(),
  confirmedName: z.string().nullable(),
  paymentStatus: z.enum(["confirmed", "refunded"]).nullable(),
});
export type DepositReceipt = z.infer<typeof depositReceiptSchema>;
export type DepositInfo = z.infer<typeof depositInfoSchema>;
