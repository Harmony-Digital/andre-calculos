"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { transition, type OrderState } from "@/modules/orders/state-machine";
import { parseDelivery } from "./forms";
import { deliveryFilesComplete } from "./delivery";
export type DeliveryState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  nextRequestId?: string;
};
export async function confirmDelivery(
  previous: DeliveryState,
  form: FormData,
): Promise<DeliveryState> {
  const session = await authorize(["calculator"]),
    parsed = parseDelivery(form);
  if (!parsed.success)
    return {
      ...previous,
      success: false,
      message: "Confira os campos indicados.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const v = parsed.data,
    db = await createSessionClient();
  const order = await db
    .from("orders")
    .select("id,client_id,status,process_id")
    .eq("id", v.orderId)
    .eq("process_id", v.processId)
    .single();
  if (order.error)
    return {
      ...previous,
      success: false,
      message: "Pedido indisponível. Os campos foram preservados.",
      errors: undefined,
    };
  // A revisão é uma declaração explícita do calculista. Vínculos, tipos e
  // integridade são carregados do servidor e revalidados sob lock na RPC.
  if (order.data.status === "in_review") {
    const files = await db
      .from("files")
      .select(
        "id,process_id,order_id,folder,upload_status,sha256,expected_sha256,mime,name,size_bytes",
      )
      .in("id", [v.calculationFile, v.pjcFile, v.reportFile, ...v.attachments]);
    try {
      transition(
        {
          state: order.data.status as OrderState,
          clientOwnerId: "", // Evento exclusivo do calculista, sem ação do cliente.
          quoteAccepted: false,
          depositConfirmed: false,
          hasContract: false,
          minimumDocumentPresent: false,
          balanceConfirmed: false,
          calculatorReviewed: v.reviewed,
          deliveryComplete:
            !files.error &&
            deliveryFilesComplete(v.processId, v.orderId, v, files.data ?? []),
        },
        "deliver",
        { id: session.user.id, role: "calculator" },
      );
    } catch {
      return {
        ...previous,
        success: false,
        message:
          "Confira os três arquivos obrigatórios e a integridade dos envios. Os campos foram preservados.",
        errors: undefined,
      };
    }
  }
  const result = await db.rpc("confirm_order_delivery", {
    target_process: v.processId,
    target_order: v.orderId,
    request_id: v.requestId,
    payload: {
      calculationFile: v.calculationFile,
      pjcFile: v.pjcFile,
      reportFile: v.reportFile,
      attachments: v.attachments,
      pjeVersion: v.pjeVersion,
      indexMonth: v.indexMonth,
      liquidated: v.liquidated,
      taxIdPresent: v.taxIdPresent,
      reviewed: v.reviewed,
    },
  });
  if (result.error)
    return {
      ...previous,
      success: false,
      errors: undefined,
      message:
        result.error.code === "PT409"
          ? "O pedido mudou de situação. Recarregue a página; os campos foram preservados."
          : result.error.message === "Identificação profissional incompleta"
            ? "Complete o nome e o CRC nas configurações antes de confirmar a entrega."
            : result.error.message === "Entrega já registrada com outros dados"
              ? "A tentativa anterior já foi registrada com outros arquivos ou campos. Recarregue a página para conferir."
              : "Não foi possível confirmar. Os campos foram preservados; tente novamente.",
    };
  for (const path of [
    `/painel/processos/${v.processId}`,
    `/app/processos/${v.processId}`,
    "/painel/fila",
  ])
    revalidatePath(path);
  return {
    success: true,
    message:
      "Entrega confirmada. A liberação dos arquivos segue a regra de pagamento.",
    nextRequestId: randomUUID(),
  };
}
