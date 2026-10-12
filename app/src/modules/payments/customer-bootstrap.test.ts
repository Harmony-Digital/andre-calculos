import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  session: vi.fn(),
  system: vi.fn(),
  rpc: vi.fn(),
  port: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  find: vi.fn(),
}));
vi.mock("@/modules/auth/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: mocks.session,
}));
vi.mock("@/lib/supabase/admin", () => ({ createSystemClient: mocks.system }));
vi.mock("./asaas/fixture-port", () => ({
  createDurableAsaasFixturePort: mocks.port,
}));
vi.mock("./asaas/adapter", () => ({
  createAsaasFixtureAdapter: () => ({
    createCustomer: mocks.create,
    getCustomer: mocks.get,
    findCustomer: mocks.find,
  }),
}));
import {
  requestPaymentCustomer,
  getPaymentCustomerRequest,
  advanceFixturePaymentCustomer,
  customerBootstrapViewSchema,
} from "./customer-bootstrap";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = {
  provider: "asaas",
  environment: "sandbox",
  accountId: "fixture-account",
};
const view = (patch: Record<string, unknown> = {}) => ({
  mode: "fixture",
  identityProof: "fixture_declared",
  requestId: id(1),
  clientId: id(2),
  currentOwnerId: id(3),
  createdBy: id(3),
  createdAt: "2026-10-11T15:00:00Z",
  revision: 0,
  state: "pending",
  reason: null,
  ...patch,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ANDRE_LOCAL_TESTS", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NODE_ENV", "test");
  mocks.authorize.mockResolvedValue({ profile: { id: id(3), role: "client" } });
  mocks.session.mockResolvedValue({ rpc: mocks.rpc });
  mocks.system.mockReturnValue({ rpc: mocks.rpc });
  mocks.port.mockResolvedValue({ scope });
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  { bodyText: "privado" },
  { document: "11144477735" },
  { customerId: "cus_private" },
  { revision: Number.MAX_SAFE_INTEGER + 1 },
])("DTO recusa campos privados/limites: %j", (patch) => {
  expect(customerBootstrapViewSchema.safeParse(view(patch)).success).toBe(
    false,
  );
});
it("autorização precede validação e cliente", async () => {
  mocks.authorize.mockRejectedValue(new Error("privado"));
  await expect(requestPaymentCustomer({})).rejects.toThrow(
    "Acesso não autorizado.",
  );
  expect(mocks.session).not.toHaveBeenCalled();
});
it("entrada inválida não usa cliente", async () => {
  expect(
    await requestPaymentCustomer({ clientId: id(2), requestId: "ruim" }),
  ).toHaveProperty("error");
  expect(mocks.session).not.toHaveBeenCalled();
});
it.each([
  { requestId: id(8) },
  { clientId: id(8) },
  { createdBy: id(8) },
  { currentOwnerId: id(8) },
])("solicitação recusa identidade divergente: %j", async (patch) => {
  mocks.rpc.mockResolvedValue({ error: null, data: view(patch) });
  expect(
    await requestPaymentCustomer({ clientId: id(2), requestId: id(1) }),
  ).toHaveProperty("error");
});
it("solicitação retorna somente DTO conferido", async () => {
  mocks.rpc.mockResolvedValue({ error: null, data: view() });
  expect(
    await requestPaymentCustomer({ clientId: id(2), requestId: id(1) }),
  ).toEqual({ view: view() });
});
it("getter mascara mensagem/cause privados e valida proprietário atual", async () => {
  mocks.rpc.mockRejectedValue(new Error("11144477735"));
  await expect(getPaymentCustomerRequest(id(1))).rejects.toThrow(
    "Vínculo do cliente indisponível.",
  );
  mocks.rpc.mockResolvedValue({
    error: null,
    data: view({ currentOwnerId: id(8) }),
  });
  await expect(getPaymentCustomerRequest(id(1))).rejects.toThrow(
    "Vínculo do cliente indisponível.",
  );
});
it.each([
  ["ANDRE_LOCAL_TESTS", "0"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://externo.supabase.co"],
  ["VERCEL", "1"],
  ["VERCEL_ENV", "preview"],
  ["NODE_ENV", "production"],
])("worker exige guarda local antes do cliente: %s", async (key, value) => {
  vi.stubEnv(key, value);
  await expect(advanceFixturePaymentCustomer(id(1))).rejects.toThrow(
    "Vínculo do cliente indisponível.",
  );
  expect(mocks.system).not.toHaveBeenCalled();
});
it("worker não envia se start foi consumido e não aceita entrada de callback", async () => {
  mocks.rpc.mockImplementation(
    async (name: string, args: Record<string, string>) =>
      name === "claim_payment_customer_step"
        ? {
            error: null,
            data: {
              view: view(),
              step: {
                id: id(4),
                workerId: args.worker_id,
                requestId: id(1),
                action: "create",
                scopeId: id(5),
                clientId: id(2),
                scope,
                kind: "person",
                document: "11144477735",
                name: "Cliente fictício",
                customerId: null,
              },
            },
          }
        : { error: null, data: false },
  );
  await expect(advanceFixturePaymentCustomer(id(1))).rejects.toThrow(
    "Vínculo do cliente indisponível.",
  );
  expect(mocks.port).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("falha do transporte só termina passo como pendente, sem repetir criação", async () => {
  mocks.rpc.mockImplementation(
    async (name: string, args: Record<string, string>) => {
      if (name === "claim_payment_customer_step")
        return {
          error: null,
          data: {
            view: view(),
            step: {
              id: id(4),
              workerId: args.worker_id,
              requestId: id(1),
              action: "create",
              scopeId: id(5),
              clientId: id(2),
              scope,
              kind: "person",
              document: "11144477735",
              name: "Cliente fictício",
              customerId: null,
            },
          },
        };
      if (name === "start_payment_customer_step")
        return { error: null, data: true };
      return {
        error: null,
        data: view({ state: "held", reason: "unavailable" }),
      };
    },
  );
  mocks.create.mockRejectedValue(new Error("privado"));
  expect((await advanceFixturePaymentCustomer(id(1))).state).toBe("held");
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls.at(-1)?.[0]).toBe("finish_payment_customer_step");
  expect(
    Object.keys(mocks.rpc.mock.calls.at(-1)?.[1] as object).sort(),
  ).toEqual(["target_step", "worker_id"]);
});
