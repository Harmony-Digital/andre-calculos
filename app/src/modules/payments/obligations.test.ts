import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/modules/auth/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/supabase/server", () => ({ createSessionClient: mocks.client }));
import {
  paymentObligationSchema,
  obligationPreparationSchema,
  paymentObligationReceiptSchema,
} from "./obligations";
import {
  getPaymentObligation,
  preparePaymentObligation,
} from "./obligation-use-cases";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = {
  id: uuid(6),
  scopeId: uuid(7),
  clientId: uuid(4),
  customerId: "cus_fixture",
  scope: {
    provider: "asaas",
    environment: "sandbox",
    accountId: "fixture-account",
  },
};
const obligation = (patch: Record<string, unknown> = {}) => ({
  mode: "fixture",
  identityProof: "fixture_declared",
  status: "ready",
  reason: null,
  orderId: uuid(1),
  phase: "deposit",
  quoteId: uuid(2),
  contextHash: "a".repeat(64),
  processId: uuid(3),
  clientId: uuid(4),
  ownerId: uuid(5),
  orderStatus: "awaiting_payment",
  hasContract: false,
  contractRevision: 0,
  totalCents: 25001,
  requiredCents: 12501,
  creditedCents: 0,
  totalCreditedCents: 0,
  remainingCents: 12501,
  binding,
  ...patch,
});
const preparation = (patch: Record<string, unknown> = {}) => ({
  orderId: uuid(1),
  phase: "deposit",
  contextHash: "a".repeat(64),
  remainingCents: 12501,
  billingType: "PIX",
  dueDate: "2026-10-20",
  requestId: uuid(8),
  ...patch,
});
const receipt = (patch: Record<string, unknown> = {}) => ({
  id: uuid(8),
  createdBy: uuid(5),
  createdAt: "2026-10-11T15:00:00+00:00",
  snapshot: { ...obligation(), billingType: "PIX", dueDate: "2026-10-20" },
  ...patch,
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({
    profile: { id: uuid(5), role: "client" },
  });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
});
it.each([
  {},
  { status: "waived", hasContract: true, remainingCents: 0, binding: null },
  {
    status: "settled",
    creditedCents: 12501,
    totalCreditedCents: 12501,
    remainingCents: 0,
  },
  {
    phase: "balance",
    orderStatus: "delivered",
    requiredCents: 25001,
    creditedCents: 12501,
    totalCreditedCents: 12501,
    remainingCents: 12500,
  },
  {
    phase: "balance",
    orderStatus: "queued",
    status: "settled",
    requiredCents: 25001,
    creditedCents: 25001,
    totalCreditedCents: 25001,
    remainingCents: 0,
    binding: null,
  },
  {
    status: "blocked",
    reason: "credit_excess",
    creditedCents: 20000,
    totalCreditedCents: 20000,
    remainingCents: null,
  },
])(
  "valida dívida/sinal dispensado/quitação e bloqueios sem autorizar crédito %#",
  (patch) => {
    expect(paymentObligationSchema.safeParse(obligation(patch)).success).toBe(
      true,
    );
  },
);
it.each([
  { mode: "production" },
  { identityProof: "authenticated" },
  { orderStatus: "unknown" },
  { totalCents: Number.MAX_SAFE_INTEGER + 1 },
  { remainingCents: 0 },
  { remainingCents: 12500 },
  { creditedCents: 1 },
  { requiredCents: 12500 },
  { hasContract: true },
  { binding: null },
  { binding: { ...binding, clientId: uuid(9) } },
  {
    binding: {
      ...binding,
      scope: { ...binding.scope, environment: "production" },
    },
  },
  {
    binding: {
      ...binding,
      scope: { ...binding.scope, accountId: "private.invalid/account" },
    },
  },
  { status: "blocked", reason: "credit_excess" },
  { status: "blocked", reason: null, remainingCents: null },
  { reason: "customer_unbound" },
  {
    status: "settled",
    creditedCents: 13000,
    totalCreditedCents: 13000,
    remainingCents: 0,
  },
  {
    status: "waived",
    hasContract: true,
    creditedCents: 13000,
    totalCreditedCents: 13000,
    remainingCents: 0,
  },
  {
    status: "settled",
    creditedCents: 12501,
    totalCreditedCents: 12501,
    remainingCents: 0,
    hasContract: true,
  },
  {
    status: "waived",
    hasContract: true,
    remainingCents: 0,
    orderStatus: "cancelled",
  },
  {
    status: "settled",
    creditedCents: 12501,
    totalCreditedCents: 12501,
    remainingCents: 0,
    orderStatus: "refunded",
  },
  { phase: "balance", requiredCents: 25001, remainingCents: 25001 },
  {
    phase: "balance",
    orderStatus: "delivered",
    requiredCents: 12501,
    remainingCents: 12501,
  },
  { scopeId: uuid(9) },
  { document: "SENTINELA_PRIVADA" },
])(
  "rejeita contrato contraditório ou campo privado sem lançar payload %#",
  (patch) => {
    expect(paymentObligationSchema.safeParse(obligation(patch)).success).toBe(
      false,
    );
  },
);
it.each(["1900-01-01", "2024-02-29", "9999-12-31"])(
  "aceita data civil de preparo %s",
  (dueDate) => {
    expect(
      obligationPreparationSchema.safeParse(preparation({ dueDate })).success,
    ).toBe(true);
  },
);
it.each([
  "1899-12-31",
  "10000-01-01",
  "2026-02-29",
  "2026-13-01",
  "2026-10-20T00:00:00Z",
  "infinity",
])("rejeita vencimento inválido %s", (dueDate) => {
  expect(
    obligationPreparationSchema.safeParse(preparation({ dueDate })).success,
  ).toBe(false);
});
it("recibo só conserva contexto pronto e vencimento/meio válidos", () => {
  expect(paymentObligationReceiptSchema.safeParse(receipt()).success).toBe(
    true,
  );
  for (const snapshot of [
    null,
    [],
    {
      ...obligation({ status: "waived", hasContract: true, remainingCents: 0 }),
      billingType: "PIX",
      dueDate: "2026-10-20",
    },
    { ...obligation(), billingType: "CASH", dueDate: "2026-10-20" },
    { ...obligation(), billingType: "PIX", dueDate: "1500-01-01" },
  ])
    expect(
      paymentObligationReceiptSchema.safeParse(receipt({ snapshot })).success,
    ).toBe(false);
});
it("autoriza antes de acessar banco e não aceita argumentos de escopo", async () => {
  mocks.authorize.mockRejectedValue(new Error("Acesso não autorizado."));
  await expect(getPaymentObligation(uuid(1), "deposit")).rejects.toThrow(
    "Acesso não autorizado.",
  );
  await expect(preparePaymentObligation(preparation())).rejects.toThrow(
    "Acesso não autorizado.",
  );
  expect(mocks.client).not.toHaveBeenCalled();
  mocks.authorize.mockResolvedValue({
    profile: { id: uuid(5), role: "client" },
  });
  expect(
    await preparePaymentObligation(
      preparation({ accountId: "another-account" }),
    ),
  ).toHaveProperty("error");
  await expect(getPaymentObligation("invalid", "deposit")).rejects.toThrow(
    "Pedido indisponível.",
  );
  await expect(getPaymentObligation(uuid(1), "triage")).rejects.toThrow(
    "Pedido indisponível.",
  );
  expect(mocks.client).not.toHaveBeenCalled();
});
it("getter cruza pedido/fase/proprietário da resposta e aceita calculista", async () => {
  mocks.rpc.mockResolvedValue({ data: obligation(), error: null });
  expect(await getPaymentObligation(uuid(1), "deposit")).toMatchObject({
    orderId: uuid(1),
    remainingCents: 12501,
  });
  for (const patch of [
    { orderId: uuid(9) },
    { ownerId: uuid(9) },
    {
      phase: "balance",
      requiredCents: 25001,
      remainingCents: 25001,
      orderStatus: "delivered",
    },
  ]) {
    mocks.rpc.mockResolvedValue({ data: obligation(patch), error: null });
    await expect(getPaymentObligation(uuid(1), "deposit")).rejects.toThrow(
      "Obrigação indisponível.",
    );
  }
  mocks.authorize.mockResolvedValue({
    profile: { id: uuid(9), role: "calculator" },
  });
  mocks.rpc.mockResolvedValue({ data: obligation(), error: null });
  expect(await getPaymentObligation(uuid(1), "deposit")).toMatchObject({
    ownerId: uuid(5),
  });
});
it("preparo confere recibo de destino/ator/fase/hash/valor/meio/data", async () => {
  mocks.rpc.mockResolvedValue({ data: receipt(), error: null });
  expect(await preparePaymentObligation(preparation())).toHaveProperty(
    "receipt",
  );
  for (const patch of [
    { id: uuid(9) },
    { createdBy: uuid(9) },
    ...[
      { orderId: uuid(9) },
      { ownerId: uuid(9) },
      { contextHash: "b".repeat(64) },
      { creditedCents: 5000, totalCreditedCents: 5000, remainingCents: 7501 },
      { billingType: "BOLETO" },
      { dueDate: "2026-10-21" },
      {
        phase: "balance",
        orderStatus: "delivered",
        requiredCents: 25001,
        creditedCents: 12500,
        totalCreditedCents: 12500,
        remainingCents: 12501,
      },
    ].map((change) => ({ snapshot: { ...receipt().snapshot, ...change } })),
  ]) {
    mocks.rpc.mockResolvedValue({ data: receipt(patch), error: null });
    expect(await preparePaymentObligation(preparation())).toHaveProperty(
      "error",
    );
  }
  mocks.authorize.mockResolvedValue({
    profile: { id: uuid(9), role: "calculator" },
  });
  mocks.rpc.mockResolvedValue({
    data: receipt({ createdBy: uuid(9) }),
    error: null,
  });
  expect(await preparePaymentObligation(preparation())).toHaveProperty(
    "receipt",
  );
});
it.each(["creation", "transport", "error", "parse"])(
  "sanitiza falha de %s nos dois casos de uso",
  async (stage) => {
    const sensitive = new Error("SENTINELA_PRIVADA", {
      cause: "SEGREDO_FICTICIO",
    });
    if (stage === "creation") mocks.client.mockRejectedValue(sensitive);
    if (stage === "transport") mocks.rpc.mockRejectedValue(sensitive);
    if (stage === "error")
      mocks.rpc.mockResolvedValue({
        data: null,
        error: {
          code: "XX000",
          message: sensitive.message,
          details: sensitive.cause,
        },
      });
    if (stage === "parse")
      mocks.rpc.mockResolvedValue({
        data: obligation({
          binding: { ...binding, scope: { private: sensitive.message } },
        }),
        error: null,
      });
    const result = await getPaymentObligation(uuid(1), "deposit").catch(
      (error: Error) => error,
    );
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("Obrigação indisponível.");
    expect((result as Error).cause).toBeUndefined();
    expect(
      JSON.stringify(await preparePaymentObligation(preparation())),
    ).not.toContain("SENTINELA");
    expect(await preparePaymentObligation(preparation())).toHaveProperty(
      "error",
    );
  },
);
it("conflito pede recarga; resposta perdida conserva UUID para replay", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "PT409", message: "SENTINELA_PRIVADA" },
  });
  expect(await preparePaymentObligation(preparation())).toEqual({
    error:
      "A obrigação mudou ou esta tentativa já foi registrada. Recarregue para conferir.",
  });
  mocks.rpc.mockRejectedValueOnce(new Error("Resposta perdida"));
  expect(await preparePaymentObligation(preparation())).toHaveProperty("error");
  mocks.rpc.mockResolvedValue({ data: receipt(), error: null });
  expect(await preparePaymentObligation(preparation())).toHaveProperty(
    "receipt",
  );
  expect(
    mocks.rpc.mock.calls.every((call) => call[1].request_id === uuid(8)),
  ).toBe(true);
});
it("falha de autorização não revela infraestrutura nem inicia RPC", async () => {
  mocks.authorize.mockRejectedValue(
    new Error("SENTINELA_PRIVADA", { cause: "SEGREDO_FICTICIO" }),
  );
  for (const action of [
    getPaymentObligation(uuid(1), "deposit"),
    preparePaymentObligation(preparation()),
  ]) {
    const failure = await action.catch((error: Error) => error);
    if (!(failure instanceof Error)) throw new Error("Falha esperada ausente.");
    expect(failure.message).toBe("Acesso não autorizado.");
    expect(failure.cause).toBeUndefined();
  }
  expect(mocks.client).not.toHaveBeenCalled();
});
