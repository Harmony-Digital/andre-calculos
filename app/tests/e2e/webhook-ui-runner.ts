import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { z } from "zod";
import { webhookFinancialJourneyFixture } from "./webhook-financial-journey-helper";
import { financialScenarios } from "./financial-scenario-helper";
import { localNotificationSql as sql } from "./notification-helper";
import { quoteSession } from "./quote-helper";
import { paymentIntentReceiptSchema } from "@/modules/payments/intents";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import { captureFixtureFinancialObservation } from "@/modules/payments/financial-worker";

type Fixture = Awaited<ReturnType<typeof webhookFinancialJourneyFixture>>;
type Target = Fixture["target"];
const commandSchema = z.strictObject({
  id: z.string().regex(/^[0-9]+$/),
  action: z.enum([
    "move",
    "signalMove",
    "receiveOnly",
    "process",
    "view",
    "replay",
    "signalReplay",
    "prepareBalance",
    "prepareSyntheticDelivery",
    "close",
  ]),
  scenario: z.enum(financialScenarios).optional(),
});
const reply = (id: string, data: unknown, ok = true) =>
  process.stdout.write(
    "ANDRE_WEBHOOK_UI " + JSON.stringify({ id, ok, data }) + "\n",
  );

async function run() {
  let f: Fixture | undefined,
    balance: Target | undefined,
    cleanupPromise: Promise<void> | undefined;
  let balanceContext: Awaited<ReturnType<Fixture["prepare"]>> | undefined;
  let balanceIntent: string | undefined, balanceOrigin: string | undefined;
  const balanceRequest = randomUUID();
  const cleanup = () =>
    (cleanupPromise ??= f ? f.cleanup() : Promise.resolve());
  const input = createInterface({ input: process.stdin });
  process.on("SIGTERM", () => input.close());
  process.on("SIGINT", () => input.close());
  try {
    const method = z
      .enum(["PIX", "BOLETO", "CREDIT_CARD"])
      .parse(process.env.ANDRE_WEBHOOK_UI_METHOD);
    f = await webhookFinancialJourneyFixture(method, "deposit");
    const fixture = f;
    const target = () => balance ?? fixture.signal;
    const prepareBalance = async () => {
      if (balance) return balance;
      const session = await quoteSession();
      try {
        balanceContext ??= await fixture.prepare(
          fixture.sample,
          session,
          "balance",
          { billing_type: method },
        );
        if (!balanceIntent) {
          const reserved = await session.rpc("reserve_payment_intent", {
            target_context: balanceContext.id,
            request_id: balanceRequest,
          });
          assert(reserved.error === null, "Saldo fictício não reservado.");
          balanceIntent = paymentIntentReceiptSchema.parse(reserved.data)
            .snapshot.intent.id;
        }
      } finally {
        await session.auth.signOut({ scope: "local" });
      }
      assert(
        (await advanceFixturePaymentExecution(balanceRequest)).state ===
          "identified",
        "Fonte fictícia não identificada.",
      );
      balanceOrigin ??= sql(
        `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${balanceIntent}' and o.facts is not null order by o.recorded_at desc limit 1;`,
      );
      const captured = await captureFixtureFinancialObservation(balanceOrigin);
      const charge = JSON.parse(
        sql(
          `select json_build_object('paymentId',provider_payment_id,'contracted',(expectation->>'contractedCents')::bigint) from private.payment_financial_charges where id='${captured.chargeId}';`,
        ),
      );
      balance = {
        chargeId: captured.chargeId,
        paymentId: charge.paymentId,
        intentId: balanceIntent!,
        requestId: balanceRequest,
        contracted: charge.contracted,
      };
      return balance;
    };
    const view = () => {
      const current = target();
      const active = JSON.parse(
        sql(
          `select json_build_object('position',(select value from private.payment_financial_positions where charge_id='${current.chargeId}'),'applications',(select count(*) from private.payment_financial_applications where charge_id='${current.chargeId}'),'reservations',(select count(*) from private.payment_intent_reservations where intent_id='${current.intentId}'),'posts',(select count(*) from private.payment_fixture_requests where scope_id='${fixture.scopeId}' and operation='payment_create' and payload->>'reference'='${current.intentId}'),'totalPosts',(select count(*) from private.payment_fixture_requests where scope_id='${fixture.scopeId}' and operation='payment_create'));`,
        ),
      );
      return {
        ...fixture.view(),
        ...active,
        phase: balance ? "balance" : "deposit",
        chargePhase: balance ? "balance" : "deposit",
        target: current,
      };
    };
    reply("ready", {
      processId: fixture.sample.process_id,
      orderId: fixture.sample.order_id,
      quoteId: fixture.sample.id,
      code: fixture.orderCode,
      clientId: fixture.owner.id,
      calculatorId: fixture.calculator.id,
      scopeId: fixture.scopeId,
      signalChargeId: fixture.signal.chargeId,
      signalPaymentId: fixture.signal.paymentId,
    });
    for await (const line of input) {
      let id = "0";
      try {
        const raw: unknown = JSON.parse(line);
        if (
          raw &&
          typeof raw === "object" &&
          "id" in raw &&
          typeof raw.id === "string" &&
          /^[0-9]+$/.test(raw.id)
        )
          id = raw.id;
        const command = commandSchema.parse(raw);
        id = command.id;
        let data: unknown;
        switch (command.action) {
          case "move":
            data = await fixture.move(
              command.scenario ?? "current",
              {},
              target(),
            );
            break;
          case "signalMove":
            data = await fixture.signalMove(command.scenario ?? "current");
            break;
          case "receiveOnly":
            fixture.mutation(command.scenario ?? "current", target());
            data = await fixture.receive({}, target());
            break;
          case "process":
            data = await fixture.process();
            break;
          case "view":
            data = view();
            break;
          case "replay":
          case "signalReplay": {
            const receipt = fixture.receipt(
              command.action === "signalReplay" ? fixture.signal : target(),
            );
            data = receipt ? await fixture.replay(receipt.runId) : null;
            break;
          }
          case "prepareBalance":
            data = await prepareBalance();
            break;
          case "prepareSyntheticDelivery":
            if (process.env.ANDRE_WEBHOOK_UI_SMOKE !== "1")
              throw new Error("Preparo sintético indisponível.");
            await fixture.deliver(fixture.sample);
            data = "prepared";
            break;
          case "close":
            await cleanup();
            reply(id, "closed");
            input.close();
            continue;
        }
        reply(id, data);
      } catch {
        reply(id, null, false);
      }
    }
  } catch {
    reply("ready", null, false);
    process.exitCode = 1;
  } finally {
    input.close();
    try {
      await cleanup();
    } catch {
      process.exitCode = 1;
    }
  }
}
void run();
