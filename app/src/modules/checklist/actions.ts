"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { validateDraft } from "./draft";
const inputSchema = z
  .object({
    orderId: z.uuid().optional(),
    revision: z.number().int().positive().optional(),
    completedStep: z.number().int().min(0).max(8),
    answers: z.unknown(),
  })
  .refine((value) => Boolean(value.orderId) === Boolean(value.revision));
export async function saveDraft(input: unknown) {
  await authorize(["client"]);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return {
      error:
        "O rascunho não pôde ser salvo. Recarregue a página e confira as respostas.",
    };
  const validated = validateDraft(
    parsed.data.answers,
    parsed.data.completedStep,
  );
  if (!validated.data)
    return {
      error: "Confira os campos das etapas preenchidas antes de salvar.",
      errors: validated.errors,
    };
  const db = await createSessionClient();
  const saved = await db.rpc("save_checklist_draft", {
    payload: validated.data as unknown as Json,
    completed_step: parsed.data.completedStep,
    draft_id: parsed.data.orderId ?? undefined,
    expected_revision: parsed.data.revision ?? undefined,
  });
  if (saved.error || !saved.data?.[0]) {
    const message = saved.error?.message ?? "";
    return {
      error: message.includes("outra sessão")
        ? "Este rascunho mudou em outra sessão. Recarregue a página para conferir a versão salva."
        : message.includes("Processo já vinculado") ||
            message.includes("já cadastrado")
          ? "Confira a identificação: o processo já tem pedidos ou documentos vinculados."
          : "Não foi possível salvar agora. Suas respostas continuam nesta tela; tente novamente.",
    };
  }
  revalidatePath("/app");
  const row = saved.data[0];
  return {
    saved: {
      orderId: row.order_id,
      code: row.order_code,
      processId: row.process_id,
      revision: row.revision,
      completedStep: row.saved_step,
    },
  };
}
