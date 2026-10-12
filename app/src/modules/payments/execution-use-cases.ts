import "server-only";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import {
  executionId,
  currentPaymentExecutionViewSchema,
} from "./execution-data";
export async function getPaymentExecution(intentId: string) {
  let actor;
  try {
    actor = await authorize(["client", "calculator"]);
  } catch {
    throw new Error("Acesso não autorizado.");
  }
  try {
    const target = executionId.parse(intentId),
      db = await createSessionClient(),
      r = await db.rpc("get_payment_execution", { target_intent: target });
    const view = currentPaymentExecutionViewSchema.parse(r.data);
    if (
      r.error ||
      view.intentId !== target ||
      (actor.profile.role === "client" &&
        view.currentOwnerId !== actor.profile.id)
    )
      throw new Error();
    return view;
  } catch {
    throw new Error("Execução indisponível.");
  }
}
