import { expect, it } from "vitest";
import { creditFixture } from "./order-credit-fixture";
import {
  currentOrderCreditSchema,
  parseCurrentOrderCredits,
  parseDeliveryCredits,
  observedCredit,
  creditStateMessage,
} from "./order-credit";
import { depositInfoSchema, depositReceiptSchema } from "./deposit";
import { queuePaymentStatus, queuePaymentNote } from "@/modules/queue/queue";
const other = "00000000-0000-4000-8000-000000000102";
const uncertain = () =>
  creditFixture({
    depositUncertain: true,
    uncertain: true,
    depositCreditCents: null,
    totalCreditCents: null,
    remainingDepositCents: null,
    remainingTotalCents: null,
    depositExcessCents: null,
    totalExcessCents: null,
    partial: null,
    providerObservedDepositCents: 12501,
    providerObservedTotalCents: 12501,
  });
const info = (credit = creditFixture()) => ({
  orderId: credit.orderId,
  quoteId: other,
  processId: other,
  code: "Pedido fictício",
  status: "awaiting_payment",
  contextHash: "a".repeat(64),
  requiredCents: 12501,
  confirmedCents: credit.projection.depositCreditCents,
  remainingCents: credit.projection.remainingDepositCents,
  credit,
  hasContract: credit.hasContract,
  pixKey: null,
  canConfirm: false,
  receipt: null,
  confirmedName: null,
  paymentStatus: null,
});
it("conciliação preserva subtotal sem inventar zero ou permitir nova instrução", () => {
  const credit = uncertain();
  expect(depositInfoSchema.parse(info(credit)).remainingCents).toBeNull();
  expect(observedCredit(credit.projection, "deposit")).toBe(12501);
  expect(queuePaymentStatus(credit)).toBe("Valores em conciliação");
  expect(queuePaymentNote(credit)).toContain("125,01");
  expect(creditStateMessage(credit)).toContain("conciliação");
  for (const patch of [
    { pixKey: "pix-ficticio" },
    { canConfirm: true },
    { remainingCents: 0 },
    { confirmedCents: 0 },
  ])
    expect(
      depositInfoSchema.safeParse({ ...info(credit), ...patch }).success,
    ).toBe(false);
});
it("parcial e excesso não são capados; reserva sem charge bloqueia Pix e confirmação positiva", () => {
  const partial = creditFixture({
    depositCreditCents: 10000,
    totalCreditCents: 10000,
    remainingDepositCents: 2501,
    remainingTotalCents: 15002,
    partial: true,
  });
  expect(
    depositInfoSchema.parse({
      ...info(partial),
      pixKey: "pix-ficticio",
      canConfirm: true,
    }).remainingCents,
  ).toBe(2501);
  const active = creditFixture({}, true);
  for (const patch of [{ pixKey: "pix-ficticio" }, { canConfirm: true }])
    expect(
      depositInfoSchema.safeParse({ ...info(active), ...patch }).success,
    ).toBe(false);
  expect(creditStateMessage(active)).toContain("em andamento");
  const excess = creditFixture({
    depositCreditCents: 13000,
    totalCreditCents: 13000,
    remainingDepositCents: 0,
    remainingTotalCents: 12002,
    depositExcessCents: 499,
  });
  expect(queuePaymentStatus(excess)).toBe("Crédito excedente");
  expect(queuePaymentNote(excess)).toContain("4,99");
  expect(
    depositInfoSchema.safeParse({ ...info(excess), canConfirm: true }).success,
  ).toBe(false);
});
it("conferência zero manual não atribui recebimento do provedor ao André", () => {
  const paid = {
    depositCreditCents: 12501,
    totalCreditCents: 12501,
    remainingDepositCents: 0,
    remainingTotalCents: 12501,
  };
  const provider = creditFixture(paid);
  expect(
    depositInfoSchema.safeParse({ ...info(provider), canConfirm: true })
      .success,
  ).toBe(false);
  const manual = creditFixture(
    { ...paid, manualDepositCents: 12501, manualTotalCents: 12501 },
    true,
  );
  expect(
    depositInfoSchema.parse({ ...info(manual), canConfirm: true }).canConfirm,
  ).toBe(true);
});
it("contrato vigente dispensa sinal sem quitar nem autorizar Pix do sinal", () => {
  const credit = creditFixture({}, false, true);
  expect(depositInfoSchema.parse(info(credit)).hasContract).toBe(true);
  expect(queuePaymentStatus(credit)).toBe("Contrato");
  for (const patch of [
    { hasContract: false },
    { canConfirm: true },
    { pixKey: "pix-ficticio" },
  ])
    expect(
      depositInfoSchema.safeParse({ ...info(credit), ...patch }).success,
    ).toBe(false);
});
it("lote rejeita dados ausentes, duplicados, de outro pedido e excesso de IDs", () => {
  const credit = creditFixture();
  expect(
    parseCurrentOrderCredits([credit], [credit.orderId]).get(credit.orderId),
  ).toEqual(credit);
  expect(parseCurrentOrderCredits([], []).size).toBe(0);
  for (const [rows, ids] of [
    [[], [credit.orderId]],
    [[credit], [other]],
    [
      [credit, credit],
      [credit.orderId, other],
    ],
    [[credit], [credit.orderId, credit.orderId]],
    [[credit], Array(51).fill(credit.orderId)],
  ] as const)
    expect(() => parseCurrentOrderCredits(rows, ids)).toThrow();
});
it("DTO corrente rejeita pedido divergente, restante incoerente e certeza falsa", () => {
  const credit = creditFixture();
  for (const patch of [
    { orderId: other },
    { collectionState: "active" },
    { projection: { ...credit.projection, remainingDepositCents: 1000 } },
    { projection: { ...credit.projection, depositCreditCents: null } },
    { receipt: {} },
  ])
    expect(
      currentOrderCreditSchema.safeParse({ ...credit, ...patch }).success,
    ).toBe(false);
  expect(
    currentOrderCreditSchema.safeParse({
      ...uncertain(),
      collectionState: "clear",
    }).success,
  ).toBe(false);
});
it("subtotal observado mantém ausência e protege overflow", () => {
  const p = creditFixture().projection;
  expect(
    observedCredit({ ...p, manualDepositCents: null }, "deposit"),
  ).toBeNull();
  expect(
    observedCredit(
      {
        ...p,
        manualTotalCents: Number.MAX_SAFE_INTEGER,
        providerObservedTotalCents: 1,
      },
      "total",
    ),
  ).toBeNull();
});
it("saldo usa restante atual, uma obrigação por pedido e Pix somente elegível", () => {
  const credit = uncertain(),
    deliveryId = other;
  const row = {
    deliveryId,
    orderId: credit.orderId,
    orderCode: "Pedido fictício",
    remainingCents: null,
    pixKey: null,
    credit,
  };
  const expected = [{ id: deliveryId, order_id: credit.orderId }];
  expect(
    parseDeliveryCredits([row], expected).get(deliveryId)?.remainingCents,
  ).toBeNull();
  for (const rows of [
    [{ ...row, remainingCents: 0 }],
    [{ ...row, pixKey: "pix-ficticio" }],
    [row, row],
    [{ ...row, deliveryId: credit.orderId }],
  ])
    expect(() => parseDeliveryCredits(rows, expected)).toThrow();
  const active = creditFixture({}, true);
  expect(() =>
    parseDeliveryCredits(
      [
        {
          ...row,
          credit: active,
          remainingCents: 25002,
          pixKey: "pix-ficticio",
        },
      ],
      expected,
    ),
  ).toThrow();
});
it("recibo histórico conserva valor, autoria e contexto sem exigir DTO corrente", () => {
  const receipt = {
    id: other,
    orderId: creditFixture().orderId,
    quoteId: other,
    paymentId: other,
    contextHash: "a".repeat(64),
    confirmedBy: other,
    confirmedAt: "2026-10-12T10:00:00-03:00",
    amountCents: 12501,
    creditedBeforeCents: 0,
    requiredCents: 12501,
    status: "awaiting_documents",
  };
  expect(depositReceiptSchema.parse(receipt)).toEqual(receipt);
  expect(
    depositInfoSchema.parse({
      ...info(uncertain()),
      receipt,
      confirmedName: "Calculista fictício",
      paymentStatus: "confirmed",
    }).receipt,
  ).toEqual(receipt);
});
