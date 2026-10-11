"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import {
  parseFuturePolicy,
  parseExistingPolicy,
  releasePolicy,
} from "./approval-forms";
export type ApprovalState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  nextRequestId?: string;
};
export async function approveFuturePolicy(
  previous: ApprovalState,
  form: FormData,
): Promise<ApprovalState> {
  await authorize(["calculator"]);
  const parsed = parseFuturePolicy(form);
  if (!parsed.success)
    return {
      ...previous,
      success: false,
      message: "Confira os campos indicados.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const { requestId, revision, policy, approved } = parsed.data,
    db = await createSessionClient(),
    result = await db.rpc("approve_future_delivery_policy", {
      request_id: requestId,
      expected_revision: revision,
      policy,
      approved,
    });
  const receipt = z
    .object({
      id: z.uuid(),
      policy: releasePolicy,
      revision: z.number().int().positive(),
    })
    .safeParse(result.data);
  if (result.error || !receipt.success)
    return {
      ...previous,
      success: false,
      errors: undefined,
      message:
        result.error?.code === "PT409"
          ? "As configurações ou a tentativa mudaram. Recarregue para conferir antes de aprovar."
          : "Não foi possível aprovar. Os campos foram preservados; tente novamente.",
    };
  revalidatePath("/painel/configuracoes");
  return {
    success: true,
    message: "Regra aprovada para as próximas entregas.",
    nextRequestId: randomUUID(),
  };
}
export async function approveExistingPolicy(
  previous: ApprovalState,
  form: FormData,
): Promise<ApprovalState> {
  await authorize(["calculator"]);
  const parsed = parseExistingPolicy(form);
  if (!parsed.success)
    return {
      ...previous,
      success: false,
      message: "Confira os campos indicados.",
      errors: parsed.error.flatten().fieldErrors,
    };
  const { requestId, deliveryId, processId, policy, approved } = parsed.data,
    db = await createSessionClient(),
    row = await db
      .from("deliveries")
      .select("id")
      .eq("id", deliveryId)
      .eq("process_id", processId)
      .single();
  if (row.error || !row.data)
    return {
      ...previous,
      success: false,
      message: "Entrega indisponível. Recarregue a pasta do processo.",
    };
  const result = await db.rpc("approve_existing_delivery_release", {
    target_delivery: deliveryId,
    request_id: requestId,
    policy,
    approved,
  });
  if (result.error)
    return {
      ...previous,
      success: false,
      errors: undefined,
      message:
        result.error.code === "PT409"
          ? "Esta entrega ou a tentativa já recebeu outra regra. Recarregue para conferir."
          : "Não foi possível aprovar. Os campos foram preservados; tente novamente.",
    };
  revalidatePath(`/painel/processos/${processId}`);
  revalidatePath(`/app/processos/${processId}`);
  return {
    success: true,
    message: "Regra aprovada para esta entrega.",
    nextRequestId: randomUUID(),
  };
}
