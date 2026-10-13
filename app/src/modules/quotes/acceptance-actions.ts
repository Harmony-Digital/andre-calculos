"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { createSystemClient } from "@/lib/supabase/admin";
import {
  acceptanceIntentSchema,
  acceptanceReceiptSchema,
  type AcceptanceReceipt,
} from "./acceptance";
import { acceptanceMetadata } from "./http-metadata";
import { after } from "next/server";
import {
  localContractWorkerEnabled,
  processContractPdf,
} from "./contract-worker";
export async function acceptQuote(
  input: unknown,
): Promise<
  | { receipt: AcceptanceReceipt; error?: never }
  | { error: string; receipt?: never }
> {
  const session = await authorize(["client"]);
  const parsed = acceptanceIntentSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Confira a proposta e confirme a contratação." };
  const metadata = acceptanceMetadata(await headers());
  if (!metadata)
    return {
      error:
        "Não foi possível registrar a origem da solicitação. Recarregue e tente novamente.",
    };
  const db = await createSessionClient();
  const visible = await db
    .from("quotes")
    .select("id,order_id")
    .eq("id", parsed.data.quoteId)
    .single();
  if (visible.error || !visible.data)
    return { error: "Proposta indisponível." };
  try {
    const result = await createSystemClient().rpc("accept_quote_system", {
      actor: session.user.id,
      target_quote: parsed.data.quoteId,
      expected_context: parsed.data.contextHash,
      request_id: parsed.data.requestId,
      confirmed: true,
      ip_address: metadata.ip,
      user_agent: metadata.userAgent,
    });
    if (result.error) {
      const message = result.error.message;
      return {
        error:
          message === "Proposta vencida"
            ? "A validade terminou. Solicite uma nova proposta ao André."
            : message === "Documentos legais indisponíveis" ||
                message.startsWith("Proposta atualizada")
              ? "A proposta ou os documentos legais precisam ser reconferidos. Recarregue a página."
              : message === "Proposta sem preparação contratual"
                ? "Esta proposta ainda não está disponível para contratação."
                : result.error.code === "PT409"
                  ? "O pedido mudou de situação. Recarregue para conferir."
                  : "Não foi possível confirmar. Sua escolha foi preservada; tente novamente.",
      };
    }
    const receipt = acceptanceReceiptSchema.safeParse(result.data);
    if (!receipt.success)
      return {
        error:
          "Não foi possível conferir o recibo. Tente novamente com esta mesma proposta.",
      };
    revalidatePath(`/app/orcamentos/${parsed.data.quoteId}`);
    revalidatePath("/app");
    revalidatePath("/painel");
    if (localContractWorkerEnabled())
      after(async () => {
        await processContractPdf(parsed.data.quoteId).catch(() => undefined);
      });
    return { receipt: receipt.data };
  } catch {
    return {
      error:
        "Não foi possível confirmar. Sua escolha foi preservada; tente novamente.",
    };
  }
}
