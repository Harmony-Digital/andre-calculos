import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { decisionSchema, parseDecision } from "./forms";
import { isPremise, parameterLabel, sourceLabel, decisionDate } from "./types";
const input = () => ({
  processId: randomUUID(),
  requestId: randomUUID(),
  parameter: "interest",
  value: " \t1%\r\nLinha 2\u00a0",
  source: "judgment",
  page: "",
  rationale: "Justificativa fictícia.",
});
it("normaliza o texto e mantém página ausente como premissa", () => {
  const v = decisionSchema.parse(input());
  expect(v.value).toBe("1%\nLinha 2");
  expect(v.page).toBeNull();
  expect(isPremise(v.page, null)).toBe(true);
  expect(isPremise(1, null)).toBe(false);
  expect(isPremise(null, "2026-01-01T12:00:00Z")).toBe(false);
});
it("recusa parâmetros, páginas e corpos malformados", () => {
  for (const patch of [
    { parameter: "__proto__" },
    { source: "toString" },
    { page: "0" },
    { page: "-1" },
    { page: "1.5" },
    { page: "1e2" },
    { page: "100001" },
    { page: "12,13" },
    { value: "\u00a0\t" },
    { rationale: " " },
    { value: "a".repeat(1001) },
    { rationale: "a".repeat(2001) },
    { requestId: "inválido" },
    { processId: null },
  ])
    expect(decisionSchema.safeParse({ ...input(), ...patch }).success).toBe(
      false,
    );
  expect(decisionSchema.parse({ ...input(), page: "100000" }).page).toBe(
    100000,
  );
});
it("FormData não aceita um arquivo no lugar do texto", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries(input())) form.set(key, value);
  expect(parseDecision(form).success).toBe(true);
  form.set("value", new Blob(["texto"]));
  expect(parseDecision(form).success).toBe(false);
});
it("labels não expõem propriedades herdadas e datas usam São Paulo", () => {
  expect(parameterLabel("interest")).toBe("Juros");
  expect(parameterLabel("__proto__")).toBe("Outro");
  expect(sourceLabel("toString")).toBe("Origem não informada");
  expect(decisionDate("2026-01-02T02:00:00Z")).toBe("01/01/2026, 23:00");
});
