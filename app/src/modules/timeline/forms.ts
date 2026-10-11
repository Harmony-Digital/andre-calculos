import { z } from "zod";
export const noteSchema = z.object({
  processId: z.uuid("Processo inválido."),
  requestId: z.uuid("Recarregue antes de registrar."),
  body: z
    .string()
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(1, "Escreva a nota.")
        .max(2000, "A nota pode ter até 2.000 caracteres."),
    ),
});
export function parseNote(form: FormData) {
  return noteSchema.safeParse({
    processId: form.get("processId"),
    requestId: form.get("requestId"),
    body: form.get("body"),
  });
}
