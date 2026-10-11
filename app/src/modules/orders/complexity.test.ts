import { describe, expect, it } from "vitest";
import { classifyComplexity, defaultComplexitySettings } from "./complexity";
const simple = {
  wageItems: ["severance"],
  timecardFormat: "none" as const,
  claimants: 1,
  processPages: 1000,
};
describe("complexidade", () => {
  it("classifica rescisórias sem jornada como simples", () =>
    expect(classifyComplexity(simple).level).toBe("simple"));
  it("classifica jornada digital como média", () =>
    expect(
      classifyComplexity({ ...simple, timecardFormat: "digital" }).level,
    ).toBe("medium"));
  it.each([
    { timecardFormat: "handwritten" as const },
    { timecardFormat: "image" as const },
    { claimants: 2 },
    { wageItems: ["a", "b", "c", "d", "e", "f"] },
    { processPages: 1001 },
  ])("classifica cada fator de alta complexidade: %j", (overrides) =>
    expect(classifyComplexity({ ...simple, ...overrides }).level).toBe("high"),
  );
  it("não conta verba duplicada como adicional de complexidade", () =>
    expect(
      classifyComplexity({ ...simple, wageItems: Array(6).fill("severance") })
        .level,
    ).toBe("medium"));
  it("preserva todos os motivos", () =>
    expect(
      classifyComplexity({
        ...simple,
        claimants: 3,
        processPages: 2000,
        timecardFormat: "image",
        wageItems: ["a", "b", "c", "d", "e", "f"],
      }).reasons,
    ).toHaveLength(4));
  it("permite limites configuráveis", () =>
    expect(
      classifyComplexity(
        { ...simple, processPages: 200 },
        { ...defaultComplexitySettings, pageThreshold: 100 },
      ).level,
    ).toBe("high"));
  it.each([{ claimants: 0 }, { processPages: -1 }, { processPages: 1.5 }])(
    "recusa quantidades inválidas %j",
    (data) =>
      expect(() => classifyComplexity({ ...simple, ...data })).toThrow(),
  );
  it("recusa configuração inválida", () =>
    expect(() =>
      classifyComplexity(simple, {
        ...defaultComplexitySettings,
        wageThreshold: 0,
      }),
    ).toThrow());
});
