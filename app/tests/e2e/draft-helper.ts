import { randomInt } from "node:crypto";
import { localSystem } from "./local-helper";
export function fictionalCnj() {
  const sequence = String(randomInt(9000000, 9999999)),
    tail = "20265109999";
  const check = String(
    BigInt(98) - (BigInt(sequence + tail + "00") % BigInt(97)),
  ).padStart(2, "0");
  return `${sequence}-${check}.2026.5.10.9999`;
}
export async function removeLocalDraft(id: string) {
  const db = localSystem();
  const order = await db
    .from("orders")
    .select("process_id,status")
    .eq("id", id)
    .single();
  if (order.error || order.data?.status !== "draft")
    throw new Error("Rascunho fictício indisponível para limpeza.");
  const files = await db
    .from("files")
    .select("id,path")
    .eq("process_id", order.data.process_id);
  for (const file of files.data ?? []) {
    await db.storage.from("processos").remove([file.path]);
    await db.from("audit_log").delete().eq("target_id", file.id);
    await db.from("files").delete().eq("id", file.id);
  }
  await db.from("audit_log").delete().eq("target_id", id);
  await db
    .from("timeline_events")
    .delete()
    .eq("process_id", order.data.process_id);
  await db.from("checklists").delete().eq("order_id", id);
  await db.from("orders").delete().eq("id", id);
  const other = await db
    .from("orders")
    .select("id")
    .eq("process_id", order.data.process_id);
  if (other.data?.length === 0)
    await db.from("processes").delete().eq("id", order.data.process_id);
}
