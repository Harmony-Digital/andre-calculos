import { it, expect } from "vitest";
import { signupSchema } from "./forms";
const input = {
  fullName: "Cadastro fictício",
  email: "teste@exemplo.com",
  phone: "61999999999",
  oabNumber: "123A",
  oabState: "DF",
  city: "Cidade fictícia",
  legalName: "Empresa fictícia",
  kind: "company",
  document: "12.ABC.345/01DE-35",
  password: "SomenteTeste123!",
  confirmation: "SomenteTeste123!",
  accepted: "yes",
  termsVersion: "fixture-termos-v1",
  privacyVersion: "fixture-privacidade-v1",
};
it("aceita novo CNPJ alfanumérico e CPF com dados normalizados", () => {
  expect(signupSchema.parse(input).document).toBe("12ABC34501DE35");
  expect(
    signupSchema.safeParse({
      ...input,
      kind: "person",
      document: "00000000191",
    }).success,
  ).toBe(true);
});
it("exige documento correto, aceite e confirmação da senha", () => {
  for (const change of [
    { document: "12ABC34501DE34" },
    { kind: "person" },
    { accepted: "" },
    { confirmation: "outra senha" },
    { password: "curta" },
    { email: "inválido" },
  ])
    expect(signupSchema.safeParse({ ...input, ...change }).success).toBe(false);
});
