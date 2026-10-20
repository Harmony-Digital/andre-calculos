import { createInterface } from "node:readline";
import { balanceJourneyFixture } from "./balance-journey-helper";
const reply = (id: string, data: unknown, ok = true) =>
  process.stdout.write(
    "ANDRE_BALANCE_JOURNEY " + JSON.stringify({ id, data, ok }) + "\n",
  );
async function run() {
  let fixture: Awaited<ReturnType<typeof balanceJourneyFixture>> | undefined;
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = () =>
    (cleanupPromise ??= fixture ? fixture.cleanup() : Promise.resolve());
  const input = createInterface({ input: process.stdin });
  process.on("SIGTERM", () => input.close());
  process.on("SIGINT", () => input.close());
  try {
    const method = process.env.ANDRE_INVOICE_METHOD ?? "PIX";
    if (!["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"].includes(method))
      throw new Error();
    fixture = await balanceJourneyFixture(method);
    await fixture.reserve();
    await fixture.advance();
    await fixture.capture();
    await fixture.observe("pending");
    await fixture.apply();
    const f = fixture;
    reply("ready", {
      processId: f.signal.sample.process_id,
      orderId: f.signal.sample.order_id,
      quoteId: f.signal.sample.id,
      code: f.signal.orderCode,
      clientId: f.signal.owner.id,
      calculatorId: f.signal.calculator.id,
      ...f.ids(),
      scopeId: f.signal.scopeId,
      contracted: 12500,
    });
    for await (const line of input) {
      let id = "invalid";
      try {
        const command = JSON.parse(line);
        if (
          !command ||
          typeof command !== "object" ||
          typeof command.id !== "string" ||
          !/^\d+$/.test(command.id)
        )
          throw new Error();
        id = command.id;
        let data: unknown;
        switch (command.action) {
          case "observe":
            if (
              !["pending", "received", "partial", "refund", "unknown"].includes(
                command.scenario,
              )
            )
              throw new Error();
            data = await f.observe(command.scenario);
            break;
          case "apply":
            data = await f.apply();
            break;
          case "receive":
            if (
              command.scenario &&
              !["received", "partial"].includes(command.scenario)
            )
              throw new Error();
            data = await f.receive(command.scenario ?? "received");
            break;
          case "view":
            data = f.view();
            break;
          case "signalRefund":
            await f.signal.observe("refund_partial");
            await f.signal.apply();
            data = "changed";
            break;
          case "dropDelivery": {
            const r = await f.signal.db
              .from("deliveries")
              .delete()
              .eq("order_id", f.signal.sample.order_id)
              .eq("process_id", f.signal.sample.process_id);
            if (r.error) throw new Error();
            data = "removed";
            break;
          }
          case "createZeroOrder": {
            const sample = await f.signal.create({ zero: true });
            await f.signal.deliver(sample);
            data = { processId: sample.process_id, orderId: sample.order_id };
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
      reply("cleanup", "Limpeza não concluída.", false);
      process.exitCode = 1;
    }
  }
  await new Promise<void>((resolve) =>
    process.stdout.write("", () => resolve()),
  );
  process.exit(process.exitCode ?? 0);
}
void run();
