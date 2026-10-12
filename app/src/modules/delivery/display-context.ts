import { z } from "zod";
import {
  deliveryAccessContextSchema,
  parseDeliveryAccessContexts,
} from "./credit-access";
import { deliveryCreditSchema } from "@/modules/payments/order-credit";

const unavailable = "Não foi possível conferir as entregas e o saldo.";
const identifier = z.uuid().transform((value) => value.toLowerCase());
const expectedSchema = z.object({
  id: identifier,
  order_id: identifier,
  created_at: z.iso
    .datetime({ offset: true })
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/,
    ),
});
const schema = z.strictObject({
  schemaVersion: z.literal(1),
  semantics: z.literal("delivery_display"),
  effects: z.literal("none"),
  contexts: z.array(deliveryAccessContextSchema).max(50),
  payments: z.array(deliveryCreditSchema).max(50),
});
function instant(date: string) {
  const parts = /^(.{19})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(date)!;
  const seconds = Date.parse(parts[1] + parts[3]);
  if (!Number.isFinite(seconds)) throw new Error(unavailable);
  return (
    BigInt(seconds) * BigInt(1000) + BigInt((parts[2] ?? "").padEnd(6, "0"))
  );
}
export function parseDeliveryDisplay(
  value: unknown,
  processId: string,
  deliveries: readonly { id: string; order_id: string; created_at: string }[],
) {
  const rows = z.array(expectedSchema).max(50).parse(deliveries);
  const parsed = schema.parse(value);
  const contexts = parseDeliveryAccessContexts(
    parsed.contexts,
    processId,
    rows.map((row) => ({ ...row, process_id: processId })),
  );
  const latest = new Map<string, string>();
  const sorted = [...rows].sort((a, b) => {
    const left = instant(a.created_at),
      right = instant(b.created_at);
    return left === right
      ? a.id === b.id
        ? 0
        : a.id > b.id
          ? -1
          : 1
      : left > right
        ? -1
        : 1;
  });
  for (const row of sorted) {
    const context = contexts.get(row.id)!;
    if (
      context.releasePolicy === "after_balance" &&
      ["delivered", "completed"].includes(context.orderStatus) &&
      !latest.has(row.order_id)
    )
      latest.set(row.order_id, row.id);
  }
  if (
    parsed.payments.length !== latest.size ||
    new Set(parsed.payments.map((row) => row.orderId)).size !==
      parsed.payments.length ||
    parsed.payments.some((row) => {
      const context = contexts.get(row.deliveryId);
      return (
        !context ||
        latest.get(row.orderId) !== row.deliveryId ||
        JSON.stringify(row.credit) !== JSON.stringify(context.credit)
      );
    })
  )
    throw new Error(unavailable);
  return {
    contexts,
    payments: new Map(parsed.payments.map((row) => [row.deliveryId, row])),
  };
}
