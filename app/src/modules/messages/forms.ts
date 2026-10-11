import { z } from "zod";
export const messageSchema = z.object({
  processId: z.uuid("Processo inválido."),
  requestId: z.uuid("Recarregue antes de enviar."),
  body: z
    .string()
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(1, "Escreva a mensagem.")
        .max(10000, "A mensagem pode ter até 10.000 caracteres."),
    ),
  attachments: z
    .array(z.uuid("Anexo inválido."))
    .max(10, "Escolha até dez anexos.")
    .refine(
      (values) => new Set(values).size === values.length,
      "Não repita anexos.",
    ),
});
export function parseMessage(form: FormData) {
  return messageSchema.safeParse({
    processId: form.get("processId"),
    requestId: form.get("requestId"),
    body: form.get("body"),
    attachments: form.getAll("attachments"),
  });
}
