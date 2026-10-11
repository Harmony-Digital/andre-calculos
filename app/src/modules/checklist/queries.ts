import "server-only";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { checklistDraftV1 } from "./draft";
export async function getDraft(id: string) {
  await authorize(["client"]);
  if (!z.uuid().safeParse(id).success) notFound();
  const db = await createSessionClient();
  const [order, checklist] = await Promise.all([
    db.from("orders").select("id,code,process_id,status").eq("id", id).single(),
    db
      .from("checklists")
      .select("answers,revision,completed_step,schema_version")
      .eq("order_id", id)
      .single(),
  ]);
  if (order.data?.status === "quoted") {
    const quote = await db
      .from("quotes")
      .select("id")
      .eq("order_id", id)
      .not("proposal_snapshot", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (quote.data) redirect(`/app/orcamentos/${quote.data.id}`);
  }
  if (
    !order.data ||
    order.data.status !== "draft" ||
    !checklist.data ||
    checklist.data.schema_version !== 1
  )
    notFound();
  const answers = checklistDraftV1.safeParse(checklist.data.answers);
  if (!answers.success)
    throw new Error("Este checklist precisa de revisão antes de continuar.");
  return {
    orderId: order.data.id,
    code: order.data.code,
    processId: order.data.process_id,
    revision: checklist.data.revision,
    completedStep: checklist.data.completed_step,
    answers: answers.data,
  };
}
export async function listDrafts() {
  await authorize(["client"]);
  const db = await createSessionClient();
  const { data, error } = await db
    .from("orders")
    .select("id,code,calc_type,updated_at")
    .eq("status", "draft")
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Não foi possível consultar seus rascunhos.");
  return data ?? [];
}
