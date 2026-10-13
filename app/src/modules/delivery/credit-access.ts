import { z } from "zod";
import { orderStates } from "@/modules/orders/state-machine";
import { currentOrderCreditSchema } from "@/modules/payments/order-credit";

const id = z.uuid().transform((value) => value.toLowerCase());
const unavailable = "Não foi possível conferir a liberação desta entrega.";
export const deliveryReleasePolicies = [
  "before_balance",
  "after_balance",
] as const;

/** Contexto atual: não representa aprovação técnica nem recibo histórico. */
export const deliveryAccessContextSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    semantics: z.literal("current_delivery_access"),
    effects: z.literal("none"),
    deliveryId: id,
    orderId: id,
    processId: id,
    orderStatus: z.enum(orderStates),
    releasePolicy: z.enum(deliveryReleasePolicies).nullable(),
    credit: currentOrderCreditSchema,
  })
  .superRefine((context, ctx) => {
    const p = context.credit.projection;
    if (
      context.orderId !== context.credit.orderId ||
      (p.depositUncertain && !p.uncertain) ||
      (p.depositCreditCents !== null &&
        p.totalCreditCents !== null &&
        p.depositCreditCents > p.totalCreditCents)
    )
      ctx.addIssue({ code: "custom", message: unavailable });
  });
export type DeliveryAccessContext = z.infer<typeof deliveryAccessContextSchema>;
export const deliveryCreditAccessLabels = {
  ready: "Arquivos liberados para download.",
  review_pending: "Arquivos em revisão. O download do cliente está bloqueado.",
  policy_pending:
    "Entrega confirmada. A liberação dos arquivos aguarda a definição da regra de pagamento.",
  financial_pending:
    "Entrega confirmada. Os valores aceitos e o crédito precisam ser conferidos antes de liberar os arquivos.",
  deposit_pending:
    "Entrega confirmada. O download aguarda a confirmação do sinal.",
  balance_pending:
    "Entrega confirmada. O download aguarda a confirmação do saldo.",
} as const;
export type DeliveryCreditAccess = keyof typeof deliveryCreditAccessLabels;

/** Certeza da fase exigida; não cobra, estorna, audita ou altera a entrega. */
export function deriveDeliveryCreditAccess(
  input: DeliveryAccessContext,
): DeliveryCreditAccess {
  const context = deliveryAccessContextSchema.parse(input);
  if (!["delivered", "completed"].includes(context.orderStatus))
    return "review_pending";
  if (context.releasePolicy === null) return "policy_pending";
  const p = context.credit.projection;
  if (
    p.unsafeAmount ||
    p.requiredDepositCents === null ||
    p.totalCents === null ||
    p.requiredDepositCents > p.totalCents
  )
    return "financial_pending";
  if (context.releasePolicy === "before_balance") {
    if (context.credit.hasContract) return "ready";
    if (p.depositUncertain || p.depositCreditCents === null)
      return "financial_pending";
    return p.depositCreditCents >= p.requiredDepositCents
      ? "ready"
      : "deposit_pending";
  }
  if (p.uncertain || p.totalCreditCents === null) return "financial_pending";
  return p.totalCreditCents >= p.totalCents ? "ready" : "balance_pending";
}

/** Todas as entregas pedidas, em um processo, com um crédito por pedido. */
export function parseDeliveryAccessContexts(
  value: unknown,
  processId: string,
  deliveries: readonly { id: string; order_id: string; process_id: string }[],
) {
  const target = id.parse(processId);
  const expected = z
    .array(z.object({ id, order_id: id, process_id: id }))
    .max(50)
    .parse(deliveries);
  const rows = z.array(deliveryAccessContextSchema).max(50).parse(value);
  const expectedById = new Map(expected.map((row) => [row.id, row]));
  if (
    expectedById.size !== expected.length ||
    new Set(rows.map((row) => row.deliveryId)).size !== rows.length ||
    rows.length !== expected.length ||
    expected.some((row) => row.process_id !== target) ||
    rows.some((row) => {
      const wanted = expectedById.get(row.deliveryId);
      return (
        !wanted || row.processId !== target || row.orderId !== wanted.order_id
      );
    })
  )
    throw new Error(unavailable);
  const orderContexts = new Map<string, string>();
  for (const row of rows) {
    const position = JSON.stringify({
      orderStatus: row.orderStatus,
      credit: row.credit,
    });
    const previous = orderContexts.get(row.orderId);
    if (previous !== undefined && previous !== position)
      throw new Error(unavailable);
    orderContexts.set(row.orderId, position);
  }
  return new Map(rows.map((row) => [row.deliveryId, row]));
}
