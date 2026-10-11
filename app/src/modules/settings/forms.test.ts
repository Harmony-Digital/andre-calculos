import { describe, it, expect } from "vitest";
import {
  parsePrices,
  priceParameters,
  parseSettings,
  centsInput,
} from "./forms";
function prices() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    initial: "150,01",
    liquidation: "250",
    challenge: "300.00",
    update: "100",
    perWage: "0",
    includedWages: "1",
    perContractMonth: "0",
    includedContractMonths: "12",
    perTimecardUnit: "70",
    timecardUnit: "month",
    perExtraClaimant: "0",
    urgency: "30,01",
    simpleDays: "3",
    mediumDays: "5",
    highDays: "8",
    expectedVersion: "1",
    isExample: "yes",
  }))
    form.set(key, value);
  return form;
}
function settings() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    technicalName: "",
    crcNumber: "",
    crcState: "",
    crcCategory: "",
    contactEmail: "",
    contactPhone: "",
    pixKey: "",
    slackDays: "2",
    quoteValidDays: "7",
    wageThreshold: "6",
    pageThreshold: "1000",
    claimantThreshold: "1",
    morningTime: "09:00",
    eveningTime: "17:00",
    conditions: "",
    guarantee: "",
    revision: "1",
  }))
    form.set(key, value);
  return form;
}
describe("configuração de preços e serviço", () => {
  it("converte reais e percentual sem arredondamento de ponto flutuante", () => {
    const parsed = parsePrices(prices());
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error();
    const params = priceParameters(parsed.data);
    expect(params.base.initial).toBe(15001);
    expect(params.base.challenge).toBe(30000);
    expect(params.urgencyBasisPoints).toBe(3001);
    expect(centsInput(15001)).toBe("150,01");
  });
  it.each(["", "-1", "1e4", "150,001", "1.234,56", "10000000,01"])(
    "rejeita dinheiro inválido %s",
    (value) => {
      const form = prices();
      form.set("initial", value);
      expect(parsePrices(form).success).toBe(false);
    },
  );
  it("ativa somente com validação explícita; exemplo não exige ativação", () => {
    const form = prices();
    form.delete("isExample");
    expect(parsePrices(form).success).toBe(false);
    form.set("approved", "yes");
    expect(parsePrices(form).success).toBe(true);
  });
  it("exige dias úteis inteiros positivos", () => {
    const form = prices();
    form.set("simpleDays", "0");
    expect(parsePrices(form).success).toBe(false);
    form.set("simpleDays", "3.5");
    expect(parsePrices(form).success).toBe(false);
  });
  it("permite começar sem identificação e exige os quatro dados ao preencher", () => {
    const form = settings();
    expect(parseSettings(form).success).toBe(true);
    form.set("technicalName", "Profissional fictício");
    expect(parseSettings(form).success).toBe(false);
    form.set("crcNumber", "000001/O-0");
    form.set("crcState", "DF");
    form.set("crcCategory", "Contador");
    expect(parseSettings(form).success).toBe(true);
  });
  it("não aceita aprovação legal vinda do formulário de configurações", () => {
    const form = settings();
    form.set("approved_terms_version", "injetada");
    const parsed = parseSettings(form);
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(parsed.data).not.toHaveProperty("approved_terms_version");
  });
  it("valida celular e horários", () => {
    const form = settings();
    form.set("contactPhone", "(61) 99999-9999");
    const parsed = parseSettings(form);
    expect(parsed.success && parsed.data.contactPhone).toBe("+5561999999999");
    form.set("morningTime", "24:00");
    expect(parseSettings(form).success).toBe(false);
  });
});

it("janela é independente dos horários pontuais e exige início antes do fim", () => {
  const form = settings();
  form.set("deadlineWindowStart", "07:00");
  form.set("deadlineWindowEnd", "21:00");
  expect(parseSettings(form).success).toBe(true);
  form.set("deadlineWindowEnd", "07:00");
  expect(parseSettings(form).success).toBe(false);
  form.delete("deadlineWindowEnd");
  expect(parseSettings(form).success).toBe(false);
  form.delete("deadlineWindowStart");
  expect(parseSettings(form).success).toBe(true);
});
