import { z } from "zod";
export const indexPieces = {
  initial: "Inicial",
  defense: "Contestação",
  judgment: "Sentença",
  appeal: "Acórdão",
  decision: "Decisão",
  financial_record: "Ficha financeira",
  timecard: "Cartão de ponto",
  payslip: "Holerite",
  costs: "Custas",
  prior_calculation: "Cálculo anterior",
  other: "Outra",
} as const;
export function pieceLabel(value: string) {
  return Object.hasOwn(indexPieces, value)
    ? indexPieces[value as keyof typeof indexPieces]
    : "Peça";
}
export function normalizePages(value: string): string {
  const parts = value.trim().split(",");
  if (value.trim().length > 1000 || parts.length > 100)
    throw new Error("Use até 100 referências e 1.000 caracteres.");
  return parts
    .map((raw) => {
      const part = raw.replace(/^[ \t]+|[ \t]+$/g, "");
      if (!/^[1-9][0-9]{0,5}(?:[ \t]*-[ \t]*[1-9][0-9]{0,5})?$/.test(part))
        throw new Error("Informe páginas como 120-135, 140.");
      const bounds = part.replace(/[ \t]/g, "").split("-").map(Number);
      if (
        bounds.some((n) => n > 100000) ||
        (bounds[1] ?? bounds[0]) < bounds[0]
      )
        throw new Error("Use páginas de 1 a 100.000 e intervalos crescentes.");
      return bounds.join("-");
    })
    .join(", ");
}
const pages = z.string().transform((value, context) => {
  try {
    return normalizePages(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: (error as Error).message,
    });
    return z.NEVER;
  }
});
const base = {
  processId: z.uuid("Processo inválido."),
  fileId: z.uuid("Escolha um PDF confirmado."),
  entryId: z.uuid("Entrada inválida."),
  requestId: z.uuid("Recarregue antes de salvar."),
  revision: z
    .string()
    .regex(/^(0|[1-9][0-9]{0,9})$/)
    .transform(Number),
};
const content = {
  piece: z.enum(
    Object.keys(indexPieces) as [
      keyof typeof indexPieces,
      ...(keyof typeof indexPieces)[],
    ],
    "Escolha o tipo de peça.",
  ),
  pages,
  note: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().max(2000, "Use até 2.000 caracteres na observação.")),
};
export const indexSchema = z.discriminatedUnion("operation", [
  z
    .object({ ...base, ...content, operation: z.literal("create") })
    .refine((v) => v.revision === 0, {
      message: "Revisão inválida.",
      path: ["revision"],
    }),
  z
    .object({ ...base, ...content, operation: z.literal("update") })
    .refine((v) => v.revision >= 1 && v.revision < 2147483647, {
      message: "Revisão inválida.",
      path: ["revision"],
    }),
  z
    .object({
      ...base,
      operation: z.literal("delete"),
      agreed: z.literal("yes", "Confirme a remoção da entrada."),
    })
    .refine((v) => v.revision >= 1 && v.revision < 2147483647, {
      message: "Revisão inválida.",
      path: ["revision"],
    }),
]);
export function parseIndexEntry(form: FormData) {
  return indexSchema.safeParse(Object.fromEntries(form));
}
