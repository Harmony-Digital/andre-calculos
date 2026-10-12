import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseInvoicePresentation } from "./invoice-presentation";
const orderId = "a0000000-0000-4000-8000-000000000201";
const processId = "b0000000-0000-4000-8000-000000000301";
const scope = {
  provider: "asaas",
  environment: "sandbox",
  accountId: "acct_fixture",
  walletId: "wallet_fixture",
};
const expected = { orderId, processId, scope };
const active = {
  schemaVersion: 1,
  semantics: "invoice_presentation",
  effects: "none",
  mode: "fixture",
  phase: "deposit",
  orderId,
  processId,
  state: "active",
  reason: "pending",
  remainingCents: 12501,
  dueDate: "2026-10-20",
  billingType: "PIX",
  invoiceUrl: "https://sandbox.asaas.com/i/ficticio",
};
const parse = (patch: Record<string, unknown> = {}) =>
  parseInvoicePresentation({ ...active, ...patch }, expected);
it("fatura ativa exige valor, vencimento, meio e URL privados conferidos", () => {
  expect(parse()).toEqual(active);
});
it("IDs esperados e retornados são normalizados sem mudar o vínculo", () => {
  expect(
    parseInvoicePresentation(
      {
        ...active,
        orderId: orderId.toUpperCase(),
        processId: processId.toUpperCase(),
      },
      { ...expected, orderId: orderId.toUpperCase() },
    ),
  ).toEqual(active);
});
it.each(["BOLETO", "CREDIT_CARD", "UNDEFINED"])(
  "meio %s conserva o valor sem capturar dados de cartão",
  (billingType) => {
    expect(parse({ billingType }).remainingCents).toBe(12501);
  },
);
it("pagamento confirmado exige saldo zero e não disponibiliza fatura para outro pagamento", () => {
  expect(
    parse({
      state: "paid",
      reason: "credit_confirmed",
      remainingCents: 0,
      invoiceUrl: null,
    }).state,
  ).toBe("paid");
  expect(() =>
    parse({
      state: "paid",
      reason: "credit_confirmed",
      remainingCents: 1,
      invoiceUrl: null,
    }),
  ).toThrow();
});
it.each(["client_contract", "no_deposit"])(
  "%s dispensa o sinal sem declarar recebimento",
  (reason) => {
    expect(
      parse({
        state: "blocked",
        reason,
        remainingCents: 0,
        invoiceUrl: null,
        dueDate: null,
        billingType: null,
      }).state,
    ).toBe("blocked");
    expect(() =>
      parse({
        state: "blocked",
        reason,
        remainingCents: 100,
        invoiceUrl: null,
      }),
    ).toThrow();
  },
);
it("conciliação mantém valor desconhecido nulo, nunca zero conhecido", () => {
  expect(
    parse({
      state: "uncertain",
      reason: "reconciliation",
      remainingCents: null,
      invoiceUrl: null,
    }).remainingCents,
  ).toBeNull();
  expect(() =>
    parse({
      state: "uncertain",
      reason: "reconciliation",
      remainingCents: 0,
      invoiceUrl: null,
    }),
  ).toThrow();
});
it.each([
  "provider_not_ready",
  "no_invoice",
  "protected_execution",
  "context_changed",
  "unsupported_payment",
  "invalid_invoice",
])("bloqueio %s não conserva URL antiga", (reason) => {
  expect(
    parse({ state: "blocked", reason, invoiceUrl: null }).invoiceUrl,
  ).toBeNull();
  expect(() => parse({ state: "blocked", reason })).toThrow();
});
it.each([
  "http://sandbox.asaas.com/i/ficticio",
  "https://www.asaas.com/i/ficticio",
  "https://sandbox.asaas.com.evil.example/i/ficticio",
  "https://usuario:senha@sandbox.asaas.com/i/ficticio",
  "https://sandbox.asaas.com/i/ficticio?autoRedirect=true",
  "https://sandbox.asaas.com/i/ficticio#fragmento",
  "https://sandbox.asaas.com/fora/ficticio",
])("origem/formato não autorizado é recusado: %s", (invoiceUrl) => {
  expect(() => parse({ invoiceUrl })).toThrow();
});
it("estado, motivo e envelope incoerentes não liberam fatura", () => {
  for (const patch of [
    { state: "active", reason: "reconciliation" },
    { state: "paid", reason: "pending", remainingCents: 0, invoiceUrl: null },
    { schemaVersion: 2 },
    { semantics: "historical_receipt" },
    { effects: "write" },
    { mode: "production" },
    { phase: "balance" },
    { state: "unknown" },
    { privateCustomer: {} },
    { document: "dado-ficticio" },
    { creditCard: {} },
  ])
    expect(() => parse(patch)).toThrow();
});
it("pedido/processo diferente e ambiente real não são aceitos no preparo fictício", () => {
  expect(() => parse({ orderId: processId })).toThrow();
  expect(() => parse({ processId: orderId })).toThrow();
  expect(() =>
    parseInvoicePresentation(active, {
      ...expected,
      scope: { ...scope, environment: "production" },
    }),
  ).toThrow();
});
it("valores inseguros, data impossível, meio ausente ou resposta parcial ficam bloqueados", () => {
  for (const patch of [
    { remainingCents: -1 },
    { remainingCents: 0 },
    { remainingCents: 1.1 },
    { remainingCents: Number.MAX_SAFE_INTEGER + 1 },
    { remainingCents: null },
    { dueDate: "2025-02-29" },
    { dueDate: null },
    { billingType: null },
    { billingType: "DEBIT_CARD" },
    { invoiceUrl: null },
  ])
    expect(() => parse(patch)).toThrow();
});
