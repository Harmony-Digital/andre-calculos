import { it, expect } from "vitest";
import { profileSchema, parseProfile } from "./forms";
const profile = {
  fullName: "Advogada de teste",
  phone: "(61) 99999-9999",
  oabNumber: "12345",
  oabState: "DF",
  city: "Cidade fictícia",
  legalName: "Escritório fictício",
};
it("normaliza celular e permite OAB opcional", () => {
  expect(profileSchema.parse(profile).phone).toBe("+5561999999999");
  expect(
    profileSchema.safeParse({ ...profile, oabNumber: "", oabState: "" })
      .success,
  ).toBe(true);
});
it("não aceita OAB sem UF, celular inválido ou nome vazio", () => {
  for (const change of [
    { oabState: "" },
    { phone: "123" },
    { fullName: " " },
    { oabState: "XX" },
  ])
    expect(profileSchema.safeParse({ ...profile, ...change }).success).toBe(
      false,
    );
});
it("lê apenas os campos declarados", () => {
  const form = new FormData();
  Object.entries(profile).forEach(([key, value]) => form.set(key, value));
  form.set("role", "admin");
  expect(parseProfile(form).data).not.toHaveProperty("role");
});
