import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSystemClient: mocks.client }));
import {
  createDurableAsaasFixturePort,
  getDurableFixtureTransportReceipt,
} from "./fixture-port";
import { readAsaasScope } from "./contracts";
import type { AsaasFixtureRequest } from "./adapter";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = { scopeId: uuid(1), clientId: uuid(2), slotId: uuid(3) };
const scope = readAsaasScope({
  provider: "asaas" as const,
  environment: "sandbox" as const,
  accountId: "fixture_account",
  walletId: "fixture_wallet",
});
const meta = {
  schemaVersion: 1,
  mode: "fixture",
  identityProof: "fixture_declared",
  scopeId: input.scopeId,
  clientId: input.clientId,
  scope,
};
const outcome = {
  kind: "response",
  scope,
  status: 200,
  bodyText: "{}",
};
const request = (patch: Record<string, unknown> = {}): AsaasFixtureRequest =>
  ({
    mode: "fixture" as const,
    scope,
    method: "GET" as const,
    url: "https://api-sandbox.asaas.com/v3/customers/cus_fixture",
    ...patch,
  }) as AsaasFixtureRequest;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ANDRE_LOCAL_TESTS", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NODE_ENV", "test");
  mocks.client.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "get_payment_fixture_scope" ? meta : outcome,
    error: null,
  }));
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  ["ANDRE_LOCAL_TESTS", ""],
  ["ANDRE_LOCAL_TESTS", "true"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://qtofwbxujshroaafxowr.supabase.co"],
  ["NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321"],
  ["VERCEL", "1"],
  ["VERCEL_ENV", "preview"],
  ["NODE_ENV", "production"],
])("%s=%s recusa antes de criar cliente de sistema", async (key, value) => {
  vi.stubEnv(key, value);
  await expect(createDurableAsaasFixturePort(input)).rejects.toThrow(
    "Transporte fictício indisponível.",
  );
  await expect(
    getDurableFixtureTransportReceipt({ ...input, operation: "customer_get" }),
  ).rejects.toThrow("Transporte fictício indisponível.");
  expect(mocks.client).not.toHaveBeenCalled();
});
it.each([
  { mode: "production" },
  { scopeId: uuid(9) },
  { clientId: uuid(9) },
  { identityProof: "authenticated" },
  { scope: { ...scope, environment: "production" } },
])("metadado inesperado %# não cria porta", async (patch) => {
  mocks.rpc.mockResolvedValue({ data: { ...meta, ...patch }, error: null });
  await expect(createDurableAsaasFixturePort(input)).rejects.toThrow(
    "Transporte fictício indisponível.",
  );
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("porta é fixa e revalida guarda local em cada envio", async () => {
  const port = await createDurableAsaasFixturePort(input);
  expect(Object.isFrozen(port)).toBe(true);
  expect(Object.isFrozen(port.scope)).toBe(true);
  vi.stubEnv("VERCEL", "1");
  await expect(port.send(request())).rejects.toThrow(
    "Transporte fictício indisponível.",
  );
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it.each([
  { mode: "production" },
  { method: "DELETE" },
  { scope: { ...scope, accountId: "outra_conta" } },
  { scope: { ...scope, walletId: "outra_carteira" } },
  { url: "https://api.asaas.com/v3/customers/cus_fixture" },
  { url: "https://outro.exemplo.com/v3/customers/cus_fixture" },
  { url: "https://nome:senha@api-sandbox.asaas.com/v3/customers/cus_fixture" },
  { url: "https://api-sandbox.asaas.com/v3/customers/cus_fixture#segredo" },
  { url: "https://api-sandbox.asaas.com/v3/customers/cus_fixture?extra=1" },
  { url: "https://api-sandbox.asaas.com/v3/customers/%63us_fixture" },
  { url: "https://api-sandbox.asaas.com/v3/notifications" },
  { bodyText: "{}" },
  { headers: { authorization: "SENTINELA_PRIVADA" } },
  {
    url: `https://api-sandbox.asaas.com/v3/customers?externalReference=${input.clientId}&cpfCnpj=11144477735&limit=2&limit=2&offset=0`,
  },
])("request inválido %# não chega ao RPC interno", async (patch) => {
  const port = await createDurableAsaasFixturePort(input);
  await expect(port.send(request(patch))).rejects.toThrow(
    "Transporte fictício indisponível.",
  );
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it.each(["{", '{"value":1,"value":2}', '{"customer":"cus_fixture"}'])(
  "POST inválido não ganha slot: %s",
  async (bodyText) => {
    const port = await createDurableAsaasFixturePort(input);
    await expect(
      port.send(
        request({
          method: "POST",
          url: "https://api-sandbox.asaas.com/v3/payments",
          bodyText,
        }),
      ),
    ).rejects.toThrow("Transporte fictício indisponível.");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  },
);
it("centavos máximos conservam token exato e chave estável em outra porta", async () => {
  const port = await createDurableAsaasFixturePort(input);
  const payment = request({
    method: "POST",
    url: "https://api-sandbox.asaas.com/v3/payments",
    bodyText: `{"customer":"cus_fixture","billingType":"PIX","value":90071992547409.91,"dueDate":"2026-10-20","externalReference":"${uuid(4)}"}`,
  });
  await port.send(payment);
  const first = mocks.rpc.mock.calls.at(-1)![1];
  expect(first.payload.amountCents).toBe(Number.MAX_SAFE_INTEGER);
  expect(first.request_id).toMatch(/^[a-f0-9-]{36}$/);
  expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  const another = await createDurableAsaasFixturePort(input);
  await another.send(payment);
  expect(mocks.rpc.mock.calls.at(-1)![1]).toEqual(first);
  await another.send(request());
  expect(mocks.rpc.mock.calls.at(-1)![1].request_id).not.toBe(first.request_id);
});
it("mesma operação/slot conserva chave e muda fingerprint quando corpo muda", async () => {
  const port = await createDurableAsaasFixturePort(input);
  const customer = request({
    method: "POST",
    url: "https://api-sandbox.asaas.com/v3/customers",
    bodyText: JSON.stringify({
      name: "Cliente inteiramente fictício",
      cpfCnpj: "11144477735",
      externalReference: input.clientId,
      notificationDisabled: true,
    }),
  });
  await port.send(customer);
  const first = mocks.rpc.mock.calls.at(-1)![1];
  await port.send({
    ...customer,
    bodyText: customer.bodyText!.replace("inteiramente", "totalmente"),
  });
  const second = mocks.rpc.mock.calls.at(-1)![1];
  expect(second.request_id).toBe(first.request_id);
  expect(second.fingerprint).not.toBe(first.fingerprint);
});
it("erros e resposta de outra conta não expõem dados internos", async () => {
  const port = await createDurableAsaasFixturePort(input);
  for (const result of [
    { data: null, error: { message: "DADO_PRIVADO", details: "SEGREDO" } },
    {
      data: { ...outcome, scope: { ...scope, accountId: "outra" } },
      error: null,
    },
  ]) {
    mocks.rpc.mockResolvedValueOnce(result);
    const failure = await port.send(request()).catch((error) => error);
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error("Erro esperado.");
    expect(failure.message).toBe("Transporte fictício indisponível.");
    expect(failure.cause).toBeUndefined();
    expect(JSON.stringify(failure)).not.toContain("PRIVADO");
  }
});
it("recibo ausente não é prova de não despacho; recibo cruzado é recusado", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
  const target = { ...input, operation: "customer_get" };
  expect(await getDurableFixtureTransportReceipt(target)).toBeNull();
  const requestId = mocks.rpc.mock.calls.at(-1)![1].request_id;
  const receipt = {
    schemaVersion: 1,
    mode: "fixture",
    identityProof: "fixture_declared",
    requestId,
    slotId: input.slotId,
    scopeId: input.scopeId,
    clientId: input.clientId,
    scope,
    operation: "customer_get",
    fingerprint: "a".repeat(64),
    recordedAt: "2026-10-11T15:00:00+00:00",
    outcome,
  };
  mocks.rpc.mockResolvedValueOnce({ data: receipt, error: null });
  expect(await getDurableFixtureTransportReceipt(target)).toEqual(receipt);
  mocks.rpc.mockResolvedValueOnce({
    data: { ...receipt, slotId: uuid(9) },
    error: null,
  });
  await expect(getDurableFixtureTransportReceipt(target)).rejects.toThrow(
    "Transporte fictício indisponível.",
  );
  for (const patch of [
    { accountId: "outra_conta" },
    { walletId: "outra_carteira" },
    { environment: "production" },
  ]) {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        ...receipt,
        outcome: { ...outcome, scope: { ...scope, ...patch } },
      },
      error: null,
    });
    await expect(getDurableFixtureTransportReceipt(target)).rejects.toThrow(
      "Transporte fictício indisponível.",
    );
  }
});
