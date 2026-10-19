import { z } from "zod";
export const updateContextSchema = z.object({
  orderId: z.uuid(),
  processId: z.uuid(),
  sourceOrderId: z.uuid(),
  sourceCode: z.string(),
  sourceBaseDate: z.string(),
  sourceRevision: z.number().int().positive(),
  file: z
    .object({
      id: z.uuid(),
      name: z.string(),
      sha256: z.string(),
      sizeBytes: z.number(),
      origin: z.enum(["delivery", "client_upload"]),
    })
    .nullable(),
  indexCount: z.number().int(),
  decisionCount: z.number().int(),
  createdAt: z.string(),
  reviewedRevision: z.number().int().nullable(),
  missingRequested: z.boolean(),
});
export type UpdateContext = z.infer<typeof updateContextSchema>;
export const updateIntentSchema = z.strictObject({
  processId: z.uuid(),
  sourceOrderId: z.uuid(),
  requestId: z.uuid(),
  fileId: z.uuid().nullable(),
});
