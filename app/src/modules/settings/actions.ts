"use server";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { parseSettings, parsePrices, priceParameters } from "./forms";
export type SettingsState = {
  message?: string;
  success?: boolean;
  errors?: Record<string, string[]>;
};
const failure = (message: string) => ({ message, success: false });
export async function saveSettings(
  _previous: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  await authorize(["calculator", "admin"]);
  const parsed = parseSettings(form);
  if (!parsed.success)
    return {
      message: "Confira os campos indicados.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const { revision, ...payload } = parsed.data;
  const db = await createSessionClient();
  const result = await db.rpc("save_service_settings", {
    payload,
    expected_revision: revision,
  });
  if (result.error)
    return failure(
      result.error.message.includes("outra sessão")
        ? "As configurações mudaram em outra sessão. Recarregue antes de salvar."
        : "Não foi possível salvar as configurações. Tente novamente.",
    );
  revalidatePath("/", "layout");
  return { success: true, message: "Configurações salvas." };
}
export async function savePrices(
  _previous: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  await authorize(["calculator", "admin"]);
  const parsed = parsePrices(form);
  if (!parsed.success)
    return {
      message: "Confira os campos indicados.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const data = parsed.data,
    db = await createSessionClient();
  const result = await db.rpc("save_price_version", {
    payload: priceParameters(data),
    example: data.isExample,
    expected_version: data.expectedVersion,
    approved: data.approved,
  });
  if (result.error || !result.data?.[0])
    return failure(
      result.error?.message.includes("outra sessão")
        ? "A tabela mudou em outra sessão. Recarregue antes de salvar."
        : "Não foi possível salvar a versão de preços. Tente novamente.",
    );
  revalidatePath("/", "layout");
  const saved = result.data[0];
  return {
    success: true,
    message: saved.is_active
      ? `Versão ${saved.table_version} ativada. Os preços anteriores permanecem no histórico.`
      : `Versão ${saved.table_version} salva como exemplo inativo.`,
  };
}
