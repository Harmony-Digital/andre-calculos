import "server-only";
import type { User } from "@supabase/supabase-js";
import { createSystemClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import { hostedValidationEnabled } from "./environment";

const origin = "https://project-rucji.vercel.app";
const host = "project-rucji.vercel.app";
const personas = {
  lawyer: {
    id: "6d07e560-0010-4000-8000-000000000001",
    email: "advogada@validacao.invalid",
    name: "Advogada de demonstração",
    role: "client",
    destination: "/app",
  },
  calculator: {
    id: "6d07e560-0010-4000-8000-000000000002",
    email: "andre@validacao.invalid",
    name: "André Modelo — validação",
    role: "calculator",
    destination: "/painel",
  },
} as const;
const reservedIds = [
  personas.lawyer.id,
  personas.calculator.id,
  "6d07e560-0010-4000-8000-000000000003",
];
type Persona = (typeof personas)[keyof typeof personas];

function matchesUser(user: User | null, persona: Persona) {
  return (
    user?.id === persona.id &&
    user.email === persona.email &&
    user.role === "authenticated" &&
    user.user_metadata.full_name === persona.name &&
    user.user_metadata.legal_name === persona.name &&
    user.user_metadata.accepted_legal === false
  );
}
function matchesProfile(
  profile: { id: string; role: string; full_name: string } | null,
  persona: Persona,
) {
  return (
    profile?.id === persona.id &&
    profile.role === persona.role &&
    profile.full_name === persona.name
  );
}

/** Somente POST de mesma origem no destino fictício explicitamente habilitado. */
export function demoRequestAllowed(
  headers: Headers,
  env: Record<string, string | undefined>,
) {
  return (
    hostedValidationEnabled(env) &&
    headers.get("origin") === origin &&
    headers.get("host") === host &&
    (!headers.has("x-forwarded-host") ||
      headers.get("x-forwarded-host") === host) &&
    (!headers.has("x-forwarded-proto") ||
      headers.get("x-forwarded-proto") === "https")
  );
}

/** Nenhum token/link/usuário é devolvido ao chamador; só o destino fixo. */
export async function createDemoSession(
  form: FormData,
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): Promise<"/app" | "/painel" | null> {
  if (!demoRequestAllowed(headers, env)) return null;
  const values = form.getAll("persona");
  const selected = values[0];
  if (
    values.length !== 1 ||
    (selected !== "lawyer" && selected !== "calculator")
  )
    return null;
  const persona = personas[selected];
  let session: Awaited<ReturnType<typeof createSessionClient>> | undefined;
  try {
    const system = createSystemClient();
    const before = await system.auth.admin.getUserById(persona.id);
    if (before.error || !matchesUser(before.data.user, persona)) return null;
    const profile = await system
      .from("profiles")
      .select("id,role,full_name")
      .eq("id", persona.id)
      .single();
    if (profile.error || !matchesProfile(profile.data, persona)) return null;
    // Desliga o atalho caso o mesmo banco passe a receber outros perfis.
    const otherProfiles = await system
      .from("profiles")
      .select("id")
      .not("id", "in", `(${reservedIds.join(",")})`)
      .limit(1);
    if (otherProfiles.error || otherProfiles.data?.length !== 0) return null;

    // O SDK documenta que generateLink pode criar usuário. Por isso o UUID,
    // email e perfil existentes são conferidos antes, e a identidade depois.
    // generateLink gera o link administrativamente; não envia e-mail.
    const generated = await system.auth.admin.generateLink({
      type: "magiclink",
      email: persona.email,
    });
    const tokenHash = generated.data.properties?.hashed_token;
    if (
      generated.error ||
      !matchesUser(generated.data.user, persona) ||
      generated.data.properties?.verification_type !== "magiclink" ||
      typeof tokenHash !== "string" ||
      tokenHash.length === 0 ||
      tokenHash.length > 2048
    )
      return null;
    const after = await system.auth.admin.getUserById(persona.id);
    if (after.error || !matchesUser(after.data.user, persona)) return null;

    session = await createSessionClient();
    const verified = await session.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });
    if (
      verified.error ||
      !verified.data.session ||
      !matchesUser(verified.data.user, persona) ||
      !matchesUser(verified.data.session.user, persona)
    )
      throw new Error("demo_session_unavailable");
    const actual = await session.auth.getUser();
    if (actual.error || !matchesUser(actual.data.user, persona))
      throw new Error("demo_session_unavailable");
    const activeProfile = await session
      .from("profiles")
      .select("id,role,full_name")
      .eq("id", persona.id)
      .single();
    if (activeProfile.error || !matchesProfile(activeProfile.data, persona))
      throw new Error("demo_session_unavailable");
    const audit = await session.rpc("record_auth_audit", { event: "login" });
    if (audit.error) throw new Error("demo_session_unavailable");
    return persona.destination;
  } catch {
    if (session) {
      try {
        await session.auth.signOut({ scope: "local" });
      } catch {
        // Nenhum erro do provedor, token ou sessão chega à resposta/log.
      }
    }
    return null;
  }
}
