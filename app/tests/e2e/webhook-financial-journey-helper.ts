import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { financialJourneyFixture } from "./financial-journey-helper";
import {
  setFinancialFixtureScenario,
  type FinancialScenario,
} from "./financial-scenario-helper";
import {
  clearWebhookJourneyScopes,
  webhookJourneyToken,
  webhookJourneyCronSecret,
} from "./webhook-journey-helper";
import { localNotificationSql as sql } from "./notification-helper";
import { quoteSession } from "./quote-helper";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import { captureFixtureFinancialObservation } from "@/modules/payments/financial-worker";
import { paymentIntentReceiptSchema } from "@/modules/payments/intents";
import { receiveFixtureAsaasWebhook } from "@/modules/payments/webhook-receipt";
import { runFixturePaymentWebhookQueue } from "@/modules/payments/webhook-queue";
import {
  webhookFinalizationReceiptSchema,
  finalizeFixturePaymentWebhook,
} from "@/modules/payments/webhook-finalization";
import { webhookRunSchema } from "@/modules/payments/webhook-worker";

export type WebhookJourneyPhase = "deposit" | "balance";
type Target = {
  chargeId: string;
  paymentId: string;
  intentId: string;
  requestId: string;
  contracted: number;
};

/** As duas fases recebem exclusivamente pelo worker. A entrega de teste é explícita. */
export async function webhookFinancialJourneyFixture(
  method = "PIX",
  phase: WebhookJourneyPhase = "deposit",
) {
  const base = await financialJourneyFixture(method);
  const keys = [
    "ANDRE_WEBHOOK_FIXTURE_SCOPE_ID",
    "ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID",
    "ANDRE_WEBHOOK_FIXTURE_TOKEN",
    "ANDRE_WEBHOOK_FIXTURE_CRON_SECRET",
  ] as const;
  const previous = keys.map((k) => [k, process.env[k]] as const);
  const restore = () => {
    for (const [k, v] of previous) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  const signal: Target = {
    chargeId: base.chargeId,
    paymentId: base.paymentId,
    intentId: base.intentId,
    requestId: base.requestId,
    contracted: base.contracted,
  };
  let active = signal;
  const mutation = (scenario: FinancialScenario, target = active) =>
    setFinancialFixtureScenario(
      { ...target, scopeId: base.scopeId, clientId: base.owner.id },
      scenario,
    );
  const body = (
    options: {
      eventId?: string;
      event?: string;
      dateCreated?: string;
      patch?: Record<string, unknown>;
    } = {},
    target = active,
  ) =>
    JSON.stringify({
      id: options.eventId ?? "evt_journey_" + randomUUID(),
      event: options.event ?? "PAYMENT_RECEIVED",
      dateCreated: options.dateCreated ?? "2026-10-12 10:00:00",
      account: { id: "fixture-" + base.scopeId },
      payment: {
        ...JSON.parse(
          sql(
            `select private.payment_fixture_payment_wire(p)::text from private.payment_fixture_payments p where scope_id='${base.scopeId}' and id='${target.paymentId}';`,
          ),
        ),
        ...options.patch,
      },
    });
  const receive = (options: Parameters<typeof body>[0] = {}, target = active) =>
    receiveFixtureAsaasWebhook(
      new Request("https://example.test/api/webhooks/asaas", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "asaas-access-token": webhookJourneyToken,
        },
        body: body(options, target),
      }),
    );
  const receipt = (target = active) => {
    const raw = sql(
      `select finalization_result from private.payment_webhook_runs where charge_id='${target.chargeId}' and stage='complete' order by created_at desc,id desc limit 1;`,
    );
    return raw ? webhookFinalizationReceiptSchema.parse(JSON.parse(raw)) : null;
  };
  const move = async (
    scenario: FinancialScenario = "current",
    options: Parameters<typeof body>[0] = {},
    target = active,
  ) => {
    mutation(scenario, target);
    const reception = await receive(options, target);
    const report = await runFixturePaymentWebhookQueue();
    return {
      reception,
      report,
      receipt: report.complete ? receipt(target) : null,
    };
  };
  const cleanup = async () => {
    try {
      clearWebhookJourneyScopes(base.scopeId, base.otherScopeId);
    } finally {
      try {
        await base.cleanup();
      } finally {
        restore();
      }
    }
  };
  try {
    process.env.ANDRE_WEBHOOK_FIXTURE_SCOPE_ID = base.scopeId;
    process.env.ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID = "fixture-" + base.scopeId;
    process.env.ANDRE_WEBHOOK_FIXTURE_TOKEN = webhookJourneyToken;
    process.env.ANDRE_WEBHOOK_FIXTURE_CRON_SECRET = webhookJourneyCronSecret;
    if (phase === "balance") {
      assert(
        (await move("received", {}, signal)).report.complete === 1,
        "Sinal fictício não recebido pelo webhook.",
      );
      assert(
        base.view().projection.depositCreditCents === 12501,
        "Crédito fictício do sinal incorreto.",
      );
      await base.deliver(base.sample);
      const session = await quoteSession(),
        requestId = randomUUID();
      let intentId: string;
      try {
        const context = await base.prepare(base.sample, session, "balance", {
          billing_type: method,
        });
        const reserved = await session.rpc("reserve_payment_intent", {
          target_context: context.id,
          request_id: requestId,
        });
        assert(reserved.error === null, "Saldo fictício não reservado.");
        intentId = paymentIntentReceiptSchema.parse(reserved.data).snapshot
          .intent.id;
      } finally {
        await session.auth.signOut({ scope: "local" });
      }
      assert(
        (await advanceFixturePaymentExecution(requestId)).state ===
          "identified",
        "Fonte fictícia do saldo indisponível.",
      );
      const origin = sql(
        `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${intentId}' and o.facts is not null order by o.recorded_at desc limit 1;`,
      );
      const captured = await captureFixtureFinancialObservation(origin);
      const charge = JSON.parse(
        sql(
          `select json_build_object('paymentId',provider_payment_id,'contracted',(expectation->>'contractedCents')::bigint) from private.payment_financial_charges where id='${captured.chargeId}';`,
        ),
      );
      active = {
        chargeId: captured.chargeId,
        paymentId: charge.paymentId,
        contracted: charge.contracted,
        intentId,
        requestId,
      };
    }
    const view = () =>
      JSON.parse(
        sql(`select json_build_object(
      'phase','${phase}','chargePhase',(select x.phase from private.payment_financial_charges c join private.payment_intents i on i.id=c.intent_id join private.payment_obligation_contexts x on x.id=i.context_id where c.id='${active.chargeId}'),'billingType',(select expectation->>'billingType' from private.payment_financial_charges where id='${active.chargeId}'),'projection',private.order_payment_credit('${base.sample.order_id}'),
      'status',(select status from public.orders where id='${base.sample.order_id}'),
      'position',(select value from private.payment_financial_positions where charge_id='${active.chargeId}'),
      'signalPosition',(select value from private.payment_financial_positions where charge_id='${signal.chargeId}'),
      'posts',(select count(*) from private.payment_fixture_requests where scope_id='${base.scopeId}' and operation='payment_create' and payload->>'reference'='${active.intentId}'),
      'gets',(select count(*) from private.payment_fixture_requests where scope_id='${base.scopeId}' and operation='payment_get'),
      'applications',(select count(*) from private.payment_financial_applications where charge_id='${active.chargeId}'),
      'publicPayments',(select count(*) from public.payments where order_id='${base.sample.order_id}'),
      'legacyOrigins',(select count(*) from private.payment_legacy_origins where scope_id='${base.scopeId}'),
      'legacyBindings',(select count(*) from private.payment_legacy_bindings where charge_id in(select id from private.payment_financial_charges where scope_id='${base.scopeId}')),
      'reservations',(select count(*) from private.payment_intent_reservations where intent_id='${active.intentId}'),
      'events',(select coalesce(json_agg(json_build_object('kind',kind,'effect',data->>'effect') order by created_at,id),'[]'::json) from public.timeline_events where order_id='${base.sample.order_id}' and kind in('payment_confirmed','payment_updated')),
      'notifications',(select coalesce(json_agg(json_build_object('channel',channel,'template',template,'dedup',dedup_key,'application',data->>'application_id') order by created_at,id),'[]'::json) from public.notifications where data->>'order_id'='${base.sample.order_id}'));
    `),
      );
    return {
      ...base,
      phase,
      method,
      signal,
      get target() {
        return active;
      },
      mutation,
      body,
      receive,
      move,
      process: runFixturePaymentWebhookQueue,
      receipt,
      view,
      cleanup,
      signalMove: (
        scenario: FinancialScenario = "current",
        options: Parameters<typeof body>[0] = {},
      ) => move(scenario, options, signal),
      stored: (runId: string) =>
        sql(
          `select finalization_result from private.payment_webhook_runs where id='${runId}' and scope_id='${base.scopeId}';`,
        ),
      async replay(runId: string) {
        const c = webhookRunSchema.parse(
          JSON.parse(
            sql(
              `select private.webhook_run_result(r) from private.payment_webhook_runs r where id='${runId}' and scope_id='${base.scopeId}';`,
            ),
          ),
        );
        return finalizeFixturePaymentWebhook(c);
      },
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
