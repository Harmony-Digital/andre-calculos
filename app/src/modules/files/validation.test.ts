import { describe, expect, it } from "vitest";
import { uploadSchema, fileMime, maxFileBytes } from "./validation";
const valid = {
  processId: "00000000-0000-4000-8000-000000000101",
  name: "arquivo fictício.pdf",
  mime: "application/pdf",
  size: 100,
  sha256: "a".repeat(64),
};
describe("validação de arquivos", () => {
  it("aceita um PDF e reconhece PJC e CSV sem MIME do navegador", () => {
    expect(uploadSchema.parse(valid).folder).toBe("case");
    expect(fileMime({ name: "teste.PJC", type: "" })).toBe(
      "application/octet-stream",
    );
    expect(
      fileMime({ name: "teste.csv", type: "application/vnd.ms-excel" }),
    ).toBe("text/csv");
  });
  it.each([0, maxFileBytes + 1, 1.5])("recusa tamanho inválido: %s", (size) =>
    expect(uploadSchema.safeParse({ ...valid, size }).success).toBe(false),
  );
  it.each(["../teste.pdf", "pasta\\teste.pdf", "teste\n.pdf", "teste.exe"])(
    "recusa nome: %s",
    (name) =>
      expect(uploadSchema.safeParse({ ...valid, name }).success).toBe(false),
  );
  it("recusa MIME incompatível e hash inválido", () => {
    expect(uploadSchema.safeParse({ ...valid, mime: "text/csv" }).success).toBe(
      false,
    );
    expect(
      uploadSchema.safeParse({ ...valid, sha256: "segredo" }).success,
    ).toBe(false);
  });
});
