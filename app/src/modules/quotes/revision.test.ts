import { describe, expect, it } from "vitest";
import {
  parseRevisionForm,
  revisionTotals,
  revisionIntentSchema,
  revisionMoneyInput,
} from "./revision";
import type { Proposal } from "./proposal";
const proposal = {
  items: [
    {
      code: "base",
      description: "Cálculo",
      quantity: 3,
      unitCents: 100,
      amountCents: 300,
    },
    {
      code: "extra",
      description: "Adicional",
      quantity: 1,
      unitCents: 200,
      amountCents: 200,
    },
  ],
} as Proposal;
function form(base = "100,01", reason = "Ajuste combinado") {
  const f = new FormData();
  f.set("price:base", base);
  f.set("price:extra", "0,00");
  f.set("reason", reason);
  return f;
}
describe("ajuste de orçamento", () => {
  it("recalcula quantidades e divide centavo ímpar sem ponto flutuante", () => {
    expect(parseRevisionForm(form(), proposal)).toEqual({
      reason: "Ajuste combinado",
      items: [
        { code: "base", unitCents: 10001 },
        { code: "extra", unitCents: 0 },
      ],
      totalCents: 30003,
      depositCents: 15002,
      balanceCents: 15001,
    });
    expect(proposal.items[0].unitCents).toBe(100);
  });
  it.each(["-1", "1.234,56", "1,001", "1e3", "", "NaN"])(
    "recusa entrada monetária ambígua %s",
    (value) =>
      expect(() => parseRevisionForm(form(value), proposal)).toThrow(
        "Valor de Cálculo",
      ),
  );
  it.each([" ", "x".repeat(1001)])("exige motivo válido", (reason) =>
    expect(() => parseRevisionForm(form("2,00", reason), proposal)).toThrow(
      "Motivo",
    ),
  );
  it("recusa divergência de itens e estouro no total", () => {
    expect(() =>
      revisionTotals(proposal, [{ code: "errado", unitCents: 1 }]),
    ).toThrow();
    expect(() =>
      revisionTotals(proposal, [
        { code: "base", unitCents: Number.MAX_SAFE_INTEGER },
        { code: "extra", unitCents: 0 },
      ]),
    ).toThrow("limite");
  });
  it("não permite itens extras nem valores fracionários no comando", () =>
    expect(
      revisionIntentSchema.safeParse({
        quoteId: crypto.randomUUID(),
        contextHash: "a".repeat(64),
        version: 1,
        orderRevision: 0,
        requestId: crypto.randomUUID(),
        reason: "fictício",
        items: [{ code: "base", unitCents: 1.5 }],
      }).success,
    ).toBe(false));
});

it("preserva cada centavo no preenchimento até o limite seguro", () => {
  expect(revisionMoneyInput(Number.MAX_SAFE_INTEGER)).toBe("90071992547409,91");
  const f = form(revisionMoneyInput(10001));
  expect(parseRevisionForm(f, proposal).items[0].unitCents).toBe(10001);
});
