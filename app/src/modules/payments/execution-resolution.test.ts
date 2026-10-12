import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  system: vi.fn(),
  rpc: vi.fn(),
  advance: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSystemClient: mocks.system }));
vi.mock("./execution-worker", () => ({
  advanceFixturePaymentExecution: mocks.advance,
}));
import {
  resolveFixturePaymentExecution,
  resumeFixturePaymentExecution,
  paymentResolutionReceiptSchema,
  getFixturePaymentExecutionResolution,
} from "./execution-resolution";
const id = (n: number) =>
  `abcdef00-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = { executionRequestId: id(1), requestId: id(2) };
const view = {
  mode: "fixture",
  identityProof: "fixture_declared",
  intentId: id(3),
  runId: id(4),
  createdBy: id(5),
  currentOwnerId: id(5),
  createdAt: "2026-10-11T15:00:00Z",
  state: "resolved",
  reason: "no_dispatch_proven",
  revision: 3,
  dispatchClaimed: true,
  reservationActive: false,
};
const receipt = (patch: Record<string, unknown> = {}) => ({
  semantics: "resolution_receipt",
  ...input,
  reason: "no_dispatch_proven",
  recordedAt: "2026-10-11T15:01:00Z",
  expectedRevision: 2,
  appliedRevision: 3,
  view,
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
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  ["ANDRE_LOCAL_TESTS", "0"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://outro.supabase.co"],
  ["NODE_ENV", "production"],
  ["VERCEL", "1"],
  ["VERCEL_ENV", "preview"],
])("guarda %s antecede acesso ao sistema", async (k, v) => {
  vi.stubEnv(k, v);
  await expect(resolveFixturePaymentExecution(input)).rejects.toThrow(
    "Resolução fictícia indisponível.",
  );
  await expect(resumeFixturePaymentExecution(id(1))).rejects.toThrow(
    "Resolução fictícia indisponível.",
  );
  await expect(getFixturePaymentExecutionResolution(id(1))).rejects.toThrow(
    "Resolução fictícia indisponível.",
  );
  expect(mocks.system).not.toHaveBeenCalled();
  expect(mocks.advance).not.toHaveBeenCalled();
});
it("resolução concorrente por outro UUID é recuperada pelo journal", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: null, error: { code: "PT409" } })
    .mockResolvedValueOnce({
      data: receipt({ requestId: id(9) }),
      error: null,
    });
  expect((await resumeFixturePaymentExecution(id(1))).state).toBe("resolved");
  expect(mocks.advance).not.toHaveBeenCalled();
});
it("getter interno recusa journal de outra solicitação", async () => {
  mocks.rpc.mockResolvedValue({
    data: receipt({ executionRequestId: id(9) }),
    error: null,
  });
  await expect(getFixturePaymentExecutionResolution(id(1))).rejects.toThrow(
    "Resolução fictícia indisponível.",
  );
});
it.each([
  { ...input, requestId: "invalido" },
  { ...input, facts: {} },
  { ...input, proof: "not_dispatched" },
  null,
])("input estrito não aceita resultado do usuário: %j", async (v) => {
  await expect(resolveFixturePaymentExecution(v)).rejects.toThrow(
    "Resolução fictícia indisponível.",
  );
  expect(mocks.system).not.toHaveBeenCalled();
});
it.each([
  { appliedRevision: 4 },
  { expectedRevision: 3 },
  { view: { ...view, reservationActive: true } },
  { view: { ...view, dispatchClaimed: false } },
  { view: { ...view, reason: null } },
  { view: { ...view, state: "held" } },
  { receiptId: id(6) },
])("recibo terminal rejeita inconsistência/privado: %j", (patch) => {
  expect(paymentResolutionReceiptSchema.safeParse(receipt(patch)).success).toBe(
    false,
  );
});
it("retorna ausência de prova e valida recibo imutável", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: receipt(), error: null });
  expect(await resolveFixturePaymentExecution(input)).toBeNull();
  expect(await resolveFixturePaymentExecution(input)).toEqual(receipt());
  expect(mocks.rpc).toHaveBeenCalledWith(
    "resolve_payment_execution_no_dispatch",
    { target_request: id(1), request_id: id(2) },
  );
});
it.each([{ requestId: id(7) }, { executionRequestId: id(7) }])(
  "identidade divergente não retorna recibo",
  async (patch) => {
    mocks.rpc.mockResolvedValue({ data: receipt(patch), error: null });
    await expect(resolveFixturePaymentExecution(input)).rejects.toThrow(
      "Resolução fictícia indisponível.",
    );
  },
);
it("erro privilegiado não expõe payload ou mensagem interna", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "conteudo sigiloso" },
  });
  await expect(resolveFixturePaymentExecution(input)).rejects.toThrow(
    "Resolução fictícia indisponível.",
  );
});
it("terminal existente evita alocação e transporte", async () => {
  mocks.rpc.mockImplementation((_name, args) =>
    Promise.resolve({
      data: receipt({ requestId: args.request_id ?? id(2) }),
      error: null,
    }),
  );
  expect((await resumeFixturePaymentExecution(id(1))).state).toBe("resolved");
  expect(mocks.advance).not.toHaveBeenCalled();
});
it("somente not_dispatched provoca resolução depois do passo", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.advance.mockResolvedValue({
    ...view,
    state: "held",
    reason: "not_dispatched",
    reservationActive: true,
  });
  expect((await resumeFixturePaymentExecution(id(1))).state).toBe("held");
  const calls = mocks.rpc.mock.calls.filter(
    ([name]) => name === "resolve_payment_execution_no_dispatch",
  );
  expect(calls).toHaveLength(2);
  expect(calls[0][1]).toEqual(calls[1][1]);
});
it.each(["not_located", "indeterminate", "multiple_candidates"])(
  "%s permanece pendente sem inferir prova",
  async (reason) => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.advance.mockResolvedValue({
      ...view,
      state: "held",
      reason,
      reservationActive: true,
    });
    expect((await resumeFixturePaymentExecution(id(1))).reason).toBe(reason);
    expect(
      mocks.rpc.mock.calls.filter(
        ([name]) => name === "resolve_payment_execution_no_dispatch",
      ),
    ).toHaveLength(1);
  },
);
