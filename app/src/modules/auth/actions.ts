"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSessionClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { portalOrigin } from "./origin";
import { authorize } from "./session";
import {
  emailSchema,
  loginSchema,
  newPasswordSchema,
  safeReturnPath,
  type AuthFormState,
} from "./forms";

export async function login(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  if (!supabaseConfig())
    return { message: "O acesso está temporariamente indisponível." };
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user)
    return { message: "Não foi possível entrar. Confira o e-mail e a senha." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (!profile || !["client", "calculator", "admin"].includes(profile.role)) {
    await supabase.auth.signOut();
    return { message: "Seu acesso precisa ser conferido pelo responsável." };
  }
  const audited = await supabase.rpc("record_auth_audit", { event: "login" });
  if (audited.error) {
    await supabase.auth.signOut({ scope: "local" });
    return { message: "O acesso está temporariamente indisponível." };
  }
  revalidatePath("/", "layout");
  redirect(
    safeReturnPath(
      form.get("next"),
      profile.role === "client" ? "/app" : "/painel",
    ),
  );
}
export async function requestLink(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  if (!supabaseConfig())
    return { message: "O acesso está temporariamente indisponível." };
  const supabase = await createSessionClient();
  const recovery = form.get("intent") === "recovery";
  const redirectTo = `${portalOrigin()}/auth/callback?next=${recovery ? "/nova-senha" : "/app"}`;
  if (recovery)
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo,
    });
  else
    await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
  return {
    success: true,
    message:
      "Se o e-mail estiver cadastrado, você receberá um link. Confira também a pasta de spam.",
  };
}
export async function changePassword(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const parsed = newPasswordSchema.safeParse({
    password: form.get("password"),
    confirmation: form.get("confirmation"),
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  await authorize(["client", "calculator", "admin"]);
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error)
    return {
      message:
        "Não foi possível atualizar a senha. Solicite um novo link e tente novamente.",
    };
  const audited = await supabase.rpc("record_auth_audit", {
    event: "password_changed",
  });
  if (audited.error)
    throw new Error("Não foi possível registrar a alteração de senha.");
  await supabase.auth.signOut({ scope: "global" });
  redirect("/entrar?senha=atualizada");
}
export async function logout() {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.rpc("record_auth_audit", { event: "logout" });
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/entrar");
}
