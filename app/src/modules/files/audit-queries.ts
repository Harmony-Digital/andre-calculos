import "server-only";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { encodeMessageCursor } from "@/modules/messages/cursor";
import {
  fileAuditIdentity,
  fileAuditPageSchema,
  parseFileAuditFilters,
  type FileAuditSearch,
} from "./audit";

export async function getFileAccessAudit(search: FileAuditSearch) {
  await authorize(["calculator"]);
  const parsed = parseFileAuditFilters(search);
  if (!parsed.ok) return parsed;
  const { filters, before } = parsed;
  const file = fileAuditIdentity(filters.arquivo),
    actor = fileAuditIdentity(filters.autor);
  try {
    const db = await createSessionClient();
    const result = await db.rpc("get_file_access_audit", {
      target_file: file.id,
      file_search: file.search,
      target_actor: actor.id,
      actor_search: actor.search,
      start_date: filters.inicio || undefined,
      end_date: filters.fim || undefined,
      access_action: filters.acao || undefined,
      cursor_created_at: before?.date,
      cursor_id: before?.id,
      page_size: 50,
    });
    const page = fileAuditPageSchema.safeParse(result.data);
    if (result.error || !page.success) throw new Error();
    return {
      ok: true as const,
      filters,
      before,
      rows: page.data.rows,
      next: page.data.has_more ? encodeMessageCursor(page.data.rows[49]) : null,
    };
  } catch {
    return {
      ok: false as const,
      error: "Não foi possível consultar os acessos agora. Tente novamente.",
    };
  }
}
