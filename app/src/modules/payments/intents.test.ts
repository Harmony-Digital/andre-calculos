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
  reservePaymentIntentInput,
  withdrawPaymentIntentInput,
  paymentIntentViewSchema,
  currentPaymentIntentSchema,
  paymentIntentReceiptSchema,
} from "./intents";
import {
  getPaymentIntent,
  getOrderPaymentReservation,
  reservePaymentIntent,
  withdrawPaymentIntent,
} from "./intent-use-cases";
const id = (n: number) =>
  `abcdef00-0000-4000-8000-${String(n).padStart(12, "0")}`;
const time = "2026-10-11T15:00:00+00:00";
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
  binding: {
    id: id(6),
    scopeId: id(7),
    clientId: id(4),
    customerId: "cus_fixture",
    scope: {
      provider: "asaas",
      environment: "sandbox",
      accountId: "fixture-account",
    },
  },
  billingType: "PIX",
  dueDate: "2026-10-20",
};
const intent = (patch: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  mode: "fixture",
  identityProof: "fixture_declared",
  id: id(8),
  reference: id(8),
  contextId: id(9),
  createdBy: id(5),
  createdAt: time,
  obligation,
  ...patch,
});
const view = (patch: Record<string, unknown> = {}) => ({
  intent: intent(),
  currentOwnerId: id(5),
  state: "reserved",
  revision: 0,
  reservationActive: true,
  claimedAt: null,
  withdrawnAt: null,
  withdrawnBy: null,
  ...patch,
});
const current = (patch: Record<string, unknown> = {}) => ({
  semantics: "current_state",
  ...view(patch),
});
const withdrawn = (patch: Record<string, unknown> = {}) =>
  view({
    state: "withdrawn",
    revision: 1,
    reservationActive: false,
    withdrawnAt: time,
    withdrawnBy: id(5),
    ...patch,
  });
const receipt = (patch: Record<string, unknown> = {}) => ({
  semantics: "receipt_snapshot",
  requestId: id(10),
  action: "reserve",
  actorId: id(5),
  recordedAt: time,
  expectedRevision: null,
  appliedRevision: 0,
  snapshot: view(),
  ...patch,
});
const withdrawal = (patch: Record<string, unknown> = {}) =>
  receipt({
    action: "withdraw",
    expectedRevision: 0,
    appliedRevision: 1,
    snapshot: withdrawn(),
    ...patch,
  });
const reserveInput = { contextId: id(9), requestId: id(10) };
const withdrawInput = {
  intentId: id(8),
  expectedRevision: 0,
  requestId: id(10),
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ profile: { id: id(5), role: "client" } });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
});
it("recibo histórico e estado atual permanecem contratos separados", () => {
  expect(currentPaymentIntentSchema.safeParse(current()).success).toBe(true);
  expect(paymentIntentReceiptSchema.safeParse(receipt()).success).toBe(true);
  expect(paymentIntentReceiptSchema.safeParse(withdrawal()).success).toBe(true);
  expect(currentPaymentIntentSchema.safeParse(receipt()).success).toBe(false);
  expect(paymentIntentReceiptSchema.safeParse(current()).success).toBe(false);
  expect(
    paymentIntentViewSchema.safeParse(
      view({ state: "dispatch_claimed", revision: 1, claimedAt: time }),
    ).success,
  ).toBe(true);
});
it.each([
  { revision: 1 },
  { reservationActive: false },
  { claimedAt: time },
  { withdrawnAt: time },
  { withdrawnBy: id(5) },
  { state: "dispatch_claimed", revision: 1 },
  {
    state: "dispatch_claimed",
    revision: 1,
    claimedAt: time,
    reservationActive: false,
  },
  { state: "withdrawn", revision: 1, withdrawnAt: time, withdrawnBy: id(5) },
  {
    state: "withdrawn",
    revision: 1,
    reservationActive: false,
    withdrawnBy: id(5),
  },
  {
    state: "withdrawn",
    revision: 1,
    reservationActive: false,
    withdrawnAt: time,
  },
  {
    state: "withdrawn",
    revision: 1,
    reservationActive: false,
    withdrawnAt: time,
    withdrawnBy: id(5),
    claimedAt: time,
  },
  { state: "created" },
  { revision: -1 },
  { revision: 2147483647 },
  { intent: intent({ reference: id(11) }) },
  { intent: intent({ mode: "production" }) },
  { intent: intent({ identityProof: "authenticated" }) },
  { intent: intent({ obligation: { ...obligation, remainingCents: 0 } }) },
  {
    intent: intent({
      obligation: { ...obligation, document: "SENTINELA_PRIVADA" },
    }),
  },
  { invoiceUrl: "https://example.invalid/private" },
])(
  "rejeita reserva/claim/retirada contraditória ou payload privado %#",
  (patch) => {
    expect(paymentIntentViewSchema.safeParse(view(patch)).success).toBe(false);
  },
);
it.each([
  { action: "emit" },
  { semantics: "current_state" },
  { expectedRevision: 0 },
  { appliedRevision: 1 },
  { actorId: id(11) },
  { snapshot: withdrawn() },
  {
    snapshot: view({ state: "dispatch_claimed", revision: 1, claimedAt: time }),
  },
])("recibo de reserva rejeita operação/resposta incoerente %#", (patch) => {
  expect(paymentIntentReceiptSchema.safeParse(receipt(patch)).success).toBe(
    false,
  );
});
it.each([
  { expectedRevision: 1 },
  { appliedRevision: 0 },
  { actorId: id(11) },
  { recordedAt: "2026-10-12T15:00:00Z" },
  { snapshot: view() },
])("retirada confere revisão/ator/instante e prova %#", (patch) => {
  expect(paymentIntentReceiptSchema.safeParse(withdrawal(patch)).success).toBe(
    false,
  );
});
it("input somente referencia IDs canônicos; não aceita conta/valor livres", () => {
  expect(
    reservePaymentIntentInput.parse({
      contextId: id(9).toUpperCase(),
      requestId: id(10).toUpperCase(),
    }),
  ).toEqual(reserveInput);
  for (const patch of [
    { accountId: "another" },
    { remainingCents: 12501 },
    { phase: "balance" },
    { contextId: "invalid" },
  ])
    expect(
      reservePaymentIntentInput.safeParse({ ...reserveInput, ...patch })
        .success,
    ).toBe(false);
  for (const patch of [
    { billingType: "BOLETO" },
    { expectedRevision: -1 },
    { expectedRevision: 2147483647 },
    { intentId: "invalid" },
  ])
    expect(
      withdrawPaymentIntentInput.safeParse({ ...withdrawInput, ...patch })
        .success,
    ).toBe(false);
});
it("reserva valida contexto/UUID/ator/proprietário e não despacha", async () => {
  mocks.rpc.mockResolvedValue({ data: receipt(), error: null });
  expect(
    await reservePaymentIntent({
      contextId: id(9).toUpperCase(),
      requestId: id(10).toUpperCase(),
    }),
  ).toHaveProperty("receipt");
  expect(mocks.rpc).toHaveBeenCalledWith("reserve_payment_intent", {
    target_context: id(9),
    request_id: id(10),
  });
  for (const patch of [
    { requestId: id(11) },
    {
      action: "withdraw",
      expectedRevision: 0,
      appliedRevision: 1,
      snapshot: withdrawn(),
    },
    { snapshot: view({ intent: intent({ contextId: id(11) }) }) },
    { snapshot: view({ currentOwnerId: id(11) }) },
    {
      actorId: id(11),
      snapshot: view({ intent: intent({ createdBy: id(11) }) }),
    },
  ]) {
    mocks.rpc.mockResolvedValue({ data: receipt(patch), error: null });
    expect(await reservePaymentIntent(reserveInput)).toHaveProperty("error");
  }
});
it("retirada não substitui autoria original; calculista e dono atual recebem seu recibo", async () => {
  mocks.rpc.mockResolvedValue({
    data: withdrawal({
      snapshot: withdrawn({ intent: intent({ createdBy: id(11) }) }),
    }),
    error: null,
  });
  expect(await withdrawPaymentIntent(withdrawInput)).toHaveProperty("receipt");
  for (const patch of [
    { requestId: id(11) },
    {
      action: "reserve",
      expectedRevision: null,
      appliedRevision: 0,
      snapshot: view(),
    },
    {
      snapshot: withdrawn({
        intent: intent({ id: id(11), reference: id(11) }),
      }),
    },
    { snapshot: withdrawn({ currentOwnerId: id(11) }) },
  ]) {
    mocks.rpc.mockResolvedValue({ data: withdrawal(patch), error: null });
    expect(await withdrawPaymentIntent(withdrawInput)).toHaveProperty("error");
  }
  mocks.authorize.mockResolvedValue({
    profile: { id: id(12), role: "calculator" },
  });
  mocks.rpc.mockResolvedValue({
    data: withdrawal({
      actorId: id(12),
      snapshot: withdrawn({ withdrawnBy: id(12) }),
    }),
    error: null,
  });
  expect(await withdrawPaymentIntent(withdrawInput)).toHaveProperty("receipt");
});
it("getter vincula intenção/pedido e proprietário, sem inferir reserva por recibo", async () => {
  mocks.rpc.mockResolvedValue({ data: current(), error: null });
  expect(await getPaymentIntent(id(8))).toMatchObject({ state: "reserved" });
  expect(await getOrderPaymentReservation(id(1))).toMatchObject({
    reservationActive: true,
  });
  for (const data of [
    receipt(),
    current({ currentOwnerId: id(11) }),
    current({
      intent: intent({
        id: id(11),
        reference: id(11),
        obligation: { ...obligation, orderId: id(11) },
      }),
    }),
  ]) {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(getPaymentIntent(id(8))).rejects.toThrow(
      "Intenção indisponível.",
    );
    await expect(getOrderPaymentReservation(id(1))).rejects.toThrow(
      "Reserva indisponível.",
    );
  }
  mocks.rpc.mockResolvedValue({
    data: { semantics: "current_state", ...withdrawn() },
    error: null,
  });
  expect(await getPaymentIntent(id(8))).toMatchObject({ state: "withdrawn" });
  await expect(getOrderPaymentReservation(id(1))).rejects.toThrow(
    "Reserva indisponível.",
  );
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  expect(await getOrderPaymentReservation(id(1))).toBeNull();
});
it("authorize precede cliente e argumentos inválidos não viram RPC", async () => {
  for (const action of [
    () => reservePaymentIntent({ ...reserveInput, account: "another" }),
    () => withdrawPaymentIntent({ ...withdrawInput, expectedRevision: -1 }),
  ])
    expect(await action()).toHaveProperty("error");
  await expect(getPaymentIntent("invalid")).rejects.toThrow(
    "Intenção indisponível.",
  );
  await expect(getOrderPaymentReservation("invalid")).rejects.toThrow(
    "Reserva indisponível.",
  );
  expect(mocks.client).not.toHaveBeenCalled();
  mocks.authorize.mockRejectedValue(
    new Error("SENTINELA_PRIVADA", { cause: "SEGREDO_FICTICIO" }),
  );
  for (const action of [
    () => reservePaymentIntent(reserveInput),
    () => withdrawPaymentIntent(withdrawInput),
    () => getPaymentIntent(id(8)),
    () => getOrderPaymentReservation(id(1)),
  ]) {
    const error = await action().catch((e: Error) => e);
    if (!(error instanceof Error)) throw new Error("Falha esperada ausente.");
    expect(error.message).toBe("Acesso não autorizado.");
    expect(error.cause).toBeUndefined();
  }
  expect(mocks.client).not.toHaveBeenCalled();
});
it.each(["client", "rpc", "error", "parse"])(
  "sanitiza falha em %s e conserva mesma solicitação",
  async (stage) => {
    const error = new Error("SENTINELA_PRIVADA", { cause: "SEGREDO_FICTICIO" });
    if (stage === "client") mocks.client.mockRejectedValue(error);
    if (stage === "rpc") mocks.rpc.mockRejectedValue(error);
    if (stage === "error")
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { message: error.message, details: error.cause },
      });
    if (stage === "parse")
      mocks.rpc.mockResolvedValue({
        data: { private: error.message },
        error: null,
      });
    for (const result of [
      await reservePaymentIntent(reserveInput),
      await withdrawPaymentIntent(withdrawInput),
    ]) {
      expect(result).toHaveProperty("error");
      expect(JSON.stringify(result)).not.toContain("SENTINELA");
    }
    for (const action of [
      () => getPaymentIntent(id(8)),
      () => getOrderPaymentReservation(id(1)),
    ]) {
      const failure = await action().catch((e: Error) => e);
      if (!(failure instanceof Error))
        throw new Error("Falha esperada ausente.");
      expect(failure.message).not.toContain("SENTINELA");
      expect(failure.cause).toBeUndefined();
    }
  },
);
it("conflito não autoriza nova emissão; perda de resposta usa UUID original", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "PT409", message: "SENTINELA_PRIVADA" },
  });
  expect(await reservePaymentIntent(reserveInput)).toEqual({
    error:
      "A reserva ou os dados mudaram. Recarregue para conferir antes de tentar novamente.",
  });
  mocks.rpc.mockRejectedValueOnce(new Error("Resposta perdida"));
  expect(await reservePaymentIntent(reserveInput)).toHaveProperty("error");
  mocks.rpc.mockResolvedValue({ data: receipt(), error: null });
  expect(await reservePaymentIntent(reserveInput)).toHaveProperty("receipt");
  expect(
    mocks.rpc.mock.calls.every((call) => call[1].request_id === id(10)),
  ).toBe(true);
});
it("estado resolvido é atual e não transforma recibo histórico", () => {
  const resolved = current({
    state: "resolved",
    revision: 2,
    reservationActive: false,
    claimedAt: time,
    resolvedAt: time,
    resolutionReason: "no_dispatch_proven",
  });
  expect(currentPaymentIntentSchema.parse(resolved)).toEqual(resolved);
  expect(paymentIntentViewSchema.safeParse(resolved).success).toBe(false);
  expect(paymentIntentReceiptSchema.parse(receipt())).toEqual(receipt());
  expect(paymentIntentReceiptSchema.parse(withdrawal())).toEqual(withdrawal());
});
it.each(["financial_received", "financial_refunded"])(
  "terminal %s pertence somente à intenção atual",
  (resolutionReason) => {
    const resolved = current({
      state: "resolved",
      revision: 2,
      reservationActive: false,
      claimedAt: time,
      resolvedAt: time,
      resolutionReason,
    });
    expect(currentPaymentIntentSchema.parse(resolved)).toEqual(resolved);
    expect(paymentIntentViewSchema.safeParse(resolved).success).toBe(false);
    expect(
      paymentIntentReceiptSchema.safeParse({ ...receipt(), snapshot: resolved })
        .success,
    ).toBe(false);
  },
);
it.each([
  { claimedAt: null },
  { reservationActive: true },
  { revision: 1 },
  { withdrawnAt: time },
  { resolutionReason: "not_located" },
  { resolvedAt: undefined },
  { receiptId: id(20) },
])("estado resolvido recusa combinação inválida: %j", (patch) => {
  expect(
    currentPaymentIntentSchema.safeParse(
      current({
        state: "resolved",
        revision: 2,
        reservationActive: false,
        claimedAt: time,
        resolvedAt: time,
        resolutionReason: "no_dispatch_proven",
        ...patch,
      }),
    ).success,
  ).toBe(false);
});
