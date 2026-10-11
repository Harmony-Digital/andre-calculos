import "server-only";
import { createSessionClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { legalVersion } from "@/content/legal";
export async function registrationLegal() {
  const unavailable = {
    enabled: false,
    termsVersion: "",
    privacyVersion: "",
    testOnly: false,
  };
  if (!supabaseConfig()) return unavailable;
  const db = await createSessionClient();
  const { data, error } = await db.rpc("get_legal_versions");
  if (error || !data?.[0]) return unavailable;
  const { terms_version: termsVersion, privacy_version: privacyVersion } =
    data[0];
  if (!termsVersion || !privacyVersion) return unavailable;
  const testOnly =
    process.env.NODE_ENV !== "production" &&
    process.env.ANDRE_LOCAL_TESTS === "1" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:54321" &&
    termsVersion === "fixture-termos-v1" &&
    privacyVersion === "fixture-privacidade-v1";
  const approved =
    !legalVersion.startsWith("rascunho") &&
    termsVersion === legalVersion &&
    privacyVersion === legalVersion;
  return {
    enabled: approved || testOnly,
    termsVersion,
    privacyVersion,
    testOnly,
  };
}
