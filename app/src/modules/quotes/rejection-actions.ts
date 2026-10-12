"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { createSystemClient } from "@/lib/supabase/admin";
import {
  rejectionIntentSchema,
  rejectionReceiptSchema,
  type RejectionReceipt,
} from "./rejection";
import { acceptanceMetadata } from "./http-metadata";
export async function rejectQuote(
  input: unknown,
): Promise<
  | { receipt: RejectionReceipt; error?: never; conflict?: never }
  | { error: string; conflict?: boolean; receipt?: never }
> {
  const session = await authorize(["client"]);
  const parsed = rejectionIntentSchema.safeParse(input);
  if (!parsed.success)
    return {
      error: "Confirme a recusa e confira o motivo, com até 500 caracteres.",
    };
  const metadata = acceptanceMetadata(await headers());
  if (!metadata)
    return {
      error:
        "Não foi possível registrar a origem. Sua escolha foi preservada; tente novamente.",
    };
  const db = await createSessionClient();
  const visible = await db
    .from("quotes")
    .select("id,order_id")
    .eq("id", parsed.data.quoteId)
    .maybeSingle();
  if (visible.error)
    return {
      error:
        "Não foi possível conferir a proposta. Sua escolha foi preservada; tente novamente.",
    };
  if (!visible.data)
    return {
      error: "Proposta indisponível. Recarregue a página para conferir.",
      conflict: true,
    };
  try {
    const result = await createSystemClient().rpc("reject_quote_system", {
      actor: session.user.id,
      target_quote: parsed.data.quoteId,
      expected_context: parsed.data.contextHash,
      expected_revision: parsed.data.revision,
      request_id: parsed.data.requestId,
      confirmed: true,
      reason: parsed.data.reason,
      ip_address: metadata.ip,
      user_agent: metadata.userAgent,
    });
    if (result.error)
      return result.error.code === "PT409"
        ? {
            error:
              "O pedido mudou de situação. Recarregue a página para conferir antes de uma nova decisão.",
            conflict: true,
          }
        : {
            error:
              "Não foi possível registrar a recusa. Sua escolha foi preservada; tente novamente.",
          };
    const receipt = rejectionReceiptSchema.safeParse(result.data);
    if (
      !receipt.success ||
      receipt.data.quoteId !== parsed.data.quoteId ||
      receipt.data.contextHash !== parsed.data.contextHash ||
      receipt.data.expectedRevision !== parsed.data.revision ||
      receipt.data.reason !== parsed.data.reason
    )
      return {
        error:
          "Não foi possível conferir o recibo. Sua escolha foi preservada; tente novamente.",
      };
    revalidatePath(`/app/orcamentos/${parsed.data.quoteId}`);
    revalidatePath(`/painel/orcamentos/${parsed.data.quoteId}`);
    revalidatePath(`/app/processos/${receipt.data.processId}`);
    revalidatePath(`/painel/processos/${receipt.data.processId}`);
    revalidatePath("/app");
    revalidatePath("/painel");
    return { receipt: receipt.data };
  } catch {
    return {
      error:
        "Não foi possível registrar a recusa. Sua escolha foi preservada; tente novamente.",
    };
  }
}
