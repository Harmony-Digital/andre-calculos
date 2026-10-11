"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { parsePreference } from "./preferences";
export type PreferenceState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  nextRequestId?: string;
  revision?: number;
};
export async function saveNotificationPreference(
  previous: PreferenceState,
  form: FormData,
): Promise<PreferenceState> {
  const actor = await authorize(["calculator"]);
  const parsed = parsePreference(form);
  if (!parsed.success)
    return {
      ...previous,
      success: false,
      message: "Confira o canal e a opção indicada.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const { event, channel, enabled, revision, requestId } = parsed.data,
    db = await createSessionClient();
  const result = await db.rpc("set_my_notification_preference", {
    event,
    channel,
    enabled,
    expected_revision: revision,
    request_id: requestId,
  });
  const receipt = z
    .object({
      id: z.uuid(),
      enabled: z.boolean(),
      revision: z.number().int().positive(),
    })
    .safeParse(result.data);
  if (result.error || !receipt.success)
    return {
      ...previous,
      success: false,
      errors: undefined,
      message:
        result.error?.code === "PT409"
          ? "Esta preferência ou tentativa mudou. Recarregue para conferir antes de salvar."
          : "Não foi possível salvar. Sua escolha continua neste formulário; tente novamente.",
    };
  const current = await db
    .from("notification_preferences")
    .select("revision,enabled")
    .eq("profile_id", actor.profile.id)
    .eq("event", event)
    .eq("channel", channel)
    .single();
  if (current.error)
    return {
      ...previous,
      success: false,
      errors: undefined,
      message:
        "A tentativa foi registrada, mas não foi possível conferir a preferência atual. Tente novamente.",
    };
  if (
    current.data.revision !== receipt.data.revision ||
    current.data.enabled !== receipt.data.enabled
  )
    return {
      ...previous,
      success: false,
      errors: undefined,
      message:
        "Esta tentativa já foi registrada e a preferência mudou depois. Recarregue para conferir antes de salvar.",
    };
  revalidatePath("/painel/configuracoes");
  return {
    success: true,
    message: "Preferência salva.",
    revision: receipt.data.revision,
    nextRequestId: randomUUID(),
  };
}
