import { createInterface } from "node:readline";
import {
  financialJourneyFixture,
  financialScenarios,
  type FinancialScenario,
} from "./financial-journey-helper";

// Processo local mantém um único lease durante os cliques no navegador.
// A saída contém somente IDs e estados fictícios; nunca o ambiente ou erros RPC.
const prefix = "ANDRE_FINANCIAL_JOURNEY ";
const reply = (id: string, data: unknown, ok = true) =>
  process.stdout.write(prefix + JSON.stringify({ id, ok, data }) + "\n");
async function run() {
  let fixture: Awaited<ReturnType<typeof financialJourneyFixture>> | undefined;
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = () =>
    (cleanupPromise ??= fixture ? fixture.cleanup() : Promise.resolve());
  const input = createInterface({ input: process.stdin });
  process.on("SIGTERM", () => input.close());
  process.on("SIGINT", () => input.close());
  try {
    const method = process.env.ANDRE_INVOICE_METHOD ?? "PIX";
    if (!["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"].includes(method))
      throw new Error("Meio fictício inválido.");
    fixture = await financialJourneyFixture(method);
    reply("ready", {
      processId: fixture.sample.process_id,
      orderId: fixture.sample.order_id,
      quoteId: fixture.sample.id,
      code: fixture.orderCode,
      clientId: fixture.owner.id,
      calculatorId: fixture.calculator.id,
      chargeId: fixture.chargeId,
      intentId: fixture.intentId,
      contracted: fixture.contracted,
    });
    for await (const line of input) {
      let id = "invalid";
      try {
        const message: unknown = JSON.parse(line);
        if (!message || typeof message !== "object") throw new Error();
        const command = message as Record<string, unknown>;
        if (typeof command.id !== "string" || !/^\d+$/.test(command.id))
          throw new Error();
        id = command.id;
        let data: unknown;
        switch (command.action) {
          case "observe":
            if (
              !financialScenarios.includes(
                command.scenario as FinancialScenario,
              )
            )
              throw new Error();
            data = await fixture.observe(command.scenario as FinancialScenario);
            break;
          case "apply":
            data = await fixture.apply();
            break;
          case "origin":
            data = await fixture.createOrigin();
            break;
          case "bind":
            data = await fixture.bind();
            break;
          case "resolve":
            data = await fixture.resolve();
            break;
          case "view":
            data = fixture.view();
            break;
          case "receipts":
            data = fixture.receipts();
            break;
          case "replay":
            data = await fixture.replay();
            break;
          case "prepareDelivery": {
            // Pré-condição técnica sintética para testar a apresentação do saldo.
            // A política permanece sem aprovação e é escolhida na UI fictícia.
            await fixture.deliver(fixture.sample);
            const delivery = await fixture.db
              .from("deliveries")
              .select("id")
              .eq("order_id", fixture.sample.order_id)
              .single();
            if (delivery.error || !delivery.data) throw new Error();
            data = delivery.data.id;
            break;
          }
          case "createZeroOrder": {
            const sample = await fixture.create({ zero: true });
            data = { orderId: sample.order_id, processId: sample.process_id };
            break;
          }
          case "close":
            await cleanup();
            reply(id, "closed");
            input.close();
            break;
          default:
            throw new Error();
        }
        if (command.action === "close") break;
        reply(id, data);
      } catch {
        reply(id, "Comando fictício não concluído.", false);
      }
    }
  } catch {
    reply("ready", "Jornada fictícia não iniciada.", false);
    process.exitCode = 1;
  } finally {
    input.close();
    try {
      await cleanup();
    } catch {
      reply("cleanup", "Limpeza fictícia não concluída.", false);
      process.exitCode = 1;
    }
  }
  // A limpeza já terminou. Encerrar também os sockets ociosos do SDK local.
  await new Promise<void>((resolve) =>
    process.stdout.write("", () => resolve()),
  );
  process.exit(process.exitCode ?? 0);
}
void run();
