import { z } from "zod";
import {
  calculatePrice,
  type PricingInputs,
  type PricingTable,
} from "@/modules/quotes/pricing";
const cents = z.number().int().min(0).max(1_000_000_000);
export const publicPriceSchema = z.strictObject({
  version: z.string().min(1).max(80),
  isExample: z.boolean(),
  base: z.strictObject({
    initial: cents,
    liquidation: cents,
    challenge: cents,
    update: cents,
  }),
  perWage: cents,
  includedWages: z.number().int().min(0).max(1000),
  perContractMonth: cents,
  includedContractMonths: z.number().int().min(0).max(1200),
  perTimecardUnit: cents,
  timecardUnit: z.enum(["month", "page"]),
  perExtraClaimant: cents,
  urgencyBasisPoints: z.number().int().min(0).max(100_000),
});
export const simulatorTypes = {
  initial: "Cálculo inicial",
  liquidation: "Liquidação ou execução",
  challenge: "Impugnação",
  update: "Atualização",
} as const;
const quantity = (label: string, min: number, max: number) =>
  z
    .string({ error: `Informe ${label} em número inteiro.` })
    .regex(/^\d{1,4}$/, `Informe ${label} em número inteiro.`)
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(min, `Informe ${label} a partir de ${min}.`)
        .max(max, `Informe ${label} até ${max}.`),
    );
const inputSchema = z
  .strictObject({
    calculationType: z.enum(["initial", "liquidation", "challenge", "update"], {
      error: "Escolha o serviço.",
    }),
    wageCount: quantity("a quantidade de verbas", 1, 100),
    contractMonths: quantity("o período contratual em meses", 0, 1200),
    claimants: quantity("a quantidade de reclamantes", 1, 100),
    timecardFormat: z.enum(["none", "digital", "image", "handwritten"], {
      error: "Escolha o formato dos cartões.",
    }),
    timecardQuantity: quantity("a quantidade de cartões", 0, 3000),
    urgency: z.enum(["yes", "no"], { error: "Escolha se há urgência." }),
  })
  .superRefine((v, ctx) => {
    if (
      ["image", "handwritten"].includes(v.timecardFormat) &&
      v.timecardQuantity === 0
    )
      ctx.addIssue({
        code: "custom",
        path: ["timecardQuantity"],
        message: "Informe a quantidade de cartões para digitação.",
      });
  });
export function parseSimulator(form: FormData) {
  return inputSchema.safeParse(Object.fromEntries(form));
}
export function estimatePrice(
  input: z.output<typeof inputSchema>,
  table: PricingTable,
) {
  const answers: PricingInputs = {
    calculationType: input.calculationType,
    wageItems: Array.from(
      { length: input.wageCount },
      (_, i) => `simulation_wage_${i + 1}`,
    ),
    contractMonths: input.contractMonths,
    claimants: input.claimants,
    timecardFormat: input.timecardFormat,
    timecardMonths: table.timecardUnit === "month" ? input.timecardQuantity : 0,
    timecardPages: table.timecardUnit === "page" ? input.timecardQuantity : 0,
    urgency: input.urgency === "yes",
  };
  const price = calculatePrice(answers, publicPriceSchema.parse(table));
  return {
    tableVersion: price.tableVersion,
    isExample: price.isExample,
    items: price.items,
    totalCents: price.totalCents,
  };
}
export type PublicPriceTable = z.infer<typeof publicPriceSchema>;
