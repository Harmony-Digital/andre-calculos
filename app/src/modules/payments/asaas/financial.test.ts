import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readAsaasScope, readAsaasPayment } from "./contracts";
import { AsaasContractError } from "./errors";
import {
  normalizeAsaasFinancialEvent,
  normalizeAsaasPaymentSnapshot,
} from "./financial";
import { compareAsaasFinancialEvents } from "./comparison";
const reference = "00000000-0000-4000-8000-000000000002";
const scope = readAsaasScope({
  provider: "asaas",
  environment: "sandbox",
  accountId: "account_fixture",
  walletId: "wallet_fixture",
});
const expected = {
  scope,
  phase: "observation",
  paymentId: "pay_fixture",
  customerId: "cus_fixture",
  reference,
  contractedCents: 12501,
  billingType: "PIX",
  dueDate: "2026-10-20",
};
function paymentText(patch: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: "pay_fixture",
    customer: "cus_fixture",
    externalReference: reference,
    value: 125.01,
    netValue: 122.51,
    status: "RECEIVED",
    billingType: "PIX",
    dueDate: "2026-10-20",
    deleted: false,
    refunds: [],
    chargeback: null,
    invoiceUrl: "https://sandbox.asaas.com/i/private_fixture",
    email: "private-fixture@example.invalid",
    creditCard: { creditCardToken: "fixture-no-secret" },
    ...patch,
  });
}
function eventText(
  patch: Record<string, unknown> = {},
  options: { id?: string; type?: string; date?: string; body?: string } = {},
) {
  return `{"id":${JSON.stringify(options.id ?? "evt_fixture")},"event":${JSON.stringify(options.type ?? "PAYMENT_RECEIVED")},"dateCreated":${JSON.stringify(options.date ?? "2026-10-11 10:00:00")},"account":{"id":"account_fixture"},"payment":${options.body ?? paymentText(patch)}}`;
}
function normalize(
  patch: Record<string, unknown> = {},
  type = "PAYMENT_RECEIVED",
  context: unknown = expected,
) {
  return normalizeAsaasFinancialEvent(
    eventText(patch, { type }),
    scope,
    context,
  ).snapshot;
}
function refund(
  value = 10.01,
  status = "DONE",
  dateCreated = "2026-10-11 09:00:00",
) {
  return { value, status, dateCreated };
}
const next = (patch: Record<string, unknown> = {}, type = "PAYMENT_RECEIVED") =>
  eventText(patch, { type, id: "evt_next", date: "2026-10-11 10:00:01" });
function compare(before: string, after: string) {
  return compareAsaasFinancialEvents(before, after, scope, expected);
}

it.each(["PIX", "BOLETO", "CREDIT_CARD"])(
  "recebimento %s preserva bruto, líquido e taxa sem crédito ou redução da obrigação",
  (billingType) => {
    const snapshot = normalize({ billingType }, "PAYMENT_RECEIVED", {
      ...expected,
      billingType,
    });
    expect(snapshot.disposition).toBe("observed");
    expect(snapshot.classification).toBe("received");
    expect(snapshot.amounts).toEqual({
      contractedCents: 12501,
      currentValueCents: 12501,
      providerOriginalCents: null,
      netCents: 12251,
      feeCents: 250,
      receivedCents: 12501,
      relationToContract: "equal",
      grossLessCompletedRefundsCents: 12501,
    });
    expect(snapshot.effects).toBe("none");
    expect(snapshot.semantics).toBe("cumulative_snapshot");
    expect(snapshot.identityProof).toBe("declared_unverified");
    expect(snapshot).not.toHaveProperty("creditCents");
    expect(snapshot).not.toHaveProperty("paid");
  },
);
it("parcial mantém original e recebido, sem fabricar parcelamento ou delta", () => {
  const snapshot = normalize({
    value: 100.01,
    originalValue: 125.01,
    netValue: 97.51,
  });
  expect(snapshot.disposition).toBe("observed");
  expect(snapshot.amounts).toMatchObject({
    contractedCents: 12501,
    currentValueCents: 10001,
    providerOriginalCents: 12501,
    receivedCents: 10001,
    relationToContract: "below_contract",
    feeCents: 250,
  });
  expect(snapshot).not.toHaveProperty("installment");
  expect(snapshot).not.toHaveProperty("deltaCents");
});
it("excedente preserva valores sem limitar ao contratado", () => {
  const snapshot = normalize({
    value: 150.01,
    originalValue: 125.01,
    netValue: 147.51,
  });
  expect(snapshot.disposition).toBe("reconcile");
  expect(snapshot.reasons).toContain("excess_gross");
  expect(snapshot.amounts).toMatchObject({
    contractedCents: 12501,
    receivedCents: 15001,
    relationToContract: "above_contract",
  });
});
it.each([
  ["PAYMENT_CREATED", "PENDING", "obligation"],
  ["PAYMENT_OVERDUE", "OVERDUE", "obligation"],
  ["PAYMENT_CONFIRMED", "CONFIRMED", "confirmed_unavailable"],
  ["PAYMENT_AUTHORIZED", "AUTHORIZED", "authorization"],
])("%s/%s não equivale a recebido", (type, status, classification) => {
  const snapshot = normalize({ status, billingType: "CREDIT_CARD" }, type, {
    ...expected,
    billingType: "CREDIT_CARD",
  });
  expect(snapshot.classification).toBe(classification);
  expect(snapshot.amounts.receivedCents).toBeNull();
  expect(snapshot.disposition).toBe("observed");
});
it("Pix CONFIRMED cautelar solicita consulta e não antecipa saldo", () => {
  const snapshot = normalize({ status: "CONFIRMED" }, "PAYMENT_CONFIRMED");
  expect(snapshot.classification).toBe("confirmed_unavailable");
  expect(snapshot.reasons).toContain("pix_confirmation_pending");
  expect(snapshot.amounts.receivedCents).toBeNull();
});
it.each([
  ["PAYMENT_RECEIVED", "CONFIRMED"],
  ["PAYMENT_CONFIRMED", "RECEIVED"],
  ["PAYMENT_CREATED", "RECEIVED"],
  ["PAYMENT_AUTHORIZED", "RECEIVED"],
  ["PAYMENT_OVERDUE", "PENDING"],
])("combinação %s/%s não ganha estado fabricado", (type, status) => {
  expect(normalize({ status }, type).reasons).toContain(
    "incompatible_event_status",
  );
});
it.each(["BOLETO", "PIX", "UNDEFINED"])(
  "autorização fora do cartão %s é incompatível",
  (billingType) => {
    const snapshot = normalize(
      { status: "AUTHORIZED", billingType },
      "PAYMENT_AUTHORIZED",
      { ...expected, billingType },
    );
    expect(snapshot.reasons).toContain("incompatible_event_status");
  },
);
it.each([
  { billingType: "RECEIVED_IN_CASH" },
  { status: "RECEIVED_IN_CASH" },
  { billingType: "RECEIVED_IN_CASH", status: "RECEIVED_IN_CASH" },
])("baixa manual externa nunca vira recebimento automático", (patch) => {
  const snapshot = normalize(patch);
  expect(snapshot.reasons).toContain("manual_receipt");
  expect(snapshot.amounts.receivedCents).toBeNull();
  expect(snapshot.amounts.grossLessCompletedRefundsCents).toBeNull();
  expect(snapshot.effects).toBe("none");
});
it.each(["PIX", "BOLETO", "CREDIT_CARD"])(
  "meio escolhido %s preserva pedido UNDEFINED",
  (billingType) => {
    expect(
      normalize({ billingType }, "PAYMENT_RECEIVED", {
        ...expected,
        billingType: "UNDEFINED",
      }).disposition,
    ).toBe("observed");
  },
);
it.each([
  [undefined, "expected_method_unknown"],
  ["FUTURE_METHOD", "expected_method_unknown"],
  ["BOLETO", "billing_type_mismatch"],
])("contexto de meio %s não inventa compatibilidade", (billingType, reason) => {
  expect(
    normalize({}, "PAYMENT_RECEIVED", { ...expected, billingType }).reasons,
  ).toContain(reason);
});
it.each(["UNDEFINED", "FUTURE_METHOD"])(
  "método observado %s desconhecido permanece cautelar",
  (billingType) => {
    expect(
      normalize({ billingType }, "PAYMENT_RECEIVED", {
        ...expected,
        billingType: "UNDEFINED",
      }).reasons,
    ).toContain("unknown_billing_type");
  },
);
it.each([
  [undefined, "missing"],
  [null, "null"],
  [0, "present"],
])(
  "presença netValue %s conserva desconhecido e zero explícito",
  (netValue, presence) => {
    const snapshot = normalize({ netValue });
    expect(snapshot.presence.netValue).toBe(presence);
    if (netValue === 0) expect(snapshot.amounts.feeCents).toBe(12501);
    else {
      expect(snapshot.reasons).toContain("net_unknown");
      expect(snapshot.amounts.feeCents).toBeNull();
    }
  },
);
it.each([-0.01, 125.02])(
  "líquido %s incompatível é conservado sem taxa inventada",
  (netValue) => {
    const snapshot = normalize({ netValue });
    expect(snapshot.reasons).toContain("invalid_net");
    expect(snapshot.amounts.netCents).toBe(netValue === -0.01 ? -1 : 12502);
    expect(snapshot.amounts.feeCents).toBeNull();
  },
);
it.each([
  [undefined, "missing"],
  [null, "null"],
  [125.01, "present"],
])("presença originalValue é preservada", (originalValue, presence) => {
  expect(normalize({ originalValue }).presence.originalValue).toBe(presence);
});
it.each([
  [undefined, "missing"],
  [null, "null"],
  [[], "empty"],
  [[refund()], "present"],
])("presença refunds é observável sem fabricar zero", (refunds, presence) => {
  const snapshot = normalize({ refunds });
  expect(snapshot.presence.refunds).toBe(presence);
  if (refunds == null) {
    expect(snapshot.refunds.completedCents).toBeNull();
    expect(snapshot.refunds.pendingCents).toBeNull();
    expect(snapshot.amounts.grossLessCompletedRefundsCents).toBeNull();
    expect(snapshot.reasons).toContain("refunds_unknown");
  }
});
it.each([
  [undefined, "missing"],
  [null, "null"],
  [{ status: "REQUESTED" }, "present"],
])("presença chargeback é conservada", (chargeback, presence) => {
  expect(normalize({ chargeback }).presence.chargeback).toBe(presence);
});
it("todos os estornos são somados por estado em centavos, com multiplicidade", () => {
  const snapshot = normalize(
    {
      refunds: [
        refund(),
        refund(),
        refund(5.01, "PENDING"),
        refund(30.01, "CANCELLED"),
      ],
    },
    "PAYMENT_PARTIALLY_REFUNDED",
  );
  expect(snapshot.classification).toBe("refund");
  expect(snapshot.disposition).toBe("observed");
  expect(snapshot.refunds).toMatchObject({
    completedCents: 2002,
    pendingCents: 501,
    cancelledCents: 3001,
    unknownCents: 0,
  });
  expect(snapshot.refunds.items).toHaveLength(4);
  expect(snapshot.amounts.currentValueCents).toBe(12501);
  expect(snapshot.amounts.grossLessCompletedRefundsCents).toBe(10499);
  expect(snapshot.amounts.feeCents).toBe(250);
  expect(snapshot.status).toBe("RECEIVED");
});
it("cancelados podem somar mais que o bruto sem se tornarem devolução", () => {
  const snapshot = normalize({
    refunds: [refund(125.01, "CANCELLED"), refund(125.01, "CANCELLED")],
  });
  expect(snapshot.refunds.cancelledCents).toBe(25002);
  expect(snapshot.refunds.completedCents).toBe(0);
  expect(snapshot.amounts.grossLessCompletedRefundsCents).toBe(12501);
  expect(snapshot.reasons).not.toContain("refund_exceeds_gross");
});
it("estorno total conserva original/bruto, sem representar parcial como integral", () => {
  const snapshot = normalize(
    { status: "REFUNDED", refunds: [refund(125.01)] },
    "PAYMENT_REFUNDED",
  );
  expect(snapshot.disposition).toBe("observed");
  expect(snapshot.refunds.completedCents).toBe(12501);
  expect(snapshot.amounts.currentValueCents).toBe(12501);
  expect(snapshot.amounts.grossLessCompletedRefundsCents).toBe(0);
});
it.each([
  undefined,
  null,
  [],
  [refund(10.01, "PENDING")],
  [refund(10.01, "DONE")],
])("evento integral sem total DONE suficiente exige conciliação", (refunds) => {
  const snapshot = normalize(
    { status: "REFUNDED", refunds },
    "PAYMENT_REFUNDED",
  );
  expect(snapshot.reasons).toContain("refund_amount_unknown");
});
it.each([undefined, null, [], [refund(10.01, "PENDING")], [refund(125.01)]])(
  "evento parcial sem DONE parcial suficiente não vira estorno integral",
  (refunds) => {
    expect(
      normalize({ refunds }, "PAYMENT_PARTIALLY_REFUNDED").reasons,
    ).toContain("refund_amount_unknown");
  },
);
it.each([
  "PAYMENT_CHECKOUT_VIEWED",
  "PAYMENT_BANK_SLIP_VIEWED",
  "PAYMENT_UPDATED",
])("status REFUNDED exige montantes também no evento %s", (type) => {
  const snapshot = normalize({ status: "REFUNDED", refunds: [] }, type);
  expect(snapshot.reasons).toContain("refund_amount_unknown");
});
it.each(["REFUND_REQUESTED", "REFUND_IN_PROGRESS"])(
  "consulta %s também exige estorno pendente",
  (status) => {
    const snapshot = normalizeAsaasPaymentSnapshot(
      paymentText({ status, refunds: [] }),
      scope,
      expected,
    );
    expect(snapshot.reasons).toContain("refund_amount_unknown");
  },
);
it("estorno em processamento mantém pendente separado do concluído", () => {
  const snapshot = normalize(
    { status: "REFUND_IN_PROGRESS", refunds: [refund(10.01, "PENDING")] },
    "PAYMENT_REFUND_IN_PROGRESS",
  );
  expect(snapshot.disposition).toBe("observed");
  expect(snapshot.refunds.completedCents).toBe(0);
  expect(snapshot.refunds.pendingCents).toBe(1001);
});
it.each(["PIX", "CREDIT_CARD"])(
  "estorno negado fora BOLETO %s é incompatível",
  (billingType) => {
    expect(
      normalize(
        { billingType, refunds: [refund(10.01, "CANCELLED")] },
        "PAYMENT_REFUND_DENIED",
        { ...expected, billingType },
      ).reasons,
    ).toContain("incompatible_event_status");
  },
);
it("estorno negado em boleto preserva CANCELLED sem devolução", () => {
  const snapshot = normalize(
    { billingType: "BOLETO", refunds: [refund(10.01, "CANCELLED")] },
    "PAYMENT_REFUND_DENIED",
    { ...expected, billingType: "BOLETO" },
  );
  expect(snapshot.disposition).toBe("observed");
  expect(snapshot.refunds.completedCents).toBe(0);
});
it.each([
  ["DONE", "refund_exceeds_gross"],
  ["PENDING", "pending_refund_exceeds_gross"],
])("estorno %s acima do bruto permanece sem truncamento", (status, reason) => {
  const snapshot = normalize({ refunds: [refund(125.02, status)] });
  expect(snapshot.reasons).toContain(reason);
  expect(
    status === "DONE"
      ? snapshot.refunds.completedCents
      : snapshot.refunds.pendingCents,
  ).toBe(12502);
});
it("estornosDONE mais PENDING acima do bruto são incompatíveis", () => {
  expect(
    normalize({ refunds: [refund(100.01), refund(30.01, "PENDING")] }).reasons,
  ).toContain("pending_refund_exceeds_gross");
});
it("status de estorno futuro é preservado, sem integrar DONE", () => {
  const snapshot = normalize({ refunds: [refund(10.01, "FUTURE_STATUS")] });
  expect(snapshot.refunds).toMatchObject({
    completedCents: 0,
    unknownCents: 1001,
  });
  expect(snapshot.reasons).toContain("unknown_refund_status");
  expect(snapshot.amounts.grossLessCompletedRefundsCents).toBeNull();
});
it.each([
  "REQUESTED",
  "IN_DISPUTE",
  "DISPUTE_LOST",
  "REVERSED",
  "DONE",
  "FUTURE_STATUS",
])("chargeback %s não fabrica montante nem reversão de crédito", (status) => {
  const snapshot = normalize({
    chargeback: { status, value: 125.01, reason: "private-fixture" },
  });
  expect(snapshot.reasons).toContain("chargeback_amount_unknown");
  expect(snapshot.chargeback).toEqual({ status });
  expect(snapshot.amounts.grossLessCompletedRefundsCents).toBeNull();
  expect(snapshot.chargeback).not.toHaveProperty("amountCents");
  if (status === "FUTURE_STATUS")
    expect(snapshot.reasons).toContain("unknown_chargeback_status");
});
it.each([
  ["PAYMENT_CHARGEBACK_REQUESTED", "CHARGEBACK_REQUESTED", "REQUESTED"],
  ["PAYMENT_CHARGEBACK_DISPUTE", "CHARGEBACK_DISPUTE", "IN_DISPUTE"],
  [
    "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
    "AWAITING_CHARGEBACK_REVERSAL",
    "REVERSED",
  ],
])(
  "%s conserva contestação sem deduzir repasse",
  (type, status, chargebackStatus) => {
    const snapshot = normalize(
      { status, chargeback: { status: chargebackStatus } },
      type,
    );
    expect(snapshot.classification).toBe("chargeback");
    expect(snapshot.reasons).toContain("chargeback_amount_unknown");
    expect(snapshot.amounts.receivedCents).toBeNull();
  },
);
it.each([undefined, null])(
  "evento de chargeback sem objeto não fica completo",
  (chargeback) => {
    expect(
      normalize(
        { status: "CHARGEBACK_REQUESTED", chargeback },
        "PAYMENT_CHARGEBACK_REQUESTED",
      ).reasons,
    ).toContain("chargeback_unknown");
  },
);
it.each(["DUNNING_REQUESTED", "DUNNING_RECEIVED", "AWAITING_RISK_ANALYSIS"])(
  "consulta com status %s não fica desconhecida e aprovada",
  (status) => {
    const snapshot = normalizeAsaasPaymentSnapshot(
      paymentText({ status }),
      scope,
      expected,
    );
    expect(snapshot.classification).toBe("non_receipt_event");
    expect(snapshot.reasons).toContain("event_requires_query");
  },
);
it.each([
  "PAYMENT_UPDATED",
  "PAYMENT_RESTORED",
  "PAYMENT_ANTICIPATED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_SPLIT_DONE",
])("evento %s não cria recebimento", (type) => {
  const snapshot = normalize({}, type);
  expect(snapshot.classification).toBe("non_receipt_event");
  expect(snapshot.amounts.receivedCents).toBeNull();
  expect(snapshot.reasons).toContain("event_requires_query");
});
it.each(["PAYMENT_BANK_SLIP_VIEWED", "PAYMENT_CHECKOUT_VIEWED"])(
  "visualização %s não é recebimento",
  (type) => {
    const snapshot = normalize({}, type);
    expect(snapshot.classification).toBe("non_receipt_event");
    expect(snapshot.amounts.receivedCents).toBeNull();
  },
);
it.each([
  ["PAYMENT_DELETED", false],
  ["PAYMENT_RESTORED", true],
])("flag de %s divergente é conciliada", (type, deleted) => {
  expect(normalize({ deleted }, type).reasons).toContain(
    "incompatible_event_status",
  );
});
it("recebimento excluído não é observação disponível", () => {
  expect(normalize({ deleted: true }).reasons).toContain(
    "deleted_financial_observation",
  );
});
it("códigos novos são preservados e não interpretados por substring", () => {
  const snapshot = normalize(
    { status: "REFUND_FUTURE" },
    "PAYMENT_PARTIALLY_RECEIVED",
  );
  expect(snapshot.status).toBe("REFUND_FUTURE");
  expect(snapshot.classification).toBe("unknown");
  expect(snapshot.reasons).toContain("unknown_event");
  expect(snapshot.reasons).toContain("unknown_payment_status");
});
it("projeção não contém contato, documento, invoiceURL, cartão ou comprovante", () => {
  const snapshot = normalize({
    cpfCnpj: "00000000191",
    refunds: [
      {
        ...refund(),
        transactionReceiptUrl: "https://example.invalid/private-fixture",
      },
    ],
  });
  expect(JSON.stringify(snapshot)).not.toMatch(
    /example|private_fixture|cpfCnpj|creditCard|invoiceUrl|transactionReceipt|fixture-no-secret/,
  );
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.presence)).toBe(true);
  expect(Object.isFrozen(snapshot.amounts)).toBe(true);
  expect(Object.isFrozen(snapshot.refunds.items?.[0])).toBe(true);
});
it("normalização não executa transporte", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  try {
    normalize();
    compare(eventText(), next());
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
it.each([
  { id: "pay_other" },
  { customer: "cus_other" },
  { externalReference: "00000000-0000-4000-8000-000000000003" },
  { value: 100.01 },
  { dueDate: "2026-10-21" },
])(
  "vínculo incompleto/divergente não é relaxado pelo normalizador",
  (patch) => {
    expect(() => normalize(patch)).toThrow(AsaasContractError);
  },
);
it.each([
  { ...scope, environment: "production" },
  { ...scope, accountId: "account_other" },
  { ...scope, walletId: "wallet_other" },
])("conta/env/carteira diferentes são recusados", (sourceScope) => {
  expect(() =>
    normalizeAsaasFinancialEvent(eventText(), sourceScope, expected),
  ).toThrow(AsaasContractError);
});
it("conta declarada do evento não substitui a identidade esperada", () => {
  expect(() =>
    normalizeAsaasFinancialEvent(
      eventText().replace('"account_fixture"', '"account_other"'),
      scope,
      expected,
    ),
  ).toThrow(AsaasContractError);
});
it("criação não é contexto válido para interpretar recebimento", () => {
  expect(() =>
    normalize({}, "PAYMENT_RECEIVED", { ...expected, phase: "creation" }),
  ).toThrow(AsaasContractError);
});
it("moeda no limite seguro conserva precisão antes de somar estornos", () => {
  const body = paymentText({ netValue: 0 }).replace(
    '"value":125.01',
    '"value":90071992547409.91',
  );
  const snapshot = normalizeAsaasFinancialEvent(
    eventText({}, { body }),
    scope,
    { ...expected, contractedCents: Number.MAX_SAFE_INTEGER },
  ).snapshot;
  expect(snapshot.amounts.currentValueCents).toBe(Number.MAX_SAFE_INTEGER);
  expect(snapshot.amounts.feeCents).toBe(Number.MAX_SAFE_INTEGER);
});
it("soma acima do limite seguro exige conciliação sem arredondar", () => {
  const body = paymentText({ netValue: 0, refunds: [refund(), refund()] })
    .replace('"value":125.01', '"value":90071992547409.91')
    .replaceAll('"value":10.01', '"value":90071992547409.91');
  const snapshot = normalizeAsaasFinancialEvent(
    eventText({}, { body }),
    scope,
    { ...expected, contractedCents: Number.MAX_SAFE_INTEGER },
  ).snapshot;
  expect(snapshot.refunds.completedCents).toBeNull();
  expect(snapshot.reasons).toContain("arithmetic_out_of_range");
  expect(snapshot.reasons).toContain("refund_exceeds_gross");
  expect(snapshot.amounts.grossLessCompletedRefundsCents).toBeNull();
});
it("DTO original também preserva cada presença antes da interpretação", () => {
  const observed = readAsaasPayment(
    paymentText({
      refunds: null,
      chargeback: undefined,
      originalValue: null,
      netValue: undefined,
    }),
    scope,
    expected,
  );
  expect(observed.presence).toEqual({
    originalValue: "null",
    netValue: "missing",
    refunds: "null",
    chargeback: "missing",
  });
});

it("reentrega do mesmo evento é replay sem somar duas vezes", () => {
  const result = compare(eventText(), eventText());
  expect(result.relation).toBe("replay");
  expect(result.requiresAuthoritativeQuery).toBe(false);
  expect(result.current.snapshot.amounts.receivedCents).toBe(12501);
  expect(result).not.toHaveProperty("deltaCents");
});
it("JSON reordenado conserva replay dos mesmos fatos", () => {
  const text = eventText();
  const object = JSON.parse(text);
  const reordered = JSON.stringify({
    payment: object.payment,
    account: object.account,
    dateCreated: object.dateCreated,
    event: object.event,
    id: object.id,
  });
  expect(compare(text, reordered).relation).toBe("replay");
});
it.each([
  eventText({ netValue: 122.5 }),
  eventText({}, { type: "PAYMENT_CHECKOUT_VIEWED" }),
  eventText({}, { date: "2026-10-11 10:00:01" }),
  eventText({ refunds: null }),
])(
  "mesmo ID com conteúdo financeiro/contexto diferente é conflito",
  (after) => {
    const result = compare(eventText(), after);
    expect(result.reasons).toContain("conflicting_replay");
    expect(result.relation).toBe("reconcile");
  },
);
it("novo ID com mesmos fatos cumulativos não acrescenta recebimento", () => {
  const result = compare(eventText(), next());
  expect(result.relation).toBe("same_cumulative_view");
  expect(result.requiresAuthoritativeQuery).toBe(false);
  expect(result.effects).toBe("none");
  expect(result.current.snapshot.amounts.receivedCents).toBe(
    result.previous.snapshot.amounts.receivedCents,
  );
});
it("ordem de itens não altera multiplicidade nem visão cumulativa", () => {
  const a = refund(10.01);
  const b = refund(20.01, "DONE", "2026-10-11 09:01:00");
  const result = compare(
    eventText({ refunds: [a, a, b] }, { type: "PAYMENT_PARTIALLY_REFUNDED" }),
    next({ refunds: [b, a, a] }, "PAYMENT_PARTIALLY_REFUNDED"),
  );
  expect(result.relation).toBe("same_cumulative_view");
  expect(result.current.snapshot.refunds.completedCents).toBe(4003);
});
it("crescimento cumulativo de DONE é candidato, nunca dois débitos somados", () => {
  const result = compare(
    eventText({ refunds: [refund()] }, { type: "PAYMENT_PARTIALLY_REFUNDED" }),
    next(
      { refunds: [refund(), refund(20.01, "DONE", "2026-10-11 09:01:00")] },
      "PAYMENT_PARTIALLY_REFUNDED",
    ),
  );
  expect(result.relation).toBe("cumulative_candidate");
  expect(result.requiresAuthoritativeQuery).toBe(true);
  expect(result.previous.snapshot.refunds.completedCents).toBe(1001);
  expect(result.current.snapshot.refunds.completedCents).toBe(3002);
  expect(result).not.toHaveProperty("deltaCents");
});
it("recebimento antigo depois do estorno não recompõe valor", () => {
  const result = compare(
    next({ refunds: [refund()] }, "PAYMENT_PARTIALLY_REFUNDED"),
    eventText(),
  );
  expect(result.relation).toBe("declared_older");
  expect(result.requiresAuthoritativeQuery).toBe(true);
  expect(result.previous.snapshot.refunds.completedCents).toBe(1001);
});
it("timestamp posterior com DONE menor continua regressão", () => {
  const result = compare(
    eventText({ refunds: [refund()] }, { type: "PAYMENT_PARTIALLY_REFUNDED" }),
    next(),
  );
  expect(result.reasons).toContain("completed_refund_regression");
  expect(result.reasons).toContain("completed_refund_history_changed");
  expect(result.relation).toBe("reconcile");
});
it("mesmo total com item DONE desaparecido exige conferência", () => {
  const result = compare(
    eventText(
      { refunds: [refund(), refund()] },
      { type: "PAYMENT_PARTIALLY_REFUNDED" },
    ),
    next({ refunds: [refund(20.02)] }, "PAYMENT_PARTIALLY_REFUNDED"),
  );
  expect(result.previous.snapshot.refunds.completedCents).toBe(2002);
  expect(result.current.snapshot.refunds.completedCents).toBe(2002);
  expect(result.reasons).toContain("completed_refund_history_changed");
});
it("DONE voltando a PENDING não devolve crédito", () => {
  const result = compare(
    eventText({ refunds: [refund()] }, { type: "PAYMENT_PARTIALLY_REFUNDED" }),
    next({ refunds: [refund(10.01, "PENDING")] }, "PAYMENT_REFUND_IN_PROGRESS"),
  );
  expect(result.reasons).toContain("completed_refund_regression");
  expect(result.relation).toBe("reconcile");
});
it("empate em segundos com fatos diferentes não inventa ordem", () => {
  const result = compare(
    eventText(),
    eventText(
      { refunds: [refund()] },
      { id: "evt_next", type: "PAYMENT_PARTIALLY_REFUNDED" },
    ),
  );
  expect(result.reasons).toContain("equal_timestamp_conflict");
});
it("regressão do bruto recebido mesmo com original vinculado exige consulta", () => {
  const result = compare(
    eventText(),
    next({ value: 100.01, originalValue: 125.01, netValue: 97.51 }),
  );
  expect(result.reasons).toContain("received_amount_regression");
});
it("recebido voltando a pendente não desfaz recebimento", () => {
  const result = compare(
    eventText(),
    next({ status: "PENDING" }, "PAYMENT_CREATED"),
  );
  expect(result.reasons).toContain("received_state_regression");
});
it("chargeback desaparecido não restaura valores", () => {
  const result = compare(
    eventText({ chargeback: { status: "REVERSED" } }),
    next(),
  );
  expect(result.reasons).toContain("chargeback_history_disappeared");
  expect(result.relation).toBe("reconcile");
});
it("campos desconhecidos não viram snapshot comparável a zero", () => {
  const result = compare(eventText({ refunds: null }), next());
  expect(result.reasons).toContain("incomparable_refunds");
  expect(result.reasons).toContain("observations_require_reconciliation");
});
it("replay incompleto permanece replay com reconciliação necessária", () => {
  const result = compare(
    eventText({ netValue: null }),
    eventText({ netValue: null }),
  );
  expect(result.relation).toBe("replay");
  expect(result.requiresAuthoritativeQuery).toBe(true);
});
it.each([
  { id: "pay_other" },
  { customer: "cus_other" },
  { externalReference: "00000000-0000-4000-8000-000000000003" },
])("dois snapshots precisam do mesmo vínculo esperado", (patch) => {
  expect(() => compare(eventText(), next(patch))).toThrow(AsaasContractError);
});

it("fato de estorno integral incompatível não sugere bruto conservado", () => {
  const snapshot = normalize(
    { status: "REFUNDED", refunds: [] },
    "PAYMENT_CHECKOUT_VIEWED",
  );
  expect(snapshot.reasons).toContain("refund_amount_unknown");
  expect(snapshot.amounts.grossLessCompletedRefundsCents).toBeNull();
});
it("contexto esperado é capturado uma vez e não mistura duas cobranças", () => {
  let reads = 0;
  const changingContext = {
    ...expected,
    get paymentId() {
      return ++reads === 1 ? "pay_fixture" : "pay_other";
    },
  };
  expect(() =>
    compareAsaasFinancialEvents(
      eventText(),
      next({ id: "pay_other" }),
      scope,
      changingContext,
    ),
  ).toThrow(AsaasContractError);
});
it("visualização seguida de recebimento não é igualdade semântica financeira", () => {
  const result = compare(
    eventText({}, { type: "PAYMENT_CHECKOUT_VIEWED" }),
    next(),
  );
  expect(result.previous.snapshot.amounts.receivedCents).toBeNull();
  expect(result.current.snapshot.amounts.receivedCents).toBe(12501);
  expect(result.relation).toBe("cumulative_candidate");
  expect(result.requiresAuthoritativeQuery).toBe(true);
});
it.each([
  "RECEIVED",
  "CONFIRMED",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "REFUNDED",
])("bruto conhecido em %s não diminui silenciosamente", (status) => {
  const refunds =
    status === "REFUNDED"
      ? [refund(125.01)]
      : status === "REFUND_REQUESTED" || status === "REFUND_IN_PROGRESS"
        ? [refund(10.01, "PENDING")]
        : [];
  const type =
    status === "REFUNDED"
      ? "PAYMENT_REFUNDED"
      : status === "CONFIRMED"
        ? "PAYMENT_CONFIRMED"
        : status === "REFUND_REQUESTED" || status === "REFUND_IN_PROGRESS"
          ? "PAYMENT_REFUND_IN_PROGRESS"
          : "PAYMENT_RECEIVED";
  const result = compare(
    eventText({ status, refunds }, { type }),
    next({ value: 100.01, originalValue: 125.01, netValue: 97.51 }),
  );
  expect(result.reasons).toContain("received_amount_regression");
  expect(result.relation).toBe("reconcile");
});
it.each(["RECEIVED", "CONFIRMED", "REFUND_IN_PROGRESS"])(
  "DONE integral com estado %s contraditório permanece conciliável",
  (status) => {
    const snapshot = normalizeAsaasPaymentSnapshot(
      paymentText({ status, refunds: [refund(125.01)] }),
      scope,
      expected,
    );
    expect(snapshot.reasons).toContain("incompatible_event_status");
    expect(snapshot.amounts.grossLessCompletedRefundsCents).toBeNull();
  },
);
it.each(["BOLETO", "CREDIT_CARD"])(
  "confirmado permanece confirmado com nova observação de líquido (%s)",
  (billingType) => {
    const before = eventText(
      { status: "CONFIRMED", billingType },
      { type: "PAYMENT_CONFIRMED" },
    );
    const after = next(
      { status: "CONFIRMED", billingType, netValue: 122.5 },
      "PAYMENT_CONFIRMED",
    );
    const result = compareAsaasFinancialEvents(before, after, scope, {
      ...expected,
      billingType,
    });
    expect(result.relation).toBe("cumulative_candidate");
    expect(result.requiresAuthoritativeQuery).toBe(true);
    expect(result.reasons).not.toContain("received_state_regression");
  },
);
it("recebido voltar a confirmado continua regressão de estado", () => {
  const before = eventText({ billingType: "BOLETO" });
  const after = next(
    { status: "CONFIRMED", billingType: "BOLETO" },
    "PAYMENT_CONFIRMED",
  );
  expect(
    compareAsaasFinancialEvents(before, after, scope, {
      ...expected,
      billingType: "BOLETO",
    }).reasons,
  ).toContain("received_state_regression");
});
