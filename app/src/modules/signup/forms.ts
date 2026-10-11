import { z } from "zod";
import { profileSchema } from "@/modules/account/forms";
import { emailSchema, newPasswordSchema } from "@/modules/auth/forms";
import { validCpf, validCnpj, normalizeDocument } from "@/lib/documents";
export const signupSchema = profileSchema
  .safeExtend({
    email: emailSchema.shape.email,
    password: newPasswordSchema.shape.password,
    confirmation: z.string(),
    kind: z.enum(["person", "company"]),
    document: z.string().transform(normalizeDocument),
    accepted: z.literal("yes", {
      error: "Aceite os termos e a política para continuar.",
    }),
    termsVersion: z.string(),
    privacyVersion: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    path: ["confirmation"],
    message: "As senhas precisam ser iguais.",
  })
  .refine(
    (value) =>
      value.kind === "person"
        ? validCpf(value.document)
        : validCnpj(value.document),
    {
      path: ["document"],
      message: "Confira o CPF ou CNPJ, incluindo os dígitos verificadores.",
    },
  );
export function parseSignup(form: FormData) {
  const fields = [
    "fullName",
    "phone",
    "oabNumber",
    "oabState",
    "city",
    "legalName",
    "email",
    "password",
    "confirmation",
    "kind",
    "document",
    "accepted",
    "termsVersion",
    "privacyVersion",
  ];
  return signupSchema.safeParse(
    Object.fromEntries(fields.map((key) => [key, form.get(key) ?? ""])),
  );
}
