import { describe, expect, it } from "vitest";
import { rejectionIntentSchema, rejectionReceiptSchema } from "./rejection";
import { transition, type Order } from "@/modules/orders/state-machine";
import { eventLabel } from "@/modules/timeline/types";
const input = {
  quoteId: "00000000-0000-4000-8000-000000000001",
  requestId: "00000000-0000-4000-8000-000000000002",
  contextHash: "a".repeat(64),
  revision: 1,
  confirmed: true,
};
const order: Order = {
  state: "quoted",
  clientOwnerId: "owner",
  quoteAccepted: false,
  depositConfirmed: false,
  hasContract: true,
  minimumDocumentPresent: true,
  calculatorReviewed: false,
  deliveryComplete: false,
  balanceConfirmed: false,
};
describe("recusa de proposta", () => {
  it("motivo é opcional, aparado e limitado", () => {
    expect(rejectionIntentSchema.parse(input).reason).toBe("");
    expect(
      rejectionIntentSchema.parse({
        ...input,
        reason: " \nMotivo sintético\u00a0 ",
      }).reason,
    ).toBe("Motivo sintético");
    expect(
      rejectionIntentSchema.safeParse({ ...input, reason: "x".repeat(501) })
        .success,
    ).toBe(false);
  });
  it.each([
    { confirmed: false },
    { revision: -1 },
    { revision: 0.1 },
    { revision: 2147483647 },
    { contextHash: "A".repeat(64) },
    { quoteId: "invalid" },
    { requestId: "invalid" },
    { actor: "owner" },
    { ip_address: "192.0.2.44" },
    { reason: null },
  ])("recusa intenção inválida %j", (patch) =>
    expect(
      rejectionIntentSchema.safeParse({ ...input, ...patch }).success,
    ).toBe(false),
  );
  it("só o proprietário recusa antes de aceite e pagamento", () => {
    const next = transition(order, "reject_quote", {
      id: "owner",
      role: "client",
    });
    expect(next).toMatchObject({
      ...order,
      state: "cancelled",
      quoteRejected: true,
    });
    expect(order.state).toBe("quoted");
    for (const facts of [
      { quoteAccepted: true },
      { quoteRejected: true },
      { depositConfirmed: true },
      { paymentPresent: true },
    ])
      expect(() =>
        transition({ ...order, ...facts }, "reject_quote", {
          id: "owner",
          role: "client",
        }),
      ).toThrow(/decisão ou pagamento/);
    expect(() =>
      transition(order, "reject_quote", { id: "other", role: "client" }),
    ).toThrow(/acesso/);
    for (const role of ["admin", "calculator", "system"] as const)
      expect(() =>
        transition(order, "reject_quote", { id: "owner", role }),
      ).toThrow(/papel/);
    expect(() =>
      transition({ ...order, state: "queued" }, "reject_quote", {
        id: "owner",
        role: "client",
      }),
    ).toThrow(/disponível/);
    expect(() =>
      transition({ ...order, quoteRejected: true }, "accept_quote", {
        id: "owner",
        role: "client",
      }),
    ).toThrow(/recusada/);
  });
  it("recibo exige revisão consecutiva e timeline identifica a decisão", () => {
    const receipt = {
      quoteId: input.quoteId,
      orderId: input.quoteId,
      processId: input.quoteId,
      number: "ORC-2026-0001",
      contextHash: input.contextHash,
      reason: "",
      expectedRevision: 1,
      revision: 2,
      rejectedAt: "2026-10-11T18:00:00Z",
      status: "cancelled",
    };
    expect(rejectionReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(
      rejectionReceiptSchema.safeParse({ ...receipt, revision: 3 }).success,
    ).toBe(false);
    expect(
      eventLabel("status_changed", {
        operation: "reject_quote",
        from: "quoted",
        to: "cancelled",
      }),
    ).toBe("Proposta recusada");
  });
});
