"use server";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { updateIntentSchema } from "./schemas";
import { z } from "zod";
export async function startCalculationUpdate(input: unknown) {
  await authorize(["client"]);
  const parsed = updateIntentSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Confira o cálculo e o arquivo de origem." };
  const v = parsed.data,
    db = await createSessionClient();
  const result = await db.rpc("create_calculation_update", {
    target_process: v.processId,
    source_order: v.sourceOrderId,
    request_id: v.requestId,
    source_file: v.fileId ?? undefined,
  });
  if (result.error || !result.data)
    return {
      error:
        result.error?.code === "PT409"
          ? "Já existe uma atualização em andamento. Abra a pasta e continue o pedido existente."
          : "Não foi possível iniciar. Confira a liberação do PJC e tente novamente; esta tentativa foi preservada.",
    };
  revalidatePath(`/app/processos/${v.processId}`);
  return { orderId: result.data };
}
export async function attachUpdatePjc(input: unknown) {
  await authorize(["client"]);
  const v = z
    .strictObject({
      orderId: z.uuid(),
      revision: z.number().int().positive(),
      fileId: z.uuid(),
    })
    .safeParse(input);
  if (!v.success)
    return { error: "Selecione o PJC enviado para esta atualização." };
  const db = await createSessionClient();
  const result = await db.rpc("complete_calculation_update", {
    target_order: v.data.orderId,
    expected_revision: v.data.revision,
    source_file: v.data.fileId,
  });
  if (result.error)
    return {
      error:
        "Não foi possível vincular. Confira o arquivo e a revisão do pedido antes de tentar novamente.",
    };
  revalidatePath("/app/novo-pedido");
  return { success: true };
}
