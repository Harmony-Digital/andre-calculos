import { z } from "zod";
import { addBusinessDays, isCivilDate } from "@/modules/deadlines/calendar";
import {
  observedCredit,
  type CurrentOrderCredit,
} from "@/modules/payments/order-credit";
export const queueStates = [
  "queued",
  "in_analysis",
  "awaiting_client",
  "in_calculation",
  "in_review",
  "in_adjustment",
] as const;
export type QueueState = (typeof queueStates)[number];
export function queueFilter(value?: string): QueueState | null {
  if (!value || value === "todos") return null;
  if (!queueStates.includes(value as QueueState))
    throw new Error("Situação inválida.");
  return value as QueueState;
}
export function todayInSaoPaulo(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).formatToParts(now);
  const get = (name: string) => parts.find((part) => part.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function deadlineBadge(due: string | null, today: string) {
  if (!isCivilDate(today) || (due !== null && !isCivilDate(due)))
    throw new Error("Data inválida.");
  if (due === null) return { kind: "missing", label: "Prazo a definir" };
  if (due < today) return { kind: "late", label: "Atrasado" };
  if (due === today) return { kind: "soon", label: "Vence hoje" };
  if (due <= addBusinessDays(today, 2))
    return { kind: "soon", label: "Próximo do prazo" };
  return { kind: "normal", label: "No prazo" };
}
const cursorSchema = z.object({
  due: z.string().refine(isCivilDate).nullable(),
  id: z.uuid(),
});
export function queueCursor(value?: string) {
  if (!value) return null;
  const [due, id, ...extra] = value.split("~");
  if (extra.length) throw new Error("Cursor inválido.");
  return cursorSchema.parse({ due: due === "sem-data" ? null : due, id });
}
export function encodeQueueCursor(value: {
  internal_due_date: string | null;
  id: string;
}) {
  const v = cursorSchema.parse({ due: value.internal_due_date, id: value.id });
  return `${v.due ?? "sem-data"}~${v.id}`;
}
function cents(value: number) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Valor inválido.");
  return value;
}
export function queuePaymentStatus(credit: CurrentOrderCredit) {
  const p = credit.projection;
  if (credit.collectionState === "reconcile") return "Valores em conciliação";
  if (credit.collectionState === "excess") return "Crédito excedente";
  if (p.totalCents !== null && p.totalCents > 0 && p.remainingTotalCents === 0)
    return "Quitado";
  if (credit.hasContract) return "Contrato";
  if (
    p.requiredDepositCents !== null &&
    p.requiredDepositCents > 0 &&
    p.remainingDepositCents === 0
  )
    return "Sinal confirmado";
  if (p.depositCreditCents !== null && p.depositCreditCents > 0)
    return "Sinal parcial";
  if (p.requiredDepositCents === 0) return "Sinal a conferir";
  return "Sinal pendente";
}
export function queuePaymentNote(credit: CurrentOrderCredit) {
  const p = credit.projection;
  if (credit.collectionState === "reconcile") {
    const observed = observedCredit(p, "total");
    return observed === null
      ? "Aguarda conferência financeira."
      : `Subtotal observado: ${queueMoney(observed)}. Aguarda conferência.`;
  }
  if (credit.collectionState === "excess")
    return `Excesso: ${queueMoney(Math.max(p.depositExcessCents ?? 0, p.totalExcessCents ?? 0))}. Aguarda conferência.`;
  return credit.activeReservation ? "Cobrança em andamento." : null;
}
export function queueMoney(value: number | null) {
  if (value === null) return "Valor a conferir";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents(value) / 100);
}
