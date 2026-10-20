import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { updateContextSchema } from "./schemas";
export async function getCalculationUpdate(orderId: string) {
  await authorize(["client", "calculator"]);
  const db = await createSessionClient();
  const result = await db.rpc("get_calculation_update", {
    target_order: orderId,
  });
  if (result.error)
    throw new Error("Não foi possível conferir a origem do pedido.");
  if (result.data === null) return null;
  return updateContextSchema.parse(result.data);
}
export async function getUpdateStart(processId: string, sourceOrderId: string) {
  await authorize(["client"]);
  if (
    !z.uuid().safeParse(processId).success ||
    !z.uuid().safeParse(sourceOrderId).success
  )
    notFound();
  const db = await createSessionClient();
  const order = await db
    .from("orders")
    .select("id,code,status,process_id")
    .eq("id", sourceOrderId)
    .eq("process_id", processId)
    .single();
  if (!order.data || !["delivered", "completed"].includes(order.data.status))
    notFound();
  const deliveries = await db
    .from("deliveries")
    .select("id")
    .eq("order_id", sourceOrderId)
    .eq("process_id", processId);
  if (deliveries.error)
    throw new Error("Não foi possível consultar o cálculo anterior.");
  if (!deliveries.data?.length) notFound();
  const links = await db
    .from("delivery_files")
    .select("file_id")
    .eq("kind", "pjc")
    .in(
      "delivery_id",
      deliveries.data.map((d) => d.id),
    );
  if (links.error)
    throw new Error("Não foi possível consultar os arquivos anteriores.");
  const files = links.data.length
    ? await db
        .from("files")
        .select("id,name,sha256,size_bytes")
        .in(
          "id",
          links.data.map((d) => d.file_id),
        )
        .eq("upload_status", "uploaded")
    : { data: [], error: null };
  if (files.error) throw new Error("Não foi possível consultar o PJC.");
  return { order: order.data, files: files.data ?? [] };
}
