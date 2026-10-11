import { afterEach, beforeEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { client, run } = vi.hoisted(() => ({ client: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSystemClient: client }));
vi.mock("@/modules/notifications/deadline-runner", () => ({
  runDeadlineReminders: run,
}));
import { GET } from "./route";
const secret = "fixture-local-cron-123456789";
const request = (authorization?: string, query = "") =>
  new Request(`http://127.0.0.1:3000/api/cron/deadlines${query}`, {
    headers: authorization ? { authorization } : {},
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", secret);
  vi.stubEnv("ANDRE_LOCAL_TESTS", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VERCEL_ENV", undefined);
});
afterEach(() => vi.unstubAllEnvs());
it("segredo ausente ou curto bloqueia antes do acesso administrativo", async () => {
  for (const value of [undefined, "short"]) {
    vi.stubEnv("CRON_SECRET", value);
    expect((await GET(request())).status).toBe(503);
  }
  expect(client).not.toHaveBeenCalled();
});
it("Bearer ausente, inválido ou com sufixo não acessa o banco", async () => {
  for (const value of [undefined, "wrong", `Bearer ${secret}x`])
    expect((await GET(request(value))).status).toBe(401);
  expect(client).not.toHaveBeenCalled();
});
it("calendário provisório continua bloqueado em nuvem mesmo com flag local", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  expect((await GET(request(`Bearer ${secret}`))).status).toBe(503);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  expect((await GET(request(`Bearer ${secret}`))).status).toBe(503);
  expect(client).not.toHaveBeenCalled();
});
it("request não injeta relógio ou aprovação; resposta não fica em cache", async () => {
  expect(
    (await GET(request(`Bearer ${secret}`, "?now=2030-01-01"))).status,
  ).toBe(400);
  expect(client).not.toHaveBeenCalled();
  run.mockResolvedValue({ status: "outside_window", scanned: 0, consumed: 0 });
  const response = await GET(request(`Bearer ${secret}`));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ status: "outside_window" });
});
it("falha do banco não revela detalhes nem o segredo", async () => {
  run.mockRejectedValue(new Error(secret));
  const response = await GET(request(`Bearer ${secret}`));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "deadline_run_failed" });
});
