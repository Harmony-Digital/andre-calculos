import { describe, expect, it } from "vitest";
import { availableOperations, parseOperation } from "./operations";
import { transition, type Order } from "./state-machine";
const id = "d5b0de69-4b45-4a1f-a72c-bd4f4e4b929b";
function form(patch: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    processId: id,
    orderId: id,
    requestId: id,
    event: "start_analysis",
    expectedState: "queued",
    revision: "0",
    reason: "",
    ...patch,
  }))
    f.set(k, v);
  return f;
}
describe("comandos operacionais", () => {
  it.each(["request_information", "return_calculation"])(
    "exige motivo de %s",
    (event) => {
      expect(parseOperation(form({ event })).success).toBe(false);
      expect(
        parseOperation(form({ event, reason: "  Faltam dados fictícios  " }))
          .success,
      ).toBe(true);
    },
  );
  it.each(["", "-1", "1.0", "1e2", "2147483647"])(
    "rejeita revisão %s",
    (revision) =>
      expect(parseOperation(form({ revision })).success).toBe(false),
  );
  it("rejeita revisão ausente e evento comercial", () => {
    const f = form();
    f.delete("revision");
    expect(parseOperation(f).success).toBe(false);
    expect(parseOperation(form({ event: "deliver" })).success).toBe(false);
  });
  it("restringe operações pela máquina e nega retorno sem origem", () => {
    expect(availableOperations("queued")).toEqual(["start_analysis"]);
    expect(availableOperations("in_calculation")).toEqual([
      "submit_review",
      "request_information",
    ]);
    expect(availableOperations("awaiting_client")).toEqual([]);
    expect(availableOperations("awaiting_client", "in_review")).toEqual([
      "receive_information",
    ]);
    expect(availableOperations("delivered")).toEqual([]);
  });
  it("identidade de sessão é o proprietário, não a linha de clients", () => {
    const order: Order = {
      state: "quoted",
      clientOwnerId: "auth-user",
      quoteAccepted: false,
      depositConfirmed: false,
      hasContract: false,
      minimumDocumentPresent: false,
      calculatorReviewed: false,
      deliveryComplete: false,
      balanceConfirmed: false,
    };
    expect(
      transition(order, "accept_quote", { id: "auth-user", role: "client" })
        .state,
    ).toBe("awaiting_payment");
    expect(() =>
      transition(order, "accept_quote", { id: "client-row", role: "client" }),
    ).toThrow(/acesso/);
  });
});
