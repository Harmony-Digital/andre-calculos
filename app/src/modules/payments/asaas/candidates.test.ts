import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  readAsaasCustomerCandidates,
  readAsaasPaymentCandidates,
  readAsaasScope,
} from "./contracts";
import { AsaasContractError } from "./errors";
const clientId = "00000000-0000-4000-8000-000000000001";
const reference = "00000000-0000-4000-8000-000000000002";
const scope = readAsaasScope({
  provider: "asaas",
  environment: "sandbox",
  accountId: "account_fixture",
});
const customer = { scope, clientId, kind: "person", document: "00000000191" };
const payment = {
  scope,
  customerId: "cus_fixture",
  reference,
  contractedCents: 12501,
};
const customerText = `{"id":"cus_fixture","cpfCnpj":"000.000.001-91","externalReference":"${clientId}","notificationDisabled":true}`;
const paymentText = `{"id":"pay_fixture","customer":"cus_fixture","externalReference":"${reference}","value":125.01,"status":"PENDING","billingType":"PIX","dueDate":"2026-10-20","deleted":false}`;
const list = (texts: string[]) =>
  `{"object":"list","offset":0,"limit":2,"totalCount":${texts.length},"hasMore":false,"data":[${texts.join(",")}]}`;
it("lista cadastral valida máscara, mantém flag e produz objetos congelados", () => {
  const page = readAsaasCustomerCandidates(
    list([customerText]),
    scope,
    customer,
  );
  expect(page.items[0].document).toBe(customer.document);
  expect(page.items[0].notificationDisabled).toBe(true);
  expect(Object.isFrozen(page)).toBe(true);
  expect(Object.isFrozen(page.items)).toBe(true);
  expect(Object.isFrozen(page.items[0])).toBe(true);
});
it.each([
  list([customerText, customerText]),
  list([
    customerText
      .replace("cus_fixture", "cus_other")
      .replace(clientId, reference),
  ]),
  list([customerText.replace("000.000.001-91", "000.000.002-72")]),
  list([customerText]).replace('"data":[', '"data":[null,'),
  list([customerText]).replace('"hasMore":false', '"hasMore":true'),
  list([customerText]).replace(
    '"totalCount":1',
    '"totalCount":1.0000000000000000001',
  ),
  list([customerText]).replace('"totalCount":1', '"totalCount":1e0'),
  list([customerText]).replace('"totalCount":1', '"totalCount":"1"'),
  list([customerText]).replace('"offset":0', '"offset":-0'),
  list([customerText]).replace('"limit":2', '"limit":2.0'),
  list([customerText]).replace(
    '"totalCount":1',
    '"totalCount":9007199254740992',
  ),
])("lista inválida não remove candidatos para parecer vazia", (text) => {
  expect(() => readAsaasCustomerCandidates(text, scope, customer)).toThrow(
    AsaasContractError,
  );
});
it("conta/env da lista devem conferir, mesmo com identificadores iguais", () => {
  expect(() =>
    readAsaasPaymentCandidates(
      list([paymentText]),
      { ...scope, environment: "production" },
      payment,
    ),
  ).toThrow(AsaasContractError);
});
it("moeda conserva lexema exato também dentro da lista", () => {
  const exact = paymentText.replace("125.01", "90071992547409.91");
  const page = readAsaasPaymentCandidates(list([exact]), scope, {
    ...payment,
    contractedCents: Number.MAX_SAFE_INTEGER,
  });
  expect(page.items[0].valueCents).toBe(Number.MAX_SAFE_INTEGER);
  expect(page.items[0].phase).toBe("observation");
});
it.each(["125.001", "1.2501e2", '"125.01"', "90071992547409.919", "-125.01"])(
  "lista não arredonda nem converte moeda ambígua %s",
  (value) => {
    expect(() =>
      readAsaasPaymentCandidates(
        list([paymentText.replace("125.01", value)]),
        scope,
        payment,
      ),
    ).toThrow(AsaasContractError);
  },
);
it("a lista nunca faz roundtrip JSON de um número antes da validação", () => {
  const text = list([
    paymentText.replace("125.01", "125.01000000000000000000000000000000000001"),
  ]);
  expect(() => readAsaasPaymentCandidates(text, scope, payment)).toThrow(
    AsaasContractError,
  );
});
it("campos futuros são descartados sem prejudicar vínculo e precisão", () => {
  const text = list([
    paymentText.replace(
      '"deleted":false',
      '"deleted":false,"newField":"fixture@example.invalid","creditCard":{"number":"fixture"}',
    ),
  ]);
  const page = readAsaasPaymentCandidates(text, scope, payment);
  expect(page.items[0].valueCents).toBe(12501);
  expect(JSON.stringify(page)).not.toMatch(/newField|creditCard|example/);
});
