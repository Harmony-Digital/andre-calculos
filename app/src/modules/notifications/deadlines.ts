import {
  addBusinessDays,
  isBusinessDay,
  isCivilDate,
  type Calendar,
} from "@/modules/deadlines/calendar";
import { queueStates, todayInSaoPaulo } from "@/modules/queue/queue";

export const deadlineCalendarVersion = "br-processual-provisorio-v1";
export type DeadlineEvent =
  "deadline_two_days" | "deadline_one_day" | "deadline_overdue";
export function deadlineSnapshot(now: Date, calendar: Calendar = {}) {
  const today = todayInSaoPaulo(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return {
    today,
    time,
    oneDay: addBusinessDays(today, 1, calendar),
    twoDays: addBusinessDays(today, 2, calendar),
    businessDay: isBusinessDay(today, calendar),
  };
}
export function inDeadlineWindow(time: string, start: string, end: string) {
  const valid = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (![time, start, end].every(valid) || start >= end)
    throw new Error("Confira a janela de envio dos lembretes.");
  return time >= start && time < end;
}
export function deadlineEvent(
  order: { status: string; internal_due_date: string | null },
  snapshot: ReturnType<typeof deadlineSnapshot>,
): DeadlineEvent | null {
  const due = order.internal_due_date;
  if (due !== null && !isCivilDate(due))
    throw new Error("Prazo interno inválido.");
  if (
    !queueStates.includes(order.status as (typeof queueStates)[number]) ||
    due === null
  )
    return null;
  if (due < snapshot.today) return "deadline_overdue";
  if (!snapshot.businessDay) return null;
  if (due === snapshot.oneDay) return "deadline_one_day";
  if (due === snapshot.twoDays) return "deadline_two_days";
  return null;
}
