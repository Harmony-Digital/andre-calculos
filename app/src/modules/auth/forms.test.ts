import { describe, expect, it } from "vitest";
import {
  emailSchema,
  loginSchema,
  newPasswordSchema,
  safeReturnPath,
} from "./forms";
describe("formulários de acesso", () => {
  it("normaliza e-mail sem alterar a senha", () => {
    expect(
      loginSchema.parse({
        email: "CLIENTEA@exemplo.com",
        password: " senha com espaços ",
      }),
    ).toEqual({
      email: "clientea@exemplo.com",
      password: " senha com espaços ",
    });
  });
  it("rejeita campos inválidos e limita o tamanho", () => {
    expect(emailSchema.safeParse({ email: "inválido" }).success).toBe(false);
    expect(
      loginSchema.safeParse({ email: "a@exemplo.com", password: "" }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({
        email: "a@exemplo.com",
        password: "a".repeat(257),
      }).success,
    ).toBe(false);
  });
  it("exige confirmação e comprimento na senha nova", () => {
    expect(
      newPasswordSchema.safeParse({
        password: "a".repeat(12),
        confirmation: "b".repeat(12),
      }).success,
    ).toBe(false);
    expect(
      newPasswordSchema.safeParse({ password: "curta", confirmation: "curta" })
        .success,
    ).toBe(false);
    expect(
      newPasswordSchema.parse({
        password: "a".repeat(12),
        confirmation: "a".repeat(12),
      }).password,
    ).toHaveLength(12);
  });
  it.each([
    "https://exemplo.com",
    "//exemplo.com",
    "/\\exemplo.com",
    "/app/../exemplo",
    "/app/%2f%2fexemplo",
    "/painel-falso",
    null,
    "/app\n",
  ])("recusa retorno externo ou ambíguo: %s", (value) =>
    expect(safeReturnPath(value)).toBe("/app"),
  );
  it("aceita só as áreas autenticadas", () => {
    expect(safeReturnPath("/app/novo-pedido")).toBe("/app/novo-pedido");
    expect(safeReturnPath("/painel/fila")).toBe("/painel/fila");
  });
});
