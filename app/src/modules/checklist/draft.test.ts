import { it, expect } from "vitest";
import { validateDraft, checklistDraftV1 } from "./draft";
import { emptyChecklist } from "./v1";
const partial = {
  ...emptyChecklist,
  processNumber: "9999999-06.2026.5.10.9999",
  court: "Unidade fictícia de teste",
};
it("salva identificação sem exigir datas futuras", () => {
  expect(validateDraft(partial, 0).data).toEqual(partial);
});
it("exige campos de todas as etapas já preenchidas", () => {
  expect(validateDraft(partial, 3).errors).toHaveProperty("admissionDate");
  expect(validateDraft(partial, 8).errors).toHaveProperty("wageItems");
});
it("confere TRT mesmo com datas ainda vazias", () => {
  expect(validateDraft({ ...partial, tribunal: 1 }, 0).errors).toHaveProperty(
    "tribunal",
  );
});
it("bloqueia versão desconhecida, tamanho e tipos indevidos", () => {
  for (const change of [
    { schemaVersion: 2 },
    { instructions: "x".repeat(4001) },
    { hasSentence: "false" },
    { claimants: 1.2 },
  ])
    expect(checklistDraftV1.safeParse({ ...partial, ...change }).success).toBe(
      false,
    );
});
it("descarta propriedades que poderiam mudar dinheiro ou estado", () => {
  const result = validateDraft(
    { ...partial, status: "queued", total_cents: 1, client_id: "outro" },
    0,
  );
  expect(result.data).not.toHaveProperty("status");
  expect(result.data).not.toHaveProperty("client_id");
});
it("limita etapas e valida vínculo temporal", () => {
  expect(validateDraft(partial, 9).data).toBeUndefined();
  expect(
    validateDraft(
      {
        ...partial,
        admissionDate: "2020-01-02",
        dismissalDate: "2019-01-01",
        filingDate: "2021-01-01",
        baseDate: "2022-01-01",
      },
      3,
    ).errors,
  ).toHaveProperty("dismissalDate");
});
