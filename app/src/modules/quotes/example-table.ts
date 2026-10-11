import type { PriceTable } from "./pricing";
/** Referências do plano M2.07. Nunca ativar como tabela real ou enviar a um cliente. */
export const examplePriceTable: PriceTable = {
  version: "exemplo-v1",
  isExample: true,
  base: { initial: 15000, liquidation: 25000, challenge: 30000, update: 10000 },
  perWage: 0,
  includedWages: 1,
  perContractMonth: 0,
  includedContractMonths: 12,
  perTimecardUnit: 7000,
  timecardUnit: "month",
  perExtraClaimant: 0,
  urgencyBasisPoints: 3000,
  businessDays: { simple: 3, medium: 5, high: 8 },
};
