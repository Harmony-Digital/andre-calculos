import { addBusinessDays } from "@/modules/deadlines/calendar";
import { todayInSaoPaulo } from "@/modules/queue/queue";
export function dashboardWindow(now = new Date()) {
  const today = todayInSaoPaulo(now);
  return {
    now: now.toISOString(),
    since: new Date(now.getTime() - 7 * 86400000).toISOString(),
    today,
    soon: addBusinessDays(today, 2),
  };
}
export type DashboardWindow = ReturnType<typeof dashboardWindow>;
export function deadlineFilter(value?: string) {
  if (!value || value === "todos") return null;
  if (value === "vencendo" || value === "atrasados") return value;
  throw new Error("Seleção de prazo inválida.");
}
export function deadlineRange(
  value: ReturnType<typeof deadlineFilter>,
  window: DashboardWindow,
) {
  return value === "vencendo"
    ? { gte: window.today, lte: window.soon, lt: undefined }
    : value === "atrasados"
      ? { gte: undefined, lte: undefined, lt: window.today }
      : { gte: undefined, lte: undefined, lt: undefined };
}
