import { describe, it, expect } from "vitest";
import { validCpf, validCnpj, normalizeDocument } from "./documents";
import { brazilMobile } from "./brazil";
describe("documentos brasileiros", () => {
  it("valida CPF com os dois dígitos", () => {
    expect(validCpf("000.000.001-91")).toBe(true);
    expect(validCpf("000.000.001-90")).toBe(false);
  });
  it.each([
    "",
    "11111111111",
    "00000000000",
    "0000000019",
    "000000001911",
    "0000000019A",
    "00000000191<script>",
  ])("rejeita CPF inválido %s", (value) => expect(validCpf(value)).toBe(false));
  it("mantém CNPJ numérico válido", () => {
    expect(validCnpj("00.000.000/0001-91")).toBe(true);
    expect(validCnpj("00.000.000/0001-90")).toBe(false);
  });
  it("segue o vetor alfanumérico da Receita, ASCII menos 48", () => {
    expect(validCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(validCnpj("12.abc.345/01de-35")).toBe(true);
    expect(normalizeDocument("12.abc.345/01de-35")).toBe("12ABC34501DE35");
  });
  it("rejeita letras Unicode que se transformariam em ASCII ao normalizar", () => {
    expect(validCnpj("12ABC345SSDE05")).toBe(true);
    expect(validCnpj("12ABC345ßDE05")).toBe(false);
    expect(normalizeDocument("12ABC345ßDE05")).toBe("12ABC345ßDE05");
  });
  it.each([
    "00000000000000",
    "AAAAAAAAAAAA00",
    "12ABC34501DE34",
    "12ABC34501DE3A",
    "12ABC34501DÉ35",
    "12ABC34501DE35x",
    "12 ABC34501DE35",
  ])("rejeita CNPJ inválido %s", (value) =>
    expect(validCnpj(value)).toBe(false),
  );
  it("converte celular com DDD para E.164", () => {
    expect(brazilMobile("(61) 99999-9999")).toBe("+5561999999999");
    expect(brazilMobile("+55 61 99999-9999")).toBe("+5561999999999");
  });
  it.each([
    "+1 61999999999",
    "+61999999999",
    "61+99999-9999",
    "++5561999999999",
    "+55 6199999999",
    "20999999999",
    "6188888888",
    "61999999999<script>",
  ])("rejeita celular inválido %s", (value) =>
    expect(brazilMobile(value)).toBeNull(),
  );
});
