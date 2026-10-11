"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { parseMessage } from "./forms";
export type MessageState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  nextRequestId?: string;
};
export async function sendMessage(
  previous: MessageState,
  form: FormData,
): Promise<MessageState> {
  await authorize(["client", "calculator"]);
  const parsed = parseMessage(form);
  if (!parsed.success)
    return {
      nextRequestId: previous.nextRequestId,
      success: false,
      message: "Confira os campos indicados.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const value = parsed.data,
    db = await createSessionClient();
  const result = await db.rpc("send_process_message", {
    target_process: value.processId,
    message_body: value.body,
    attachments: value.attachments,
    request_id: value.requestId,
  });
  if (result.error)
    return {
      nextRequestId: previous.nextRequestId,
      success: false,
      message:
        "Não foi possível enviar. Confira os anexos e seu acesso ao processo, depois tente novamente.",
    };
  revalidatePath(`/app/processos/${value.processId}`);
  revalidatePath(`/painel/processos/${value.processId}`);
  return {
    success: true,
    message: "Mensagem enviada.",
    nextRequestId: randomUUID(),
  };
}
