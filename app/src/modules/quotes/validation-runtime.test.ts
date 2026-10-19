import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { quoteFixturesEnabled } from "./local-fixtures";
import { localContractWorkerEnabled } from "./contract-worker";
const env = {
  ANDRE_VALIDATION_MODE: "1",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_tdmzmC6utVU2fHPz0iVhroMD8NtI",
  APP_BASE_URL: "https://project-rucji.vercel.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://qtofwbxujshroaafxowr.supabase.co",
};
afterEach(() => vi.unstubAllEnvs());
it("os dois consumidores permitem somente o destino fictício autorizado", () => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  expect(quoteFixturesEnabled(process.env)).toBe(true);
  expect(localContractWorkerEnabled()).toBe(true);
  vi.stubEnv("VERCEL_PROJECT_ID", "outro");
  expect(quoteFixturesEnabled(process.env)).toBe(false);
  expect(localContractWorkerEnabled()).toBe(false);
});
it("o ambiente hospedado comum continua bloqueado", () => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.stubEnv("ANDRE_VALIDATION_MODE", undefined);
  expect(quoteFixturesEnabled(process.env)).toBe(false);
  expect(localContractWorkerEnabled()).toBe(false);
});
