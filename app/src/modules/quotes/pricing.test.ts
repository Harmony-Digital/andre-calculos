import { describe, expect, it } from "vitest";
import {
  calculateQuote,
  type PricingAnswers,
  type PriceTable,
} from "./pricing";
const answers: PricingAnswers = {
  calculationType: "initial",
  wageItems: ["severance"],
  timecardFormat: "none",
  claimants: 1,
  processPages: 100,
  contractMonths: 12,
  timecardMonths: 0,
  timecardPages: 0,
  urgency: false,
};
const table: PriceTable = {
  version: "teste-1",
  isExample: true,
  base: { initial: 15000, liquidation: 25000, challenge: 30000, update: 10000 },
  perWage: 1000,
  includedWages: 1,
  perContractMonth: 200,
  includedContractMonths: 12,
  perTimecardUnit: 7000,
  timecardUnit: "month",
  perExtraClaimant: 5000,
  urgencyBasisPoints: 3000,
  businessDays: { simple: 3, medium: 5, high: 8 },
};
describe("preço em centavos", () => {
  it.each([
    ["initial", 15000],
    ["liquidation", 25000],
    ["challenge", 30000],
    ["update", 10000],
  ] as const)("calcula base %s", (calculationType, total) =>
    expect(
      calculateQuote({ ...answers, calculationType }, table).totalCents,
    ).toBe(total),
  );
  it.each([
    [{ wageItems: ["severance", "fgts"] }, "wages", 1000],
    [{ contractMonths: 14 }, "period", 400],
    [{ claimants: 2 }, "claimants", 5000],
    [{ timecardFormat: "handwritten", timecardMonths: 2 }, "timecards", 14000],
    [{ timecardFormat: "image", timecardMonths: 1 }, "timecards", 7000],
  ] as const)("discrimina adicional %s", (override, code, amountCents) => {
    const quote = calculateQuote(
      {
        ...answers,
        ...override,
        wageItems: [
          ...("wageItems" in override ? override.wageItems : answers.wageItems),
        ],
      } as PricingAnswers,
      table,
    );
    expect(quote.items.find((item) => item.code === code)?.amountCents).toBe(
      amountCents,
    );
    expect(quote.totalCents).toBe(15000 + amountCents);
  });
  it("digita por página conforme versão da tabela", () =>
    expect(
      calculateQuote(
        { ...answers, timecardFormat: "image", timecardPages: 3 },
        { ...table, timecardUnit: "page", perTimecardUnit: 100 },
      ).totalCents,
    ).toBe(15300));
  it("não cobra digitação de cartões digitais", () =>
    expect(
      calculateQuote(
        { ...answers, timecardFormat: "digital", timecardMonths: 10 },
        table,
      ).totalCents,
    ).toBe(15000));
  it("urgência incide sobre o subtotal completo", () => {
    const quote = calculateQuote(
      { ...answers, contractMonths: 14, urgency: true },
      table,
    );
    expect(quote).toMatchObject({
      subtotalCents: 15400,
      urgencyCents: 4620,
      totalCents: 20020,
      depositCents: 10010,
      balanceCents: 10010,
      tableVersion: "teste-1",
      isExample: true,
    });
    expect(quote.items.at(-1)?.code).toBe("urgency");
  });
  it("arredonda urgência e sinal sem perder um centavo", () => {
    const quote = calculateQuote(
      { ...answers, urgency: true },
      { ...table, base: { initial: 5 }, urgencyBasisPoints: 1000 },
    );
    expect(quote).toMatchObject({
      urgencyCents: 1,
      totalCents: 6,
      depositCents: 3,
      balanceCents: 3,
    });
    expect(
      calculateQuote(answers, { ...table, base: { initial: 5 } }),
    ).toMatchObject({ depositCents: 3, balanceCents: 2 });
  });
  it("preserva serviço gratuito e não adiciona itens gratuitos", () => {
    const quote = calculateQuote(
      { ...answers, claimants: 2, wageItems: ["a", "b"] },
      { ...table, base: { initial: 0 }, perExtraClaimant: 0, perWage: 0 },
    );
    expect(quote.items).toHaveLength(1);
    expect(quote.totalCents).toBe(0);
    expect(quote.businessDays).toBe(8);
  });
  it("não cobra verba repetida", () =>
    expect(
      calculateQuote({ ...answers, wageItems: ["a", "a"] }, table).totalCents,
    ).toBe(15000));
  it("ignora urgência zero", () =>
    expect(
      calculateQuote(
        { ...answers, urgency: true },
        { ...table, urgencyBasisPoints: 0 },
      ).items,
    ).toHaveLength(1));
  it.each([
    { base: {} },
    { version: " " },
    { perWage: -1 },
    { includedWages: 1.1 },
    { base: { initial: NaN } },
    { timecardUnit: "invalid" },
    { businessDays: { simple: 0, medium: 5, high: 8 } },
    { businessDays: { medium: 5, high: 8 } },
  ])("recusa tabela incompleta ou inválida %j", (override) =>
    expect(() =>
      calculateQuote(answers, { ...table, ...override } as PriceTable),
    ).toThrow(),
  );
  it("recusa quantidade fracionada", () =>
    expect(() =>
      calculateQuote({ ...answers, contractMonths: 1.2 }, table),
    ).toThrow());
  it("recusa multiplicação fora do limite de inteiro seguro", () =>
    expect(() =>
      calculateQuote(
        { ...answers, claimants: 3 },
        { ...table, perExtraClaimant: Number.MAX_SAFE_INTEGER },
      ),
    ).toThrow());
  it("recusa soma acima do limite", () =>
    expect(() =>
      calculateQuote(
        { ...answers, claimants: 2 },
        { ...table, base: { initial: Number.MAX_SAFE_INTEGER } },
      ),
    ).toThrow());
});
