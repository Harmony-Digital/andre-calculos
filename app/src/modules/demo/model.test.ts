import { describe, expect, it } from "vitest";
import {
  buildDemoQuote,
  createDemoOrder,
  initialDemoState,
  newDemoAnswers,
  restoreDemoState,
  transitionDemo,
} from "./model";

const order = () =>
  createDemoOrder(newDemoAnswers(), "DEMO-1", "Processo fictício");
describe("demonstração isolada", () => {
  it("discrimina os valores em centavos e preserva o snapshot", () => {
    const answers = newDemoAnswers();
    const proposal = createDemoOrder(answers, "DEMO-1", "Fictício");
    answers.wageItems.push("interval");
    expect(proposal.quote.totalCents).toBe(65000);
    expect(proposal.quote.depositCents).toBe(32500);
    expect(proposal.quote.balanceCents).toBe(32500);
    expect(proposal.answers.wageItems).toHaveLength(3);
    expect(
      proposal.quote.items.reduce((sum, item) => sum + item.amountCents, 0),
    ).toBe(proposal.quote.totalCents);
  });
  it("cobra adicionais e urgência sem presumir a unidade de cartões", () => {
    const answers = {
      ...newDemoAnswers(),
      timecardFormat: "image",
      timecardMonths: 2,
      timecardPages: 8,
      urgency: true,
    };
    expect(buildDemoQuote(answers).totalCents).toBe(93600);
    expect(() => buildDemoQuote({ ...answers, timecardMonths: 0 })).toThrow(
      "meses de cartões",
    );
  });
  it("não emite checklist inválido ou período presumido", () => {
    expect(() =>
      buildDemoQuote({ ...newDemoAnswers(), processNumber: "inválido" }),
    ).toThrow();
    expect(() =>
      buildDemoQuote({ ...newDemoAnswers(), wageItems: [] }),
    ).toThrow();
    expect(() =>
      buildDemoQuote({ ...newDemoAnswers(), dismissalDate: "" }),
    ).toThrow("demissão fictícia");
  });
  it("respeita entrega, limite interno e folga, e recusa prazo insuficiente", () => {
    const quote = buildDemoQuote(newDemoAnswers());
    expect(quote.deliveryDate).toBe("2026-10-20");
    expect(quote.deliveryDate <= quote.internalDueDate).toBe(true);
    expect(quote.internalDueDate < quote.dueDate).toBe(true);
    expect(() =>
      buildDemoQuote({ ...newDemoAnswers(), deadlineDays: 3 }),
    ).toThrow("não comporta");
  });
  it("recusa sinal e trabalho antes do aceite", () => {
    expect(() => transitionDemo(order(), "deposit")).toThrow("aceite");
    expect(() => transitionDemo(order(), "advance")).toThrow("fila");
  });
  it("exige documento mesmo com aceite e sinal, sem duplicar eventos", () => {
    const accepted = transitionDemo(order(), "accept");
    expect(transitionDemo(accepted, "accept")).toBe(accepted);
    const paid = transitionDemo(accepted, "deposit");
    expect(paid.stage).toBe("awaiting_payment");
    expect(transitionDemo(paid, "deposit")).toBe(paid);
    expect(() => transitionDemo(paid, "advance")).toThrow("fila");
    const queued = transitionDemo(paid, "document");
    expect(queued.stage).toBe("queued");
    expect(transitionDemo(queued, "document")).toBe(queued);
  });
  it("exige sinal mesmo com documento e percorre análise, cálculo e revisão antes da entrega", () => {
    let current = transitionDemo(transitionDemo(order(), "document"), "accept");
    expect(current.stage).toBe("awaiting_payment");
    current = transitionDemo(current, "deposit");
    for (const stage of [
      "in_analysis",
      "in_calculation",
      "in_review",
      "delivered",
    ]) {
      current = transitionDemo(current, "advance");
      expect(current.stage).toBe(stage);
    }
    expect(current.events.at(-1)?.detail).toContain(
      "Revisão e assinatura fictícias",
    );
    expect(transitionDemo(current, "advance")).toBe(current);
    expect(current.quote).toEqual(order().quote);
  });
  it("restaura exemplos e recalcula valores adulterados sem confiar no armazenamento", () => {
    const initial = initialDemoState();
    expect(restoreDemoState(JSON.parse(JSON.stringify(initial)))).toEqual(
      initial,
    );
    const forged = structuredClone(initial);
    forged.orders[0].quote.totalCents = 1;
    expect(restoreDemoState(forged).orders[0].quote.totalCents).toBe(65000);
    forged.orders[0].deposit = false;
    expect(() => restoreDemoState(forged)).toThrow("inconsistente");
    expect(() => restoreDemoState({ version: 2, orders: [] })).toThrow();
  });
});
