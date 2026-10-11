import { describe, expect, it } from "vitest";
import {
  evaluateProposal,
  proposalSchema,
  proposalValidity,
  type EvaluationInput,
} from "./proposal";
import { quoteFixtureInputs, quoteFixturesEnabled } from "./local-fixtures";
import { fictionalChecklist } from "@/modules/checklist/fixtures";
import { examplePriceTable } from "./example-table";
const now = new Date("2026-10-13T15:00:00.000Z");
function input(): EvaluationInput {
  const answers = { ...fictionalChecklist, noticeDate: "2026-10-13" };
  return {
    now,
    mode: "fixture",
    orderId: "11111111-1111-4111-8111-111111111111",
    processId: "22222222-2222-4222-8222-222222222222",
    checklistRevision: 9,
    settingsRevision: 1,
    professional: {
      name: "Responsável fictício",
      crcNumber: "000001/O-0",
      crcState: "DF",
      category: "Contador",
      email: "calculista@exemplo.com",
      phone: "+5561999999999",
    },
    conditions: "Condições fictícias sem cobrança.",
    validityDays: 7,
    slackDays: 2,
    answers,
    prices: {
      id: "33333333-3333-4333-8333-333333333333",
      active: true,
      activatedAt: now.toISOString(),
      table: {
        ...examplePriceTable,
        base: { ...examplePriceTable.base, liquidation: 25001 },
        version: "1",
      },
    },
    ...quoteFixtureInputs(now, answers),
  };
}
describe("proposta determinística com fontes explícitas", () => {
  it("fecha centavos ímpares, snapshot, validade civil e cadeia de prazo", () => {
    const result = evaluateProposal(input());
    expect(result.status).toBe("fixture_ready");
    if (result.status === "blocked") throw new Error();
    expect(result.proposal).toMatchObject({
      totalCents: 25001,
      depositCents: 12501,
      balanceCents: 12500,
      validUntil: "2026-10-20T15:00:00.000Z",
      deliveryDate: "2026-10-16",
      internalDueDate: "2026-10-21",
      dueDate: "2026-10-23",
    });
    expect(proposalSchema.safeParse(result.proposal).success).toBe(true);
  });
  it.each([
    "prices",
    "professional",
    "calendar",
    "capacity",
    "period",
  ] as const)("bloqueia insumo ausente: %s", (key) => {
    expect(evaluateProposal({ ...input(), [key]: null })).toMatchObject({
      status: "blocked",
      reasons: expect.arrayContaining([key]),
    });
  });
  it("não transforma dados de ensaio em aprovação comercial", () => {
    expect(evaluateProposal({ ...input(), mode: "commercial" })).toMatchObject({
      status: "blocked",
      reasons: ["prices", "calendar", "capacity", "period"],
    });
  });
  it("avalia entradas comerciais revisadas sem inferir aprovações", () => {
    const i = input();
    i.mode = "commercial";
    i.prices!.table.isExample = false;
    for (const source of [i.period!, i.calendar!, i.capacity!])
      source.basis = "reviewed";
    expect(evaluateProposal(i).status).toBe("commercial_ready");
  });
  it.each([false, true])(
    "não usa tabela inativa nem exemplo no modo comercial (%s)",
    (isExample) => {
      const i = input();
      i.mode = "commercial";
      i.prices!.active = false;
      i.prices!.table.isExample = isExample;
      expect(evaluateProposal(i)).toMatchObject({
        status: "blocked",
        reasons: expect.arrayContaining(["prices"]),
      });
    },
  );
  it("exige quantidade de cartões na unidade efetivamente cobrada", () => {
    const i = input();
    i.answers = {
      ...fictionalChecklist,
      timecardFormat: "image",
      timecardMonths: 2,
      timecardPages: 0,
    };
    i.prices!.table.timecardUnit = "page";
    expect(evaluateProposal(i)).toEqual({
      status: "blocked",
      reasons: ["timecards"],
    });
  });
  it("não trata data-base como fim de contrato sem demissão", () => {
    const i = input();
    i.answers = { ...fictionalChecklist, dismissalDate: "" };
    i.period = null;
    expect(evaluateProposal(i)).toMatchObject({
      status: "blocked",
      reasons: ["period"],
    });
  });
  it("não aceita período diferente das datas salvas", () => {
    const i = input();
    i.period!.endDate = "2025-04-11";
    expect(evaluateProposal(i)).toMatchObject({
      status: "blocked",
      reasons: ["period"],
    });
  });
  it.each([0, -1, 1])(
    "capacidade suficiente tem fronteira exata (%s)",
    (delta) => {
      const i = input();
      i.capacity!.availableBusinessDays =
        i.prices!.table.businessDays.simple + delta;
      expect(evaluateProposal(i).status).toBe(
        delta < 0 ? "blocked" : "fixture_ready",
      );
    },
  );
  it("recusa agenda vencida exatamente no instante de emissão", () => {
    const i = input();
    i.capacity!.validUntil = now.toISOString();
    expect(evaluateProposal(i)).toMatchObject({
      status: "blocked",
      reasons: ["capacity"],
    });
  });
  it("não vende urgência sem disponibilidade nem comprime dias", () => {
    const i = input();
    i.answers = { ...(i.answers as object), urgency: true };
    i.capacity!.urgencyAvailable = false;
    expect(evaluateProposal(i)).toEqual({
      status: "blocked",
      reasons: ["deadline"],
    });
  });
  it("recusa conclusão posterior ao prazo interno", () => {
    const i = input();
    i.capacity!.startDate = "2026-10-21";
    expect(evaluateProposal(i)).toEqual({
      status: "blocked",
      reasons: ["deadline"],
    });
  });
  it("bloqueia calendário de outro TRT", () => {
    const i = input();
    i.calendar!.tribunal = 1;
    expect(evaluateProposal(i)).toEqual({
      status: "blocked",
      reasons: ["calendar"],
    });
  });
  it("folga igual ao prazo processual não gera uma data", () => {
    expect(evaluateProposal({ ...input(), slackDays: 8 })).toEqual({
      status: "blocked",
      reasons: ["configuration"],
    });
  });
  it("snapshot rejeita valores adulterados e mistura comercial/fictícia", () => {
    const r = evaluateProposal(input());
    if (r.status === "blocked") throw new Error();
    expect(
      proposalSchema.safeParse({ ...r.proposal, totalCents: 1 }).success,
    ).toBe(false);
    expect(
      proposalSchema.safeParse({ ...r.proposal, mode: "commercial" }).success,
    ).toBe(false);
  });
});
describe("validade e isolamento do ensaio", () => {
  it.each([
    "2026-12-31T02:59:59.999Z",
    "2027-01-01T03:00:00.000Z",
    "2024-02-28T03:00:00.000Z",
  ])("dias civis preservam hora SP em %s", (value) => {
    expect(
      new Date(proposalValidity(new Date(value), 7)).getTime() -
        new Date(value).getTime(),
    ).toBe(7 * 86400000);
  });
  it.each([0, 366, 1.5])("rejeita validade inválida %s", (days) =>
    expect(() => proposalValidity(now, days)).toThrow(),
  );
  it("exige opt-in, destino local exato e ausência de Vercel", () => {
    const env = {
      ANDRE_QUOTE_FIXTURES: "1",
      ANDRE_LOCAL_TESTS: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    };
    expect(quoteFixturesEnabled(env)).toBe(true);
    for (const patch of [
      { ANDRE_QUOTE_FIXTURES: undefined },
      { ANDRE_LOCAL_TESTS: undefined },
      { NEXT_PUBLIC_SUPABASE_URL: "https://qtofwbxujshroaafxowr.supabase.co" },
      { VERCEL_ENV: "preview" },
    ])
      expect(quoteFixturesEnabled({ ...env, ...patch })).toBe(false);
  });
});
