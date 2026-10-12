import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { portalOrigin } from "./origin";
beforeEach(() => vi.stubEnv("NODE_ENV", "production"));
afterEach(() => vi.unstubAllEnvs());
it("HTTPS público e HTTP apenas local fornecem origem canônica", () => {
  for (const [configured, origin] of [
    ["https://portal.example.test/caminho", "https://portal.example.test"],
    ["http://127.0.0.1:3000/", "http://127.0.0.1:3000"],
    ["http://localhost:3000/", "http://localhost:3000"],
  ]) {
    vi.stubEnv("APP_BASE_URL", configured);
    expect(portalOrigin()).toBe(origin);
  }
});
it("HTTP remoto, outros protocolos e credenciais na URL são recusados", () => {
  for (const configured of [
    "http://portal.example.test",
    "ftp://localhost/",
    "ftp://127.0.0.1/",
    "javascript:confirm('ficticio')",
    "https://usuario:ficticio@portal.example.test",
    "http://usuario@localhost:3000",
  ]) {
    vi.stubEnv("APP_BASE_URL", configured);
    expect(() => portalOrigin()).toThrow("Origem do portal indisponível.");
  }
});
it("produção exige configuração; desenvolvimento tem padrão local", () => {
  vi.stubEnv("APP_BASE_URL", undefined);
  expect(() => portalOrigin()).toThrow("Origem do portal indisponível.");
  vi.stubEnv("NODE_ENV", "development");
  expect(portalOrigin()).toBe("http://127.0.0.1:3000");
});
