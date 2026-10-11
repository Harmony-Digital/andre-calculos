import { expect, it } from "vitest";
import { acceptanceIntentSchema } from "./acceptance";
import { acceptanceMetadata } from "./http-metadata";
const intent = {
  quoteId: "00000000-0000-4000-8000-000000000001",
  requestId: "00000000-0000-4000-8000-000000000002",
  contextHash: "a".repeat(64),
  confirmed: true,
};
it("aceite exige confirmação e hash do conteúdo; não admite ator ou preço do formulário", () => {
  expect(acceptanceIntentSchema.safeParse(intent).success).toBe(true);
  for (const patch of [
    { confirmed: false },
    { confirmed: undefined },
    { contextHash: "alterado" },
    { actor: "forjado" },
    { totalCents: 1 },
    { ipAddress: "192.0.2.8" },
  ])
    expect(
      acceptanceIntentSchema.safeParse({ ...intent, ...patch }).success,
    ).toBe(false);
});
it("registra o primeiro IP HTTP válido e nunca usa o próximo como fallback", () => {
  expect(
    acceptanceMetadata(
      new Headers({
        "x-forwarded-for": " 192.0.2.44, 203.0.113.1",
        "user-agent": "Agente de teste",
      }),
    ),
  ).toEqual({ ip: "192.0.2.44", userAgent: "Agente de teste" });
  expect(
    acceptanceMetadata(new Headers({ "x-forwarded-for": "2001:db8::4" }))?.ip,
  ).toBe("2001:db8::4");
  for (const value of [
    "",
    "desconhecido, 192.0.2.44",
    "192.0.2.1/24",
    "192.0.2.1:8080",
  ])
    expect(
      acceptanceMetadata(new Headers({ "x-forwarded-for": value })),
    ).toBeNull();
  expect(acceptanceMetadata(new Headers())).toBeNull();
});
it("limita user agent sem usar metadados como autorização", () => {
  const result = acceptanceMetadata({
    get: (name) =>
      name === "x-forwarded-for"
        ? "192.0.2.1"
        : "a\u0000\u007f" + "x".repeat(600),
  });
  expect(result?.userAgent).toHaveLength(512);
  expect(result?.userAgent).toMatch(/^a  x+$/);
});
