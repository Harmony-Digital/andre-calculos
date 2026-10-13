import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSystemClient: () => ({ rpc: state.rpc }),
}));
import {
  allocateFixtureFinancialQuery,
  queryFixtureFinancialObservation,
  startFixtureFinancialQuery,
  finishFixtureFinancialQuery,
  captureFixtureFinancialObservation,
  financialQuerySchema,
} from "./financial-worker";
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002";
const query = financialQuerySchema.parse({
  queryId: a,
  chargeId: b,
  workerId: a,
  revision: 1,
  scopeId: a,
  clientId: a,
  expectation: {
    phase: "observation",
    scope: {
      provider: "asaas",
      environment: "sandbox",
      accountId: "account_fixture",
    },
    paymentId: "pay_fixture",
    customerId: "cus_fixture",
    reference: a,
    contractedCents: 100,
    billingType: "PIX",
    dueDate: "2026-10-20",
  },
  started: false,
  finished: false,
  protocol: null,
});
beforeEach(() => {
  vi.stubEnv("ANDRE_LOCAL_TESTS", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  state.rpc.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  () => allocateFixtureFinancialQuery(a, b),
  () => queryFixtureFinancialObservation(a, b),
  () => startFixtureFinancialQuery(query),
  () => finishFixtureFinancialQuery(query),
  () => captureFixtureFinancialObservation(a),
])("fronteira financeira não expõe erro bruto", async (operation) => {
  state.rpc.mockRejectedValue(new Error("conteúdo sigiloso de teste"));
  await expect(operation()).rejects.toThrow(
    "Observação financeira fictícia indisponível.",
  );
});
it.each(["VERCEL", "VERCEL_ENV"])(
  "%s recusa a fixture antes de RPC",
  async (name) => {
    vi.stubEnv(name, "production");
    await expect(allocateFixtureFinancialQuery(a, b)).rejects.toThrow(
      "Observação financeira fictícia indisponível.",
    );
    expect(state.rpc).not.toHaveBeenCalled();
  },
);
it("outra URL do Supabase recusa a fixture", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://outro.supabase.co");
  await expect(queryFixtureFinancialObservation(a, b)).rejects.toThrow(
    "Observação financeira fictícia indisponível.",
  );
  expect(state.rpc).not.toHaveBeenCalled();
});
