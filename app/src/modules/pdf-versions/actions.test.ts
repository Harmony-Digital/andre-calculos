import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/modules/auth/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { savePdfVersion } from "./actions";
const id = "a0000000-0000-4000-8000-000000000201";
const form = () => {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    processId: id,
    requestId: id,
    fileId: id,
    revision: "1",
    operation: "read",
    pages: "1-3",
    read: "yes",
  }))
    f.set(k, v);
  return f;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({});
  mocks.rpc.mockResolvedValue({
    data: { fileId: id, revision: 2, entryId: null },
    error: null,
  });
});
it("autoriza antes de consultar e revalida duas visões só com recibo íntegro", async () => {
  const result = await savePdfVersion({}, form());
  expect(result.success).toBe(true);
  expect(result.nextRequestId).toBeTruthy();
  expect(mocks.authorize).toHaveBeenCalledWith(["calculator"]);
  expect(mocks.rpc).toHaveBeenCalledWith("mutate_pdf_version", {
    target_process: id,
    request_id: id,
    payload: {
      operation: "read",
      fileId: id,
      revision: 1,
      pages: "1-3",
      read: true,
    },
  });
  expect(mocks.revalidate).toHaveBeenCalledTimes(3);
});
it("recusa papel e formulário inválido antes do banco", async () => {
  mocks.authorize.mockRejectedValueOnce(new Error("Acesso não autorizado."));
  await expect(savePdfVersion({}, form())).rejects.toThrow();
  const bad = form();
  bad.set("pages", "0");
  expect((await savePdfVersion({}, bad)).success).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("conflito e resposta perdida preservam a chave, sem revalidar ou expor payload de erro", async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: { code: "PT409", message: "dado privado fictício" },
  });
  const result = await savePdfVersion({}, form());
  expect(result.message).toContain("Recarregue");
  expect(result.nextRequestId).toBeUndefined();
  mocks.rpc.mockRejectedValueOnce(new Error("dado privado fictício"));
  const lost = await savePdfVersion({}, form());
  expect(lost.message).toContain("recuperar o recibo");
  expect(lost.message).not.toContain("dado privado");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("payload inesperado ou recibo de outro arquivo não confirmam ação", async () => {
  for (const data of [
    { fileId: id, revision: 2, entryId: null, path: "não revelar" },
    {
      fileId: "a0000000-0000-4000-8000-000000000202",
      revision: 2,
      entryId: null,
    },
  ]) {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect((await savePdfVersion({}, form())).success).toBe(false);
  }
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
