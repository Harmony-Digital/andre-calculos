import { z } from "zod";
import { decisionParameters, decisionSources } from "./types";
const text = (label: string, limit: number) =>
  z
    .string()
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(1, `Informe ${label}.`)
        .max(limit, `Use até ${limit.toLocaleString("pt-BR")} caracteres.`),
    );
export const decisionSchema = z.object({
  processId: z.uuid("Processo inválido."),
  requestId: z.uuid("Recarregue antes de registrar."),
  parameter: z.enum(
    Object.keys(decisionParameters) as [
      keyof typeof decisionParameters,
      ...(keyof typeof decisionParameters)[],
    ],
    "Escolha o parâmetro.",
  ),
  value: text("o valor escolhido", 1000),
  source: z.enum(
    Object.keys(decisionSources) as [
      keyof typeof decisionSources,
      ...(keyof typeof decisionSources)[],
    ],
    "Escolha a origem.",
  ),
  page: z
    .string()
    .trim()
    .regex(
      /^(?:[1-9][0-9]{0,5})?$/,
      "Use uma página inteira de 1 a 100.000 ou deixe em branco.",
    )
    .transform((value) => (value === "" ? null : Number(value)))
    .pipe(z.number().int().min(1).max(100000).nullable()),
  rationale: text("a justificativa", 2000),
});
export function parseDecision(form: FormData) {
  return decisionSchema.safeParse(Object.fromEntries(form));
}
