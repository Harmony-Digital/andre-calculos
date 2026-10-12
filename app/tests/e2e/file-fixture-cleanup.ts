import { localSystem } from "./local-helper";

export async function cleanupFileFixture(name: string) {
  if (
    !/^(?:documento-ficticio|arquivo-ficticio-300mb)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/.test(
      name,
    )
  )
    throw new Error("Nome de fixture de download inválido.");
  const system = localSystem();
  const fixture = await system
    .from("files")
    .select("id,path")
    .eq("name", name)
    .eq("process_id", "00000000-0000-4000-8000-000000000101")
    .eq("folder", "case")
    .maybeSingle();
  if (fixture.error)
    throw new Error("Não foi possível consultar a fixture de download.");
  if (!fixture.data) return;
  const storage = await system.storage
    .from("processos")
    .remove([fixture.data.path]);
  if (storage.error)
    throw new Error("Não foi possível limpar o objeto fictício de download.");
  const events = await system
    .from("timeline_events")
    .delete()
    .eq("process_id", "00000000-0000-4000-8000-000000000101")
    .eq("kind", "file_uploaded")
    .contains("data", { file_id: fixture.data.id });
  if (events.error)
    throw new Error("Não foi possível limpar o evento da fixture.");
  const audit = await system
    .from("audit_log")
    .delete()
    .eq("target_type", "file")
    .eq("target_id", fixture.data.id);
  if (audit.error)
    throw new Error("Não foi possível limpar a auditoria da fixture.");
  const metadata = await system
    .from("files")
    .delete()
    .eq("id", fixture.data.id);
  if (metadata.error)
    throw new Error("Não foi possível limpar os metadados da fixture.");
}
