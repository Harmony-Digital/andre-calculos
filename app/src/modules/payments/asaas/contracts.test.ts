import { expect, expectTypeOf, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  readAsaasScope,
  readAsaasCustomerInput,
  readAsaasCustomer,
  readAsaasPayment,
  readAsaasEvent,
  type AsaasAccountId,
  type AsaasWalletId,
} from "./contracts";
import { AsaasContractError } from "./errors";

const clientId = "00000000-0000-4000-8000-000000000001";
const reference = "00000000-0000-4000-8000-000000000002";
const scope = readAsaasScope({
  provider: "asaas",
  environment: "sandbox",
  accountId: "account_fixture_a",
  walletId: "wallet_fixture_a",
});
const customerExpected = {
  scope,
  customerId: "cus_fixture",
  clientId,
  kind: "person",
  document: "00000000191",
};
const paymentExpected = {
  scope,
  phase: "observation",
  paymentId: "pay_fixture",
  customerId: "cus_fixture",
  reference,
  contractedCents: 12501,
  dueDate: "2026-10-20",
};
const customerText = `{"id":"cus_fixture","cpfCnpj":"00000000191","externalReference":"${clientId}","name":"Advogada Fictícia","email":"fixture@example.invalid"}`;
const paymentText = `{"id":"pay_fixture","customer":"cus_fixture","externalReference":"${reference}","value":125.01,"netValue":122.51,"status":"RECEIVED","billingType":"PIX","dueDate":"2026-10-20","deleted":false,"invoiceUrl":"https://sandbox.asaas.com/i/fixture","refunds":null,"chargeback":null}`;
const eventText = (payment = paymentText) =>
  `{"id":"evt_fixture&1","event":"PAYMENT_RECEIVED","dateCreated":"2026-10-11 16:00:00","account":{"id":"account_fixture_a","ownerId":"parent_fixture"},"payment":${payment}}`;

it("conta e carteira são tipos distintos, com configuração imutável", () => {
  expectTypeOf<AsaasWalletId>().not.toMatchTypeOf<AsaasAccountId>();
  expect(Object.isFrozen(scope)).toBe(true);
  expect(scope.accountId).not.toBe(scope.walletId);
});
it.each([
  undefined,
  {},
  { ...scope, environment: undefined },
  { ...scope, environment: "staging" },
  { ...scope, provider: "outro" },
  { ...scope, accountId: "../outra" },
  { ...scope, apiKey: "ficticio-nao-secreto" },
])("configuração incompleta ou arbitrária não ganha padrão", (value) => {
  expect(() => readAsaasScope(value)).toThrow(AsaasContractError);
});
it.each([
  ["person", "00000000191"],
  ["company", "00000000000191"],
  ["company", "12ABC34501DE35"],
])("cadastro textual preserva CPF/CNPJ (%s)", (kind, document) => {
  const result = readAsaasCustomerInput({
    clientId,
    kind,
    document,
    name: "Cliente Fictício",
  });
  expect(result.document).toBe(document);
  expect(Object.isFrozen(result)).toBe(true);
});
it.each([
  { document: "00000000000" },
  { document: "000.000.001-91" },
  { document: 191 },
  { kind: "company", document: "00000000191" },
  { name: " X " },
  { phone: "5561999999999" },
  { phone: "+5520999999999" },
  { creditCard: { number: "ficticio-nao-secreto" } },
  { url: "https://example.invalid" },
])("input de cliente recusa documento/campos inválidos", (patch) => {
  expect(() =>
    readAsaasCustomerInput({
      clientId,
      kind: "person",
      document: "00000000191",
      name: "Cliente Fictício",
      ...patch,
    }),
  ).toThrow(AsaasContractError);
});
it("resposta cadastral vincula documento e referência, descartando contato", () => {
  const result = readAsaasCustomer(customerText, scope, customerExpected);
  expect(result.customerId).toBe("cus_fixture");
  expect(result.document).toBe("00000000191");
  expect(Object.keys(result).sort()).toEqual(
    ["scope", "customerId", "clientId", "kind", "document"].sort(),
  );
  expect(JSON.stringify(result)).not.toContain("fixture@example.invalid");
});

it("nome segue o limite de pontos de código do cadastro", () => {
  const input = {
    clientId,
    kind: "person",
    document: "00000000191",
    name: "𠀀".repeat(200),
  };
  expect(readAsaasCustomerInput(input).name).toBe(input.name);
  expect(() =>
    readAsaasCustomerInput({ ...input, name: "𠀀".repeat(201) }),
  ).toThrow(AsaasContractError);
  expect(() =>
    readAsaasCustomerInput({ ...input, name: "𠀀".repeat(2) }),
  ).toThrow(AsaasContractError);
});
it("máscara de resposta é normalizada sem apagar letras do CNPJ", () => {
  const text = customerText.replace("00000000191", "12.abc.345/01de-35");
  const result = readAsaasCustomer(text, scope, {
    ...customerExpected,
    kind: "company",
    document: "12ABC34501DE35",
  });
  expect(result.document).toBe("12ABC34501DE35");
});
it.each([
  [scope, { ...customerExpected, customerId: "cus_other" }],
  [scope, { ...customerExpected, clientId: reference }],
  [scope, { ...customerExpected, document: "00000000000191", kind: "company" }],
  [{ ...scope, accountId: "account_other" }, customerExpected],
  [{ ...scope, environment: "production" }, customerExpected],
  [{ ...scope, walletId: "wallet_other" }, customerExpected],
])("recusa vínculo cadastral/escopo divergente", (source, expected) => {
  expect(() => readAsaasCustomer(customerText, source, expected)).toThrow(
    "Identidade do provedor divergente.",
  );
});
it("cobrança conserva bruto, líquido e original sem inventar crédito", () => {
  const result = readAsaasPayment(paymentText, scope, paymentExpected);
  expect(result).toMatchObject({
    valueCents: 12501,
    contractedCents: 12501,
    providerOriginalCents: null,
    netCents: 12251,
    phase: "observation",
    refunds: null,
  });
  expect(result).not.toHaveProperty("confirmedCents");
  expect(result).not.toHaveProperty("creditCents");
  expect(Object.isFrozen(result)).toBe(true);
});
it.each(["100.00", "130.00"])(
  "observação de parcial/excedente conserva original conhecido (%s)",
  (value) => {
    const text = paymentText.replace(
      '"value":125.01',
      `"value":${value},"originalValue":125.01`,
    );
    const result = readAsaasPayment(text, scope, paymentExpected);
    expect(result.providerOriginalCents).toBe(12501);
    expect(result.contractedCents).toBe(12501);
    expect(result.valueCents).toBe(value === "100.00" ? 10000 : 13000);
  },
);
it("valor líquido assinado continua separado e não modifica bruto", () => {
  const result = readAsaasPayment(
    paymentText.replace('"netValue":122.51', '"netValue":-0.99'),
    scope,
    paymentExpected,
  );
  expect(result.valueCents).toBe(12501);
  expect(result.netCents).toBe(-99);
});
it.each([
  { paymentId: "pay_other" },
  { customerId: "cus_other" },
  { reference: clientId },
  { contractedCents: 12500 },
  { dueDate: "2026-10-21" },
])("consulta recusa obrigação divergente", (patch) => {
  expect(() =>
    readAsaasPayment(paymentText, scope, { ...paymentExpected, ...patch }),
  ).toThrow("Vínculo da cobrança divergente.");
});
it.each([
  undefined,
  null,
  {},
  { ...paymentExpected, paymentId: undefined },
  { ...paymentExpected, contractedCents: 1.5 },
  { ...paymentExpected, phase: "unknown" },
])("consulta exige contexto explícito completo", (expected) => {
  expect(() => readAsaasPayment(paymentText, scope, expected)).toThrow(
    AsaasContractError,
  );
});
it("criação aceita ID novo mas não aceita valor alterado nem concede crédito", () => {
  const expected = {
    ...paymentExpected,
    phase: "creation",
    paymentId: undefined,
  };
  expect(readAsaasPayment(paymentText, scope, expected).phase).toBe("creation");
  expect(() =>
    readAsaasPayment(
      paymentText.replace(
        '"value":125.01',
        '"value":100.00,"originalValue":125.01',
      ),
      scope,
      expected,
    ),
  ).toThrow("Vínculo da cobrança divergente.");
});
it("estornos múltiplos conservam status e valor de cada item", () => {
  const refunds =
    '[{"dateCreated":"2026-10-11 16:00:00","value":10.01,"status":"DONE","description":"texto fictício privado","transactionReceiptUrl":"https://example.invalid/private"},{"dateCreated":"2026-10-11 16:01:00","value":20.00,"status":"PENDING"},{"dateCreated":"2026-10-11 16:02:00","value":5.00,"status":"CANCELLED"}]';
  const result = readAsaasPayment(
    paymentText.replace('"refunds":null', '"refunds":' + refunds),
    scope,
    paymentExpected,
  );
  expect(result.refunds?.map((r) => [r.valueCents, r.status])).toEqual([
    [1001, "DONE"],
    [2000, "PENDING"],
    [500, "CANCELLED"],
  ]);
  expect(Object.isFrozen(result.refunds)).toBe(true);
  expect(Object.isFrozen(result.refunds?.[0])).toBe(true);
  expect(JSON.stringify(result)).not.toContain("texto fictício privado");
  expect(JSON.stringify(result)).not.toContain("example.invalid");
  expect(result.valueCents).toBe(12501);
});
it("enum futuro/chargeback sem montante permanece fato para reconciliação", () => {
  const result = readAsaasEvent(
    eventText(
      paymentText.replace(
        '"chargeback":null',
        '"chargeback":{"status":"FUTURE_STATUS","reason":"conteudo-ficticio-privado"}',
      ),
    ).replace("PAYMENT_RECEIVED", "PAYMENT_FUTURE_EVENT"),
    scope,
    paymentExpected,
  );
  expect(result.eventType).toBe("PAYMENT_FUTURE_EVENT");
  expect(result.payment.chargeback).toEqual({ status: "FUTURE_STATUS" });
  expect(result.payment.chargeback).not.toHaveProperty("amountCents");
  expect(JSON.stringify(result)).not.toContain("conteudo-ficticio-privado");
});
it("envelope confere conta declarada, sem afirmar autenticidade", () => {
  const result = readAsaasEvent(eventText(), scope, paymentExpected);
  expect(result.declaredAccountId).toBe(scope.accountId);
  expect(result.eventId).toBe("evt_fixture&1");
  expect(result.providerCreatedAt).toBe("2026-10-11 16:00:00");
  expect(result).not.toHaveProperty("authenticated");
  expect(() =>
    readAsaasEvent(
      eventText().replace(
        '"id":"account_fixture_a"',
        '"id":"wallet_fixture_a"',
      ),
      scope,
      paymentExpected,
    ),
  ).toThrow("Identidade do provedor divergente.");
  expect(() =>
    readAsaasEvent(
      eventText(),
      { ...scope, environment: "production" },
      paymentExpected,
    ),
  ).toThrow("Identidade do provedor divergente.");
});
it.each([
  '"value":0',
  '"value":-1',
  '"value":125.011',
  '"value":1e2',
  '"value":"125.01"',
  '"value":0.10000000000000001',
])(
  "resposta monetária inválida não vira número arredondado (%s)",
  (replacement) => {
    expect(() =>
      readAsaasPayment(
        paymentText.replace('"value":125.01', replacement),
        scope,
        paymentExpected,
      ),
    ).toThrow(AsaasContractError);
  },
);
it.each([
  '"dueDate":"2026-02-30"',
  '"dueDate":null',
  '"id":123',
  '"customer":null',
  '"externalReference":null',
])("campo requerido inválido é sanitizado (%s)", (replacement) => {
  const key = replacement.slice(0, replacement.indexOf(":"));
  const original = paymentText.match(new RegExp(key + ":[^,}]+"))![0];
  expect(() =>
    readAsaasPayment(
      paymentText.replace(original, replacement),
      scope,
      paymentExpected,
    ),
  ).toThrow(AsaasContractError);
});
it.each([
  "http://sandbox.asaas.com/i/fixture",
  "https://www.asaas.com/i/fixture",
  "https://example.invalid/i/fixture",
  "https://sandbox.asaas.com.evil.invalid/i/fixture",
  "https://user@sandbox.asaas.com/i/fixture",
  "https://sandbox.asaas.com/i/fixture?private=1",
  "https://sandbox.asaas.com/i/fixture#data",
  "https://sandbox.asaas.com/i/../other",
])("URL privada respeita ambiente e origem (%s)", (url) => {
  expect(() =>
    readAsaasPayment(
      paymentText.replace("https://sandbox.asaas.com/i/fixture", url),
      scope,
      paymentExpected,
    ),
  ).toThrow(AsaasContractError);
});
it("produção exige seu próprio vínculo e origem da fatura", () => {
  const production = readAsaasScope({
    ...scope,
    environment: "production",
    accountId: "account_fixture_prod",
    walletId: "wallet_fixture_prod",
  });
  const result = readAsaasPayment(
    paymentText.replace("https://sandbox.asaas.com", "https://www.asaas.com"),
    production,
    { ...paymentExpected, scope: production },
  );
  expect(result.scope.environment).toBe("production");
});
it("dados novos e cartão são descartados na projeção mínima", () => {
  const text = paymentText.replace(
    '"deleted":false',
    '"deleted":false,"creditCard":{"creditCardToken":"ficticio-nao-secreto"},"futureAttribute":{"unknown":1},"description":"conteudo-ficticio-privado"',
  );
  const result = readAsaasPayment(text, scope, paymentExpected);
  expect(result).not.toHaveProperty("creditCard");
  expect(result).not.toHaveProperty("futureAttribute");
  expect(JSON.stringify(result)).not.toContain("conteudo-ficticio-privado");
});
