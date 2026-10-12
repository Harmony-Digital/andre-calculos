import { expect, it } from "vitest";
import {
  calculatePrice,
  calculateQuote,
  type PricingAnswers,
} from "@/modules/quotes/pricing";
import { demoPriceTable } from "@/modules/demo/model";
import { publicPriceSchema, parseSimulator, estimatePrice } from "./model";
const { businessDays, complexitySettings, ...publicTable } = demoPriceTable;
void complexitySettings;
function form(patch: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    calculationType: "initial",
    wageCount: "1",
    contractMonths: "36",
    claimants: "1",
    timecardFormat: "none",
    timecardQuantity: "0",
    urgency: "no",
    ...patch,
  }))
    f.set(k, v);
  return f;
}
it.each(["initial", "liquidation", "challenge", "update"] as const)(
  "mesmas entradas e tabela produzem preço completo para%s sem prazo público",
  (calculationType) => {
    const f = form({
      calculationType,
      wageCount: "3",
      contractMonths: "40",
      claimants: "2",
      timecardFormat: "image",
      timecardQuantity: "3",
      urgency: "yes",
    });
    const input = parseSimulator(f);
    expect(input.success).toBe(true);
    if (!input.success) throw new Error("Fixture inválida.");
    const estimate = estimatePrice(input.data, publicTable);
    const answer: PricingAnswers = {
      calculationType,
      wageItems: [
        "simulation_wage_1",
        "simulation_wage_2",
        "simulation_wage_3",
      ],
      contractMonths: 40,
      claimants: 2,
      timecardFormat: "image",
      timecardMonths: 3,
      timecardPages: 0,
      urgency: true,
      processPages: 0,
    };
    const quote = calculateQuote(answer, demoPriceTable);
    expect(estimate.totalCents).toBe(quote.totalCents);
    expect(estimate.items).toEqual(quote.items);
    expect(estimate).toEqual(estimatePrice(input.data, publicTable));
    expect(Object.keys(estimate).sort()).toEqual([
      "isExample",
      "items",
      "tableVersion",
      "totalCents",
    ]);
  },
);
it("discrimina todos os adicionais e mantém arredondamento em centavos", () => {
  const input = parseSimulator(
    form({
      wageCount: "3",
      contractMonths: "40",
      claimants: "2",
      timecardFormat: "handwritten",
      timecardQuantity: "3",
      urgency: "yes",
    }),
  );
  if (!input.success) throw new Error("Fixture inválida.");
  const value = estimatePrice(input.data, publicTable);
  expect(value.totalCents).toBe(108810);
  expect(value.items.map((i) => i.code)).toEqual([
    "base",
    "wages",
    "period",
    "timecards",
    "claimants",
    "urgency",
  ]);
  const small = {
    ...publicTable,
    base: { ...publicTable.base, initial: 5 },
    urgencyBasisPoints: 1000,
  };
  const one = parseSimulator(form({ urgency: "yes" }));
  if (!one.success) throw new Error("Fixture inválida.");
  expect(estimatePrice(one.data, small).totalCents).toBe(6);
});
it("unidade página usa quantidade informada sem inventar meses", () => {
  const input = parseSimulator(
    form({ timecardFormat: "image", timecardQuantity: "2" }),
  );
  if (!input.success) throw new Error("Fixture inválida.");
  expect(
    estimatePrice(input.data, {
      ...publicTable,
      timecardUnit: "page",
      perTimecardUnit: 125,
    }).totalCents,
  ).toBe(35250);
});
it("digital não cobra digitação e valores gratuitos permanecem discriminados", () => {
  const input = parseSimulator(
    form({ timecardFormat: "digital", timecardQuantity: "10" }),
  );
  if (!input.success) throw new Error("Fixture inválida.");
  expect(estimatePrice(input.data, publicTable).totalCents).toBe(35000);
  expect(
    estimatePrice(input.data, {
      ...publicTable,
      base: { ...publicTable.base, initial: 0 },
    }).items,
  ).toEqual([
    {
      code: "base",
      description: "Serviço de cálculo",
      quantity: 1,
      unitCents: 0,
      amountCents: 0,
    },
  ]);
});
it.each(["", "-1", "1.5", "1e3", "Infinity", "99999"])(
  "entrada inválida%s não produz estimativa",
  (wageCount) =>
    expect(parseSimulator(form({ wageCount })).success).toBe(false),
);
it("limites e campos obrigatórios bloqueiam números fora da faixa", () => {
  const patches: Record<string, string>[] = [
    { wageCount: "101" },
    { contractMonths: "1201" },
    { claimants: "0" },
    { claimants: "101" },
    { timecardQuantity: "3001" },
    { calculationType: "unknown" },
    { timecardFormat: "unknown" },
    { urgency: "unknown" },
  ];
  for (const patch of patches)
    expect(parseSimulator(form(patch)).success).toBe(false);
  const f = form();
  f.delete("contractMonths");
  expect(parseSimulator(f).success).toBe(false);
});
it("cartões para digitação exigem quantidade positiva e erro tem campo português", () => {
  const input = parseSimulator(form({ timecardFormat: "image" }));
  expect(input.success).toBe(false);
  if (!input.success)
    expect(input.error.issues[0]).toMatchObject({
      path: ["timecardQuantity"],
      message: "Informe a quantidade de cartões para digitação.",
    });
});
it("não aceita dados pessoais, arquivo ou campos externos ao checklist curto", () => {
  expect(parseSimulator(form({ cnj: "PROCESSO_FICTICIO" })).success).toBe(
    false,
  );
  const f = form();
  f.set("wageCount", new Blob(["fixture"]), "ficticio.txt");
  const result = parseSimulator(f);
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.issues[0].message).toContain("quantidade de verbas");
});
it("projeção pública rejeita configuração completa, valores inseguros e tipos inválidos", () => {
  expect(publicPriceSchema.safeParse(publicTable).success).toBe(true);
  expect(
    publicPriceSchema.safeParse({ ...publicTable, businessDays }).success,
  ).toBe(false);
  expect(
    publicPriceSchema.safeParse({ ...publicTable, pixKey: "FICTICIO" }).success,
  ).toBe(false);
  expect(
    publicPriceSchema.safeParse({
      ...publicTable,
      base: { ...publicTable.base, privateField: 1 },
    }).success,
  ).toBe(false);
  for (const perWage of [-1, 1.1, Infinity, Number.MAX_SAFE_INTEGER])
    expect(
      publicPriceSchema.safeParse({ ...publicTable, perWage }).success,
    ).toBe(false);
  expect(publicPriceSchema.safeParse(null).success).toBe(false);
});
it("motor de preço puro valida reclamantes e não precisa receber calendário", () => {
  const input = {
    calculationType: "initial",
    wageItems: ["a"],
    contractMonths: 36,
    claimants: 1,
    timecardFormat: "none",
    timecardMonths: 0,
    timecardPages: 0,
    urgency: false,
  } as const;
  expect(calculatePrice(input, publicTable).totalCents).toBe(35000);
  expect(() => calculatePrice({ ...input, claimants: 0 }, publicTable)).toThrow(
    "reclamantes",
  );
});
