import { z } from "zod";
import { brazilStates, brazilMobile } from "@/lib/brazil";
export const profileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(3, "Informe seu nome completo.")
      .max(200, "Nome muito longo."),
    phone: z
      .string()
      .transform(brazilMobile)
      .refine(
        (value) => value !== null,
        "Informe um celular brasileiro com DDD.",
      ),
    oabNumber: z
      .string()
      .trim()
      .max(30)
      .regex(/^[0-9A-Za-z/.-]*$/, "Confira o número da OAB."),
    oabState: z.union([z.enum(brazilStates), z.literal("")]),
    city: z.string().trim().max(120, "Cidade muito longa."),
    legalName: z
      .string()
      .trim()
      .min(3, "Informe o nome do escritório ou empresa.")
      .max(200),
  })
  .refine((value) => Boolean(value.oabNumber) === Boolean(value.oabState), {
    path: ["oabNumber"],
    message: "Informe o número e a UF da OAB, ou deixe ambos vazios.",
  });
export function parseProfile(form: FormData) {
  return profileSchema.safeParse(
    Object.fromEntries(
      ["fullName", "phone", "oabNumber", "oabState", "city", "legalName"].map(
        (key) => [key, form.get(key) ?? ""],
      ),
    ),
  );
}
