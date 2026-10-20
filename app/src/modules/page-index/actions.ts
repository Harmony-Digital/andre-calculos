"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { parseIndexEntry } from "./forms";
export type IndexState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  nextRequestId?: string;
  nextEntryId?: string;
};
export async function saveIndexEntry(
  previous: IndexState,
  form: FormData,
): Promise<IndexState> {
  await authorize(["calculator"]);
  const parsed = parseIndexEntry(form);
  if (!parsed.success)
    return {
      ...previous,
      success: false,
      message: "Confira os campos indicados.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const v = parsed.data,
    db = await createSessionClient(),
    result = await db.rpc("mutate_process_page_index", {
      target_process: v.processId,
      request_id: v.requestId,
      payload: {
        action: v.operation,
        fileId: v.fileId,
        entryId: v.entryId,
        expectedRevision: v.revision,
        piece: v.operation === "delete" ? "" : v.piece,
        pages: v.operation === "delete" ? "" : v.pages,
        note: v.operation === "delete" ? "" : v.note,
      },
    });
  if (result.error)
    return {
      ...previous,
      success: false,
      errors: undefined,
      message:
        result.error.message === "Página fora do PDF conferido"
          ? "As páginas ultrapassam a quantidade conferida deste PDF. Corrija as páginas; os campos foram preservados."
          : result.error.code === "PT409"
            ? "O índice mudou. Recarregue a página antes de editar; os campos foram preservados."
            : result.error.message === "Operação já registrada com outros dados"
              ? "A tentativa anterior já foi registrada com outros campos. Recarregue a página para conferir o índice."
              : "Não foi possível salvar. Os campos foram preservados; tente novamente.",
    };
  revalidatePath(`/painel/processos/${v.processId}`);
  revalidatePath(`/app/processos/${v.processId}`);
  return {
    success: true,
    message: v.operation === "delete" ? "Entrada removida." : "Índice salvo.",
    nextRequestId: randomUUID(),
    nextEntryId: randomUUID(),
  };
}
