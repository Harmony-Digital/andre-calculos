import { z } from "zod";
import { proposalSchema } from "./proposal";
import { rejectionReceiptSchema } from "./rejection";
const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const acceptanceIntentSchema = z.strictObject({
  quoteId: z.uuid(),
  contextHash: hash,
  requestId: z.uuid(),
  confirmed: z.literal(true),
});
export const acceptanceReceiptSchema = z.strictObject({
  quoteId: z.uuid(),
  number: z.string().regex(/^ORC-\d{4}-\d{4,}$/),
  acceptedAt: z.iso.datetime({ offset: true }),
  contextHash: hash,
  status: z.enum(["awaiting_payment", "awaiting_documents", "queued"]),
  hasContract: z.boolean(),
  minimumDocumentPresent: z.boolean(),
  depositCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
export type AcceptanceReceipt = z.infer<typeof acceptanceReceiptSchema>;
export const contractContextSchema = z.strictObject({
  proposal: proposalSchema,
  contextHash: hash,
  termsVersion: z.string().min(1).max(200),
  termsText: z.string().min(1).max(64000),
  privacyVersion: z.string().min(1).max(200),
  privacyText: z.string().min(1).max(64000),
  canAccept: z.boolean(),
  blockMessage: z.string().nullable(),
  status: z.string(),
  receipt: acceptanceReceiptSchema.nullable(),
  canReject: z.boolean(),
  rejectionBlockMessage: z.string().nullable(),
  statusRevision: z.number().int().min(0).max(2147483647),
  rejectionReceipt: rejectionReceiptSchema.nullable(),
});
export type ContractContext = z.infer<typeof contractContextSchema>;
