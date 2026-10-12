import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createAsaasFixtureAdapter, type AsaasFixtureRequest } from "./adapter";
import { readAsaasScope } from "./contracts";
import { AsaasContractError } from "./errors";

const clientId = "00000000-0000-4000-8000-000000000001";
const reference = "00000000-0000-4000-8000-000000000002";
const scope = readAsaasScope({
  provider: "asaas",
  environment: "sandbox",
  accountId: "account_fixture_a",
  walletId: "wallet_fixture_a",
});
const input = {
  clientId,
  kind: "person",
  name: "Cliente Fictício",
  document: "00000000191",
};
const customer = {
  scope,
  customerId: "cus_fixture",
  clientId,
  kind: "person",
  document: input.document,
};
const customerText = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: "cus_fixture",
    cpfCnpj: input.document,
    externalReference: clientId,
    notificationDisabled: true,
    ...patch,
  });
const payment = {
  customer,
  reference,
  contractedCents: 12501,
  dueDate: "2026-10-20",
  billingType: "PIX",
};
const customerSearch = {
  scope,
  clientId,
  kind: input.kind,
  document: input.document,
};
const paymentSearch = {
  scope,
  customerId: "cus_fixture",
  reference,
  contractedCents: 12501,
  dueDate: payment.dueDate,
  billingType: "PIX",
};
const expected = {
  ...paymentSearch,
  phase: "observation",
  paymentId: "pay_fixture",
};
const paymentText = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: "pay_fixture",
    customer: "cus_fixture",
    externalReference: reference,
    value: 125.01,
    status: "PENDING",
    billingType: "PIX",
    dueDate: payment.dueDate,
    deleted: false,
    invoiceUrl: "https://sandbox.asaas.com/i/fixture",
    ...patch,
  });
const response = (bodyText: string, status = 200, source = scope) => ({
  kind: "response",
  scope: source,
  status,
  bodyText,
});
const list = (texts: string[], patch: Record<string, unknown> = {}) => {
  const metadata = JSON.stringify({
    object: "list",
    offset: 0,
    limit: 2,
    totalCount: texts.length,
    hasMore: false,
    ...patch,
  });
  return metadata.slice(0, -1) + ',"data":[' + texts.join(",") + "]}";
};
function fixture(outcomes: unknown[], alphanumericCnpj = "unverified") {
  const calls: AsaasFixtureRequest[] = [];
  const send = vi.fn(async (request: AsaasFixtureRequest) => {
    calls.push(request);
    const outcome = outcomes.shift();
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  const port = {
    mode: "fixture",
    scope,
    capabilities: { alphanumericCnpj },
    send,
  };
  return {
    calls,
    send,
    port,
    adapter: createAsaasFixtureAdapter(scope, port),
  };
}

it.each([
  { mode: "live" },
  { mode: undefined },
  { scope: { ...scope, environment: "production" } },
  { scope: { ...scope, accountId: "account_other_fixture" } },
  { scope: { ...scope, walletId: "wallet_other_fixture" } },
  { capabilities: {} },
  { capabilities: { alphanumericCnpj: true } },
  { send: undefined },
  { apiKey: "fixture-no-secret" },
])("porta incompleta, externa ou divergente não é habilitada", (patch) => {
  const { port, send } = fixture([]);
  expect(() => createAsaasFixtureAdapter(scope, { ...port, ...patch })).toThrow(
    AsaasContractError,
  );
  expect(send).not.toHaveBeenCalled();
});
it("metadados do ensaio são congelados e não alegam autenticação", () => {
  const { adapter, port } = fixture([]);
  port.capabilities.alphanumericCnpj = "supported";
  expect(adapter.capabilities.alphanumericCnpj).toBe("unverified");
  expect(Object.isFrozen(adapter)).toBe(true);
  expect(Object.isFrozen(adapter.scope)).toBe(true);
  expect(Object.isFrozen(adapter.capabilities)).toBe(true);
  expect(adapter.identityProof).toBe("fixture_declared");
});
it("cadastro emite whitelist, referência estável e supressão de notificações", async () => {
  const { adapter, calls } = fixture([response(customerText())]);
  const result = await adapter.createCustomer({
    ...input,
    email: "fixture@example.invalid",
    phone: "+5561999999999",
  });
  expect(result.kind).toBe("created");
  expect(result.mode).toBe("fixture");
  expect(result.identityProof).toBe("fixture_declared");
  expect(Object.isFrozen(result)).toBe(true);
  expect(calls).toHaveLength(1);
  expect(Object.isFrozen(calls[0])).toBe(true);
  expect(calls[0].method).toBe("POST");
  expect(calls[0].url).toBe("https://api-sandbox.asaas.com/v3/customers");
  expect(JSON.parse(calls[0].bodyText!)).toEqual({
    name: input.name,
    cpfCnpj: "00000000191",
    externalReference: clientId,
    notificationDisabled: true,
    email: "fixture@example.invalid",
    mobilePhone: "61999999999",
  });
  expect(JSON.stringify(result)).not.toContain("fixture@example.invalid");
});
it("contato opcional não é fabricado", async () => {
  const { adapter, calls } = fixture([response(customerText())]);
  await adapter.createCustomer(input);
  expect(calls[0].bodyText).not.toContain("email");
  expect(calls[0].bodyText).not.toContain("mobilePhone");
});
it.each([
  { document: null },
  { document: "000.000.001-91" },
  { creditCard: { number: "fixture" } },
  { url: "https://example.invalid" },
  { notificationDisabled: false },
])("cadastro inválido é recusado antes da porta", async (patch) => {
  const { adapter, calls } = fixture([]);
  await expect(adapter.createCustomer({ ...input, ...patch })).rejects.toThrow(
    AsaasContractError,
  );
  expect(calls).toHaveLength(0);
});
it.each(["unverified", "unsupported"])(
  "CNPJ alfanumérico depende de capacidade explícita da fixture (%s)",
  async (capability) => {
    const { adapter, calls } = fixture([], capability);
    await expect(
      adapter.createCustomer({
        ...input,
        kind: "company",
        document: "12ABC34501DE35",
      }),
    ).rejects.toThrow(AsaasContractError);
    expect(calls).toHaveLength(0);
  },
);
it("fixture com capacidade suporta letras sem modificar documento", async () => {
  const { adapter, calls } = fixture(
    [response(customerText({ cpfCnpj: "12ABC34501DE35" }))],
    "supported",
  );
  const result = await adapter.createCustomer({
    ...input,
    kind: "company",
    document: "12ABC34501DE35",
  });
  expect(result.kind).toBe("created");
  expect(calls[0].bodyText).toContain('"cpfCnpj":"12ABC34501DE35"');
});
it.each([
  customerText({ id: "../outro" }),
  customerText({ externalReference: reference }),
  customerText({ cpfCnpj: "00000000272" }),
  customerText({ notificationDisabled: false }),
  customerText({ notificationDisabled: undefined }),
  "{",
])(
  "resposta cadastral incoerente após POST permanece indeterminada",
  async (text) => {
    const { adapter, calls } = fixture([response(text)]);
    expect((await adapter.createCustomer(input)).kind).toBe("indeterminate");
    expect(calls).toHaveLength(1);
  },
);
it.each([
  { kind: "indeterminate", scope },
  new Error("contato-privado-fixture@example.invalid; body; token-ficticio"),
  { kind: "not_dispatched", scope, error: "fixture-raw" },
  { kind: "not_dispatched", scope: { ...scope, environment: "production" } },
  response(customerText(), 400),
  response(customerText(), 401),
  response(customerText(), 429),
  response(customerText(), 500),
  response(customerText(), 201),
  response(
    customerText(),
    200,
    readAsaasScope({ ...scope, accountId: "other" }),
  ),
  undefined,
])(
  "perda, erro ou resultado não confiável não repete POST",
  async (outcome) => {
    const { adapter, calls } = fixture([outcome]);
    const result = await adapter.createCustomer(input);
    expect(result).toEqual({
      mode: "fixture",
      identityProof: "fixture_declared",
      kind: "indeterminate",
    });
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/privado|token|body|error/);
  },
);
it("somente recusa explícita válida da porta representa POST não despachado", async () => {
  const { adapter, calls } = fixture([{ kind: "not_dispatched", scope }]);
  expect((await adapter.createCustomer(input)).kind).toBe("not_dispatched");
  expect(calls).toHaveLength(1);
});
it.each(["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"])(
  "cobrança %s confere cadastro e envia valor numérico exato uma vez",
  async (billingType) => {
    const { adapter, calls } = fixture([
      response(customerText()),
      response(paymentText({ billingType })),
    ]);
    const result = await adapter.createPayment({ ...payment, billingType });
    expect(result.kind).toBe("created");
    expect(calls.map((call) => call.method)).toEqual(["GET", "POST"]);
    expect(calls[0].url).toContain("/customers/cus_fixture");
    expect(calls[0]).not.toHaveProperty("bodyText");
    expect(calls[1].bodyText).toBe(
      `{"customer":"cus_fixture","billingType":"${billingType}","value":125.01,"dueDate":"2026-10-20","externalReference":"${reference}"}`,
    );
    expect(calls[1].bodyText).not.toMatch(
      /creditCard|token|callback|split|email/,
    );
    expect(result).not.toHaveProperty("paid");
  },
);
it("centavos no limite seguro não viram moeda arredondada no POST", async () => {
  const maximum = "90071992547409.91";
  const { adapter, calls } = fixture([
    response(customerText()),
    response(paymentText().replace("125.01", maximum)),
  ]);
  const result = await adapter.createPayment({
    ...payment,
    contractedCents: Number.MAX_SAFE_INTEGER,
  });
  expect(result.kind).toBe("created");
  expect(calls[1].bodyText).toContain('"value":' + maximum + ",");
});
it.each([
  { contractedCents: 0 },
  { contractedCents: 125.001 },
  { contractedCents: Number.MAX_SAFE_INTEGER + 1 },
  { dueDate: "2026-02-30" },
  { billingType: "ARBITRARY" },
  { creditCard: "fixture" },
  { customer: { ...customer, customerId: undefined } },
  { customer: { ...customer, scope: { ...scope, environment: "production" } } },
  { customer: { ...customer, document: null } },
])(
  "cobrança inválida falha antes de qualquer consulta ou criação",
  async (patch) => {
    const { adapter, calls } = fixture([]);
    await expect(
      adapter.createPayment({ ...payment, ...patch }),
    ).rejects.toThrow(AsaasContractError);
    expect(calls).toHaveLength(0);
  },
);
it.each([
  response(customerText({ id: "cus_other" })),
  response(customerText({ notificationDisabled: false })),
  response(customerText({ notificationDisabled: undefined })),
  response(customerText(), 404),
  response("{"),
  new Error("fixture-private"),
])("cliente não conferido impede o POST da cobrança", async (outcome) => {
  const { adapter, calls } = fixture([outcome]);
  expect((await adapter.createPayment(payment)).kind).toBe("not_dispatched");
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("GET");
});
it.each([
  paymentText({ billingType: "BOLETO" }),
  paymentText({ dueDate: "2026-10-21" }),
  paymentText({ customer: "cus_other" }),
  paymentText({ externalReference: clientId }),
  paymentText({ value: 125.02 }),
  paymentText({ value: 120, originalValue: 125.01 }),
  paymentText({ deleted: true }),
  paymentText({ invoiceUrl: "https://example.invalid/i/private-fixture" }),
])(
  "resposta da cobrança divergente não permite recriação automática",
  async (text) => {
    const { adapter, calls } = fixture([
      response(customerText()),
      response(text),
    ]);
    expect((await adapter.createPayment(payment)).kind).toBe("indeterminate");
    expect(calls.map((call) => call.method)).toEqual(["GET", "POST"]);
  },
);
it("POST perdido seguido de busca vazia continua inconclusivo sem novo POST", async () => {
  const { adapter, calls } = fixture([
    response(customerText()),
    new Error("fixture-timeout"),
    response(list([])),
  ]);
  expect((await adapter.createPayment(payment)).kind).toBe("indeterminate");
  expect(await adapter.findPayment(paymentSearch)).toMatchObject({
    kind: "reconcile",
    reason: "not_located",
  });
  expect(calls.map((call) => call.method)).toEqual(["GET", "POST", "GET"]);
});
it("consulta vincula ID exato sem body e preserva observação parcial", async () => {
  const { adapter, calls } = fixture([
    response(paymentText({ value: 100, originalValue: 125.01 })),
  ]);
  const result = await adapter.getPayment(expected);
  expect(result.kind).toBe("observed");
  if (result.kind === "observed") {
    expect(result.value.valueCents).toBe(10000);
    expect(result.value.contractedCents).toBe(12501);
  }
  expect(calls[0].url).toBe(
    "https://api-sandbox.asaas.com/v3/payments/pay_fixture",
  );
  expect(calls[0]).not.toHaveProperty("bodyText");
});
it.each([
  { paymentId: undefined },
  { phase: "creation" },
  { paymentId: "../other" },
  { scope: { ...scope, accountId: "other" } },
])("consulta inválida não despacha", async (patch) => {
  const { adapter, calls } = fixture([]);
  await expect(adapter.getPayment({ ...expected, ...patch })).rejects.toThrow(
    AsaasContractError,
  );
  expect(calls).toHaveLength(0);
});
it.each([404, 400, 401, 403, 429, 500])(
  "GET %s não prova ausência nem recria",
  async (status) => {
    const { adapter, calls } = fixture([response(paymentText(), status)]);
    expect(await adapter.getPayment(expected)).toMatchObject({
      kind: "reconcile",
      reason: "unavailable",
    });
    expect(calls.map((call) => call.method)).toEqual(["GET"]);
  },
);
it("fatura pendente é obtida por vínculo exato e permanece somente na resposta privada", async () => {
  const { adapter, calls } = fixture([response(paymentText())]);
  const result = await adapter.getInvoice(expected);
  expect(result).toMatchObject({
    kind: "observed",
    value: "https://sandbox.asaas.com/i/fixture",
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).not.toContain("/i/");
});
it.each([
  { value: 150, originalValue: 125.01 },
  { value: 100, originalValue: 125.01 },
  { status: "RECEIVED" },
  { status: "CONFIRMED" },
  { status: "OVERDUE" },
  { status: "FUTURE_UNKNOWN" },
  { deleted: true },
  { invoiceUrl: null },
  { chargeback: { status: "REQUESTED" } },
  {
    refunds: [
      { value: 1, status: "PENDING", dateCreated: "2026-10-11 16:00:00" },
    ],
  },
])(
  "fatura só é disponibilizada no estado seguro configurado",
  async (patch) => {
    const { adapter } = fixture([response(paymentText(patch))]);
    expect(await adapter.getInvoice(expected)).toMatchObject({
      kind: "reconcile",
      reason: "invoice_unavailable",
    });
  },
);
it.each([
  "https://www.asaas.com/i/fixture",
  "https://sandbox.asaas.com.attacker.invalid/i/fixture",
  "https://fixture:sensitive@sandbox.asaas.com/i/fixture",
  "https://sandbox.asaas.com/i/fixture?token=private-fixture",
  "https://sandbox.asaas.com/i/fixture#fixture",
])("URL não validada não é disponibilizada", async (invoiceUrl) => {
  const { adapter } = fixture([response(paymentText({ invoiceUrl }))]);
  expect(await adapter.getInvoice(expected)).toMatchObject({
    kind: "reconcile",
    reason: "unavailable",
  });
});
it("cliente conhecido é consultado sem body e com vínculo local validado", async () => {
  const { adapter, calls } = fixture([response(customerText())]);
  expect((await adapter.getCustomer(customer)).kind).toBe("observed");
  expect(calls[0]).not.toHaveProperty("bodyText");
  expect(calls[0].url).toBe(
    "https://api-sandbox.asaas.com/v3/customers/cus_fixture",
  );
});
it.each(["customer", "payment"])(
  "busca %s usa filtros próprios sem status",
  async (target) => {
    const { adapter, calls } = fixture([
      response(list([target === "customer" ? customerText() : paymentText()])),
    ]);
    const result =
      target === "customer"
        ? await adapter.findCustomer(customerSearch)
        : await adapter.findPayment(paymentSearch);
    expect(result.kind).toBe("observed");
    const url = new URL(calls[0].url);
    expect(Object.fromEntries(url.searchParams)).toEqual(
      target === "customer"
        ? {
            externalReference: clientId,
            cpfCnpj: input.document,
            limit: "2",
            offset: "0",
          }
        : {
            customer: "cus_fixture",
            externalReference: reference,
            limit: "2",
            offset: "0",
          },
    );
    expect(calls[0]).not.toHaveProperty("bodyText");
    expect(calls).toHaveLength(1);
  },
);
it.each([
  [list([]), "not_located"],
  [
    list([paymentText(), paymentText({ id: "pay_second" })]),
    "multiple_candidates",
  ],
  [
    list([paymentText(), paymentText({ id: "pay_second" })], {
      hasMore: true,
      totalCount: 3,
    }),
    "incomplete_list",
  ],
  [list([paymentText(), paymentText()]), "unavailable"],
  [list([paymentText()], { hasMore: true, totalCount: 3 }), "unavailable"],
  [list([paymentText()], { totalCount: 0 }), "unavailable"],
  [list([paymentText()], { totalCount: 1.5 }), "unavailable"],
  [list([paymentText()], { offset: 2 }), "unavailable"],
  [list([paymentText()], { limit: 10 }), "unavailable"],
  [list([paymentText()], { object: "other" }), "unavailable"],
  [list([paymentText({ externalReference: clientId })]), "unavailable"],
  [list([paymentText({ value: 125.02 })]), "unavailable"],
  ["{", "unavailable"],
])(
  "lista %s não fabrica unicidade/ausência em caso inseguro",
  async (text, reason) => {
    const { adapter, calls } = fixture([response(text)]);
    expect(await adapter.findPayment(paymentSearch)).toMatchObject({
      kind: "reconcile",
      reason,
    });
    expect(calls.map((call) => call.method)).toEqual(["GET"]);
  },
);
it("cobrança cancelada encontrada continua observação, nunca vira ausente", async () => {
  const { adapter } = fixture([
    response(list([paymentText({ deleted: true, status: "REFUNDED" })])),
  ]);
  const result = await adapter.findPayment(paymentSearch);
  expect(result.kind).toBe("observed");
  if (result.kind === "observed") expect(result.value.deleted).toBe(true);
});
it("ambiente explicitamente configurado não cai em outro host", async () => {
  const production = readAsaasScope({ ...scope, environment: "production" });
  const send = vi.fn(async (request: AsaasFixtureRequest) =>
    response(customerText(), 200, request.scope),
  );
  const adapter = createAsaasFixtureAdapter(production, {
    mode: "fixture",
    scope: production,
    capabilities: { alphanumericCnpj: "unverified" },
    send,
  });
  expect((await adapter.createCustomer(input)).kind).toBe("created");
  expect(send.mock.calls[0][0]).toMatchObject({
    url: "https://api.asaas.com/v3/customers",
  });
});

it.each([
  { dueDate: undefined },
  { billingType: undefined },
  { billingType: "UNKNOWN" },
])(
  "fatura precisa de vencimento e meio esperados antes da consulta",
  async (patch) => {
    const { adapter, calls } = fixture([]);
    await expect(adapter.getInvoice({ ...expected, ...patch })).rejects.toThrow(
      AsaasContractError,
    );
    expect(calls).toHaveLength(0);
  },
);
