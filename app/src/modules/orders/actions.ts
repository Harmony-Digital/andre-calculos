"use server";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import {
  parseOperation,
  operationReceiptSchema,
  operationalOrder,
  type OperationIntent,
} from "./operations";
import { transition } from "./state-machine";
export type OperationState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  intent?: OperationIntent;
  conflict?: boolean;
};
export async function operateOrder(
  previous: OperationState,
  form: FormData,
): Promise<OperationState> {
  const session = await authorize(["calculator"]),
    parsed = parseOperation(form);
  if (!parsed.success)
    return {
      success: false,
      message: "Confira os campos indicados.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const v = parsed.data;
  try {
    const db = await createSessionClient();
    const order = await db
      .from("orders")
      .select("id,client_id")
      .eq("id", v.orderId)
      .eq("process_id", v.processId)
      .single();
    if (order.error) throw new Error("Pedido indisponível");
    const owner = await db
      .from("clients")
      .select("owner_id")
      .eq("id", order.data.client_id)
      .single();
    if (owner.error) throw new Error("Cliente indisponível");
    // No replay a situação atual pode ter mudado; a RPC recupera o recibo
    // antes da guarda de concorrência. Validar só o comando original aqui.
    if (v.event !== "receive_information")
      transition(
        operationalOrder(v.expectedState, owner.data.owner_id),
        v.event,
        { id: session.user.id, role: "calculator" },
      );
    const result = await db.rpc("operate_order", {
      target_process: v.processId,
      target_order: v.orderId,
      request_id: v.requestId,
      payload: {
        event: v.event,
        expectedState: v.expectedState,
        expectedRevision: v.revision,
        reason: v.reason,
      },
    });
    if (result.error)
      return {
        success: false,
        intent: v,
        conflict: result.error.code === "PT409",
        message:
          result.error.code === "PT409"
            ? "O pedido mudou ou esta tentativa já foi registrada. Confira a situação atual antes de uma nova ação."
            : "Não foi possível confirmar. A tentativa foi preservada; tente novamente.",
      };
    const receipt = operationReceiptSchema.parse(result.data);
    if (
      receipt.id !== v.requestId ||
      receipt.orderId !== v.orderId ||
      receipt.processId !== v.processId
    )
      throw new Error("Recibo inesperado");
    const verified = transition(
      operationalOrder(
        receipt.from,
        owner.data.owner_id,
        v.event === "receive_information" ? receipt.to : undefined,
      ),
      v.event,
      { id: session.user.id, role: "calculator" },
    );
    if (verified.state !== receipt.to) throw new Error("Etapa inesperada");
    for (const path of [
      `/painel/processos/${v.processId}`,
      `/app/processos/${v.processId}`,
      "/painel/fila",
      "/painel",
      "/app",
    ])
      revalidatePath(path);
    return {
      success: true,
      message: "Etapa registrada. A situação atual está na pasta do processo.",
    };
  } catch {
    return {
      success: false,
      intent: v,
      message:
        "Não foi possível confirmar. A tentativa foi preservada; tente novamente.",
    };
  }
}
