import { randomUUID } from "node:crypto";
import { fictionalCnj } from "./draft-helper";
import { localSystem } from "./local-helper";
const marker = "Ensaio fictício de mensagens";
export async function createMessageProcess(clientId?: string) {
  const db = localSystem();
  const seed = await db
    .from("processes")
    .select("client_id")
    .eq("id", "00000000-0000-4000-8000-000000000101")
    .single();
  if (seed.error) throw new Error("Cliente fictício indisponível.");
  const id = randomUUID(),
    owner = clientId ?? seed.data.client_id;
  const client = await db
    .from("clients")
    .select("owner_id")
    .eq("id", owner)
    .single();
  if (client.error) throw new Error("Dono fictício indisponível.");
  const result = await db.from("processes").insert({
    id,
    client_id: owner,
    cnj_number: fictionalCnj().replace(/\D/g, ""),
    court: "TRT-10",
    chamber: marker,
    side: "claimant",
  });
  if (result.error)
    throw new Error("Não foi possível criar o processo fictício.");
  return { id, clientId: owner, authorId: client.data.owner_id as string };
}
export async function removeMessageProcess(id: string) {
  const db = localSystem();
  const process = await db
    .from("processes")
    .select("chamber")
    .eq("id", id)
    .single();
  if (process.error || process.data.chamber !== marker)
    throw new Error("Limpeza limitada ao processo fictício de mensagens.");
  const messages = await db.from("messages").select("id").eq("process_id", id),
    files = await db.from("files").select("id,path").eq("process_id", id),
    events = await db.from("timeline_events").select("id").eq("process_id", id),
    decisions = await db.from("decisions").select("id").eq("process_id", id);
  if (messages.error || files.error || events.error || decisions.error)
    throw new Error("Fixture de mensagens indisponível.");
  const targets = [
    id,
    ...decisions.data!.map((row) => row.id),
    ...events.data!.map((row) => row.id),
    ...messages.data.map((row) => row.id),
    ...files.data.map((row) => row.id),
  ];
  // Excluir mensagens primeiro libera os vínculos internos com os anexos.
  const removed = await db.from("messages").delete().eq("process_id", id);
  if (removed.error) throw new Error("Falha ao limpar mensagens fictícias.");
  for (let offset = 0; offset < targets.length; offset += 50) {
    const audit = await db
      .from("audit_log")
      .delete()
      .in("target_id", targets.slice(offset, offset + 50));
    if (audit.error) throw new Error("Falha ao limpar auditorias fictícias.");
  }
  for (const result of [
    await db.from("decisions").delete().eq("process_id", id),
    await db
      .from("notifications")
      .delete()
      .contains("data", { process_id: id }),
    await db.from("timeline_events").delete().eq("process_id", id),
  ])
    if (result.error) throw new Error("Falha ao limpar eventos fictícios.");
  if (files.data.length) {
    const storage = await db.storage
      .from("processos")
      .remove(files.data.map((row) => row.path));
    if (storage.error) throw new Error("Falha ao limpar anexos fictícios.");
  }
  for (const result of [
    await db.from("files").delete().eq("process_id", id),
    await db.from("processes").delete().eq("id", id),
  ])
    if (result.error) throw new Error("Falha ao limpar a pasta fictícia.");
}
