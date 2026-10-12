import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { executionTransportFixture } from "./execution-transport-helper";
import { leaseQueue } from "./queue-helper";
import { localNotificationSql as sql } from "./notification-helper";
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
export const financialScenarios = [
  "current",
  "received",
  "partial",
  "excess",
  "refund_partial",
  "refund_full",
  "refund_pending",
  "chargeback_dispute",
  "chargeback_debit",
  "chargeback_restore",
  "chargeback_restore_full",
  "unknown",
] as const;
export type FinancialScenario = (typeof financialScenarios)[number];
const literal = (v: unknown) =>
  "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
/** Um lease e uma origem real da fixture. Nenhum evento financeiro semeado. */
export async function financialJourneyFixture() {
  if (
    process.env.ANDRE_LOCAL_TESTS !== "1" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321" ||
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV === "production"
  )
    throw new Error("Jornada fictícia indisponível.");
  const fixture = await executionTransportFixture();
  let releaseQueue: (() => Promise<void>) | undefined;
  let prior:
    | {
        recipient: string | null;
        prefs: { channel: string; enabled: boolean; revision: number }[];
        changes: string[];
      }
    | undefined;
  let observationId = "",
    chargeId = "",
    paymentId = "";
  let legacy: Awaited<ReturnType<typeof createFixtureLegacyOrigin>> | undefined;
  let application:
    Awaited<ReturnType<typeof applyFixtureFinancialObservation>> | undefined;
  let binding: Awaited<ReturnType<typeof bindFixtureLegacyPayment>> | undefined;
  let resolution:
    Awaited<ReturnType<typeof resolveFixtureFinancialApplication>> | undefined;
  let bindingInput:
    | {
        originRequestId: string;
        applicationRequestId: string;
        requestId: string;
      }
    | undefined;
  let resolutionInput:
    { applicationRequestId: string; requestId: string } | undefined;
  const cleanup = async () => {
    try {
      if (prior) {
        const oldChanges = prior.changes.length
          ? prior.changes.map((x) => `'${x}'`).join(",")
          : "null";
        sql(`delete from public.audit_log where action='notification_preference_saved' and target_id in(select id from private.notification_preference_changes where profile_id='${fixture.calculator.id}' and event='payment_updated' and ${prior.changes.length ? `id not in(${oldChanges})` : "true"});
         delete from private.notification_preference_changes where profile_id='${fixture.calculator.id}' and event='payment_updated' and ${prior.changes.length ? `id not in(${oldChanges})` : "true"};
         update private.calculator_notification_recipient set profile_id=${prior.recipient ? `'${prior.recipient}'` : "null"} where singleton;
         delete from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated';`);
        for (const p of prior.prefs)
          sql(
            `insert into public.notification_preferences(profile_id,event,channel,enabled,revision) values('${fixture.calculator.id}','payment_updated','${p.channel}',${p.enabled},${p.revision});`,
          );
      }
      sql(`delete from public.audit_log where target_id in(select id from public.deliveries where process_id='${fixture.sample.process_id}' union select id from private.order_operation_receipts where process_id='${fixture.sample.process_id}');
       delete from public.deliveries where process_id='${fixture.sample.process_id}';delete from private.order_operation_receipts where process_id='${fixture.sample.process_id}';`);
    } finally {
      try {
        await fixture.cleanup();
      } finally {
        await releaseQueue?.();
      }
    }
  };
  try {
    // Mesma ordem do fullJourneyFixture: settings primeiro, fila depois.
    releaseQueue = await leaseQueue();
    prior = JSON.parse(
      sql(
        `select json_build_object('recipient',(select profile_id from private.calculator_notification_recipient where singleton),'prefs',coalesce((select json_agg(json_build_object('channel',channel,'enabled',enabled,'revision',revision)) from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated'),'[]'::json),'changes',coalesce((select json_agg(id) from private.notification_preference_changes where profile_id='${fixture.calculator.id}' and event='payment_updated'),'[]'::json));`,
      ),
    );
    sql(
      `update private.calculator_notification_recipient set profile_id='${fixture.calculator.id}' where singleton;delete from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated';update public.settings set delivery_release_policy=null where singleton;`,
    );
    assert(
      (await advanceFixturePaymentExecution(fixture.requestId)).state ===
        "identified",
      "Execução fictícia não identificada.",
    );
    const originId = sql(
        `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${fixture.intentId}' and o.facts is not null limit 1;`,
      ),
      captured = await captureFixtureFinancialObservation(originId);
    chargeId = captured.chargeId;
    observationId = captured.observationId;
    paymentId = sql(
      `select provider_payment_id from private.payment_financial_charges where id='${chargeId}';`,
    );
    const contracted = Number(
      sql(
        `select (expectation->>'contractedCents')::bigint from private.payment_financial_charges where id='${chargeId}';`,
      ),
    );
    const patch = (value: string) =>
      sql(
        `update private.payment_fixture_payments set ${value} where scope_id='${fixture.scopeId}' and id='${paymentId}';`,
      );
    const cb = (
      status: string,
      restoration: "none" | "partial" | "full" = "none",
    ) => ({
      status,
      fixtureProof: {
        schemaVersion: 1,
        semantics: "fixture_chargeback_cumulative",
        paymentId,
        reference: fixture.intentId,
        caseId: "case_fixture",
        debit: {
          id: "debit_fixture",
          value: 20.01,
          effectedAt: "2026-10-12T10:00:00-03:00",
        },
        reversals:
          restoration !== "none"
            ? [
                {
                  id: "reversal_fixture",
                  value: 10.01,
                  reversesDebitId: "debit_fixture",
                  effectedAt: "2026-10-12T11:00:00-03:00",
                },
                ...(restoration === "full"
                  ? [
                      {
                        id: "second_reversal_fixture",
                        value: 10,
                        reversesDebitId: "debit_fixture",
                        effectedAt: "2026-10-12T12:00:00-03:00",
                      },
                    ]
                  : []),
              ]
            : [],
      },
    });
    const observe = async (scenario: FinancialScenario = "current") => {
      assert(
        financialScenarios.includes(scenario),
        "Cenário fictício inválido.",
      );
      if (scenario === "unknown")
        sql(
          `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior,calls_left) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found',1) on conflict(scope_id,client_id,operation) do update set behavior='not_found',calls_left=1;`,
        );
      if (["received", "partial", "excess"].includes(scenario)) {
        const gross =
          scenario === "partial"
            ? 10000
            : scenario === "excess"
              ? 13000
              : contracted;
        patch(
          `status='RECEIVED',original_cents=${contracted},value_cents=${gross},net_cents=${gross}-100,refunds='[]',chargeback=null`,
        );
      }
      if (scenario.startsWith("refund_")) {
        const gross = Number(
          sql(
            `select value_cents from private.payment_fixture_payments where scope_id='${fixture.scopeId}' and id='${paymentId}';`,
          ),
        );
        const value = scenario === "refund_full" ? gross / 100 : 10.01;
        const refunds = [
          {
            value,
            status: scenario === "refund_pending" ? "PENDING" : "DONE",
            dateCreated: "2026-10-12 10:00:00",
          },
        ];
        if (scenario === "refund_full") {
          const previous: typeof refunds = JSON.parse(
            sql(
              `select refunds from private.payment_fixture_payments where scope_id='${fixture.scopeId}' and id='${paymentId}';`,
            ),
          );
          const completed = previous.filter((r) => r.status === "DONE");
          if (completed.length) {
            const refunded = completed.reduce(
              (sum, r) => sum + Math.round(r.value * 100),
              0,
            );
            refunds.splice(0, refunds.length, ...completed);
            if (refunded < gross)
              refunds.push({
                value: (gross - refunded) / 100,
                status: "DONE",
                dateCreated: "2026-10-12 11:00:00",
              });
          }
        }
        patch(
          `status='${scenario === "refund_full" ? "REFUNDED" : scenario === "refund_pending" ? "REFUND_REQUESTED" : "RECEIVED"}',refunds=${literal(refunds)},chargeback=null`,
        );
      }
      if (scenario.startsWith("chargeback_"))
        patch(
          `status='CHARGEBACK_DISPUTE',chargeback=${literal(cb(scenario === "chargeback_dispute" ? "IN_DISPUTE" : "DONE", scenario === "chargeback_restore_full" ? "full" : scenario === "chargeback_restore" ? "partial" : "none"))}`,
        );
      observationId = (
        await queryFixtureFinancialObservation(chargeId, randomUUID())
      ).observationId;
      return observationId;
    };
    const apply = async () => {
      application = await applyFixtureFinancialObservation({
        observationId,
        requestId: randomUUID(),
      });
      return application;
    };
    const createOrigin = async () => {
      legacy = await createFixtureLegacyOrigin({
        observationId,
        requestId: randomUUID(),
      });
      return legacy;
    };
    const bind = async () => {
      assert(legacy && application, "Origem/aplicação fictícias ausentes.");
      const input = {
        originRequestId: legacy.requestId,
        applicationRequestId: application.requestId,
        requestId: randomUUID(),
      };
      binding = await bindFixtureLegacyPayment(input);
      bindingInput = input;
      return binding;
    };
    const resolve = async () => {
      assert(application, "Aplicação fictícia ausente.");
      const input = {
        applicationRequestId: application.requestId,
        requestId: randomUUID(),
      };
      const result = await resolveFixtureFinancialApplication(input);
      if (result) {
        resolutionInput = input;
        resolution = result;
      }
      return result;
    };
    const view = () =>
      JSON.parse(
        sql(`select json_build_object('processId','${fixture.sample.process_id}','orderId','${fixture.sample.order_id}','intentId','${fixture.intentId}','chargeId','${chargeId}','paymentId','${paymentId}',
      'status',(select status from public.orders where id='${fixture.sample.order_id}'),
      'projection',private.order_payment_credit('${fixture.sample.order_id}'),
      'position',(select value from private.payment_financial_positions where charge_id='${chargeId}'),
      'run',(select json_build_object('id',id,'state',state,'reason',reason,'revision',revision,'currentStep',current_step) from private.payment_execution_runs where intent_id='${fixture.intentId}'),
      'claims',(select count(*) from private.payment_intent_dispatch_claims where intent_id='${fixture.intentId}'),
      'reservations',(select count(*) from private.payment_intent_reservations where intent_id='${fixture.intentId}'),
      'posts',(select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${fixture.intentId}'),
      'events',(select coalesce(json_agg(json_build_object('kind',kind,'effect',data->>'effect') order by created_at,id),'[]'::json) from public.timeline_events where order_id='${fixture.sample.order_id}' and kind in('payment_confirmed','payment_updated')),
      'notifications',(select coalesce(json_agg(json_build_object('channel',channel,'recipient',recipient,'template',template,'dedup',dedup_key,'application',data->>'application_id') order by created_at,id),'[]'::json) from public.notifications where data->>'order_id'='${fixture.sample.order_id}'));`),
      );
    return {
      ...fixture,
      orderCode: sql(
        `select code from public.orders where id='${fixture.sample.order_id}';`,
      ),
      chargeId,
      paymentId,
      contracted,
      observe,
      apply,
      createOrigin,
      bind,
      resolve,
      view,
      cleanup,
      receipts: () => ({ legacy, application, binding, resolution }),
      replay: async () => ({
        legacy: legacy
          ? await createFixtureLegacyOrigin({
              observationId: legacy.observationId,
              requestId: legacy.requestId,
            })
          : undefined,
        binding: bindingInput
          ? await bindFixtureLegacyPayment(bindingInput)
          : undefined,
        resolution: resolution
          ? await resolveFixtureFinancialApplication(resolutionInput)
          : undefined,
      }),
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
