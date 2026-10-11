import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  computeDeadline,
  easterDate,
  isBusinessDay,
  isCivilDate,
} from "./calendar";
describe("calendário processual", () => {
  it.each([
    "2026-02-30",
    "2025-02-29",
    "2026-1-01",
    "01/02/2026",
    "1899-01-01",
    "",
  ])("recusa data inválida %s", (value) =>
    expect(isCivilDate(value)).toBe(false),
  );
  it("aceita dia bissexto válido", () =>
    expect(isCivilDate("2024-02-29")).toBe(true));
  it.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2038, "2038-04-25"],
  ])("calcula Páscoa %i", (year, date) =>
    expect(easterDate(Number(year))).toBe(date),
  );
  it.each([0, 1899, 10000, 2026.5])("recusa ano inválido %i", (year) =>
    expect(() => easterDate(year)).toThrow(),
  );
  it.each([
    "2026-02-07",
    "2026-02-08",
    "2026-04-21",
    "2026-05-01",
    "2026-09-07",
    "2026-10-12",
    "2026-11-02",
    "2026-11-20",
    "2026-12-25",
    "2026-08-11",
    "2026-12-08",
  ])("exclui feriado ou fim de semana %s", (date) =>
    expect(isBusinessDay(date)).toBe(false),
  );
  it("trata 20/11 como nacional a partir de 2024", () => {
    expect(isBusinessDay("2023-11-20")).toBe(true);
    expect(isBusinessDay("2025-11-20")).toBe(false);
  });
  it("exclui início e inclui vencimento", () =>
    expect(addBusinessDays("2026-02-02", 3)).toBe("2026-02-05"));
  it("mantém data quando são zero dias", () =>
    expect(addBusinessDays("2026-02-07", 0)).toBe("2026-02-07"));
  it("pula Carnaval do preset judicial", () =>
    expect(addBusinessDays("2026-02-13", 1)).toBe("2026-02-18"));
  it("considera Cinzas somente quando a suspensão local for cadastrada", () =>
    expect(
      addBusinessDays("2026-02-13", 1, {
        suspensions: [
          {
            start: "2026-02-18",
            end: "2026-02-18",
            reason: "Calendário de teste do TRT",
          },
        ],
      }),
    ).toBe("2026-02-19"));
  it("pula a Semana Santa do preset judicial", () =>
    expect(addBusinessDays("2026-03-31", 1)).toBe("2026-04-06"));
  it("permite calendário sem feriados judiciais do preset", () =>
    expect(
      addBusinessDays("2026-02-13", 1, { federalCourtHolidays: false }),
    ).toBe("2026-02-16"));
  it("pula 20 de novembro", () =>
    expect(addBusinessDays("2026-11-19", 1)).toBe("2026-11-23"));
  it("suspende 20/12 a 20/01 inclusive", () => {
    expect(addBusinessDays("2025-12-19", 1)).toBe("2026-01-21");
    expect(isBusinessDay("2026-01-20")).toBe(false);
    expect(isBusinessDay("2026-01-21")).toBe(true);
  });
  it("retrocede dias úteis sem contar a data inicial", () =>
    expect(addBusinessDays("2026-01-21", -1)).toBe("2025-12-19"));
  it.each([
    ["challenge", 8, "2026-02-12"],
    ["embargo", 5, "2026-02-09"],
    ["appeal", 8, "2026-02-12"],
  ] as const)("calcula ato %s e folga", (actType, businessDays, dueDate) =>
    expect(
      computeDeadline({ noticeDate: "2026-02-02", actType }),
    ).toMatchObject({ businessDays, dueDate, requiresTribunalReview: true }),
  );
  it("calcula prazo customizado e folga dois dias", () =>
    expect(
      computeDeadline({ noticeDate: "2026-02-02", actType: "other", days: 3 }),
    ).toMatchObject({ dueDate: "2026-02-05", internalDueDate: "2026-02-03" }));
  it("aceita folga zero", () =>
    expect(
      computeDeadline({
        noticeDate: "2026-02-02",
        actType: "other",
        days: 1,
        slackBusinessDays: 0,
      }),
    ).toMatchObject({ dueDate: "2026-02-03", internalDueDate: "2026-02-03" }));
  it.each([undefined, 0, -1, 1.5])("recusa prazo outro inválido %s", (days) =>
    expect(() =>
      computeDeadline({ noticeDate: "2026-02-02", actType: "other", days }),
    ).toThrow(),
  );
  it.each([-1, 5, 1.5])("recusa folga inválida %s", (slackBusinessDays) =>
    expect(() =>
      computeDeadline({
        noticeDate: "2026-02-02",
        actType: "embargo",
        slackBusinessDays,
      }),
    ).toThrow(),
  );
  it.each([1.5, 3661, -3661])("recusa contagem inválida %s", (days) =>
    expect(() => addBusinessDays("2026-02-02", days)).toThrow(),
  );
  it("recusa data impossível", () =>
    expect(() => isBusinessDay("2026-02-30")).toThrow());
  it.each([
    { start: "2026-02-30", end: "2026-03-01", reason: "teste" },
    { start: "2026-03-02", end: "2026-03-01", reason: "teste" },
    { start: "2026-03-01", end: "2026-03-02", reason: " " },
    { start: "2026-03-01", end: "erro", reason: "teste" },
  ])("recusa suspensão inválida %j", (suspension) =>
    expect(() =>
      isBusinessDay("2026-02-02", { suspensions: [suspension] }),
    ).toThrow(),
  );
});
