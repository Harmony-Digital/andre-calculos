import { z } from "zod";
export const releasePolicies = {
  before_balance: "Antes do pagamento do saldo",
  after_balance: "Depois da confirmação do saldo",
} as const;
export const releasePolicy = z.enum(["before_balance", "after_balance"], {
  error: "Escolha uma regra de liberação.",
});
const approval = {
  policy: releasePolicy,
  requestId: z.uuid(),
  approved: z.literal(true, {
    error: "Confirme a aprovação do responsável técnico.",
  }),
};
const futureSchema = z.object({
  ...approval,
  revision: z
    .string()
    .regex(/^[1-9][0-9]{0,9}$/)
    .transform(Number)
    .pipe(z.number().int().max(2147483646)),
});
const existingSchema = z.object({
  ...approval,
  processId: z.uuid(),
  deliveryId: z.uuid(),
});
function values(form: FormData) {
  return {
    ...Object.fromEntries(form),
    approved: form.get("approved") === "on",
  };
}
export const parseFuturePolicy = (form: FormData) =>
  futureSchema.safeParse(values(form));
export const parseExistingPolicy = (form: FormData) =>
  existingSchema.safeParse(values(form));
