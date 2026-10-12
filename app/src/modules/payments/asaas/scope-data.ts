import { z } from "zod";
const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);
export const accountId = identifier.brand<"AsaasAccountId">();
const walletId = identifier.brand<"AsaasWalletId">();
/** IDs diferentes: uma carteira não comprova o ID da conta emissora. */
export const scopeSchema = z.strictObject({
  provider: z.literal("asaas"),
  environment: z.enum(["sandbox", "production"]),
  accountId,
  walletId: walletId.optional(),
});
export type AsaasScope = Readonly<z.infer<typeof scopeSchema>>;
export type AsaasAccountId = z.infer<typeof accountId>;
export type AsaasWalletId = z.infer<typeof walletId>;
