import { z } from "zod";
import { normalizePages } from "@/modules/page-index/forms";
const integer = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,9})$/, "Informe um número inteiro.")
  .transform(Number)
  .pipe(z.number().int().min(0).max(2147483646));
export function parseCorrespondences(value: string) {
  if (value.length > 2000) throw new Error("Use até 100 correspondências.");
  const parts = value.split(",");
  if (parts.length > 100 || parts.length < 1)
    throw new Error("Use até 100 correspondências.");
  const pairs = parts.map((part) => {
    const match = /^(0|[1-9][0-9]{0,5})\s*:\s*([1-9][0-9]{0,5})$/.exec(
      part.trim(),
    );
    if (!match || Number(match[1]) > 100000 || Number(match[2]) > 100000)
      throw new Error(
        "Use anterior:atual, por exemplo 3:1, 1:3. Use 0:2 para retirar a correspondência da página atual 2.",
      );
    return { source: Number(match[1]) || null, target: Number(match[2]) };
  });
  const sources = pairs.flatMap((pair) =>
    pair.source === null ? [] : [pair.source],
  );
  if (
    new Set(pairs.map((p) => p.target)).size !== pairs.length ||
    new Set(sources).size !== sources.length
  )
    throw new Error("Não repita páginas na correspondência.");
  return pairs.sort((a, b) => a.target - b.target);
}
function readPages(value: string) {
  const normalized = normalizePages(value);
  let count = 0;
  for (const part of normalized.split(",")) {
    const [start, end] = part.trim().split("-").map(Number);
    count += (end ?? start) - start + 1;
  }
  if (count > 500) throw new Error("Marque até 500 páginas por vez.");
  return normalized;
}
const checked = z.literal("yes", "Confirme a conferência manual.");
const base = {
  processId: z.uuid("Processo inválido."),
  requestId: z.uuid("Recarregue antes de salvar."),
  fileId: z.uuid("Escolha um PDF confirmado."),
  revision: integer,
};
const schema = z.discriminatedUnion("operation", [
  z.object({
    ...base,
    operation: z.literal("register"),
    pageCount: integer.pipe(
      z
        .number()
        .min(1, "Informe ao menos uma página.")
        .max(100000, "Use até 100.000 páginas."),
    ),
    previousFileId: z.union([z.literal(""), z.uuid()]),
    confirmed: checked,
  }),
  z.object({
    ...base,
    operation: z.literal("read"),
    pages: z.string(),
    read: z.enum(["yes", "no"]),
  }),
  z.object({
    ...base,
    operation: z.literal("map"),
    pairs: z.string(),
    confirmed: checked,
  }),
  z.object({
    ...base,
    operation: z.literal("copy"),
    entryId: z.uuid(),
    entryRevision: integer.pipe(z.number().min(1)),
  }),
]);
export function parsePdfVersion(form: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { ok: false as const, errors: parsed.error.flatten().fieldErrors };
  const v = parsed.data;
  try {
    const common = {
      operation: v.operation,
      fileId: v.fileId,
      revision: v.revision,
    };
    const payload =
      v.operation === "register"
        ? {
            ...common,
            pageCount: v.pageCount,
            previousFileId: v.previousFileId || null,
            confirmed: true,
          }
        : v.operation === "read"
          ? { ...common, pages: readPages(v.pages), read: v.read === "yes" }
          : v.operation === "map"
            ? {
                ...common,
                pairs: parseCorrespondences(v.pairs),
                confirmed: true,
              }
            : { ...common, entryId: v.entryId, entryRevision: v.entryRevision };
    if ((v.operation === "register") !== (v.revision === 0))
      throw new Error("Recarregue para conferir a revisão do PDF.");
    return {
      ok: true as const,
      processId: v.processId,
      requestId: v.requestId,
      payload,
    };
  } catch (error) {
    const field =
      v.operation === "map"
        ? "pairs"
        : v.operation === "read"
          ? "pages"
          : "revision";
    return {
      ok: false as const,
      errors: { [field]: [(error as Error).message] },
    };
  }
}
