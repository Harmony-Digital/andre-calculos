import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { financialJourneyFixture } from "./financial-journey-helper";
import { quoteSession } from "./quote-helper";
import { localNotificationSql as sql } from "./notification-helper";
import { paymentIntentReceiptSchema } from "@/modules/payments/intents";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import {
  captureFixtureFinancialObservation,
  queryFixtureFinancialObservation,
} from "@/modules/payments/financial-worker";
import { applyFixtureFinancialObservation } from "@/modules/payments/financial-application";
import {
  createFixtureLegacyOrigin,
  bindFixtureLegacyPayment,
} from "@/modules/payments/legacy-binding";
import { resolveFixtureFinancialApplication } from "@/modules/payments/financial-resolution";

/** Sinal produzido/recebido pelo núcleo existente; entrega explicitamente fictícia. */
export async function balanceJourneyFixture(billingType = "PIX") {
  const signal = await financialJourneyFixture();
  let requestId = "",
    intentId = "",
    chargeId = "",
    paymentId = "",
    observationId = "";
  try {
    await signal.observe("received");
    await signal.createOrigin();
    await signal.apply();
    await signal.bind();
    assert(
      (await signal.resolve())?.reason === "financial_received",
      "Sinal fictício não conciliado.",
    );
    await signal.deliver(signal.sample);
    const reserve = async () => {
      const session = await quoteSession();
      try {
        const context = await signal.prepare(
          signal.sample,
          session,
          "balance",
          { billing_type: billingType },
        );
        const request = randomUUID();
        const result = await session.rpc("reserve_payment_intent", {
          target_context: context.id,
          request_id: request,
        });
        assert(result.error === null, "Saldo fictício não reservado.");
        const receipt = paymentIntentReceiptSchema.parse(result.data);
        requestId = request;
        intentId = receipt.snapshot.intent.id;
        return { context, receipt, requestId, intentId };
      } finally {
        await session.auth.signOut({ scope: "local" });
      }
    };
    const advance = () => advanceFixturePaymentExecution(requestId);
    const capture = async () => {
      const origin = sql(
        `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${intentId}' and o.facts is not null order by o.recorded_at desc limit 1;`,
      );
      assert(origin, "Origem de saldo fictícia ausente.");
      const captured = await captureFixtureFinancialObservation(origin);
      chargeId = captured.chargeId;
      observationId = captured.observationId;
      paymentId = sql(
        `select provider_payment_id from private.payment_financial_charges where id='${chargeId}';`,
      );
      return captured;
    };
    const observe = async (
      scenario: "pending" | "received" | "partial" | "refund" | "unknown",
    ) => {
      const amount = Number(
        sql(
          `select (expectation->>'contractedCents')::bigint from private.payment_financial_charges where id='${chargeId}';`,
        ),
      );
      const patch =
        scenario === "unknown"
          ? "status='UNKNOWN'"
          : scenario === "refund"
            ? "status='REFUNDED',refunds=jsonb_build_array(jsonb_build_object('value',round(value_cents/100.0,2),'status','DONE','dateCreated','2026-10-12 11:00:00'))"
            : `status='${scenario === "pending" ? "PENDING" : "RECEIVED"}',original_cents=${amount},value_cents=${scenario === "partial" ? amount - 1000 : amount},net_cents=${scenario === "partial" ? amount - 1100 : amount - 100},refunds='[]',chargeback=null`;
      sql(
        `update private.payment_fixture_payments set ${patch} where scope_id='${signal.scopeId}' and id='${paymentId}';`,
      );
      observationId = (
        await queryFixtureFinancialObservation(chargeId, randomUUID())
      ).observationId;
      return observationId;
    };
    const apply = () =>
      applyFixtureFinancialObservation({
        observationId,
        requestId: randomUUID(),
      });
    const receive = async (scenario: "received" | "partial" = "received") => {
      await observe(scenario);
      const origin = await createFixtureLegacyOrigin({
        observationId,
        requestId: randomUUID(),
      });
      const application = await apply();
      const binding = await bindFixtureLegacyPayment({
        originRequestId: origin.requestId,
        applicationRequestId: application.requestId,
        requestId: randomUUID(),
      });
      const resolution = await resolveFixtureFinancialApplication({
        applicationRequestId: application.requestId,
        requestId: randomUUID(),
      });
      return { origin, application, binding, resolution };
    };
    const view = () =>
      JSON.parse(
        sql(`select json_build_object(
      'projection',private.order_payment_credit('${signal.sample.order_id}'),
      'status',(select status from public.orders where id='${signal.sample.order_id}'),
      'position',(select value from private.payment_financial_positions where charge_id=${chargeId ? `'${chargeId}'` : "null"}),
      'posts',(select count(*) from private.payment_fixture_invocations v join private.payment_fixture_requests r on r.id=v.request_id where r.operation='payment_create' and r.payload->>'reference'='${intentId}'),
      'payments',(select count(*) from private.payment_fixture_payments where intent_id=${intentId ? `'${intentId}'` : "null"}),
      'reservations',(select count(*) from private.payment_intent_reservations where order_id='${signal.sample.order_id}'),
      'claims',(select count(*) from private.payment_intent_dispatch_claims where intent_id=${intentId ? `'${intentId}'` : "null"}),
      'policy',(select delivery_release_policy from public.settings where singleton));`),
      );
    return {
      signal,
      reserve,
      advance,
      capture,
      observe,
      apply,
      receive,
      view,
      ids: () => ({ requestId, intentId, chargeId, paymentId, observationId }),
      cleanup: signal.cleanup,
    };
  } catch (error) {
    await signal.cleanup();
    throw error;
  }
}
