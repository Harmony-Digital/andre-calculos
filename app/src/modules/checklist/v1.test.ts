import { describe, expect, it } from "vitest";
import { checklistLaborV1, checklistSteps } from "./v1";
import { fictionalChecklist } from "./fixtures";
describe("checklist versão 1", () => {
  it("aceita cenário fictício completo", () =>
    expect(checklistLaborV1.safeParse(fictionalChecklist).success).toBe(true));
  it("possui nove etapas e mantém versão no payload", () => {
    expect(checklistSteps).toHaveLength(9);
    expect(checklistLaborV1.parse(fictionalChecklist).schemaVersion).toBe(1);
  });
  it.each([
    { schemaVersion: 2 },
    { processNumber: "123" },
    { tribunal: 1 },
    { court: "" },
    { claimants: 0 },
    { claimants: 1.5 },
    { wageItems: [] },
    { wageItems: ["severance", "severance"] },
    { documents: ["sentence", "sentence"] },
    { admissionDate: "2026-02-30" },
    { dismissalDate: "2019-01-01" },
    { baseDate: "2019-01-01" },
    { timecardFormat: "handwritten" },
    { timecardFormat: "image" },
    { wageItems: ["other"], otherWages: "" },
    { correctionRule: "other", correctionDetails: "" },
    { instructions: "a".repeat(4001) },
    { deadlineDays: 0 },
  ])("rejeita respostas inválidas %j", (override) =>
    expect(
      checklistLaborV1.safeParse({ ...fictionalChecklist, ...override })
        .success,
    ).toBe(false),
  );
  it("aceita contrato ativo sem demissão", () =>
    expect(
      checklistLaborV1.safeParse({ ...fictionalChecklist, dismissalDate: "" })
        .success,
    ).toBe(true));
  it("aceita estimativa de cartões em meses ou páginas", () => {
    expect(
      checklistLaborV1.safeParse({
        ...fictionalChecklist,
        timecardFormat: "image",
        timecardMonths: 1,
      }).success,
    ).toBe(true);
    expect(
      checklistLaborV1.safeParse({
        ...fictionalChecklist,
        timecardFormat: "handwritten",
        timecardPages: 4,
      }).success,
    ).toBe(true);
  });
  it("aceita detalhes explícitos", () =>
    expect(
      checklistLaborV1.safeParse({
        ...fictionalChecklist,
        wageItems: ["other"],
        otherWages: "Verba de teste",
        correctionRule: "other",
        correctionDetails: "Regra da decisão de teste",
      }).success,
    ).toBe(true));
});
