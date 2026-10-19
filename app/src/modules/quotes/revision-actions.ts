"use server";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { createSystemClient } from "@/lib/supabase/admin";
import {
  revisionIntentSchema,
  revisionReceiptSchema,
  type RevisionReceipt,
} from "./revision";
export async function reviseQuote(
  input: unknown,
): Promise<{ receipt?: RevisionReceipt; error?: string; conflict?: boolean }> {
  const session = await authorize(["calculator"]);
  const parsed = revisionIntentSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Confira os valores e informe o motivo do ajuste." };
  const intent = parsed.data;
  try {
    const db = await createSessionClient();
    const visible = await db
      .from("quotes")
      .select("id")
      .eq("id", intent.quoteId)
      .maybeSingle();
    if (visible.error)
      return {
        error: "Não foi possível conferir a proposta. Tente novamente.",
      };
    if (!visible.data)
      return {
        error: "Proposta indisponível. Recarregue a página.",
        conflict: true,
      };
    const result = await createSystemClient().rpc("revise_quote_system", {
      actor: session.user.id,
      target_quote: intent.quoteId,
      expected_context: intent.contextHash,
      expected_version: intent.version,
      expected_order_revision: intent.orderRevision,
      request_id: intent.requestId,
      reason: intent.reason,
      unit_prices: intent.items,
    });
    if (result.error)
      return result.error.code === "PT409"
        ? {
            error:
              "A proposta mudou ou já recebeu uma decisão. Recarregue para conferir a versão vigente.",
            conflict: true,
          }
        : {
            error:
              "Não foi possível concluir o ajuste. Confira valores, tabela e disponibilidade; seus dados foram preservados.",
          };
    const receipt = revisionReceiptSchema.safeParse(result.data);
    if (
      !receipt.success ||
      receipt.data.previousQuoteId !== intent.quoteId ||
      receipt.data.version !== intent.version + 1 ||
      receipt.data.reason !== intent.reason
    )
      return {
        error:
          "Não foi possível conferir o recibo. Reenvie os mesmos dados para recuperar o resultado.",
      };
    for (const prefix of ["/app", "/painel"]) {
      revalidatePath(prefix);
      revalidatePath(`${prefix}/orcamentos/${intent.quoteId}`);
      revalidatePath(`${prefix}/orcamentos/${receipt.data.quoteId}`);
      revalidatePath(`${prefix}/processos/${receipt.data.processId}`);
    }
    return { receipt: receipt.data };
  } catch {
    return {
      error:
        "Não foi possível registrar agora. Seus dados foram preservados; tente novamente.",
    };
  }
}
