import { z } from "zod";
import { brazilStates, brazilMobile } from "@/lib/brazil";
const money = z
  .string()
  .trim()
  .regex(
    /^\d{1,10}(?:[,.]\d{1,2})?$/,
    "Use um valor como 150,00, sem separador de milhares.",
  )
  .transform((value) => {
    const [whole, cents = ""] = value.replace(",", ".").split(".");
    return Number(BigInt(whole) * BigInt(100) + BigInt(cents.padEnd(2, "0")));
  })
  .pipe(z.number().int().min(0).max(1000000000, "Use até R$ 10.000.000,00."));
const integer = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, "Informe um número inteiro.")
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(min, `Use no mínimo ${min}.`)
        .max(max, `Use no máximo ${max}.`),
    );
export const priceFormSchema = z
  .object({
    initial: money,
    liquidation: money,
    challenge: money,
    update: money,
    perWage: money,
    includedWages: integer(0, 1000),
    perContractMonth: money,
    includedContractMonths: integer(0, 1200),
    perTimecardUnit: money,
    timecardUnit: z.enum(["month", "page"]),
    perExtraClaimant: money,
    urgency: money.pipe(z.number().max(100000, "Use até 1.000%.")),
    simpleDays: integer(1, 365),
    mediumDays: integer(1, 365),
    highDays: integer(1, 365),
    expectedVersion: integer(0, 2147483646),
    isExample: z.boolean(),
    approved: z.boolean(),
  })
  .refine((value) => value.isExample || value.approved, {
    path: ["approved"],
    message:
      "Confirme que o André validou os valores e prazos antes de ativar.",
  });
export const priceParameterSchema = z.object({
  base: z.object({
    initial: z.number().int().min(0).max(1000000000),
    liquidation: z.number().int().min(0).max(1000000000),
    challenge: z.number().int().min(0).max(1000000000),
    update: z.number().int().min(0).max(1000000000),
  }),
  perWage: z.number().int().min(0).max(1000000000),
  includedWages: z.number().int().min(0).max(1000),
  perContractMonth: z.number().int().min(0).max(1000000000),
  includedContractMonths: z.number().int().min(0).max(1200),
  perTimecardUnit: z.number().int().min(0).max(1000000000),
  timecardUnit: z.enum(["month", "page"]),
  perExtraClaimant: z.number().int().min(0).max(1000000000),
  urgencyBasisPoints: z.number().int().min(0).max(100000),
  businessDays: z.object({
    simple: z.number().int().min(1).max(365),
    medium: z.number().int().min(1).max(365),
    high: z.number().int().min(1).max(365),
  }),
});
export function parsePrices(form: FormData) {
  return priceFormSchema.safeParse({
    ...Object.fromEntries(form),
    isExample: form.get("isExample") === "yes",
    approved: form.get("approved") === "yes",
  });
}
export function priceParameters(data: z.output<typeof priceFormSchema>) {
  return {
    base: {
      initial: data.initial,
      liquidation: data.liquidation,
      challenge: data.challenge,
      update: data.update,
    },
    perWage: data.perWage,
    includedWages: data.includedWages,
    perContractMonth: data.perContractMonth,
    includedContractMonths: data.includedContractMonths,
    perTimecardUnit: data.perTimecardUnit,
    timecardUnit: data.timecardUnit,
    perExtraClaimant: data.perExtraClaimant,
    urgencyBasisPoints: data.urgency,
    businessDays: {
      simple: data.simpleDays,
      medium: data.mediumDays,
      high: data.highDays,
    },
  };
}
export const settingsFormSchema = z
  .object({
    technicalName: z.string().trim().max(200),
    crcNumber: z
      .string()
      .trim()
      .max(30)
      .regex(/^[0-9A-Za-z/.-]*$/, "Confira o número do CRC."),
    crcState: z.union([z.enum(brazilStates), z.literal("")]),
    crcCategory: z.enum(["", "Contador", "Técnico em Contabilidade"]),
    contactEmail: z.union([z.email("Confira o e-mail."), z.literal("")]),
    contactPhone: z
      .string()
      .trim()
      .transform((value) => (value ? brazilMobile(value) : ""))
      .refine((value) => value !== null, "Confira o celular com DDD."),
    pixKey: z.string().trim().max(200),
    slackDays: integer(0, 365),
    quoteValidDays: integer(1, 365),
    wageThreshold: integer(1, 1000),
    pageThreshold: integer(0, 100000),
    claimantThreshold: integer(1, 1000),
    morningTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Confira o horário."),
    eveningTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Confira o horário."),
    deadlineWindowStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Confira o horário.")
      .optional(),
    deadlineWindowEnd: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Confira o horário.")
      .optional(),
    conditions: z.string().trim().max(4000),
    guarantee: z.string().trim().max(4000),
    revision: integer(1, 2147483646),
  })
  .superRefine((data, ctx) => {
    if (
      (data.deadlineWindowStart !== undefined ||
        data.deadlineWindowEnd !== undefined) &&
      (!data.deadlineWindowStart ||
        !data.deadlineWindowEnd ||
        data.deadlineWindowStart >= data.deadlineWindowEnd)
    )
      ctx.addIssue({
        code: "custom",
        path: ["deadlineWindowEnd"],
        message:
          "Informe início e fim; o fim deve ser depois do início no mesmo dia.",
      });
    if (
      [
        data.technicalName,
        data.crcNumber,
        data.crcState,
        data.crcCategory,
      ].some(Boolean)
    ) {
      for (const key of [
        "technicalName",
        "crcNumber",
        "crcState",
        "crcCategory",
      ] as const) {
        if (
          !data[key] ||
          ((key === "technicalName" || key === "crcNumber") &&
            data[key].length < 3)
        )
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Preencha a identificação profissional completa.",
          });
      }
    }
  });
export function parseSettings(form: FormData) {
  return settingsFormSchema.safeParse(Object.fromEntries(form));
}
export type SettingsValues = z.input<typeof settingsFormSchema>;
export type PriceValues = z.input<typeof priceFormSchema>;
export function centsInput(cents: number) {
  return `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}
