import {
  classifyComplexity,
  type ComplexityAnswers,
  type Complexity,
  defaultComplexitySettings,
} from "@/modules/orders/complexity";
import type { calculationTypes } from "@/modules/checklist/v1";

type CalculationType = (typeof calculationTypes)[number];
export type PricingAnswers = ComplexityAnswers & {
  calculationType: CalculationType;
  contractMonths: number;
  timecardMonths: number;
  timecardPages: number;
  urgency: boolean;
};
export type PriceTable = {
  version: string;
  isExample: boolean;
  base: Partial<Record<CalculationType, number>>;
  perWage: number;
  includedWages: number;
  perContractMonth: number;
  includedContractMonths: number;
  perTimecardUnit: number;
  timecardUnit: "month" | "page";
  perExtraClaimant: number;
  urgencyBasisPoints: number;
  businessDays: Record<Complexity, number>;
  complexitySettings?: typeof defaultComplexitySettings;
};
export type QuoteItem = {
  code: string;
  description: string;
  quantity: number;
  unitCents: number;
  amountCents: number;
};

function integer(value: number, label: string, min = 0): number {
  if (!Number.isSafeInteger(value) || value < min)
    throw new Error(`Informe ${label} como inteiro válido.`);
  return value;
}
function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("O valor calculado excede o limite permitido.");
  return Number(value);
}
/** Não consulta rede ou IA. A versão e os preços usados acompanham o resultado. */
export type PricingInputs = Omit<PricingAnswers, "processPages">;
export type PricingTable = Omit<
  PriceTable,
  "businessDays" | "complexitySettings"
>;

export function calculatePrice(answers: PricingInputs, table: PricingTable) {
  if (!table.version.trim())
    throw new Error("A tabela de preços precisa de uma versão.");
  const base = table.base[answers.calculationType];
  if (base === undefined)
    throw new Error("A tabela não possui preço para este tipo de cálculo.");
  integer(base, "o preço base");
  for (const [name, value] of Object.entries({
    perWage: table.perWage,
    includedWages: table.includedWages,
    perContractMonth: table.perContractMonth,
    includedContractMonths: table.includedContractMonths,
    perTimecardUnit: table.perTimecardUnit,
    perExtraClaimant: table.perExtraClaimant,
    urgencyBasisPoints: table.urgencyBasisPoints,
    contractMonths: answers.contractMonths,
    timecardMonths: answers.timecardMonths,
    timecardPages: answers.timecardPages,
  }))
    integer(value, name);
  if (!["month", "page"].includes(table.timecardUnit))
    throw new Error("Informe a unidade dos cartões de ponto.");
  integer(answers.claimants, "a quantidade de reclamantes", 1);
  const items: QuoteItem[] = [];
  const add = (
    code: string,
    description: string,
    quantity: number,
    unitCents: number,
  ) => {
    if (quantity === 0 || unitCents === 0) return;
    items.push({
      code,
      description,
      quantity,
      unitCents,
      amountCents: safeNumber(BigInt(quantity) * BigInt(unitCents)),
    });
  };
  // O serviço base aparece mesmo quando configurado como gratuito.
  items.push({
    code: "base",
    description: "Serviço de cálculo",
    quantity: 1,
    unitCents: base,
    amountCents: base,
  });
  add(
    "wages",
    "Verbas adicionais",
    Math.max(0, new Set(answers.wageItems).size - table.includedWages),
    table.perWage,
  );
  add(
    "period",
    "Período contratual adicional (meses)",
    Math.max(0, answers.contractMonths - table.includedContractMonths),
    table.perContractMonth,
  );
  if (["handwritten", "image"].includes(answers.timecardFormat))
    add(
      "timecards",
      `Digitação de cartões (${table.timecardUnit === "month" ? "meses" : "páginas"})`,
      table.timecardUnit === "month"
        ? answers.timecardMonths
        : answers.timecardPages,
      table.perTimecardUnit,
    );
  add(
    "claimants",
    "Reclamantes adicionais",
    answers.claimants - 1,
    table.perExtraClaimant,
  );
  const subtotalCents = safeNumber(
    items.reduce((sum, item) => sum + BigInt(item.amountCents), BigInt(0)),
  );
  // Arredondamento ao centavo mais próximo, empate para cima, sem ponto flutuante.
  const urgencyCents = answers.urgency
    ? safeNumber(
        (BigInt(subtotalCents) * BigInt(table.urgencyBasisPoints) +
          BigInt(5000)) /
          BigInt(10000),
      )
    : 0;
  if (urgencyCents > 0)
    items.push({
      code: "urgency",
      description: "Adicional de urgência",
      quantity: 1,
      unitCents: urgencyCents,
      amountCents: urgencyCents,
    });
  const totalCents = safeNumber(BigInt(subtotalCents) + BigInt(urgencyCents));
  const depositCents = Math.ceil(totalCents / 2);
  return {
    tableVersion: table.version,
    isExample: table.isExample,
    items,
    subtotalCents,
    urgencyCents,
    totalCents,
    depositCents,
    balanceCents: totalCents - depositCents,
  };
}

/** O orçamento completo acrescenta classificação e prazo ao mesmo preço. */
export function calculateQuote(answers: PricingAnswers, table: PriceTable) {
  for (const days of Object.values(table.businessDays))
    integer(days, "o prazo de entrega", 1);
  const complexity = classifyComplexity(answers, table.complexitySettings);
  const businessDays = integer(
    table.businessDays[complexity.level],
    "o prazo desta complexidade",
    1,
  );
  return { ...calculatePrice(answers, table), complexity, businessDays };
}
