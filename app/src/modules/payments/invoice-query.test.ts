import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/session", () => ({ authorize: auth }));
import { getPaymentInvoice, readFixtureInvoice } from "./invoice-query";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it.each([
  ["ANDRE_LOCAL_TESTS", "0"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://qtofwbxujshroaafxowr.supabase.co"],
  ["VERCEL", "1"],
  ["VERCEL_ENV", "preview"],
  ["NODE_ENV", "production"],
])(
  "consulta fictícia não usa ambiente externo ou produção: %s",
  async (name, value) => {
    vi.stubEnv("ANDRE_LOCAL_TESTS", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(name, value);
    const id = "a0000000-0000-4000-8000-000000000001";
    await expect(getPaymentInvoice(id, id)).rejects.toThrow(
      "Não foi possível conferir a fatura",
    );
    await expect(readFixtureInvoice(id, {})).rejects.toThrow(
      "Não foi possível conferir a fatura",
    );
    expect(auth).not.toHaveBeenCalled();
  },
);
