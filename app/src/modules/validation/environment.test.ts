import { expect, it } from "vitest";
import { hostedValidationEnabled } from "./environment";
const valid = {
  ANDRE_VALIDATION_MODE: "1",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_tdmzmC6utVU2fHPz0iVhroMD8NtI",
  APP_BASE_URL: "https://project-rucji.vercel.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://qtofwbxujshroaafxowr.supabase.co",
};
it("exige opt-in e todas as identidades do destino de validação", () => {
  expect(hostedValidationEnabled(valid)).toBe(true);
  for (const key of Object.keys(valid))
    expect(hostedValidationEnabled({ ...valid, [key]: undefined })).toBe(false);
});
it.each([
  { VERCEL_ENV: "preview" },
  { VERCEL_PROJECT_ID: "outro-projeto" },
  { APP_BASE_URL: "https://outro.vercel.app" },
  { NEXT_PUBLIC_SUPABASE_URL: "https://outro.supabase.co" },
  { ANDRE_VALIDATION_MODE: "0" },
])("recusa destino ou modo divergente: %o", (patch) => {
  expect(hostedValidationEnabled({ ...valid, ...patch })).toBe(false);
});
