"use server";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import {
  depositIntentSchema,
  depositReceiptSchema,
  type DepositReceipt,
} from "./deposit";
export async function confirmDeposit(
  input: unknown,
): Promise<{ receipt?: DepositReceipt; error?: string }> {
  await authorize(["calculator"]);
  const parsed = depositIntentSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Confira a proposta e o valor do sinal." };
  const db = await createSessionClient();
  const visible = await db
    .from("quotes")
    .select("order:orders!quotes_order_id_fkey(process_id)")
    .eq("id", parsed.data.quoteId)
    .single();
  if (visible.error || !visible.data)
    return { error: "Proposta indisponível." };
  try {
    const result = await db.rpc("confirm_manual_deposit", {
      target_quote: parsed.data.quoteId,
      expected_context: parsed.data.contextHash,
      expected_remaining_cents: parsed.data.remainingCents,
      request_id: parsed.data.requestId,
      confirmed: true,
    });
    if (result.error)
      return {
        error:
          result.error.code === "PT423"
            ? "Há uma cobrança pendente de resolução neste pedido. Confira a cobrança antes de registrar outro recebimento."
            : result.error.code === "PT409"
              ? "O pedido ou o sinal mudou em outra sessão. Recarregue para conferir."
              : "Não foi possível registrar. O valor foi preservado; tente novamente.",
      };
    const receipt = depositReceiptSchema.safeParse(result.data);
    if (!receipt.success)
      return {
        error:
          "Não foi possível conferir o recibo. Tente novamente com esta mesma solicitação.",
      };
    const processId = visible.data.order.process_id;
    revalidatePath(`/painel/processos/${processId}`);
    revalidatePath(`/app/processos/${processId}`);
    revalidatePath(`/app/orcamentos/${parsed.data.quoteId}`);
    revalidatePath(`/painel/orcamentos/${parsed.data.quoteId}`);
    revalidatePath("/painel");
    revalidatePath("/painel/fila");
    return { receipt: receipt.data };
  } catch {
    return {
      error:
        "Não foi possível registrar. O valor foi preservado; tente novamente.",
    };
  }
}
