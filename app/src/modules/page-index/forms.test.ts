import { describe, expect, it } from "vitest";
import { normalizePages, parseIndexEntry, pieceLabel } from "./forms";
const id = "00000000-0000-4000-8000-000000000101";
function form(patch: Record<string, string | Blob | undefined> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    processId: id,
    fileId: id,
    entryId: id,
    requestId: id,
    operation: "create",
    revision: "0",
    piece: "judgment",
    pages: " 120 - 135 , 140 ",
    note: " \nObservação\r\n  fictícia\u00a0",
    ...patch,
  }))
    if (value !== undefined) data.set(key, value);
  return data;
}
describe("índice de páginas", () => {
  it("normaliza intervalos sem expandir nem trocar a ordem das referências", () => {
    expect(normalizePages(" 120 - 135 , 140 ")).toBe("120-135, 140");
    expect(normalizePages("100000, 1-100000")).toBe("100000, 1-100000");
    expect(pieceLabel("judgment")).toBe("Sentença");
    expect(pieceLabel("__proto__")).toBe("Peça");
    const parsed = parseIndexEntry(form());
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.operation !== "delete")
      expect(parsed.data.note).toBe("Observação\n  fictícia");
  });
  it("rejeita zero, invertido, Unicode, expoente e referências excessivas", () => {
    for (const value of [
      "",
      "0",
      "01",
      "4-3",
      "1-",
      "1,,2",
      "1.5",
      "1e3",
      "１２",
      "1–2",
      "100001",
      "1-100001",
      "1\n-2",
      Array(101).fill("1").join(","),
    ])
      expect(() => normalizePages(value)).toThrow();
  });
  it("exige identificadores, tipos, revisão e limites coerentes", () => {
    for (const patch of [
      { processId: "invalid" },
      { fileId: "" },
      { requestId: "" },
      { piece: "sentence" },
      { note: "a".repeat(2001) },
      { revision: "1" },
      { pages: new Blob() },
      { operation: "update", revision: "0" },
      { operation: "update", revision: "1.5" },
      { operation: "update", revision: "2147483647" },
    ])
      expect(parseIndexEntry(form(patch)).success).toBe(false);
    expect(
      parseIndexEntry(form({ operation: "update", revision: "2" })).success,
    ).toBe(true);
  });
  it("remoção exige confirmação explícita e revisão positiva", () => {
    expect(
      parseIndexEntry(form({ operation: "delete", revision: "2" })).success,
    ).toBe(false);
    expect(
      parseIndexEntry(
        form({ operation: "delete", revision: "2", agreed: "yes" }),
      ).success,
    ).toBe(true);
  });
});
