import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { messageCursor, encodeMessageCursor } from "@/modules/messages/cursor";
import { pdfContextSchema, pdfHeadsSchema, pdfOriginsSchema } from "./schemas";
export async function getPdfIndexOrigins(processId: string, ids: string[]) {
  await authorize(["client", "calculator"]);
  if (!ids.length) return [];
  const db = await createSessionClient();
  const result = await db.rpc("get_pdf_index_origins", {
    target_process: processId,
    entry_ids: ids,
  });
  const parsed = pdfOriginsSchema.safeParse(result.data);
  if (result.error || !parsed.success)
    throw new Error("Não foi possível conferir a origem das referências.");
  return parsed.data;
}
export async function getPdfVersionScreen(
  processId: string,
  search: { arquivo?: string; pagina?: string; referencias?: string },
) {
  await authorize(["calculator"]);
  if (!z.uuid().safeParse(processId).success) notFound();
  const db = await createSessionClient();
  const process = await db
    .from("processes")
    .select("id,cnj_number")
    .eq("id", processId)
    .single();
  if (process.error || !process.data) notFound();
  const files = await db
    .from("files")
    .select("id,name")
    .eq("process_id", processId)
    .eq("mime", "application/pdf")
    .eq("upload_status", "uploaded")
    .in("folder", ["case", "client"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (files.error) throw new Error("Não foi possível consultar os PDFs.");
  const selected = search.arquivo ?? files.data[0]?.id;
  if (selected && !files.data.some((f) => f.id === selected)) notFound();
  let before;
  try {
    before = messageCursor(search.referencias);
  } catch {
    notFound();
  }
  const start =
    search.pagina === undefined
      ? 1
      : /^([1-9][0-9]{0,5})$/.test(search.pagina)
        ? Number(search.pagina)
        : 0;
  if (start < 1 || start > 100000) notFound();
  const headsResult = await db.rpc("get_pdf_version_heads", {
    target_process: processId,
  });
  const heads = pdfHeadsSchema.safeParse(headsResult.data);
  if (headsResult.error || !heads.success)
    throw new Error("Não foi possível conferir as versões anteriores.");
  if (!selected)
    return {
      process: process.data,
      files: files.data,
      selected: null,
      start,
      heads: heads.data,
      context: null,
      error: null,
      nextRefs: null,
      before,
    };
  const result = await db.rpc("get_pdf_version_context", {
    target_file: selected,
    start_page: start,
    ref_after_at: before?.date,
    ref_after_id: before?.id,
  });
  const context = pdfContextSchema.safeParse(result.data);
  if (result.error || !context.success)
    return {
      process: process.data,
      files: files.data,
      selected,
      start,
      heads: heads.data,
      context: null,
      error:
        "Não foi possível carregar a conferência. Confira a página selecionada ou tente novamente.",
      nextRefs: null,
      before,
    };
  return {
    process: process.data,
    files: files.data,
    selected,
    start,
    heads: heads.data,
    context: context.data,
    error: null,
    before,
    nextRefs: context.data.hasMoreEntries
      ? encodeMessageCursor(context.data.entries[49])
      : null,
  };
}
export function pdfVersionHref(
  processId: string,
  fileId: string,
  start = 1,
  after?: string,
) {
  const query = new URLSearchParams({ arquivo: fileId });
  if (start !== 1) query.set("pagina", String(start));
  if (after) query.set("referencias", after);
  return `/painel/processos/${processId}/versoes?${query}`;
}

export async function getPdfVersionSequences(processId: string) {
  await authorize(["client", "calculator"]);
  const db = await createSessionClient();
  const result = await db.rpc("get_pdf_version_sequences", {
    target_process: processId,
  });
  const parsed = z
    .array(
      z
        .object({ fileId: z.uuid(), sequence: z.number().int().positive() })
        .strict(),
    )
    .safeParse(result.data);
  if (result.error || !parsed.success)
    throw new Error("Não foi possível conferir a sequência dos PDFs.");
  return new Map(parsed.data.map((row) => [row.fileId, row.sequence]));
}
