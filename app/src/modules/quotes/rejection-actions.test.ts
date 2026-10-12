import { beforeEach, expect, it, vi } from "vitest";
const stubs = vi.hoisted(() => ({
  visible: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      "x-forwarded-for": "192.0.2.44",
      "user-agent": "Teste sintético",
    }),
}));
vi.mock("next/cache", () => ({ revalidatePath: stubs.revalidate }));
vi.mock("@/modules/auth/session", () => ({
  authorize: async () => ({
    user: { id: "00000000-0000-4000-8000-000000000003" },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: stubs.visible }) }),
    }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSystemClient: () => ({ rpc: stubs.rpc }),
}));
import { rejectQuote } from "./rejection-actions";
const intent = {
  quoteId: "00000000-0000-4000-8000-000000000001",
  requestId: "00000000-0000-4000-8000-000000000002",
  contextHash: "a".repeat(64),
  revision: 1,
  confirmed: true,
  reason: "Motivo fictício",
};
beforeEach(() => {
  vi.clearAllMocks();
  stubs.visible.mockResolvedValue({
    data: { id: intent.quoteId },
    error: null,
  });
});
it("consulta indisponível preserva possibilidade de reenvio sem chamar RPC", async () => {
  stubs.visible.mockResolvedValue({
    data: null,
    error: { code: "503", message: "Unavailable" },
  });
  expect(await rejectQuote(intent)).toEqual({
    error: expect.stringContaining("Sua escolha foi preservada"),
  });
  expect(stubs.rpc).not.toHaveBeenCalled();
  stubs.visible.mockResolvedValueOnce({
    data: { id: intent.quoteId },
    error: null,
  });
  const receipt = {
    quoteId: intent.quoteId,
    orderId: intent.quoteId,
    processId: intent.quoteId,
    number: "ORC-2026-0001",
    contextHash: intent.contextHash,
    reason: intent.reason,
    expectedRevision: 1,
    revision: 2,
    rejectedAt: "2026-10-11T18:00:00Z",
    status: "cancelled",
  };
  stubs.rpc.mockResolvedValueOnce({ data: receipt, error: null });
  expect(await rejectQuote(intent)).toEqual({ receipt });
  expect(stubs.rpc.mock.calls[0][1]).toMatchObject({
    request_id: intent.requestId,
    expected_revision: 1,
    reason: intent.reason,
  });
});
it("ausência confirmada e conflito transacional exigem reconferência", async () => {
  stubs.visible.mockResolvedValueOnce({ data: null, error: null });
  expect(await rejectQuote(intent)).toMatchObject({ conflict: true });
  stubs.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409" } });
  expect(await rejectQuote(intent)).toMatchObject({ conflict: true });
});
it("origem é inferida do servidor e erro de transporte permite reenvio", async () => {
  stubs.rpc.mockRejectedValueOnce(new Error("Falha sintética"));
  expect(await rejectQuote(intent)).toEqual({
    error: expect.stringContaining("Sua escolha foi preservada"),
  });
  expect(stubs.rpc).toHaveBeenCalledWith("reject_quote_system", {
    actor: "00000000-0000-4000-8000-000000000003",
    target_quote: intent.quoteId,
    expected_context: intent.contextHash,
    expected_revision: 1,
    request_id: intent.requestId,
    confirmed: true,
    reason: intent.reason,
    ip_address: "192.0.2.44",
    user_agent: "Teste sintético",
  });
});
