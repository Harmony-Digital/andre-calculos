"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { parsePdfVersion } from "./forms";
export type PdfVersionState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
  nextRequestId?: string;
};
const receiptSchema = z
  .object({
    fileId: z.uuid(),
    revision: z.number().int().positive(),
    entryId: z.uuid().nullable(),
  })
  .strict();
const safeMessages = new Set([
  "Confirme a correspondência de todas as páginas da referência",
  "Página fora do PDF conferido",
  "Escolha a última versão já conferida",
  "Este PDF não tem versão anterior",
  "Referência já reaproveitada; confira o índice",
  "A quantidade declarada não cobre o índice existente",
  "Divida a referência em até 500 páginas antes de reaproveitar",
  "Divida a referência antes de reaproveitar",
  "Não repita páginas na correspondência",
]);
export async function savePdfVersion(
  previous: PdfVersionState,
  form: FormData,
): Promise<PdfVersionState> {
  await authorize(["calculator"]);
  const parsed = parsePdfVersion(form);
  if (!parsed.ok)
    return {
      ...previous,
      success: false,
      message: "Confira os campos indicados.",
      errors: parsed.errors,
    };
  try {
    const db = await createSessionClient();
    const result = await db.rpc("mutate_pdf_version", {
      target_process: parsed.processId,
      request_id: parsed.requestId,
      payload: parsed.payload,
    });
    const receipt = receiptSchema.safeParse(result.data);
    if (
      result.error ||
      !receipt.success ||
      receipt.data.fileId !== parsed.payload.fileId
    )
      return {
        ...previous,
        success: false,
        errors: undefined,
        message:
          result.error?.code === "PT409"
            ? "A conferência ou a referência mudou. Recarregue antes de continuar; os campos foram preservados."
            : result.error?.code === "23505"
              ? "Uma página anterior já corresponde a outro destino. Retire a correspondência antiga antes de trocar."
              : safeMessages.has(result.error?.message ?? "")
                ? result.error!.message + "."
                : result.error?.message ===
                    "Operação já registrada com outros dados"
                  ? "Esta tentativa já foi registrada com outros campos. Recarregue para conferir."
                  : "Não foi possível salvar. Os campos foram preservados; tente novamente.",
      };
    revalidatePath(`/painel/processos/${parsed.processId}/versoes`);
    revalidatePath(`/painel/processos/${parsed.processId}`);
    revalidatePath(`/app/processos/${parsed.processId}`);
    return {
      success: true,
      message:
        parsed.payload.operation === "register"
          ? "Versão registrada com conferência manual."
          : parsed.payload.operation === "read"
            ? "Marcação de leitura salva."
            : parsed.payload.operation === "map"
              ? "Correspondências salvas. Confira as referências reaproveitadas."
              : "Referência reaproveitada com origem preservada.",
      nextRequestId: randomUUID(),
    };
  } catch {
    return {
      ...previous,
      success: false,
      errors: undefined,
      message:
        "Não foi possível confirmar a resposta. Preserve os campos e tente novamente para recuperar o recibo.",
    };
  }
}
