import { z } from "zod";
import { isCivilDate } from "@/modules/deadlines/calendar";
import { messageCursor } from "@/modules/messages/cursor";

export const fileAccessLabels = {
  file_view: "Visualização autorizada",
  file_download: "Download autorizado",
} as const;
const selection = z.string().trim().max(255).optional().default("");
const civilDate = z
  .string()
  .refine((value) => !value || isCivilDate(value), "Informe uma data válida.");
const filtersSchema = z
  .object({
    arquivo: selection,
    autor: selection,
    inicio: civilDate.optional().default(""),
    fim: civilDate.optional().default(""),
    acao: z.enum(["", "file_view", "file_download"]).optional().default(""),
    depois: z.string().max(100).optional().default(""),
  })
  .refine(
    (value) => !value.inicio || !value.fim || value.inicio <= value.fim,
    "A data inicial deve ser anterior ou igual à final.",
  );

export type FileAuditSearch = Record<string, string | string[] | undefined>;
export type FileAuditFilters = z.infer<typeof filtersSchema>;
export function parseFileAuditFilters(search: FileAuditSearch) {
  const parsed = filtersSchema.safeParse(search);
  if (!parsed.success)
    return {
      ok: false as const,
      error:
        "Confira os filtros: use nomes com até 255 caracteres, uma ação válida e datas válidas em ordem cronológica.",
    };
  try {
    return {
      ok: true as const,
      filters: parsed.data,
      before: messageCursor(parsed.data.depois),
    };
  } catch {
    return {
      ok: false as const,
      error:
        "A referência da página é inválida. Limpe os filtros e consulte novamente.",
    };
  }
}

export function fileAuditHref(filters: FileAuditFilters, after = "") {
  const params = new URLSearchParams();
  for (const key of ["arquivo", "autor", "inicio", "fim", "acao"] as const)
    if (filters[key]) params.set(key, filters[key]);
  if (after) params.set("depois", after);
  return `/painel/acessos${params.size ? `?${params}` : ""}`;
}

export function fileAuditIdentity(value: string) {
  const id = z.uuid().safeParse(value);
  return id.success
    ? { id: id.data.toLowerCase(), search: undefined }
    : { id: undefined, search: value || undefined };
}

export const fileAuditPageSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            id: z.uuid(),
            created_at: z.iso.datetime({ offset: true }),
            action: z.enum(["file_view", "file_download"]),
            actor_id: z.uuid().nullable(),
            actor_name: z.string().nullable(),
            file_id: z.uuid(),
            file_name: z.string().nullable(),
            file_version: z.number().int().positive().nullable(),
          })
          .strict(),
      )
      .max(50),
    has_more: z.boolean(),
  })
  .strict()
  .refine((page) => !page.has_more || page.rows.length === 50);
