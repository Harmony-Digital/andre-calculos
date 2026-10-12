import { expect, it } from "vitest";
import { creditFixture } from "@/modules/payments/order-credit-fixture";
import { parseDeliveryDisplay } from "./display-context";
const processId = "00000000-0000-4000-8000-000000000301";
const firstId = "00000000-0000-4000-8000-000000000201";
const secondId = "00000000-0000-4000-8000-000000000202";
function context(
  id = firstId,
  releasePolicy: "before_balance" | "after_balance" | null = "after_balance",
  credit = creditFixture(),
) {
  return {
    schemaVersion: 1 as const,
    semantics: "current_delivery_access" as const,
    effects: "none" as const,
    deliveryId: id,
    orderId: credit.orderId,
    processId,
    orderStatus: "delivered" as const,
    releasePolicy,
    credit,
  };
}
function payment(row = context()) {
  return {
    deliveryId: row.deliveryId,
    orderId: row.orderId,
    orderCode: "Pedido fictício",
    remainingCents: row.credit.projection.remainingTotalCents,
    pixKey: null as string | null,
    credit: row.credit,
  };
}
function display(contexts = [context()], payments = [payment()]) {
  return {
    schemaVersion: 1,
    semantics: "delivery_display",
    effects: "none",
    contexts,
    payments,
  };
}
function expected(row = context(), created_at = "2026-10-12T10:00:00.000001Z") {
  return { id: row.deliveryId, order_id: row.orderId, created_at };
}
it("apresentação valida contexto e saldo de uma mesma projeção, sem efeitos", () => {
  const result = parseDeliveryDisplay(display(), processId, [expected()]);
  expect(result.contexts.get(firstId)).toEqual(context());
  expect(result.payments.get(firstId)).toEqual(payment());
});
it("lote vazio e política antes do saldo não inventam obrigação", () => {
  expect(
    parseDeliveryDisplay(display([], []), processId, []).contexts.size,
  ).toBe(0);
  const row = context(firstId, "before_balance");
  expect(
    parseDeliveryDisplay(display([row], []), processId, [expected(row)])
      .payments.size,
  ).toBe(0);
  expect(() =>
    parseDeliveryDisplay(display([row], [payment(row)]), processId, [
      expected(row),
    ]),
  ).toThrow();
});
it("saldo totalmente pago mantém sua leitura atual, sem exigir Pix", () => {
  const credit = creditFixture({
    depositCreditCents: 12501,
    totalCreditCents: 25002,
    remainingDepositCents: 0,
    remainingTotalCents: 0,
  });
  const row = context(firstId, "after_balance", credit);
  expect(
    parseDeliveryDisplay(display([row], [payment(row)]), processId, [
      expected(row),
    ]).payments.get(firstId)?.remainingCents,
  ).toBe(0);
});
it("UNKNOWN conserva ausência de valor restante e recusa Pix", () => {
  const credit = creditFixture({
    depositUncertain: true,
    uncertain: true,
    depositCreditCents: null,
    totalCreditCents: null,
    remainingDepositCents: null,
    remainingTotalCents: null,
    depositExcessCents: null,
    totalExcessCents: null,
  });
  const row = context(firstId, "after_balance", credit);
  expect(
    parseDeliveryDisplay(display([row], [payment(row)]), processId, [
      expected(row),
    ]).payments.get(firstId)?.remainingCents,
  ).toBeNull();
  expect(() =>
    parseDeliveryDisplay(
      display([row], [{ ...payment(row), pixKey: "ficticio" }]),
      processId,
      [expected(row)],
    ),
  ).toThrow();
});
it("duas entregas do mesmo pedido recebem uma única obrigação, pela data em microssegundos", () => {
  const first = context(),
    second = context(secondId);
  const metadata = [
    expected(second, "2026-10-12T10:00:00.100001Z"),
    expected(first, "2026-10-12T10:00:00.100002Z"),
  ];
  expect(
    parseDeliveryDisplay(
      display([second, first], [payment(first)]),
      processId,
      metadata,
    ).payments.has(firstId),
  ).toBe(true);
  expect(() =>
    parseDeliveryDisplay(
      display([second, first], [payment(second)]),
      processId,
      metadata,
    ),
  ).toThrow();
});
it("mesmo instante em fusos diferentes desempata por UUID, sem depender da ordem do retorno", () => {
  const first = context(),
    second = context(secondId);
  const metadata = [
    expected(first, "2026-10-12T07:00:00.1-03:00"),
    expected(second, "2026-10-12T10:00:00.100000Z"),
  ];
  expect(
    parseDeliveryDisplay(
      display([first, second], [payment(second)]),
      processId,
      metadata,
    ).payments.has(secondId),
  ).toBe(true);
});
it("regra capturada antes do saldo não substitui a obrigação da entrega anterior depois do saldo", () => {
  const first = context(),
    second = context(secondId, "before_balance");
  expect(
    parseDeliveryDisplay(
      display([first, second], [payment(first)]),
      processId,
      [expected(first), expected(second, "2026-10-13T10:00:00Z")],
    ).payments.has(firstId),
  ).toBe(true);
});
it("leitura financeira de outro snapshot ou pedido não aparece junto do contexto", () => {
  const credit = creditFixture({
    depositCreditCents: 1000,
    totalCreditCents: 1000,
    remainingDepositCents: 11501,
    remainingTotalCents: 24002,
  });
  const changed = context(firstId, "after_balance", credit);
  expect(() =>
    parseDeliveryDisplay(display([context()], [payment(changed)]), processId, [
      expected(),
    ]),
  ).toThrow();
  const other = context(secondId);
  expect(() =>
    parseDeliveryDisplay(display([context()], [payment(other)]), processId, [
      expected(),
    ]),
  ).toThrow();
});
it("saldo ausente ou duplicado e lote parcial são recusados", () => {
  for (const value of [
    display([context()], []),
    display([context()], [payment(), payment()]),
    display([], [payment()]),
  ])
    expect(() =>
      parseDeliveryDisplay(value, processId, [expected()]),
    ).toThrow();
});
it("envelope rejeita semântica, versão, efeitos ou campos extras", () => {
  for (const patch of [
    { schemaVersion: 2 },
    { semantics: "receipt_snapshot" },
    { effects: "write" },
    { privateConfig: {} },
  ])
    expect(() =>
      parseDeliveryDisplay({ ...display(), ...patch }, processId, [expected()]),
    ).toThrow();
});
it("identidade, data fora do contrato e cinquenta e um registros não são aceitos", () => {
  for (const rows of [
    [{ ...expected(), order_id: secondId }],
    [{ ...expected(), created_at: "2026-10-12" }],
    Array(51).fill(expected()),
  ])
    expect(() => parseDeliveryDisplay(display(), processId, rows)).toThrow();
});
