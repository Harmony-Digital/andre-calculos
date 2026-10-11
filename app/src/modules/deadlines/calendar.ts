export type Suspension = { start: string; end: string; reason: string };
export type Calendar = {
  suspensions?: readonly Suspension[];
  federalCourtHolidays?: boolean;
};
const DAY = 86400000;

export function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    Number(value.slice(0, 4)) >= 1900 &&
    Number(value.slice(0, 4)) <= 9999
  );
}
function dateValue(value: string): Date {
  if (!isCivilDate(value))
    throw new Error("Informe a data no formato AAAA-MM-DD, com dia válido.");
  return new Date(`${value}T12:00:00.000Z`);
}
function shifted(value: string, days: number): string {
  return new Date(dateValue(value).getTime() + days * DAY)
    .toISOString()
    .slice(0, 10);
}
function validateCalendar(calendar: Calendar) {
  for (const suspension of calendar.suspensions ?? []) {
    if (
      !isCivilDate(suspension.start) ||
      !isCivilDate(suspension.end) ||
      suspension.start > suspension.end ||
      !suspension.reason.trim()
    )
      throw new Error("Cada suspensão precisa de datas válidas e motivo.");
  }
}

export function easterDate(year: number): string {
  if (!Number.isInteger(year) || year < 1900 || year > 9999)
    throw new Error("Informe um ano válido.");
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100,
    d = Math.floor(b / 4),
    e = b % 4;
  const f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function businessDay(value: string, calendar: Calendar): boolean {
  const date = dateValue(value),
    weekday = date.getUTCDay(),
    year = date.getUTCFullYear(),
    md = value.slice(5);
  if (weekday === 0 || weekday === 6) return false;
  if (md >= "12-20" || md <= "01-20") return false;
  if (
    [
      "01-01",
      "04-21",
      "05-01",
      "09-07",
      "10-12",
      "11-02",
      "11-15",
      "12-25",
    ].includes(md) ||
    (year >= 2024 && md === "11-20")
  )
    return false;
  if (calendar.federalCourtHolidays !== false) {
    if (["08-11", "11-01", "12-08"].includes(md)) return false;
    const easter = easterDate(year);
    if (
      [-48, -47, -4, -3, -2].some((offset) => shifted(easter, offset) === value)
    )
      return false;
  }
  return !(calendar.suspensions ?? []).some(
    (s) => s.start <= value && s.end >= value,
  );
}

/** Datas civis de São Paulo; nunca converte uma data de formulário pelo fuso do processo. */
export function isBusinessDay(value: string, calendar: Calendar = {}): boolean {
  validateCalendar(calendar);
  return businessDay(value, calendar);
}
export function addBusinessDays(
  value: string,
  days: number,
  calendar: Calendar = {},
): string {
  dateValue(value);
  validateCalendar(calendar);
  if (!Number.isSafeInteger(days) || Math.abs(days) > 3660)
    throw new Error("Informe até 3.660 dias úteis em número inteiro.");
  let current = value,
    remaining = Math.abs(days),
    scanned = 0;
  while (remaining > 0) {
    if (++scanned > 36525)
      throw new Error(
        "O calendário não permite encontrar o prazo neste intervalo.",
      );
    current = shifted(current, Math.sign(days));
    if (businessDay(current, calendar)) remaining--;
  }
  return current;
}

const actDays = { challenge: 8, embargo: 5, appeal: 8 } as const;
export function computeDeadline({
  noticeDate,
  actType,
  days,
  slackBusinessDays = 2,
  suspensions = [],
  federalCourtHolidays = true,
}: {
  noticeDate: string;
  actType: keyof typeof actDays | "other";
  days?: number;
  slackBusinessDays?: number;
  suspensions?: readonly Suspension[];
  federalCourtHolidays?: boolean;
}) {
  const count = actType === "other" ? days : actDays[actType];
  if (!Number.isSafeInteger(count) || count === undefined || count < 1)
    throw new Error("Informe um prazo processual positivo.");
  if (
    !Number.isSafeInteger(slackBusinessDays) ||
    slackBusinessDays < 0 ||
    slackBusinessDays >= count
  )
    throw new Error("A folga deve ser menor que o prazo processual.");
  const calendar = { suspensions, federalCourtHolidays };
  const dueDate = addBusinessDays(noticeDate, count, calendar);
  return {
    dueDate,
    internalDueDate: addBusinessDays(dueDate, -slackBusinessDays, calendar),
    businessDays: count,
    slackBusinessDays,
    requiresTribunalReview: true as const,
  };
}
