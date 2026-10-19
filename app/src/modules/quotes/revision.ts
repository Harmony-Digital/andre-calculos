import { z } from "zod";
import type { Proposal } from "./proposal";
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const revisionIntentSchema = z.strictObject({
  quoteId: z.uuid(),
  contextHash: z.string().regex(/^[a-f0-9]{64}$/),
  version: z.number().int().positive(),
  orderRevision: z.number().int().nonnegative(),
  requestId: z.uuid(),
  reason: z.string().trim().min(1).max(1000),
  items: z
    .array(
      z.strictObject({ code: z.string().min(1).max(50), unitCents: money }),
    )
    .min(1)
    .max(10),
});
export type RevisionIntent = z.infer<typeof revisionIntentSchema>;
export const revisionReceiptSchema = z.strictObject({
  quoteId: z.uuid(),
  previousQuoteId: z.uuid(),
  orderId: z.uuid(),
  processId: z.uuid(),
  number: z.string().regex(/^ORC-\d{4}-\d{4,}$/),
  version: z.number().int().min(2),
  previousTotalCents: money,
  totalCents: money,
  reason: z.string().min(1).max(1000),
  createdAt: z.iso.datetime({ offset: true }),
});
export type RevisionReceipt = z.infer<typeof revisionReceiptSchema>;
export const revisionContextSchema = z.strictObject({
  version: z.number().int().positive(),
  currentQuoteId: z.uuid().nullable(),
  isCurrent: z.boolean(),
  blockMessage: z.string().nullable().optional(),
  canRevise: z.boolean(),
  history: z.array(
    z.strictObject({
      id: z.uuid(),
      number: z.string(),
      version: z.number().int().positive(),
      previousQuoteId: z.uuid().nullable(),
      totalCents: money,
      createdAt: z.iso.datetime({ offset: true }),
      reason: z.string().nullable(),
    }),
  ),
});
export type RevisionContext = z.infer<typeof revisionContextSchema>;
export function parseRevisionForm(form: FormData, proposal: Proposal) {
  const prices = proposal.items.map((item) => {
    const value = String(form.get(`price:${item.code}`) ?? "").trim();
    if (!/^\d{1,14}([,.]\d{1,2})?$/.test(value))
      throw new Error(`Valor de ${item.description}: use reais, como 1234,56.`);
    const [whole, fraction = ""] = value.replace(",", ".").split(".");
    const amount =
      BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
    if (amount > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error(`Valor de ${item.description}: limite excedido.`);
    return { code: item.code, unitCents: Number(amount) };
  });
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason || reason.length > 1000)
    throw new Error("Motivo: informe de 1 a 1.000 caracteres.");
  const summary = revisionTotals(proposal, prices);
  return { reason, items: prices, ...summary };
}
export function revisionTotals(
  proposal: Proposal,
  prices: { code: string; unitCents: number }[],
) {
  if (
    prices.length !== proposal.items.length ||
    new Set(prices.map((p) => p.code)).size !== prices.length
  )
    throw new Error("Serviços divergentes.");
  const total = proposal.items.reduce((sum, item, index) => {
    const price = prices[index];
    if (
      price.code !== item.code ||
      !Number.isSafeInteger(price.unitCents) ||
      price.unitCents < 0
    )
      throw new Error("Valor do serviço inválido.");
    return sum + BigInt(item.quantity) * BigInt(price.unitCents);
  }, BigInt(0));
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Total: limite excedido.");
  const deposit = (total + BigInt(1)) / BigInt(2);
  return {
    totalCents: Number(total),
    depositCents: Number(deposit),
    balanceCents: Number(total - deposit),
  };
}

export function revisionMoneyInput(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new Error("Valor do serviço inválido.");
  const value = BigInt(cents);
  return `${value / BigInt(100)},${String(value % BigInt(100)).padStart(2, "0")}`;
}
