import { expect, it } from "vitest";
import { orderStates } from "@/modules/orders/state-machine";
import { creditFixture } from "@/modules/payments/order-credit-fixture";
import type { OrderCreditProjection } from "@/modules/payments/order-credit";
import {
  deliveryAccessContextSchema,
  deriveDeliveryCreditAccess,
  parseDeliveryAccessContexts,
  type DeliveryAccessContext,
} from "./credit-access";

const processId = "a0000000-0000-4000-8000-000000000301";
const deliveryId = "b0000000-0000-4000-8000-000000000201";
const otherDelivery = "b0000000-0000-4000-8000-000000000202";
const otherOrder = "00000000-0000-4000-8000-000000000102";
const otherProcess = "a0000000-0000-4000-8000-000000000302";
function funded(
  deposit = 0,
  total = deposit,
  patch: Partial<OrderCreditProjection> = {},
) {
  const required = patch.requiredDepositCents ?? 12501;
  const price = patch.totalCents ?? 25002;
  return creditFixture({
    manualDepositCents: deposit,
    manualTotalCents: total,
    depositCreditCents: deposit,
    totalCreditCents: total,
    remainingDepositCents: Math.max(required - deposit, 0),
    remainingTotalCents: Math.max(price - total, 0),
    depositExcessCents: Math.max(deposit - required, 0),
    totalExcessCents: Math.max(total - price, 0),
    ...patch,
  });
}
function unknown(patch: Partial<OrderCreditProjection> = {}) {
  return creditFixture({
    depositUncertain: true,
    uncertain: true,
    depositCreditCents: null,
    totalCreditCents: null,
    remainingDepositCents: null,
    remainingTotalCents: null,
    depositExcessCents: null,
    totalExcessCents: null,
    partial: null,
    ...patch,
  });
}
function context(
  credit = funded(),
  patch: Partial<DeliveryAccessContext> = {},
): DeliveryAccessContext {
  return {
    schemaVersion: 1,
    semantics: "current_delivery_access",
    effects: "none",
    deliveryId,
    orderId: credit.orderId,
    processId,
    orderStatus: "delivered",
    releasePolicy: "before_balance",
    credit,
    ...patch,
  };
}
function expected(row: DeliveryAccessContext) {
  return {
    id: row.deliveryId,
    order_id: row.orderId,
    process_id: row.processId,
  };
}

it.each(orderStates.filter((s) => !["delivered", "completed"].includes(s)))(
  "estado %s mantém revisão pendente mesmo com crédito e contrato",
  (orderStatus) =>
    expect(
      deriveDeliveryCreditAccess(
        context(
          { ...funded(12501, 25002), hasContract: true },
          { orderStatus },
        ),
      ),
    ).toBe("review_pending"),
);
it.each(["delivered", "completed"] as const)(
  "%s com regra ausente não é liberado por pagamento ou contrato",
  (orderStatus) =>
    expect(
      deriveDeliveryCreditAccess(
        context(
          { ...funded(12501, 25002), hasContract: true },
          { orderStatus, releasePolicy: null },
        ),
      ),
    ).toBe("policy_pending"),
);
it.each([
  [0, "deposit_pending"],
  [12500, "deposit_pending"],
  [12501, "ready"],
  [13000, "ready"],
] as const)(
  "antes do saldo, sinal conhecido de %s centavos resulta em %s",
  (amount, access) =>
    expect(deriveDeliveryCreditAccess(context(funded(amount)))).toBe(access),
);
it.each([
  [false, 0, "balance_pending"],
  [false, 25001, "balance_pending"],
  [false, 25002, "ready"],
  [true, 0, "balance_pending"],
  [true, 25001, "balance_pending"],
  [true, 25002, "ready"],
] as const)(
  "depois do saldo, contrato %s e crédito total %s resultam em %s",
  (hasContract, total, access) =>
    expect(
      deriveDeliveryCreditAccess(
        context(
          { ...funded(0, total), hasContract },
          { releasePolicy: "after_balance" },
        ),
      ),
    ).toBe(access),
);
it("contrato vigente dispensa sinal incerto somente na política antes do saldo", () => {
  const credit = { ...unknown(), hasContract: true };
  expect(deriveDeliveryCreditAccess(context(credit))).toBe("ready");
  expect(
    deriveDeliveryCreditAccess(
      context(credit, { releasePolicy: "after_balance" }),
    ),
  ).toBe("financial_pending");
  expect(
    deriveDeliveryCreditAccess(context({ ...credit, hasContract: false })),
  ).toBe("financial_pending");
});
it("incerteza restrita ao saldo conserva a cobertura certa do sinal", () => {
  const credit = creditFixture({
    ...funded(12501).projection,
    uncertain: true,
    totalCreditCents: null,
    remainingTotalCents: null,
    totalExcessCents: null,
  });
  expect(credit.collectionState).toBe("reconcile");
  expect(deriveDeliveryCreditAccess(context(credit))).toBe("ready");
  expect(
    deriveDeliveryCreditAccess(
      context(credit, { releasePolicy: "after_balance" }),
    ),
  ).toBe("financial_pending");
  const partial = creditFixture({
    ...funded(12500).projection,
    uncertain: true,
    totalCreditCents: null,
    remainingTotalCents: null,
    totalExcessCents: null,
  });
  expect(deriveDeliveryCreditAccess(context(partial))).toBe("deposit_pending");
});
it.each(["before_balance", "after_balance"] as const)(
  "%s não libera legado sem valores aceitos, mesmo com soma observada e contrato",
  (releasePolicy) => {
    const credit = {
      ...unknown({
        requiredDepositCents: null,
        totalCents: null,
        manualDepositCents: 25002,
        manualTotalCents: 25002,
      }),
      hasContract: true,
    };
    expect(deriveDeliveryCreditAccess(context(credit, { releasePolicy }))).toBe(
      "financial_pending",
    );
  },
);
it("valor inseguro e sinal superior ao total não recebem liberação por contrato", () => {
  const unsafe = { ...unknown({ unsafeAmount: true }), hasContract: true };
  expect(deriveDeliveryCreditAccess(context(unsafe))).toBe("financial_pending");
  expect(
    deriveDeliveryCreditAccess(
      context(funded(12501, 25002, { requiredDepositCents: 30000 })),
    ),
  ).toBe("financial_pending");
});
it.each(["before_balance", "after_balance"] as const)(
  "%s trata proposta gratuita reconhecida sem fabricar cobrança",
  (releasePolicy) =>
    expect(
      deriveDeliveryCreditAccess(
        context(funded(0, 0, { requiredDepositCents: 0, totalCents: 0 }), {
          releasePolicy,
        }),
      ),
    ).toBe("ready"),
);
it("excesso certo libera pela cobertura sem capar crédito ou inventar restituição", () => {
  const credit = funded(13000, 26000),
    row = context(credit);
  const before = structuredClone(row);
  expect(credit.collectionState).toBe("excess");
  expect(deriveDeliveryCreditAccess(row)).toBe("ready");
  expect(
    deriveDeliveryCreditAccess({ ...row, releasePolicy: "after_balance" }),
  ).toBe("ready");
  expect(row).toEqual(before);
  expect(credit.projection.totalExcessCents).toBe(998);
});
it("reserva ativa não apaga crédito já certo e não é usada como recibo", () => {
  const credit = {
    ...funded(12501, 25002),
    activeReservation: true,
    collectionState: "active" as const,
  };
  expect(deriveDeliveryCreditAccess(context(credit))).toBe("ready");
  expect(
    deriveDeliveryCreditAccess(
      context(credit, { releasePolicy: "after_balance" }),
    ),
  ).toBe("ready");
  const empty = {
    ...funded(),
    activeReservation: true,
    collectionState: "active" as const,
  };
  expect(deriveDeliveryCreditAccess(context(empty))).toBe("deposit_pending");
});
it("estorno e restauração alteram elegibilidade sem mudar política ou entrega", () => {
  const approved = context(funded(12501, 25002), {
    releasePolicy: "after_balance",
  });
  const before = structuredClone(approved);
  const afterRefund = { ...approved, credit: funded(12501, 12501) };
  expect(deriveDeliveryCreditAccess(approved)).toBe("ready");
  expect(deriveDeliveryCreditAccess(afterRefund)).toBe("balance_pending");
  expect(deriveDeliveryCreditAccess({ ...approved, credit: unknown() })).toBe(
    "financial_pending",
  );
  expect(
    deriveDeliveryCreditAccess({
      ...afterRefund,
      credit: funded(12501, 25002),
    }),
  ).toBe("ready");
  expect(approved).toEqual(before);
  expect(afterRefund.releasePolicy).toBe(approved.releasePolicy);
  expect(afterRefund.deliveryId).toBe(approved.deliveryId);
});
it("limite inteiro seguro é comparado sem somar ou arredondar valores", () => {
  const max = Number.MAX_SAFE_INTEGER;
  expect(
    deriveDeliveryCreditAccess(
      context(
        funded(max, max, { requiredDepositCents: max, totalCents: max }),
        {
          releasePolicy: "after_balance",
        },
      ),
    ),
  ).toBe("ready");
});
it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "contexto rejeita valor %s em vez de liberar os arquivos",
  (totalCents) => {
    const row = context();
    expect(
      deliveryAccessContextSchema.safeParse({
        ...row,
        credit: {
          ...row.credit,
          projection: { ...row.credit.projection, totalCents },
        },
      }).success,
    ).toBe(false);
  },
);
it("contrato estrito rejeita recibo, efeitos, versão, política e identidade divergentes", () => {
  const row = context();
  for (const patch of [
    { semantics: "financial_resolution_receipt" },
    { effects: "payment" },
    { schemaVersion: 2 },
    { releasePolicy: "automatic" },
    { receipt: {} },
    { orderId: otherOrder },
    { orderStatus: "unknown" },
    { credit: null },
  ])
    expect(
      deliveryAccessContextSchema.safeParse({ ...row, ...patch }).success,
    ).toBe(false);
});
it("contexto rejeita certeza total incompatível com sinal incerto e total menor que sinal", () => {
  const row = context();
  const signalUnknown = {
    ...unknown().projection,
    uncertain: false,
    totalCreditCents: 25002,
    remainingTotalCents: 0,
    totalExcessCents: 0,
  };
  expect(
    deliveryAccessContextSchema.safeParse({
      ...row,
      credit: creditFixture(signalUnknown),
    }).success,
  ).toBe(false);
  expect(
    deliveryAccessContextSchema.safeParse(context(funded(13000, 10000)))
      .success,
  ).toBe(false);
});
it("lote aceita exatamente as entregas e preserva regras diferentes do mesmo pedido", () => {
  const first = context(),
    second = context(first.credit, {
      deliveryId: otherDelivery,
      releasePolicy: "after_balance",
    });
  const rows = parseDeliveryAccessContexts([second, first], processId, [
    expected(first),
    expected(second),
  ]);
  expect(rows.size).toBe(2);
  expect(rows.get(deliveryId)?.releasePolicy).toBe("before_balance");
  expect(rows.get(otherDelivery)?.releasePolicy).toBe("after_balance");
  expect(parseDeliveryAccessContexts([], processId, []).size).toBe(0);
});
it("IDs normalizados continuam vinculados a processo, pedido e entrega", () => {
  const row = context();
  expect(
    parseDeliveryAccessContexts(
      [
        {
          ...row,
          deliveryId: deliveryId.toUpperCase(),
          processId: processId.toUpperCase(),
        },
      ],
      processId.toUpperCase(),
      [
        {
          ...expected(row),
          id: deliveryId.toUpperCase(),
          process_id: processId.toUpperCase(),
        },
      ],
    ).get(deliveryId)?.processId,
  ).toBe(processId);
});
it("lote rejeita ausência, extra, repetição, processo ou pedido trocado", () => {
  const first = context(),
    second = context(first.credit, { deliveryId: otherDelivery });
  const cases: [unknown, ReturnType<typeof expected>[]][] = [
    [[], [expected(first)]],
    [[first, second], [expected(first)]],
    [
      [first, first],
      [expected(first), expected(second)],
    ],
    [[first], [expected(first), expected(first)]],
    [[second], [expected(first)]],
    [[{ ...first, processId: otherProcess }], [expected(first)]],
    [[first], [{ ...expected(first), process_id: otherProcess }]],
    [[context(funded(0, 0, { orderId: otherOrder }))], [expected(first)]],
  ];
  for (const [rows, requested] of cases)
    expect(() =>
      parseDeliveryAccessContexts(rows, processId, requested),
    ).toThrow();
});
it("lote aceita cinquenta IDs distintos e rejeita o quinquagésimo primeiro", () => {
  const rows = Array.from({ length: 51 }, (_, i) =>
    context(funded(), {
      deliveryId:
        "00000000-0000-4000-8000-" + String(i + 1000).padStart(12, "0"),
    }),
  );
  expect(
    parseDeliveryAccessContexts(
      rows.slice(0, 50),
      processId,
      rows.slice(0, 50).map(expected),
    ).size,
  ).toBe(50);
  expect(() =>
    parseDeliveryAccessContexts(rows, processId, rows.map(expected)),
  ).toThrow();
  expect(() =>
    parseDeliveryAccessContexts(
      rows.slice(0, 50),
      processId,
      rows.map(expected),
    ),
  ).toThrow();
});
it("lote rejeita status e crédito incompatíveis para o mesmo pedido", () => {
  const first = context(),
    second = context(first.credit, { deliveryId: otherDelivery });
  for (const patch of [
    { orderStatus: "in_review" as const },
    { credit: funded(12501) },
    { credit: { ...first.credit, hasContract: true } },
    {
      credit: {
        ...first.credit,
        activeReservation: true,
        collectionState: "active" as const,
      },
    },
  ])
    expect(() =>
      parseDeliveryAccessContexts([first, { ...second, ...patch }], processId, [
        expected(first),
        expected(second),
      ]),
    ).toThrow();
});
