import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const { create, exchange } = vi.hoisted(() => ({
  create: vi.fn(),
  exchange: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSessionClient: create }));
import { GET } from "./route";
const origin = "https://portal.example.test";
function callback(next?: string, code?: string) {
  const url = new URL("https://interno.example.test/auth/callback");
  if (next !== undefined) url.searchParams.set("next", next);
  if (code !== undefined) url.searchParams.set("code", code);
  return new NextRequest(url, {
    headers: {
      host: "forjado.example.test",
      "x-forwarded-host": "forjado.example.test",
      "x-forwarded-proto": "http",
    },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_BASE_URL", origin);
  create.mockResolvedValue({ auth: { exchangeCodeForSession: exchange } });
  exchange.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("origem pública configurada prevalece sobre origem interna e cabeçalhos forjados", async () => {
  for (const path of ["/app", "/app/conta", "/nova-senha"]) {
    const response = await GET(callback(path, "CODIGO_FICTICIO"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(origin + path);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(exchange).toHaveBeenCalledTimes(3);
});
it("retorno externo ou codificado não sai da origem do portal após troca válida", async () => {
  for (const path of [
    "https://externo.example.test",
    "//externo.example.test",
    "/app/../externo",
    "/app/%2e%2e/externo",
    "/app\\externo",
    "/nova-senha?url=https://externo.example.test",
  ]) {
    const response = await GET(callback(path, "CODIGO_FICTICIO"));
    expect(response.headers.get("location")).toBe(origin + "/app");
  }
});
it("falha ou código ausente apresenta apenas o motivo público sem cache", async () => {
  const noCode = await GET(callback("https://externo.example.test"));
  expect(create).not.toHaveBeenCalled();
  exchange.mockResolvedValue({
    error: { message: "DETALHE_FICTICIO_PRIVADO" },
  });
  const invalid = await GET(
    callback("/nova-senha", "CODIGO_FICTICIO_INVALIDO"),
  );
  for (const response of [noCode, invalid]) {
    expect(response.headers.get("location")).toBe(
      origin + "/entrar?link=invalido",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("DETALHE_FICTICIO_PRIVADO");
  }
});
it("produção sem origem configurada falha antes de trocar o código", async () => {
  vi.stubEnv("APP_BASE_URL", undefined);
  await expect(GET(callback("/app", "CODIGO_FICTICIO"))).rejects.toThrow(
    "Origem do portal indisponível.",
  );
  expect(create).not.toHaveBeenCalled();
});
