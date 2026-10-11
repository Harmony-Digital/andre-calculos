import { z } from "zod";

const revision = z.number().int().nonnegative().max(2147483646);
export const contractIntentSchema = z.strictObject({
  clientId: z.uuid(),
  hasContract: z.enum(["yes", "no"]).transform((value) => value === "yes"),
  reason: z
    .string()
    .trim()
    .min(3, "Informe o motivo da alteração.")
    .max(1000, "Use até mil caracteres."),
  revision: z.string().regex(/^\d+$/).transform(Number).pipe(revision),
  requestId: z.uuid(),
});
export function parseClientContract(form: FormData) {
  return contractIntentSchema.safeParse({
    clientId: form.get("clientId"),
    hasContract: form.get("hasContract"),
    reason: form.get("reason"),
    revision: form.get("revision"),
    requestId: form.get("requestId"),
  });
}
const contractRecordSchema = z.strictObject({
  id: z.uuid(),
  clientId: z.uuid(),
  hasContract: z.boolean(),
  priorHasContract: z.boolean(),
  reason: z.string().min(3).max(1000),
  revision: z.number().int().positive().max(2147483647),
  changedAt: z.iso.datetime({ offset: true }),
  changedBy: z.uuid(),
  changedName: z.string(),
});
export const contractReceiptSchema = contractRecordSchema.extend({
  effects: z.array(
    z.strictObject({
      orderId: z.uuid(),
      processId: z.uuid(),
      from: z.enum(["awaiting_payment", "awaiting_documents"]),
      to: z.enum(["awaiting_payment", "awaiting_documents", "queued"]),
    }),
  ),
});
export const clientContractContextSchema = z.strictObject({
  clientId: z.uuid(),
  hasContract: z.boolean(),
  revision: z.number().int().nonnegative().max(2147483647),
  canRemove: z.boolean(),
  receipt: contractRecordSchema.nullable(),
});
export type ContractReceipt = z.infer<typeof contractReceiptSchema>;
export type ClientContractContext = z.infer<typeof clientContractContextSchema>;
