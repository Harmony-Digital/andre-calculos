/** Opt-in de hospedagem para a primeira validação autorizada, sem serviços reais. */
export function hostedValidationEnabled(
  env: Record<string, string | undefined>,
) {
  return (
    env.ANDRE_VALIDATION_MODE === "1" &&
    env.VERCEL === "1" &&
    env.VERCEL_ENV === "production" &&
    env.VERCEL_PROJECT_ID === "prj_tdmzmC6utVU2fHPz0iVhroMD8NtI" &&
    env.APP_BASE_URL === "https://project-rucji.vercel.app" &&
    env.NEXT_PUBLIC_SUPABASE_URL === "https://qtofwbxujshroaafxowr.supabase.co"
  );
}
