import { z } from "zod";
const fileId = z.uuid("Escolha um arquivo disponível.");
export const deliverySchema = z
  .object({
    processId: z.uuid(),
    orderId: z.uuid(),
    requestId: z.uuid(),
    calculationFile: fileId,
    pjcFile: fileId,
    reportFile: fileId,
    attachments: z
      .array(fileId)
      .max(10, "Escolha até dez arquivos adicionais."),
    pjeVersion: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,39}$/,
        "Informe a versão do PJe-Calc (até 40 caracteres).",
      ),
    indexMonth: z
      .string()
      .trim()
      .regex(
        /^(0[1-9]|1[0-2])\/[0-9]{4}$/,
        "Informe o mês e o ano no formato MM/AAAA.",
      )
      .refine((s) => Number(s.slice(3)) >= 1900, "Informe um ano válido.")
      .transform((s) => `${s.slice(3)}-${s.slice(0, 2)}`),
    liquidated: z.literal(true, {
      error: "Confirme que o cálculo está liquidado.",
    }),
    taxIdPresent: z.literal(true, { error: "Confirme o CPF ou CNPJ no PJC." }),
    reviewed: z.literal(true, {
      error: "Confirme a revisão e a assinatura do parecer.",
    }),
  })
  .superRefine((v, ctx) => {
    const all = [v.calculationFile, v.pjcFile, v.reportFile, ...v.attachments];
    if (new Set(all).size !== all.length)
      ctx.addIssue({
        code: "custom",
        path: ["reportFile"],
        message: "Escolha arquivos distintos para cada entrega.",
      });
  });
export function parseDelivery(form: FormData) {
  return deliverySchema.safeParse({
    ...Object.fromEntries(
      [
        "processId",
        "orderId",
        "requestId",
        "calculationFile",
        "pjcFile",
        "reportFile",
        "pjeVersion",
        "indexMonth",
      ].map((field) => [field, form.get(field)]),
    ),
    attachments: form.getAll("attachments").sort(),
    liquidated: form.get("liquidated") === "on",
    taxIdPresent: form.get("taxIdPresent") === "on",
    reviewed: form.get("reviewed") === "on",
  });
}
export const deliveryKinds = {
  calculation: "PDF do cálculo",
  pjc: "Arquivo PJC",
  report: "Parecer assinado",
  attachment: "Arquivo adicional",
} as const;
