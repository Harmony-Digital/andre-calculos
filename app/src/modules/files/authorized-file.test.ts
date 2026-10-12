import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/session", () => ({ getSessionProfile: mocks.session }));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
import { getAuthorizedFile } from "./authorized-file";
import { maxFileBytes } from "./validation";
const id = "a0000000-0000-4000-8000-000000000201";
const metadata = {
  id,
  path: "caminho/ficticio/atual.pdf",
  name: "Fictício.pdf",
  mime: "application/pdf",
  size_bytes: 100,
  upload_status: "uploaded",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ profile: { role: "client" } });
  mocks.rpc.mockResolvedValue({ data: metadata, error: null });
  mocks.from.mockImplementation(() => {
    throw new Error("Não usar consulta anterior ao audit.");
  });
});
it("retorna somente metadados da operação auditada, sem consulta anterior ao arquivo", async () => {
  expect(await getAuthorizedFile(id, "file_download")).toEqual(metadata);
  expect(mocks.rpc).toHaveBeenCalledWith("authorize_file_access", {
    target_file: id,
    access_kind: "file_download",
  });
  expect(mocks.from).not.toHaveBeenCalled();
});
it("calculista e UUID normalizado conservam autorização pelo mesmo RPC", async () => {
  mocks.session.mockResolvedValue({ profile: { role: "calculator" } });
  expect(await getAuthorizedFile(id.toUpperCase(), "file_view")).toEqual(
    metadata,
  );
});
it("sessão ausente, administrador e ID inválido não chegam ao banco", async () => {
  mocks.session.mockResolvedValue(null);
  expect(await getAuthorizedFile(id, "file_download")).toBeNull();
  mocks.session.mockResolvedValue({ profile: { role: "admin" } });
  expect(await getAuthorizedFile(id, "file_download")).toBeNull();
  mocks.session.mockResolvedValue({ profile: { role: "client" } });
  expect(await getAuthorizedFile("invalido", "file_download")).toBeNull();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("erro ou resposta perdida do RPC não liberam metadados antigos", async () => {
  mocks.rpc.mockResolvedValue({ data: metadata, error: { code: "PT409" } });
  expect(await getAuthorizedFile(id, "file_download")).toBeNull();
  mocks.rpc.mockRejectedValue(new Error("Falha fictícia."));
  expect(await getAuthorizedFile(id, "file_download")).toBeNull();
});
it("resposta incompleta, de outro arquivo ou sem upload confirmado fica bloqueada", async () => {
  for (const patch of [
    { id: "a0000000-0000-4000-8000-000000000202" },
    { path: "" },
    { size_bytes: 0 },
    { size_bytes: maxFileBytes + 1 },
    { upload_status: "pending" },
    { name: "" },
    { extra: "Não publicar" },
  ]) {
    mocks.rpc.mockResolvedValue({
      data: { ...metadata, ...patch },
      error: null,
    });
    expect(await getAuthorizedFile(id, "file_download")).toBeNull();
  }
});
it("limite de upload existente permanece disponível para download", async () => {
  mocks.rpc.mockResolvedValue({
    data: { ...metadata, size_bytes: maxFileBytes },
    error: null,
  });
  expect((await getAuthorizedFile(id, "file_download"))?.size_bytes).toBe(
    maxFileBytes,
  );
});
it("visualização recebe somente PDF, enquanto download conserva outros formatos", async () => {
  const pjc = {
    ...metadata,
    mime: "application/octet-stream",
    name: "Fictício.pjc",
  };
  mocks.rpc.mockResolvedValue({ data: pjc, error: null });
  expect(await getAuthorizedFile(id, "file_view")).toBeNull();
  expect(await getAuthorizedFile(id, "file_download")).toEqual(pjc);
});
