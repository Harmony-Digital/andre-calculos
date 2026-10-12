import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { JsonNumber, parseAsaasJson } from "./json";
import { AsaasContractError } from "./errors";

it("preserva o decimal que JSON.parse arredondaria", () => {
  const data = parseAsaasJson(
    '{"value":0.10000000000000001,"id":"00001"}',
  ) as Record<string, unknown>;
  expect(data.value).toBeInstanceOf(JsonNumber);
  expect((data.value as JsonNumber).source).toBe("0.10000000000000001");
  expect(Object.isFrozen(data.value)).toBe(true);
  expect(data.id).toBe("00001");
});
it("interpreta estruturas e escapes sem transformar strings numéricas", () => {
  const data = parseAsaasJson(
    ' {"a":[true,false,null,"1.20","a\\\"b","\\u00e1",{"n":1e2}]} ',
  );
  expect(data).toEqual({
    a: [true, false, null, "1.20", 'a"b', "á", { n: new JsonNumber("1e2") }],
  });
});
it("objetos não herdam protótipo nem permitem poluição", () => {
  const data = parseAsaasJson(
    '{"__proto__":{"polluted":true},"constructor":false}',
  ) as object;
  expect(Object.getPrototypeOf(data)).toBeNull();
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(Object.keys(data)).toEqual(["__proto__", "constructor"]);
});
it.each([
  "",
  " ",
  "[1,]",
  '{"a":1,}',
  "{a:1}",
  "[true false]",
  "01",
  "+1",
  ".1",
  "1.",
  "NaN",
  "Infinity",
  '"unterminated',
  '"\\x01"',
  '"\n"',
  "{}[]",
  "truex",
  '{"a":1,"a":2}',
  '{"a":1,"\\u0061":2}',
  '{"nested":{"value":1,"value":2}}',
])("recusa JSON inválido/ambíguo sem ecoar entrada (%s)", (text) => {
  expect(() => parseAsaasJson(text)).toThrow(AsaasContractError);
  expect(() => parseAsaasJson(text)).toThrow(
    "Resposta do provedor em formato indisponível.",
  );
});
it("limita tamanho em bytes, inclusive texto multibyte", () => {
  expect(() => parseAsaasJson('"' + "a".repeat(1024 * 1024) + '"')).toThrow(
    AsaasContractError,
  );
  expect(() => parseAsaasJson('"' + "á".repeat(524288) + '"')).toThrow(
    AsaasContractError,
  );
});
it("limita profundidade e quantidade de elementos", () => {
  expect(() =>
    parseAsaasJson("[".repeat(32) + "0" + "]".repeat(32)),
  ).not.toThrow();
  expect(() => parseAsaasJson("[".repeat(33) + "0" + "]".repeat(33))).toThrow(
    AsaasContractError,
  );
  expect(
    parseAsaasJson("[" + Array(1000).fill("null").join(",") + "]"),
  ).toHaveLength(1000);
  expect(() =>
    parseAsaasJson("[" + Array(1001).fill("null").join(",") + "]"),
  ).toThrow(AsaasContractError);
});
it("limita nós também em objetos, não apenas arrays", () => {
  const text =
    "{" +
    Array.from({ length: 10000 }, (_, i) => `"k${i}":null`).join(",") +
    "}";
  expect(() => parseAsaasJson(text)).toThrow(AsaasContractError);
});
it("erro malicioso fica restrito ao código/mensagem", () => {
  try {
    parseAsaasJson('{"private":"conteudo-ficticio-reservado",');
    throw new Error("Deveria recusar");
  } catch (error) {
    expect(error).toBeInstanceOf(AsaasContractError);
    expect(String(error)).not.toContain("conteudo-ficticio-reservado");
    expect(JSON.stringify(error)).toBe(
      '{"code":"invalid_json","name":"AsaasContractError"}',
    );
    expect((error as Error).cause).toBeUndefined();
  }
});
