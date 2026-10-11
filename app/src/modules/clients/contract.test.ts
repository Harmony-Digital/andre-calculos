import { expect, it } from "vitest";
import { parseClientContract } from "./contract";
const valid = () => {
  const form = new FormData();
  form.set("clientId", "00000000-0000-4000-8000-000000000001");
  form.set("requestId", "00000000-0000-4000-8000-000000000002");
  form.set("hasContract", "yes");
  form.set("revision", "0");
  form.set("reason", "  Contrato fictício.  ");
  return form;
};
it("revisão obrigatória não presume zero quando o formulário perde o campo", () => {
  const form = valid();
  for (const value of ["", "-1", "1.5", "Infinity", "2147483647"]) {
    form.set("revision", value);
    expect(parseClientContract(form).success).toBe(false);
  }
  form.delete("revision");
  expect(parseClientContract(form).success).toBe(false);
});
it("condição explícita e motivo real são necessários", () => {
  const form = valid();
  form.set("hasContract", "true");
  expect(parseClientContract(form).success).toBe(false);
  form.set("hasContract", "yes");
  for (const value of ["\n\t\r", "\u00a0\u00a0\u00a0", "a".repeat(1001)]) {
    form.set("reason", value);
    expect(parseClientContract(form).success).toBe(false);
  }
});
it("preserva cliente, intenção e revisão; normaliza apenas motivo e condição", () => {
  expect(parseClientContract(valid()).data).toEqual({
    clientId: "00000000-0000-4000-8000-000000000001",
    requestId: "00000000-0000-4000-8000-000000000002",
    hasContract: true,
    revision: 0,
    reason: "Contrato fictício.",
  });
});
