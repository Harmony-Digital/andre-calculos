import { z } from "zod";

export const emailSchema = z.object({
  email: z
    .email("Informe um e-mail válido.")
    .max(254)
    .transform((value) => value.trim().toLowerCase()),
});
export const loginSchema = emailSchema.extend({
  password: z
    .string()
    .min(1, "Informe sua senha.")
    .max(256, "Senha muito longa."),
});
export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(12, "Use uma senha com pelo menos 12 caracteres.")
      .max(256),
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    path: ["confirmation"],
    message: "As senhas precisam ser iguais.",
  });

export function safeReturnPath(value: unknown, fallback = "/app") {
  if (
    typeof value !== "string" ||
    value.includes("\\") ||
    value.includes("%") ||
    value.includes("..")
  )
    return fallback;
  return /^\/(app|painel)(\/[^?#\s]*)?(\?[^\s]*)?$/.test(value)
    ? value
    : fallback;
}
export type AuthFormState = {
  message?: string;
  errors?: Record<string, string[]>;
  success?: boolean;
};
