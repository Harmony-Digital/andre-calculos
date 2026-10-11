import { describe, expect, it } from "vitest";
import { isValidLaborCnj, parseLaborCnj } from "./cnj";

describe("numeração CNJ trabalhista", () => {
  it("aceita número fictício com e sem máscara e identifica o TRT", () => {
    expect(parseLaborCnj("9999999-06.2026.5.10.9999")).toMatchObject({
      tribunal: 10,
      year: 2026,
    });
    expect(isValidLaborCnj("99999990620265109999")).toBe(true);
  });
  it.each([
    "9999999-04.2026.5.10.9999",
    "abc9999999-06.2026.5.10.9999",
    "9999999-06.2026.8.10.9999",
    "",
    "9999999-06.2026.5.25.9999",
    "9999999-06.1800.5.10.9999",
    "9999999--03.2026.5.10.9999",
  ])("recusa entrada inválida %s", (number) =>
    expect(isValidLaborCnj(number)).toBe(false),
  );
  it("não transforma entrada com letras em número válido", () =>
    expect(parseLaborCnj("99999990620265109999x")).toBeNull());
});
