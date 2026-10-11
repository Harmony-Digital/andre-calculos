import "server-only";
import { z } from "zod";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { effectivePreferences } from "./preferences";
export async function getNotificationPreferences() {
  await authorize(["calculator"]);
  const db = await createSessionClient();
  const [context, preferences] = await Promise.all([
    db.rpc("get_calculator_notification_context"),
    db
      .from("notification_preferences")
      .select("event,channel,enabled,revision"),
  ]);
  const parsed = z
    .object({ isRecipient: z.boolean(), canClaim: z.boolean() })
    .safeParse(context.data);
  if (context.error || !parsed.success || preferences.error)
    throw new Error("Não foi possível consultar as preferências de aviso.");
  return {
    context: parsed.data,
    preferences: effectivePreferences(preferences.data),
  };
}
