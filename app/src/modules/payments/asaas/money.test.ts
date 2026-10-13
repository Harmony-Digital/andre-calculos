import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseAsaasJson, JsonNumber } from "./json";
import { centsToken, providerCents } from "./money";
import { AsaasContractError } from "./errors";

it.each([
  ["0", 0],
  ["0.0", 0],
  ["0.01", 1],
  ["0.1", 10],
  ["1", 100],
  ["1.10", 110],
  ["125.01", 12501],
  ["90071992547409.91", Number.MAX_SAFE_INTEGER],
])("converte moeda lexical %s sem arredondamento", (raw, expected) => {
  expect(providerCents(parseAsaasJson(String(raw)))).toBe(expected);
});
it.each([
  "1e2",
  "1E-2",
  "0.001",
  "1.230",
  "0.10000000000000001",
  "0.30000000000000004",
  "-0",
  "-0.00",
  "-1.00",
  "90071992547409.92",
  "90071992547410",
  "99999999999999999999999999999999",
])("recusa moeda ambígua/negativa/fora do limite %s", (raw) => {
  expect(() => providerCents(parseAsaasJson(raw))).toThrow(AsaasContractError);
});
it.each([125.01, 0.1 + 0.2, "125.01", null, undefined, { source: "1.25" }])(
  "não aceita valor já convertido ou token falsificado",
  (input) => {
    expect(() => providerCents(input)).toThrow(
      "Valor do provedor indisponível para conciliação.",
    );
  },
);
it("permite sinal negativo apenas no campo explicitamente assinado", () => {
  expect(providerCents(parseAsaasJson("-0.99"), { signed: true })).toBe(-99);
  expect(
    providerCents(parseAsaasJson("-90071992547409.91"), { signed: true }),
  ).toBe(-Number.MAX_SAFE_INTEGER);
  expect(() =>
    providerCents(parseAsaasJson("-0.00"), { signed: true }),
  ).toThrow(AsaasContractError);
});
it("recusa token interno inválido ou grande antes de BigInt", () => {
  expect(() => providerCents(new JsonNumber("9".repeat(100000)))).toThrow(
    AsaasContractError,
  );
  expect(() => providerCents(new JsonNumber("não-monetário"))).toThrow(
    AsaasContractError,
  );
});
it.each([0, 1, 10, 12501, 19999, Number.MAX_SAFE_INTEGER])(
  "serializa centavos %s como número JSON exato",
  (amount) => {
    const token = centsToken(amount);
    const wire = parseAsaasJson('{"value":' + token + "}") as {
      value: unknown;
    };
    expect(providerCents(wire.value)).toBe(amount);
    expect(token).toMatch(/^(0|[1-9]\d*)\.\d{2}$/);
  },
);
it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "recusa centavos de saída inválidos",
  (amount) => {
    expect(() => centsToken(amount)).toThrow(AsaasContractError);
  },
);
