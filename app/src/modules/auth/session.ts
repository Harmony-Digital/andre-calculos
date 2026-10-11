import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";

export type Role = "client" | "calculator" | "admin";
export const getSessionProfile = cache(async () => {
  if (!supabaseConfig()) return null;
  const supabase = await createSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role,full_name,phone,oab_number,oab_state")
    .eq("id", user.id)
    .single();
  if (!profile || !["client", "calculator", "admin"].includes(profile.role))
    return null;
  return {
    user: { id: user.id, email: user.email },
    profile: profile as {
      id: string;
      role: Role;
      full_name: string;
      phone: string | null;
      oab_number: string | null;
      oab_state: string | null;
    },
  };
});

export async function authorize(roles: readonly Role[]) {
  const session = await getSessionProfile();
  if (!session || !roles.includes(session.profile.role))
    throw new Error("Acesso não autorizado.");
  return session;
}

export async function requireRole(roles: readonly Role[]) {
  const session = await getSessionProfile();
  if (!session) redirect("/entrar");
  if (!roles.includes(session.profile.role)) redirect("/acesso-negado");
  return session;
}
