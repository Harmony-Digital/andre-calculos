import { describe, expect, it } from "vitest";
import {
  allowedOrderEvents,
  orderStateLabels,
  orderStates,
  transition,
  type Order,
  type OrderEvent,
  type OrderState,
  type Actor,
} from "./state-machine";
const base: Order = {
  state: "draft",
  clientOwnerId: "client-a",
  quoteAccepted: true,
  depositConfirmed: true,
  hasContract: false,
  minimumDocumentPresent: true,
  calculatorReviewed: true,
  deliveryComplete: true,
  balanceConfirmed: true,
};
const calculator: Actor = { id: "calculator", role: "calculator" },
  client: Actor = { id: "client-a", role: "client" },
  admin: Actor = { id: "admin", role: "admin" };
const valid: [OrderState, OrderEvent, OrderState, Actor][] = [
  ["draft", "request_triage", "awaiting_triage", client],
  ["awaiting_triage", "start_triage", "in_triage", calculator],
  ["in_triage", "create_quote", "quoted", calculator],
  ["draft", "create_quote", "quoted", { id: "server", role: "system" }],
  ["quoted", "accept_quote", "awaiting_payment", client],
  ["quoted", "reject_quote", "cancelled", client],
  ["awaiting_payment", "queue", "queued", admin],
  ["queued", "start_analysis", "in_analysis", calculator],
  ["in_analysis", "request_information", "awaiting_client", calculator],
  ["awaiting_client", "receive_information", "in_analysis", calculator],
  ["in_analysis", "start_calculation", "in_calculation", calculator],
  ["in_calculation", "submit_review", "in_review", calculator],
  ["in_review", "return_calculation", "in_calculation", calculator],
  ["in_review", "deliver", "delivered", calculator],
  ["delivered", "complete", "completed", client],
  ["completed", "request_adjustment", "in_adjustment", client],
  ["in_adjustment", "submit_review", "in_review", calculator],
  ["quoted", "cancel", "cancelled", client],
  ["cancelled", "confirm_refund", "refunded", admin],
];
describe("estados do pedido", () => {
  it.each(valid)("permite %s + %s → %s", (state, event, target, actor) =>
    expect(
      transition(
        {
          ...base,
          state,
          ...(event === "reject_quote"
            ? { quoteAccepted: false, depositConfirmed: false }
            : {}),
          ...(state === "awaiting_client"
            ? { resumeState: "in_analysis" as const }
            : {}),
        },
        event,
        actor,
      ).state,
    ).toBe(target),
  );
  it("cobre todos os eventos e rótulos", () => {
    expect(new Set(valid.map((v) => v[1])).size).toBe(
      allowedOrderEvents.length,
    );
    expect(Object.keys(orderStateLabels)).toEqual([...orderStates]);
  });
  it("só enfileira com aceite e sinal ou contrato", () => {
    for (const facts of [
      { quoteAccepted: false },
      { depositConfirmed: false },
      { minimumDocumentPresent: false },
    ])
      expect(() =>
        transition(
          { ...base, state: "awaiting_payment", ...facts },
          "queue",
          admin,
        ),
      ).toThrow(/sinal/);
    expect(
      transition(
        {
          ...base,
          state: "quoted",
          quoteAccepted: true,
          depositConfirmed: false,
          hasContract: true,
        },
        "queue",
        admin,
      ).state,
    ).toBe("queued");
    expect(() =>
      transition(
        { ...base, state: "quoted", hasContract: true, quoteAccepted: false },
        "queue",
        admin,
      ),
    ).toThrow(/aceite/);
  });
  it.each([true, false])(
    "contrato dispensa sinal e respeita documento mínimo: %s",
    (minimumDocumentPresent) => {
      expect(
        transition(
          {
            ...base,
            state: "quoted",
            hasContract: true,
            depositConfirmed: false,
            minimumDocumentPresent,
          },
          "accept_quote",
          client,
        ).state,
      ).toBe(minimumDocumentPresent ? "queued" : "awaiting_documents");
    },
  );
  it.each([{ calculatorReviewed: false }, { deliveryComplete: false }])(
    "não entrega sem requisito %j",
    (facts) =>
      expect(() =>
        transition(
          { ...base, state: "in_review", ...facts },
          "deliver",
          calculator,
        ),
      ).toThrow(/revisão/),
  );
  it("confirma o trabalho revisado sem confundir saldo com liberação do download", () =>
    expect(
      transition(
        {
          ...base,
          state: "in_review",
          balanceConfirmed: false,
          hasContract: false,
        },
        "deliver",
        calculator,
      ).state,
    ).toBe("delivered"));
  it("admin financeiro não inicia análise nem entrega", () => {
    expect(() =>
      transition({ ...base, state: "queued" }, "start_analysis", admin),
    ).toThrow(/papel/);
    expect(() =>
      transition({ ...base, state: "in_review" }, "deliver", admin),
    ).toThrow(/papel/);
  });
  it("cliente de outro pedido não age", () =>
    expect(() =>
      transition({ ...base, state: "quoted" }, "accept_quote", {
        ...client,
        id: "client-b",
      }),
    ).toThrow(/acesso/));
  it("ator vazio não age", () =>
    expect(() =>
      transition(base, "request_triage", { ...client, id: "" }),
    ).toThrow(/acesso/));
  it("não pula a fila", () =>
    expect(() => transition(base, "start_calculation", calculator)).toThrow(
      /disponível/,
    ));
  it("recusa evento desconhecido", () =>
    expect(() => transition(base, "invalid" as OrderEvent, calculator)).toThrow(
      /papel/,
    ));
  it("resume a etapa interrompida pelo pedido de informação", () => {
    const waiting = transition(
      { ...base, state: "in_calculation" },
      "request_information",
      calculator,
    );
    const resumed = transition(waiting, "receive_information", calculator);
    expect(resumed.state).toBe("in_calculation");
    expect(resumed.resumeState).toBeUndefined();
  });
  it("aceite fica registrado sem alterar o objeto original", () => {
    const original = {
      ...base,
      state: "quoted" as const,
      quoteAccepted: false,
    };
    expect(transition(original, "accept_quote", client).quoteAccepted).toBe(
      true,
    );
    expect(original.quoteAccepted).toBe(false);
  });
  it("ajuste invalida a revisão anterior", () =>
    expect(
      transition({ ...base, state: "delivered" }, "request_adjustment", client),
    ).toMatchObject({ calculatorReviewed: false, deliveryComplete: false }));
  it("não ajusta entrega que nunca foi revisada", () =>
    expect(() =>
      transition(
        { ...base, state: "delivered", calculatorReviewed: false },
        "request_adjustment",
        client,
      ),
    ).toThrow(/revisada/));
  it("não cancela pedido já entregue", () =>
    expect(() =>
      transition({ ...base, state: "delivered" }, "cancel", calculator),
    ).toThrow());
});
