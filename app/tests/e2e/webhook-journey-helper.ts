import { randomUUID } from "node:crypto";
import { executionTransportFixture } from "./execution-transport-helper";
import { localNotificationSql as sql } from "./notification-helper";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import { captureFixtureFinancialObservation } from "@/modules/payments/financial-worker";
import { receiveFixtureAsaasWebhook } from "@/modules/payments/webhook-receipt";

export const webhookJourneyToken =
  "ficticio-webhook-jornada-somente-teste-2026";
export const webhookJourneyCronSecret =
  "ficticio-cron-jornada-distinto-do-webhook-2026";

/** Produtor existente e origem real do banco local; nenhum pagamento paralelo. */
export async function webhookJourneyFixture() {
  const base = await executionTransportFixture();
  await advanceFixturePaymentExecution(base.requestId);
  const origin = sql(
    `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${base.intentId}' and o.facts is not null limit 1;`,
  );
  const paymentId = sql(
    `select selected_payment_id from private.payment_execution_runs where intent_id='${base.intentId}';`,
  );
  sql(
    `update private.payment_fixture_payments set status='RECEIVED',net_cents=value_cents-100,refunds='[]',chargeback=null where scope_id='${base.scopeId}' and id='${paymentId}';`,
  );
  let chargeId: string | undefined;
  const body = (
    patch: Record<string, unknown> = {},
    eventId = "evt_fixture_" + randomUUID(),
  ) =>
    JSON.stringify({
      id: eventId,
      event: "PAYMENT_RECEIVED",
      dateCreated: "2026-10-12 10:00:00",
      account: { id: "fixture-" + base.scopeId },
      payment: {
        ...JSON.parse(
          sql(
            `select private.payment_fixture_payment_wire(p)::text from private.payment_fixture_payments p where scope_id='${base.scopeId}' and id='${paymentId}';`,
          ),
        ),
        ...patch,
      },
    });
  return {
    ...base,
    paymentId,
    body,
    get chargeId() {
      if (!chargeId) throw new Error("Origem fictícia ainda não capturada.");
      return chargeId;
    },
    async capture() {
      chargeId = (await captureFixtureFinancialObservation(origin)).chargeId;
      return chargeId;
    },
    receive(patch: Record<string, unknown> = {}, eventId?: string) {
      return receiveFixtureAsaasWebhook(
        new Request("https://example.test/api/webhooks/asaas", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "asaas-access-token": webhookJourneyToken,
          },
          body: body(patch, eventId),
        }),
      );
    },
    counts() {
      return JSON.parse(
        sql(
          `select json_build_object('runs',(select count(*) from private.payment_webhook_runs where scope_id='${base.scopeId}'),'claims',(select count(*) from private.payment_webhook_claims where run_id in(select id from private.payment_webhook_runs where scope_id='${base.scopeId}')),'gets',(select count(*) from private.payment_fixture_requests where scope_id='${base.scopeId}' and operation='payment_get'),'applications',(select count(*) from private.payment_financial_applications a join private.payment_financial_charges c on c.id=a.charge_id where c.scope_id='${base.scopeId}'),'done',(select count(*) from private.payment_webhook_queue q join private.payment_webhook_events e on e.id=q.event_id where e.scope_id='${base.scopeId}' and q.state='done'));`,
        ),
      ) as {
        runs: number;
        claims: number;
        gets: number;
        applications: number;
        done: number;
      };
    },
    async cleanup() {
      try {
        const scopes = `'${base.scopeId}','${base.otherScopeId}'`;
        sql(`update private.payment_fixture_environment set enabled=true where singleton;
          delete from public.audit_log where action in('payment_webhook_claimed','payment_webhook_queried','payment_webhook_finalized') and target_id in(select request_id from private.payment_webhook_claims where run_id in(select id from private.payment_webhook_runs where scope_id in(${scopes})) union select id from private.payment_webhook_runs where scope_id in(${scopes}));
          delete from private.payment_webhook_claims where run_id in(select id from private.payment_webhook_runs where scope_id in(${scopes}));delete from private.payment_webhook_runs where scope_id in(${scopes});
          delete from public.audit_log where action in('payment_webhook_received','payment_webhook_conflict') and target_id in(select id from private.payment_webhook_events where scope_id in(${scopes}) union select x.id from private.payment_webhook_conflicts x join private.payment_webhook_events e on e.id=x.event_id where e.scope_id in(${scopes}));
          delete from private.payment_webhook_queue where event_id in(select id from private.payment_webhook_events where scope_id in(${scopes}));delete from private.payment_webhook_conflicts where event_id in(select id from private.payment_webhook_events where scope_id in(${scopes}));delete from private.payment_webhook_events where scope_id in(${scopes});`);
      } finally {
        await base.cleanup();
      }
    },
  };
}
