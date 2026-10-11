import { describe, it, expect } from "vitest";
import { deadlineSnapshot, deadlineEvent, inDeadlineWindow } from "./deadlines";
const snapshot = (day: string) =>
  deadlineSnapshot(new Date(`${day}T12:00:00Z`));
const event = (day: string, due: string | null, status = "queued") =>
  deadlineEvent({ status, internal_due_date: due }, snapshot(day));
describe("lembretes pelo calendário provisório", () => {
  it("sexta antecipa segunda e terça, preservando dias úteis", () => {
    expect(event("2026-10-16", "2026-10-19")).toBe("deadline_one_day");
    expect(event("2026-10-16", "2026-10-20")).toBe("deadline_two_days");
    expect(event("2026-10-16", "2026-10-16")).toBeNull();
    expect(event("2026-10-16", "2026-10-15")).toBe("deadline_overdue");
  });
  it("atravessa o recesso sem transformar dias corridos em úteis", () => {
    expect(event("2026-12-18", "2027-01-21")).toBe("deadline_one_day");
    expect(event("2026-12-18", "2027-01-22")).toBe("deadline_two_days");
    expect(event("2027-01-20", "2027-01-21")).toBeNull();
    expect(event("2027-01-21", "2027-01-22")).toBe("deadline_one_day");
  });
  it.each(["2026-10-17", "2026-10-18", "2026-10-12", "2027-01-20"])(
    "não antecipa em %s; atraso continua disponível",
    (day) => {
      expect(event(day, snapshot(day).oneDay)).toBeNull();
      expect(event(day, "2026-09-01")).toBe("deadline_overdue");
    },
  );
  it("não move prazo em fim de semana nem recupera antecipado perdido", () => {
    expect(event("2026-10-16", "2026-10-17")).toBeNull();
    expect(event("2026-10-18", "2026-10-17")).toBe("deadline_overdue");
    expect(event("2026-10-19", "2026-10-19")).toBeNull();
    expect(event("2026-10-20", "2026-10-19")).toBe("deadline_overdue");
  });
  it.each([
    "draft",
    "quoted",
    "awaiting_payment",
    "delivered",
    "completed",
    "cancelled",
    "refunded",
  ])("exclui %s", (status) =>
    expect(event("2026-10-16", "2026-10-15", status)).toBeNull(),
  );
  it("não envia sem prazo e rejeita data inválida", () => {
    expect(event("2026-10-16", null)).toBeNull();
    expect(() => event("2026-10-16", "2026-02-30")).toThrow();
  });
  it("usa o mesmo instante para data e horário de São Paulo", () => {
    expect(deadlineSnapshot(new Date("2026-10-17T02:59:59Z"))).toMatchObject({
      today: "2026-10-16",
      time: "23:59",
      businessDay: true,
    });
    expect(deadlineSnapshot(new Date("2026-10-17T03:00:00Z"))).toMatchObject({
      today: "2026-10-17",
      time: "00:00",
      businessDay: false,
    });
  });
  it("inclui início e exclui fim da janela; permite configuração no mesmo dia", () => {
    expect(inDeadlineWindow("06:59", "07:00", "21:00")).toBe(false);
    expect(inDeadlineWindow("07:00", "07:00", "21:00")).toBe(true);
    expect(inDeadlineWindow("20:59", "07:00", "21:00")).toBe(true);
    expect(inDeadlineWindow("21:00", "07:00", "21:00")).toBe(false);
    expect(inDeadlineWindow("08:30", "08:00", "09:00")).toBe(true);
    expect(() => inDeadlineWindow("12:00", "21:00", "07:00")).toThrow();
  });
});
