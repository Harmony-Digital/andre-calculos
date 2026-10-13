import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ system: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSystemClient: mocks.system }));
import {
  resolveFixtureFinancialApplication,
  getFixtureFinancialExecutionResolution,
  financialResolutionReceiptSchema,
} from "./financial-resolution";
import {
  currentPaymentExecutionViewSchema,
  paymentExecutionViewSchema,
} from "./execution-data";
import { paymentResolutionReceiptSchema } from "./execution-resolution";
const id = (n: number) =>
  `abcdef00-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = { applicationRequestId: id(1), requestId: id(2) };
const view = {
  mode: "fixture",
  identityProof: "fixture_declared",
  intentId: id(3),
  runId: id(4),
  createdBy: id(5),
  currentOwnerId: id(5),
  createdAt: "2026-10-12T10:00:00Z",
  state: "resolved",
  reason: "financial_received",
  revision: 5,
  dispatchClaimed: true,
  reservationActive: false,
};
const receipt = (patch: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  semantics: "financial_resolution_receipt",
  mode: "fixture",
  ...input,
  executionRequestId: id(6),
  chargeId: id(7),
  orderId: id(8),
  intentId: id(3),
  runId: id(4),
  observationId: id(9),
  basisObservationId: id(10),
  reason: "financial_received",
  recordedAt: "2026-10-12T10:01:00Z",
  positionRevision: 2,
  chargeRevision: 3,
  journalFingerprint: "a".repeat(64),
  expectedRunRevision: 4,
  appliedRunRevision: 5,
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
])("guarda %s impede leitura e escrita privilegiada", async (key, value) => {
  vi.stubEnv(key, value);
  await expect(resolveFixtureFinancialApplication(input)).rejects.toThrow(
    "Resolução financeira fictícia indisponível.",
  );
  await expect(getFixtureFinancialExecutionResolution(id(6))).rejects.toThrow(
    "Resolução financeira fictícia indisponível.",
  );
  expect(mocks.system).not.toHaveBeenCalled();
});
it.each([
  null,
  { ...input, applicationRequestId: "invalido" },
  { ...input, requestId: "invalido" },
  { ...input, position: {} },
  { ...input, reason: "financial_received" },
  { ...input, expectedRunRevision: 4 },
  { ...input, orderId: id(8) },
])(
  "input não permite caller escolher prova, terminal ou destinatário: %j",
  async (value) => {
    await expect(resolveFixtureFinancialApplication(value)).rejects.toThrow(
      "Resolução financeira fictícia indisponível.",
    );
    expect(mocks.system).not.toHaveBeenCalled();
  },
);
it("recibo recuperado precede nova resolução e conserva a resposta histórica", async () => {
  mocks.rpc.mockResolvedValue({ data: receipt(), error: null });
  expect(await resolveFixtureFinancialApplication(input)).toEqual(receipt());
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith("get_financial_resolution_receipt", {
    target_application: id(1),
    request_id: id(2),
  });
});
it.each([null, receipt()])(
  "somente os dois IDs são enviados à transação após ausência do recibo",
  async (data) => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data, error: null });
    expect(await resolveFixtureFinancialApplication(input)).toEqual(data);
    expect(mocks.rpc).toHaveBeenLastCalledWith("resolve_financial_execution", {
      target_application: id(1),
      request_id: id(2),
    });
  },
);
it.each([{ applicationRequestId: id(11) }, { requestId: id(11) }])(
  "IDs divergentes do recibo são recusados: %j",
  async (patch) => {
    mocks.rpc.mockResolvedValue({ data: receipt(patch), error: null });
    await expect(resolveFixtureFinancialApplication(input)).rejects.toThrow(
      "Resolução financeira fictícia indisponível.",
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  },
);
it.each([
  { appliedRunRevision: 6 },
  { expectedRunRevision: 5 },
  { expectedRunRevision: Number.MAX_SAFE_INTEGER },
  { positionRevision: 0 },
  { journalFingerprint: "invalido" },
  { view: { ...view, revision: 6 } },
  { view: { ...view, intentId: id(11) } },
  { view: { ...view, runId: id(11) } },
  { view: { ...view, runId: null, createdAt: null } },
  { view: { ...view, reason: "no_dispatch_proven" } },
  { view: { ...view, reason: "financial_refunded" } },
  { view: { ...view, state: "held" } },
  { view: { ...view, dispatchClaimed: false } },
  { view: { ...view, reservationActive: true } },
  { position: { creditCents: 12501 } },
])("recibo exige identidade e fencing terminal coerentes: %j", (patch) => {
  expect(
    financialResolutionReceiptSchema.safeParse(receipt(patch)).success,
  ).toBe(false);
});
it.each(["financial_received", "financial_refunded"])(
  "%s é view atual e não altera o contrato de S",
  (reason) => {
    const current = { ...view, reason };
    expect(currentPaymentExecutionViewSchema.parse(current)).toEqual(current);
    expect(paymentExecutionViewSchema.safeParse(current).success).toBe(false);
    expect(
      financialResolutionReceiptSchema.parse(
        receipt({ reason, view: current }),
      ),
    ).toEqual(receipt({ reason, view: current }));
    expect(
      paymentResolutionReceiptSchema.safeParse({
        semantics: "resolution_receipt",
        requestId: id(2),
        executionRequestId: id(6),
        reason: "no_dispatch_proven",
        recordedAt: "2026-10-12T10:01:00Z",
        expectedRevision: 4,
        appliedRevision: 5,
        view: current,
      }).success,
    ).toBe(false);
  },
);
it("getter por execução recupera recibo e recusa outro vínculo", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: receipt(), error: null })
    .mockResolvedValueOnce({
      data: receipt({ executionRequestId: id(11) }),
      error: null,
    });
  expect(await getFixtureFinancialExecutionResolution(id(6))).toEqual(
    receipt(),
  );
  await expect(getFixtureFinancialExecutionResolution(id(6))).rejects.toThrow(
    "Resolução financeira fictícia indisponível.",
  );
  expect(mocks.rpc).toHaveBeenCalledWith("get_financial_execution_resolution", {
    target_request: id(6),
  });
});
it("erro privilegiado permanece genérico e não permite seguir para a escrita", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "payload sigiloso" },
  });
  await expect(resolveFixtureFinancialApplication(input)).rejects.toThrow(
    "Resolução financeira fictícia indisponível.",
  );
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  await expect(getFixtureFinancialExecutionResolution(id(6))).rejects.toThrow(
    "Resolução financeira fictícia indisponível.",
  );
});
