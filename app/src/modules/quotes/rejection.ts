import { z } from "zod";
const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const rejectionIntentSchema = z.strictObject({
  quoteId: z.uuid(),
  contextHash: hash,
  revision: z.number().int().min(0).max(2147483646),
  requestId: z.uuid(),
  confirmed: z.literal(true),
  reason: z.string().trim().max(500).optional().default(""),
});
export type RejectionIntent = z.infer<typeof rejectionIntentSchema>;
export const rejectionReceiptSchema = z
  .strictObject({
    quoteId: z.uuid(),
    orderId: z.uuid(),
    processId: z.uuid(),
    number: z.string().regex(/^ORC-\d{4}-\d{4,}$/),
    contextHash: hash,
    reason: z.string().max(500),
    expectedRevision: z.number().int().min(0).max(2147483646),
    revision: z.number().int().min(1).max(2147483647),
    rejectedAt: z.iso.datetime({ offset: true }),
    status: z.literal("cancelled"),
  })
  .refine((receipt) => receipt.revision === receipt.expectedRevision + 1);
export type RejectionReceipt = z.infer<typeof rejectionReceiptSchema>;
