"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { parseDecision } from "./forms";
export type DecisionState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  nextRequestId?: string;
};
function refresh(processId: string) {
  revalidatePath(`/painel/processos/${processId}`);
  revalidatePath(`/app/processos/${processId}`);
}
export async function recordDecision(
  previous: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  await authorize(["calculator"]);
  const parsed = parseDecision(form);
  if (!parsed.success)
    return {
      success: false,
      nextRequestId: previous.nextRequestId,
      message: "Confira os campos indicados.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const db = await createSessionClient(),
    v = parsed.data;
  const result = await db.rpc("record_process_decision", {
    target_process: v.processId,
    decision_parameter: v.parameter,
    decision_value: v.value,
    decision_source: v.source,
    decision_page: v.page ?? undefined,
    decision_rationale: v.rationale,
    request_id: v.requestId,
  });
  if (result.error)
    return {
      success: false,
      nextRequestId: previous.nextRequestId,
      message:
        "Não foi possível registrar. Os campos foram preservados; tente novamente.",
    };
  refresh(v.processId);
  return {
    success: true,
    message: "Decisão registrada.",
    nextRequestId: randomUUID(),
  };
}
export async function confirmDecision(
  _previous: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  await authorize(["client"]);
  const parsed = z
    .object({
      processId: z.uuid(),
      decisionId: z.uuid(),
      agreed: z.literal("yes"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      success: false,
      message: "Marque a concordância antes de confirmar.",
    };
  const db = await createSessionClient(),
    result = await db.rpc("confirm_process_decision", {
      target_decision: parsed.data.decisionId,
    });
  if (result.error)
    return {
      success: false,
      message: "Não foi possível confirmar. Tente novamente.",
    };
  refresh(parsed.data.processId);
  return { success: true, message: "Concordância registrada." };
}
