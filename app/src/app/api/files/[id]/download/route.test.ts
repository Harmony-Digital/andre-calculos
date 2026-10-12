import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ authorized: vi.fn(), sign: vi.fn() }));
vi.mock("@/modules/files/authorized-file", () => ({
  getAuthorizedFile: mocks.authorized,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSystemClient: () => ({
    storage: { from: () => ({ createSignedUrl: mocks.sign }) },
  }),
}));
vi.mock("@/lib/supabase/config", () => ({
  supabaseConfig: () => ({ url: "http://127.0.0.1:54321" }),
}));
import { GET } from "./route";
const id = "00000000-0000-4000-8000-000000000201";
const request = () =>
  GET(new NextRequest("http://127.0.0.1:3000/api/files/" + id + "/download"), {
    params: Promise.resolve({ id }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorized.mockResolvedValue({
    id,
    path: "ficticio.pdf",
    name: "Fictício.pdf",
  });
  mocks.sign.mockResolvedValue({
    data: {
      signedUrl:
        "http://127.0.0.1:54321/storage/v1/object/sign/processos/ficticio.pdf?token=ficticio",
    },
    error: null,
  });
});
const privateResponse = (r: Response) => {
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
};
it("emite URL de120 segundos somente após autorização atual, com resposta privada", async () => {
  const r = await request();
  expect(r.status).toBe(307);
  privateResponse(r);
  expect(mocks.authorized).toHaveBeenCalledWith(id, "file_download");
  expect(mocks.sign).toHaveBeenCalledWith("ficticio.pdf", 120, {
    download: "Fictício.pdf",
  });
  expect(r.headers.get("location")).toContain(
    "/storage/v1/object/sign/processos/",
  );
});
it("negação usa404 privado e não tenta assinar", async () => {
  mocks.authorized.mockResolvedValue(null);
  const r = await request();
  expect(r.status).toBe(404);
  privateResponse(r);
  expect(mocks.sign).not.toHaveBeenCalled();
});
it("falha ou resposta perdida de armazenamento usa503 privado", async () => {
  mocks.sign.mockResolvedValue({ data: null, error: { code: "FICTICIO" } });
  const r = await request();
  expect(r.status).toBe(503);
  privateResponse(r);
  mocks.sign.mockRejectedValue(new Error("Falha fictícia"));
  const retry = await request();
  expect(retry.status).toBe(503);
  privateResponse(retry);
});
it.each([
  "https://outro.example/storage/v1/object/sign/processos/ficticio.pdf",
  "http://127.0.0.1:54321/fora-do-bucket/ficticio.pdf",
])(
  "endereço fora da origem/bucket esperados não é redirecionado:%s",
  async (signedUrl) => {
    mocks.sign.mockResolvedValue({ data: { signedUrl }, error: null });
    const r = await request();
    expect(r.status).toBe(503);
    privateResponse(r);
    expect(r.headers.get("location")).toBeNull();
  },
);
