import { it, expect } from "vitest";
import { dashboardWindow, deadlineFilter, deadlineRange } from "./window";
it("usa o mesmo instante na janela móvel e o dia civil de São Paulo nos prazos", () => {
  const before = dashboardWindow(new Date("2026-10-10T02:59:59.999Z")),
    after = dashboardWindow(new Date("2026-10-10T03:00:00Z"));
  expect(before.today).toBe("2026-10-09");
  expect(after.today).toBe("2026-10-10");
  expect(after.since).toBe("2026-10-03T03:00:00.000Z");
  expect(before.soon).toBe("2026-10-14");
  expect(deadlineRange(deadlineFilter("vencendo"), before)).toEqual({
    gte: "2026-10-09",
    lte: "2026-10-14",
    lt: undefined,
  });
  expect(deadlineRange(deadlineFilter("atrasados"), after).lt).toBe(
    "2026-10-10",
  );
  expect(dashboardWindow(new Date("2026-12-18T12:00:00Z")).soon).toBe(
    "2027-01-22",
  );
  expect(deadlineFilter("todos")).toBeNull();
  expect(() => deadlineFilter("amanha")).toThrow();
});
