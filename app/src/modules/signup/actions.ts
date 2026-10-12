"use server";
import { createSessionClient } from "@/lib/supabase/server";
import type { AuthFormState } from "@/modules/auth/forms";
import { parseSignup } from "./forms";
import { registrationLegal } from "./legal";
import { portalOrigin } from "@/modules/auth/origin";
import { signupMetadata } from "./metadata";
export async function signup(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const legal = await registrationLegal();
  if (!legal.enabled)
    return {
      message:
        "O cadastro aguarda a conclusão dos termos e da política de privacidade.",
    };
  const parsed = parseSignup(form);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const value = parsed.data;
  if (
    value.termsVersion !== legal.termsVersion ||
    value.privacyVersion !== legal.privacyVersion
  )
    return {
      message:
        "Os documentos foram atualizados. Recarregue a página e leia as versões atuais antes de aceitar.",
    };
  const db = await createSessionClient();
  const result = await db.auth.signUp({
    email: value.email,
    password: value.password,
    options: {
      emailRedirectTo: `${portalOrigin()}/auth/callback`,
      data: signupMetadata(value, legal),
    },
  });
  if (result.error)
    return {
      message:
        "Não foi possível concluir o cadastro. Confira os dados ou tente recuperar seu acesso, caso já tenha uma conta.",
    };
  // A configuração deve exigir confirmação; uma sessão imediata falha fechada.
  if (result.data.session) {
    await db.auth.signOut({ scope: "local" });
    return {
      message:
        "O cadastro está temporariamente indisponível. A confirmação de e-mail precisa ser conferida.",
    };
  }
  return {
    success: true,
    message:
      "Confira seu e-mail e confirme o cadastro pelo link recebido. Se já tiver uma conta, entre ou recupere seu acesso.",
  };
}
