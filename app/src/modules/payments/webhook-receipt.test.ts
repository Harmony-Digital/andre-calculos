import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSystemClient: () => ({ rpc }),
}));
import { fixtureAsaasWebhookResponse } from "./webhook-receipt";
const scope = "00000000-0000-4000-8000-000000000902";
const token = "ficticio-webhook-token-somente-teste-2026";
const receipt = {
  schemaVersion: 1,
  kind: "recorded",
  eventId: "00000000-0000-4000-8000-000000000903",
  conflictId: null,
  queueState: "pending",
};
const incoming = () =>
  new Request("https://example.test/api/webhooks/asaas", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "asaas-access-token": token,
    },
    body: JSON.stringify({
      id: "evt_fixture&1",
      event: "PAYMENT_RECEIVED",
      dateCreated: "2026-10-12 10:00:00",
      account: { id: "account_fixture" },
      payment: {
        id: "pay_fixture",
        value: 125.01,
        invoiceUrl: "DADO_PRIVADO_FICTICIO",
      },
    }),
  });
beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: receipt, error: null });
  vi.stubEnv("ANDRE_LOCAL_TESTS", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_SCOPE_ID", scope);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID", "account_fixture");
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_TOKEN", token);
});
afterEach(() => vi.unstubAllEnvs());
it("não envia ACK enquanto a persistência está pendente", async () => {
  let complete!: (value: unknown) => void;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  rpc.mockReturnValue(pending);
  let settled = false;
  const result = fixtureAsaasWebhookResponse(incoming()).then((response) => {
    settled = true;
    return response;
  });
  await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
  expect(settled).toBe(false);
  expect(rpc.mock.calls[0][0]).toBe("receive_fixture_payment_webhook");
  expect(rpc.mock.calls[0][1].target_scope).toBe(scope);
  expect(rpc.mock.calls[0][1].body_text).not.toContain("DADO_PRIVADO_FICTICIO");
  expect(rpc.mock.calls[0][1].source_hash).toMatch(/^[a-f0-9]{64}$/);
  complete({ data: receipt, error: null });
  const response = await result;
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ received: true });
});
it("erro da persistência usa resposta fixa sem token, body ou URL", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { message: token + "DADO_PRIVADO_FICTICIO" },
  });
  const response = await fixtureAsaasWebhookResponse(incoming());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ received: false });
});
it.each([
  {},
  { ...receipt, kind: "conflict" },
  { ...receipt, queueState: "done" },
  { ...receipt, privateBody: token },
])("recibo incompleto/incompatível não confirma recepção", async (data) => {
  rpc.mockResolvedValue({ data, error: null });
  expect((await fixtureAsaasWebhookResponse(incoming())).status).toBe(503);
});
it.each([
  ["ANDRE_LOCAL_TESTS", "0"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://qtofwbxujshroaafxowr.supabase.co"],
  ["NODE_ENV", "production"],
  ["VERCEL", "1"],
  ["VERCEL_ENV", "preview"],
  ["ANDRE_WEBHOOK_FIXTURE_SCOPE_ID", ""],
  ["ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID", ""],
  ["ANDRE_WEBHOOK_FIXTURE_TOKEN", ""],
])("configuração %s=%s impede leitura e persistência", async (key, value) => {
  vi.stubEnv(key, value);
  const request = incoming(),
    reader = vi.spyOn(request.body!, "getReader");
  expect((await fixtureAsaasWebhookResponse(request)).status).toBe(503);
  expect(reader).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
