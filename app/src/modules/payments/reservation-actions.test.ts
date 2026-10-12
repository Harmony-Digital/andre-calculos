import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/modules/auth/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/supabase/server", () => ({ createSessionClient: mocks.client }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { confirmDeposit } from "./actions";
import { saveClientContract } from "@/modules/clients/actions";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ profile: { role: "calculator" } });
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({
      data: { order: { process_id: uuid(3) } },
      error: null,
    }),
  };
  mocks.client.mockResolvedValue({ rpc: mocks.rpc, from: () => chain });
});
it.each(["PT423", "PT409", "private_failure"])(
  "Pix: %s informa texto fixo sem expor erro interno ou renovar a tentativa",
  async (code) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code, message: "SENTINELA_PRIVADA", details: "DADO_PRIVADO" },
    });
    const input = {
      quoteId: uuid(1),
      contextHash: "a".repeat(64),
      remainingCents: 12501,
      requestId: uuid(2),
      confirmed: true,
    };
    const result = await confirmDeposit(input);
    expect(result.error).toBe(
      code === "PT423"
        ? "Há uma cobrança pendente de resolução neste pedido. Confira a cobrança antes de registrar outro recebimento."
        : code === "PT409"
          ? "O pedido ou o sinal mudou em outra sessão. Recarregue para conferir."
          : "Não foi possível registrar. O valor foi preservado; tente novamente.",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("confirm_manual_deposit", {
      target_quote: input.quoteId,
      expected_context: input.contextHash,
      expected_remaining_cents: 12501,
      request_id: input.requestId,
      confirmed: true,
    });
    expect(mocks.authorize).toHaveBeenCalledWith(["calculator"]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("PRIVAD");
    expect(input.requestId).toBe(uuid(2));
  },
);
it.each(["PT423", "PT409", "private_failure"])(
  "Contrato: %s preserva formulário, revisão e tentativa sem expor dados internos",
  async (code) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code, message: "SENTINELA_PRIVADA", details: "DADO_PRIVADO" },
    });
    const form = new FormData();
    for (const [key, value] of Object.entries({
      clientId: uuid(1),
      hasContract: "yes",
      reason: "Condição fictícia para ensaio.",
      revision: "5",
      requestId: uuid(2),
    }))
      form.set(key, value);
    const before = [...form.entries()];
    const previous = { revision: 5, nextRequestId: uuid(2) };
    const result = await saveClientContract(previous, form);
    expect(result).toMatchObject({
      ...previous,
      success: false,
      message:
        code === "PT423"
          ? "Há uma cobrança pendente de resolução para este cliente. Confira a cobrança antes de alterar a condição de contrato."
          : code === "PT409"
            ? "O cadastro ou esta tentativa mudou. Recarregue para conferir antes de salvar."
            : "Não foi possível conferir a gravação. Sua escolha e motivo foram preservados; tente novamente.",
    });
    expect([...form.entries()]).toEqual(before);
    expect(mocks.rpc).toHaveBeenCalledWith("set_client_contract", {
      target_client: uuid(1),
      has_contract: true,
      reason: "Condição fictícia para ensaio.",
      expected_revision: 5,
      request_id: uuid(2),
    });
    expect(mocks.authorize).toHaveBeenCalledWith(["calculator"]);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("PRIVAD");
  },
);
