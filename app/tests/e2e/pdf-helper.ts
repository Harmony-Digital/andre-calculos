import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { localSystem } from "./local-helper";
export const pdfFixture = resolve("tests/fixtures/processo-ficticio.pdf");
export const encryptedPdfFixture = resolve(
  "tests/fixtures/processo-ficticio-protegido.pdf",
);
export async function largePdfFixture() {
  const original = await readFile(pdfFixture),
    text = original.toString("latin1");
  const size = Number([...text.matchAll(/\/Size\s+(\d+)/g)].at(-1)![1]);
  const root = [...text.matchAll(/\/Root\s+(\d+\s+\d+\s+R)/g)].at(-1)![1];
  const previous = Number([...text.matchAll(/startxref\s+(\d+)/g)].at(-1)![1]);
  const prefix = Buffer.from(
    `\n${size} 0 obj\n<< /Length ${6 * 1024 * 1024} >>\nstream\n`,
  );
  const object = Buffer.concat([
    prefix,
    Buffer.alloc(6 * 1024 * 1024, 48),
    Buffer.from("\nendstream\nendobj\n"),
  ]);
  const xrefOffset = original.length + object.length;
  const trailer = Buffer.from(
    `xref\n${size} 1\n${String(original.length + 1).padStart(10, "0")} 00000 n \ntrailer\n<< /Size ${size + 1} /Root ${root} /Prev ${previous} >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return Buffer.concat([original, object, trailer]);
}
export async function removePdfFixture(name: string) {
  const db = localSystem();
  const { data, error } = await db
    .from("files")
    .select("id,path")
    .eq("name", name)
    .maybeSingle();
  if (error) throw new Error("Falha ao localizar a fixture de PDF.");
  if (!data) return;
  const storage = await db.storage.from("processos").remove([data.path]);
  if (storage.error) throw new Error("Falha ao remover a fixture de PDF.");
  await db
    .from("audit_log")
    .delete()
    .eq("target_type", "file")
    .eq("target_id", data.id);
  await db
    .from("timeline_events")
    .delete()
    .eq("kind", "file_uploaded")
    .contains("data", { file_id: data.id });
  const removed = await db.from("files").delete().eq("id", data.id);
  if (removed.error) throw new Error("Falha ao limpar a fixture de PDF.");
}
