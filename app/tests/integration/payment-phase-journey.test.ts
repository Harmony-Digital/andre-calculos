import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => session,
}));
vi.mock("@/modules/auth/session", () => ({
  authorize: async (roles: readonly string[]) => {
    const user = (await session.auth.getUser()).data.user;
    const profile = user
      ? await session
          .from("profiles")
          .select("id,role")
          .eq("id", user.id)
          .single()
      : null;
    if (!profile?.data || !roles.includes(profile.data.role))
      throw new Error("Acesso não autorizado.");
    return { profile: profile.data };
  },
}));
import { balanceJourneyFixture } from "../e2e/balance-journey-helper";
import { executionTransportFixture } from "../e2e/execution-transport-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { paymentIntentReceiptSchema } from "@/modules/payments/intents";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import {
  captureFixtureFinancialObservation,
  queryFixtureFinancialObservation,
} from "@/modules/payments/financial-worker";
import { applyFixtureFinancialObservation } from "@/modules/payments/financial-application";
import { getPaymentInvoice } from "@/modules/payments/invoice-query";
let balance: Awaited<ReturnType<typeof balanceJourneyFixture>> | undefined;
let contract: Awaited<ReturnType<typeof executionTransportFixture>> | undefined;
let session: Awaited<ReturnType<typeof quoteSession>>;
afterEach(async () => {
  await session?.auth.signOut({ scope: "local" });
  await balance?.cleanup();
  balance = undefined;
  await contract?.cleanup();
  contract = undefined;
}, 60000);
const literal = (value: unknown) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
it("chargeback do saldo conserva sinal, histórico e taxa fora da dívida", async () => {
  balance = await balanceJourneyFixture("CREDIT_CARD");
  const b = balance;
  await b.reserve();
  await b.advance();
  await b.capture();
  await b.receive();
  session = await quoteSession();
  const ids = b.ids(),
    order = b.signal.sample.order_id;
  const original = sql(
    `select json_agg(row_to_json(p) order by p.id)::text from public.payments p where order_id='${order}';`,
  );
  const confirmations = sql(
    `select count(*) from public.timeline_events where order_id='${order}' and kind='payment_confirmed';`,
  );
  const observe = async (
    status: "IN_DISPUTE" | "DONE",
    restore: "none" | "partial" | "full",
  ) => {
    const reversals =
      restore === "none"
        ? []
        : [
            {
              id: "reversal_fixture",
              value: 10.01,
              reversesDebitId: "debit_fixture",
              effectedAt: "2026-10-12T11:00:00-03:00",
            },
            ...(restore === "full"
              ? [
                  {
                    id: "second_reversal_fixture",
                    value: 10,
                    reversesDebitId: "debit_fixture",
                    effectedAt: "2026-10-12T12:00:00-03:00",
                  },
                ]
              : []),
          ];
    const cb = {
      status,
      fixtureProof: {
        schemaVersion: 1,
        semantics: "fixture_chargeback_cumulative",
        paymentId: ids.paymentId,
        reference: ids.intentId,
        caseId: "case_fixture",
        debit: {
          id: "debit_fixture",
          value: 20.01,
          effectedAt: "2026-10-12T10:00:00-03:00",
        },
        reversals,
      },
    };
    sql(
      `update private.payment_fixture_payments set status='CHARGEBACK_DISPUTE',chargeback=${literal(cb)} where scope_id='${b.signal.scopeId}' and id='${ids.paymentId}';`,
    );
    const observation = await queryFixtureFinancialObservation(
      ids.chargeId,
      randomUUID(),
    );
    return await applyFixtureFinancialObservation({
      observationId: observation.observationId,
      requestId: randomUUID(),
    });
  };
  const disputed = await observe("IN_DISPUTE", "none");
  expect(disputed.effects).toEqual(["debited", "reconcile"]);
  expect(b.view().projection).toMatchObject({
    depositCreditCents: 12501,
    totalCreditCents: null,
  });
  expect(
    await getPaymentInvoice(order, b.signal.sample.process_id, "balance"),
  ).toMatchObject({
    state: "uncertain",
    remainingCents: null,
    invoiceUrl: null,
  });
  expect((await observe("DONE", "none")).effects).toEqual(["reconciled"]);
  expect(b.view()).toMatchObject({
    status: "delivered",
    projection: {
      depositCreditCents: 12501,
      totalCreditCents: 23000,
      remainingTotalCents: 2001,
    },
    position: { feeCents: 100 },
  });
  expect((await observe("DONE", "partial")).effects).toEqual(["restored"]);
  expect(b.view().projection).toMatchObject({
    depositCreditCents: 12501,
    totalCreditCents: 24001,
    remainingTotalCents: 1000,
  });
  const full = await observe("DONE", "full");
  expect(full.effects).toEqual(["restored"]);
  expect(b.view().projection).toMatchObject({
    depositCreditCents: 12501,
    totalCreditCents: 25001,
    remainingTotalCents: 0,
  });
  expect(
    await applyFixtureFinancialObservation({
      observationId: full.observationId,
      requestId: full.requestId,
    }),
  ).toEqual(full);
  expect(
    sql(
      `select json_agg(row_to_json(p) order by p.id)::text from public.payments p where order_id='${order}';`,
    ),
  ).toBe(original);
  expect(
    sql(
      `select count(*) from public.timeline_events where order_id='${order}' and kind='payment_confirmed';`,
    ),
  ).toBe(confirmations);
  expect(b.view().posts).toBe(1);
});
it.each(["PIX", "BOLETO", "CREDIT_CARD"])(
  "cliente com contrato recebe saldo integral por %s somente na entrega",
  async (method) => {
    contract = await executionTransportFixture();
    const f = contract;
    session = await quoteSession();
    const calc = await quoteSession("calculator"),
      change = randomUUID();
    try {
      // Reserva de sinal ainda não despachada é retirada pela RPC real; não apagar proteção.
      const withdrawal = await session.rpc("withdraw_payment_intent", {
        target_intent: f.intentId,
        expected_revision: 0,
        request_id: randomUUID(),
      });
      expect(withdrawal.error).toBeNull();
      expect(paymentIntentReceiptSchema.parse(withdrawal.data).action).toBe(
        "withdraw",
      );
      expect(
        (
          await calc.rpc("set_client_contract", {
            target_client: f.owner.id,
            has_contract: true,
            expected_revision: Number(
              sql(
                `select contract_revision from public.clients where id='${f.owner.id}';`,
              ),
            ),
            request_id: change,
            reason: "Condição fictícia para conferir saldo integral na entrega",
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await session.rpc("get_payment_obligation", {
            target_order: f.sample.order_id,
            target_phase: "deposit",
          })
        ).data,
      ).toMatchObject({ status: "waived", remainingCents: 0 });
      expect(
        (
          await session.rpc("get_payment_obligation", {
            target_order: f.sample.order_id,
            target_phase: "balance",
          })
        ).data,
      ).toMatchObject({ status: "blocked", reason: "phase_unavailable" });
      await f.deliver(f.sample);
      const context = await f.prepare(f.sample, session, "balance", {
        billing_type: method,
      });
      expect(context.snapshot).toMatchObject({
        hasContract: true,
        phase: "balance",
        totalCreditedCents: 0,
        remainingCents: 25001,
      });
      const request = randomUUID(),
        reserved = await session.rpc("reserve_payment_intent", {
          target_context: context.id,
          request_id: request,
        });
      expect(reserved.error).toBeNull();
      const intent = paymentIntentReceiptSchema.parse(reserved.data).snapshot
        .intent.id;
      expect((await advanceFixturePaymentExecution(request)).state).toBe(
        "identified",
      );
      const origin = sql(
        `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${intent}' and o.facts is not null limit 1;`,
      );
      const capture = await captureFixtureFinancialObservation(origin);
      const payment = sql(
        `select provider_payment_id from private.payment_financial_charges where id='${capture.chargeId}';`,
      );
      sql(
        `update private.payment_fixture_payments set refunds='[]' where scope_id='${f.scopeId}' and id='${payment}';`,
      );
      const observed = await queryFixtureFinancialObservation(
        capture.chargeId,
        randomUUID(),
      );
      await applyFixtureFinancialObservation({
        observationId: observed.observationId,
        requestId: randomUUID(),
      });
      expect(
        await getPaymentInvoice(
          f.sample.order_id,
          f.sample.process_id,
          "balance",
        ),
      ).toMatchObject({
        phase: "balance",
        state: "active",
        invoiceAmountCents: 25001,
        remainingCents: null,
        billingType: method,
      });
      expect(
        sql(
          `select count(*) from private.payment_fixture_payments where client_id='${f.owner.id}';`,
        ),
      ).toBe("1");
      expect(
        sql(
          `select count(*) from public.payments where order_id='${f.sample.order_id}';`,
        ),
      ).toBe("0");
    } finally {
      await calc.auth.signOut({ scope: "local" });
      sql(
        `delete from public.audit_log where action='client_contract_changed' and target_id='${change}';delete from private.client_contract_changes where id='${change}';`,
      );
    }
  },
  60000,
);
