import { z } from "zod";
import {
  orderStates,
  transition,
  type Order,
  type OrderState,
} from "./state-machine";

export const operationLabels = {
  start_analysis: "Iniciar análise",
  start_calculation: "Iniciar cálculo",
  submit_review: "Enviar para revisão",
  return_calculation: "Devolver ao cálculo",
  request_information: "Aguardar informações do cliente",
  receive_information: "Retomar trabalho",
} as const;
export type OperationalEvent = keyof typeof operationLabels;
export const operationalEvents = Object.keys(
  operationLabels,
) as OperationalEvent[];
export function operationalOrder(
  state: OrderState,
  clientOwnerId: string,
  resumeStatus?: string | null,
): Order {
  return {
    state,
    clientOwnerId,
    quoteAccepted: false,
    depositConfirmed: false,
    hasContract: false,
    minimumDocumentPresent: false,
    calculatorReviewed: false,
    deliveryComplete: false,
    balanceConfirmed: false,
    ...(resumeStatus
      ? { resumeState: resumeStatus as Order["resumeState"] }
      : {}),
  };
}
export function availableOperations(
  state: OrderState,
  resumeStatus?: string | null,
) {
  return operationalEvents.filter((event) => {
    try {
      transition(operationalOrder(state, "owner", resumeStatus), event, {
        id: "calculator",
        role: "calculator",
      });
      return true;
    } catch {
      return false;
    }
  });
}
export const operationSchema = z
  .object({
    processId: z.uuid("Processo inválido."),
    orderId: z.uuid("Pedido inválido."),
    requestId: z.uuid("Tentativa inválida."),
    event: z.enum(operationalEvents, "Escolha uma etapa disponível."),
    expectedState: z.enum(orderStates),
    revision: z
      .string()
      .regex(/^(0|[1-9][0-9]{0,9})$/, "Revisão inválida.")
      .transform(Number)
      .pipe(z.number().int().max(2147483646)),
    reason: z
      .string()
      .trim()
      .max(1000, "O motivo deve ter até 1.000 caracteres."),
  })
  .superRefine((v, context) => {
    if (
      ["request_information", "return_calculation"].includes(v.event) &&
      v.reason.length < 3
    )
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Informe o motivo com pelo menos três caracteres.",
      });
  });
export type OperationIntent = z.infer<typeof operationSchema>;
export function parseOperation(form: FormData) {
  return operationSchema.safeParse(
    Object.fromEntries(
      [
        "processId",
        "orderId",
        "requestId",
        "event",
        "expectedState",
        "revision",
        "reason",
      ].map((key) => [key, form.get(key)]),
    ),
  );
}
export const operationReceiptSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  processId: z.uuid(),
  from: z.enum(orderStates),
  to: z.enum(orderStates),
  resumeStatus: z
    .enum(["in_analysis", "in_calculation", "in_review"])
    .nullable(),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
});
