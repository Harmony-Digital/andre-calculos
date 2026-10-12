import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { paymentObligationFixture } from "./payment-obligation-helper";
import { quoteSession } from "./quote-helper";
import { localNotificationSql as sql } from "./notification-helper";
import { advanceFixturePaymentCustomer } from "@/modules/payments/customer-bootstrap-worker";
import { paymentIntentReceiptSchema } from "@/modules/payments/intents";
export async function executionTransportFixture(billingType = "PIX") {
  const fixture = await paymentObligationFixture();
  let priorEnabled: boolean | undefined;
  const cleanup = async () => {
    try {
      const scopes = `'${fixture.scopeId}','${fixture.otherScopeId}'`;
      sql(`delete from public.audit_log where action like 'payment_execution_%' and target_id in(
 select i.id from private.payment_intents i join private.payment_obligation_contexts c on c.id=i.context_id where c.client_id='${fixture.owner.id}'
 union select s.id from private.payment_execution_steps s join private.payment_execution_runs r on r.id=s.run_id where r.scope_id in(${scopes}));
 delete from private.payment_execution_observations where run_id in(select id from private.payment_execution_runs where scope_id in(${scopes}));
 delete from private.payment_execution_protocols where run_id in(select id from private.payment_execution_runs where scope_id in(${scopes}));
 update private.payment_execution_runs set current_step=null where scope_id in(${scopes});
 delete from private.payment_execution_steps where run_id in(select id from private.payment_execution_runs where scope_id in(${scopes}));
 delete from private.payment_execution_runs where scope_id in(${scopes});
 delete from public.audit_log where action like 'payment_customer_%' and target_id in(
 select id from private.payment_customer_requests where work_id in(select id from private.payment_customer_work where scope_id in(${scopes}))
 union select id from private.payment_customer_steps where work_id in(select id from private.payment_customer_work where scope_id in(${scopes})));
 update private.payment_customer_work set current_step=null where scope_id in(${scopes});
 delete from private.payment_customer_steps where work_id in(select id from private.payment_customer_work where scope_id in(${scopes}));
 delete from private.payment_customer_requests where work_id in(select id from private.payment_customer_work where scope_id in(${scopes}));
 delete from private.payment_customer_work where scope_id in(${scopes});
 delete from public.audit_log where action='payment_fixture_transport' and target_id in(select id from private.payment_fixture_requests where scope_id in(${scopes}));
 delete from private.payment_fixture_invocations where request_id in(select id from private.payment_fixture_requests where scope_id in(${scopes}));
 delete from private.payment_fixture_requests where scope_id in(${scopes});
 delete from private.payment_fixture_controls where scope_id in(${scopes});
 delete from private.payment_fixture_payments where scope_id in(${scopes});
 delete from private.payment_fixture_customers where scope_id in(${scopes});
`);
    } finally {
      try {
        if (priorEnabled !== undefined) {
          sql(
            `update private.payment_fixture_environment set enabled=${priorEnabled} where singleton;`,
          );
        }
      } finally {
        await fixture.cleanup();
      }
    }
  };
  try {
    priorEnabled =
      sql(
        "select enabled from private.payment_fixture_environment where singleton;",
      ) === "t";
    sql(
      `update private.payment_fixture_environment set enabled=true where singleton; delete from private.payment_provider_customers where id='${fixture.bindingId}';`,
    );
    const db = await quoteSession(),
      customerRequest = randomUUID();
    try {
      expect(
        (
          await db.rpc("request_payment_customer", {
            target_client: fixture.owner.id,
            request_id: customerRequest,
          })
        ).error,
      ).toBeNull();
    } finally {
      await db.auth.signOut({ scope: "local" });
    }
    expect((await advanceFixturePaymentCustomer(customerRequest)).state).toBe(
      "ready_to_create",
    );
    expect((await advanceFixturePaymentCustomer(customerRequest)).state).toBe(
      "bound",
    );

    const sample = await fixture.create(),
      session = await quoteSession(),
      requestId = randomUUID();
    let context, intentId;
    try {
      context = await fixture.prepare(sample, session, "deposit", {
        billing_type: billingType,
      });
      const r = await session.rpc("reserve_payment_intent", {
        target_context: context.id,
        request_id: requestId,
      });
      expect(r.error).toBeNull();
      intentId = paymentIntentReceiptSchema.parse(r.data).snapshot.intent.id;
    } finally {
      await session.auth.signOut({ scope: "local" });
    }
    return { ...fixture, sample, requestId, intentId, context, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
