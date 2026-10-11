"use server";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import type { AuthFormState } from "@/modules/auth/forms";
import { parseProfile } from "./forms";
export async function saveProfile(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  await authorize(["client"]);
  const parsed = parseProfile(form);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const db = await createSessionClient();
  const result = await db.rpc("update_own_profile", {
    full_name: parsed.data.fullName,
    phone: parsed.data.phone!,
    oab_number: parsed.data.oabNumber,
    oab_state: parsed.data.oabState,
    city: parsed.data.city,
    legal_name: parsed.data.legalName,
  });
  if (result.error)
    return { message: "Não foi possível salvar seus dados. Tente novamente." };
  revalidatePath("/app", "layout");
  return { success: true, message: "Seus dados foram atualizados." };
}
export async function requestDeletion(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  await authorize(["client"]);
  if (form.get("confirm") !== "yes")
    return {
      errors: {
        confirm: ["Confirme que deseja registrar o pedido de exclusão."],
      },
    };
  const db = await createSessionClient();
  const { error } = await db.rpc("request_account_deletion");
  if (error)
    return {
      message: "Não foi possível registrar a solicitação. Tente novamente.",
    };
  revalidatePath("/app/conta");
  return {
    success: true,
    message:
      "Pedido de exclusão registrado. O responsável analisará a retenção legal e informará os próximos passos.",
  };
}
