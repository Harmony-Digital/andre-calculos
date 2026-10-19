import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({ rpc: mocks.rpc }),
}));
import { getFileAccessAudit } from "./audit-queries";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({});
  mocks.rpc.mockResolvedValue({
    data: { rows: [], has_more: false },
    error: null,
  });
});
it("usa somente sessão do calculista e envia datas civis para o fuso do banco", async () => {
  const result = await getFileAccessAudit({
    arquivo: "Nome % literal",
    autor: "Autor",
    inicio: "2026-10-18",
    fim: "2026-10-18",
    acao: "file_view",
  });
  expect(result.ok).toBe(true);
  expect(mocks.authorize).toHaveBeenCalledWith(["calculator"]);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "get_file_access_audit",
    expect.objectContaining({
      file_search: "Nome % literal",
      actor_search: "Autor",
      start_date: "2026-10-18",
      end_date: "2026-10-18",
      access_action: "file_view",
      page_size: 50,
    }),
  );
});
it("nega papel não permitido antes de consultar; filtro inválido também não consulta", async () => {
  mocks.authorize.mockRejectedValueOnce(new Error("Acesso não autorizado."));
  await expect(getFileAccessAudit({})).rejects.toThrow("Acesso não autorizado");
  expect((await getFileAccessAudit({ depois: "inválido" })).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("falha de banco, transporte e payload inesperado geram mensagem segura", async () => {
  for (const response of [
    { error: { message: "segredo-fictício" }, data: null },
    { error: null, data: { rows: [], has_more: false, ip: "privado" } },
  ]) {
    mocks.rpc.mockResolvedValue(response);
    const result = await getFileAccessAudit({});
    expect(result).toEqual({
      ok: false,
      error: "Não foi possível consultar os acessos agora. Tente novamente.",
    });
  }
  mocks.rpc.mockRejectedValue(new Error("segredo-fictício"));
  expect((await getFileAccessAudit({})).ok).toBe(false);
});
