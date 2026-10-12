import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  system: vi.fn(),
  session: vi.fn(),
  authorize: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSystemClient: mocks.system }));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: mocks.session,
}));
vi.mock("@/modules/auth/session", () => ({ authorize: mocks.authorize }));
import {
  allocateFixturePaymentExecution,
  startFixturePaymentExecution,
} from "./execution-system";
import { getPaymentExecution } from "./execution-use-cases";
import {
  paymentExecutionViewSchema,
  paymentExecutionClaimSchema,
} from "./execution-data";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const view = (patch: Record<string, unknown> = {}) => ({
  mode: "fixture",
  identityProof: "fixture_declared",
  intentId: id(1),
  runId: null,
  createdBy: id(2),
  currentOwnerId: id(2),
  createdAt: null,
  state: "unstarted",
  reason: null,
  revision: 0,
  dispatchClaimed: false,
  reservationActive: true,
  ...patch,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ANDRE_LOCAL_TESTS", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  mocks.system.mockReturnValue({ rpc: mocks.rpc });
  mocks.session.mockResolvedValue({ rpc: mocks.rpc });
  mocks.authorize.mockResolvedValue({ profile: { id: id(2), role: "client" } });
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  { document: "11144477735" },
  { bodyText: "privado" },
  { scopeId: id(5) },
  { runId: id(4) },
  { createdAt: "2026-10-11T15:00:00Z" },
  { revision: Number.MAX_SAFE_INTEGER + 1 },
  { state: "held" },
  { state: "stopped" },
])("DTO recusa segredo/estado incoerente: %j", (patch) => {
  expect(paymentExecutionViewSchema.safeParse(view(patch)).success).toBe(false);
});
it.each([
  ["ANDRE_LOCAL_TESTS", "0"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://externo.supabase.co"],
  ["NODE_ENV", "production"],
  ["VERCEL", "1"],
  ["VERCEL_ENV", "preview"],
])("guarda %s antecede cliente de sistema", async (key, value) => {
  vi.stubEnv(key, value);
  await expect(allocateFixturePaymentExecution(id(3))).rejects.toThrow(
    "Execução fictícia indisponível.",
  );
  await expect(
    startFixturePaymentExecution({ stepId: id(4), workerId: id(5) }),
  ).rejects.toThrow("Execução fictícia indisponível.");
  expect(mocks.system).not.toHaveBeenCalled();
});
it("UUID e objeto de start inválidos não criam cliente", async () => {
  await expect(allocateFixturePaymentExecution("inválido")).rejects.toThrow(
    "Execução fictícia indisponível.",
  );
  await expect(
    startFixturePaymentExecution({
      stepId: id(4),
      workerId: id(5),
      result: "livre",
    }),
  ).rejects.toThrow("Execução fictícia indisponível.");
  expect(mocks.system).not.toHaveBeenCalled();
});
it.each([true, false])("start retorna booleano consumível %s", async (data) => {
  mocks.rpc.mockResolvedValue({ error: null, data });
  expect(
    await startFixturePaymentExecution({ stepId: id(4), workerId: id(5) }),
  ).toBe(data);
  expect(mocks.rpc).toHaveBeenCalledWith("start_payment_execution_step", {
    target_step: id(4),
    worker_id: id(5),
  });
});
it("start rejeita falha/resposta sem expor causa", async () => {
  mocks.rpc.mockRejectedValue(new Error("11144477735"));
  await expect(
    startFixturePaymentExecution({ stepId: id(4), workerId: id(5) }),
  ).rejects.toThrow("Execução fictícia indisponível.");
  mocks.rpc.mockResolvedValue({ error: null, data: "true" });
  await expect(
    startFixturePaymentExecution({ stepId: id(4), workerId: id(5) }),
  ).rejects.toThrow("Execução fictícia indisponível.");
});
it("getter autoriza antes de consultar e mascara dados privados", async () => {
  mocks.authorize.mockRejectedValue(new Error("privado"));
  await expect(getPaymentExecution(id(1))).rejects.toThrow(
    "Acesso não autorizado.",
  );
  expect(mocks.session).not.toHaveBeenCalled();
});
it.each([
  { intentId: id(8) },
  { currentOwnerId: id(8) },
  { bodyText: "privado" },
])("getter rejeita destino/owner/privacidade: %j", async (patch) => {
  mocks.rpc.mockResolvedValue({ error: null, data: view(patch) });
  await expect(getPaymentExecution(id(1))).rejects.toThrow(
    "Execução indisponível.",
  );
});
it("getter retorna estado mínimo conferido", async () => {
  mocks.rpc.mockResolvedValue({ error: null, data: view() });
  expect(await getPaymentExecution(id(1))).toEqual(view());
});
const descriptor = () => {
  const scope = {
    provider: "asaas",
    environment: "sandbox",
    accountId: "fixture-account",
  };
  const binding = {
    id: id(6),
    scopeId: id(7),
    clientId: id(4),
    customerId: "cus_fixture",
    scope,
  };
  const obligation = {
    mode: "fixture",
    identityProof: "fixture_declared",
    status: "ready",
    reason: null,
    orderId: id(1),
    phase: "deposit",
    quoteId: id(2),
    contextHash: "a".repeat(64),
    processId: id(3),
    clientId: id(4),
    ownerId: id(5),
    orderStatus: "awaiting_payment",
    hasContract: false,
    contractRevision: 0,
    totalCents: 25001,
    requiredCents: 12501,
    creditedCents: 0,
    totalCreditedCents: 0,
    remainingCents: 12501,
    binding,
    billingType: "PIX",
    dueDate: "2026-10-20",
  };
  return {
    requestId: id(12),
    view: view({
      runId: id(9),
      createdAt: "2026-10-11T15:00:00Z",
      state: "pending",
      revision: 1,
    }),
    step: {
      id: id(10),
      runId: id(9),
      workerId: id(11),
      requestId: id(12),
      intentId: id(1),
      action: "create",
      scopeId: id(7),
      clientId: id(4),
      scope: { ...scope },
      snapshot: {
        obligation,
        customer: { kind: "person", document: "11144477735" },
      },
    },
  };
};
it.each(["claimed", "inactive", "request", "scope", "document"])(
  "descritor privado recusa coerência inválida: %s",
  (key) => {
    const data = descriptor();
    if (key === "claimed") data.view.dispatchClaimed = true;
    else if (key === "inactive") data.view.reservationActive = false;
    else if (key === "request") data.requestId = id(13);
    else if (key === "scope") data.step.scope.accountId = "outra-conta";
    else data.step.snapshot.customer.document = "inválido";
    expect(paymentExecutionClaimSchema.safeParse(data).success).toBe(false);
  },
);
it("alocação aceita descriptor da própria solicitação/worker", async () => {
  mocks.rpc.mockImplementation(
    async (_name: string, args: Record<string, string>) => {
      const data = descriptor();
      data.step.workerId = args.worker_id;
      return { error: null, data };
    },
  );
  expect((await allocateFixturePaymentExecution(id(12))).step!.requestId).toBe(
    id(12),
  );
});
it("alocação sem etapa ainda confere identidade da solicitação", async () => {
  mocks.rpc.mockResolvedValue({
    error: null,
    data: {
      requestId: id(8),
      view: view({
        runId: id(9),
        createdAt: "2026-10-11T15:00:00Z",
        state: "held",
        reason: "context_changed",
        revision: 1,
      }),
      step: null,
    },
  });
  await expect(allocateFixturePaymentExecution(id(12))).rejects.toThrow(
    "Execução fictícia indisponível.",
  );
});
