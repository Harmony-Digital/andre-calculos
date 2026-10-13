import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { financialJourneyFixture } from "../e2e/financial-journey-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { quoteSession } from "../e2e/quote-helper";
import {
  parseDeliveryAccessContexts,
  deriveDeliveryCreditAccess,
} from "@/modules/delivery/credit-access";

let f: Awaited<ReturnType<typeof financialJourneyFixture>>;
beforeEach(async () => {
  f = await financialJourneyFixture();
}, 60000);
afterEach(async () => {
  if (f) await f.cleanup();
}, 60000);

it.each(["before_balance", "after_balance"] as const)(
  "%s: segunda reversão recompõe crédito e liberação sem apagar provas ou duplicar recebimento",
  async (policy) => {
    await f.observe("received");
    await f.createOrigin();
    const firstApplication = await f.apply();
    await f.bind();
    await f.resolve();
    if (policy === "after_balance") {
      // Saldo sintético explícito: este ensaio não valida o comando de M3.09.
      expect(
        (
          await f.db.from("payments").insert({
            order_id: f.sample.order_id,
            kind: "balance",
            method: "pix_manual",
            amount_cents: 12500,
            status: "confirmed",
          })
        ).error,
      ).toBeNull();
    }
    await f.deliver(f.sample);
    const delivery = (
      await f.db
        .from("deliveries")
        .select("id,order_id,process_id")
        .eq("order_id", f.sample.order_id)
        .single()
    ).data!;
    expect(
      (
        await f.db.from("delivery_releases").insert({
          delivery_id: delivery.id,
          policy,
          approved_by: f.calculator.id,
        })
      ).error,
    ).toBeNull();
    const actor = await quoteSession();
    const access = async () => {
      const result = await actor.rpc("get_current_delivery_access_contexts", {
        target_process: f.sample.process_id,
        target_deliveries: [delivery.id],
      });
      expect(result.error).toBeNull();
      return deriveDeliveryCreditAccess(
        parseDeliveryAccessContexts(result.data, f.sample.process_id, [
          delivery,
        ]).get(delivery.id)!,
      );
    };
    const protectedState = () =>
      sql(`select md5(json_build_object(
      'run',(select row_to_json(r) from private.payment_execution_runs r where intent_id='${f.intentId}'),
      'claim',(select row_to_json(c) from private.payment_intent_dispatch_claims c where intent_id='${f.intentId}'),
      'reservation',(select row_to_json(v) from private.payment_intent_reservations v where intent_id='${f.intentId}'),
      'posts',(select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${f.intentId}'),
      'origin',(select row_to_json(o) from private.payment_legacy_origins o where charge_id='${f.chargeId}'),
      'binding',(select row_to_json(b) from private.payment_legacy_binding_receipts b where charge_id='${f.chargeId}'),
      'application',(select row_to_json(a) from private.payment_financial_applications a where request_id='${firstApplication.requestId}'),
      'terminal',(select row_to_json(t) from private.payment_financial_resolutions t where charge_id='${f.chargeId}')
    )::text);`);
    const protectedBefore = protectedState();
    const proof = () =>
      JSON.parse(
        sql(
          `select chargeback->'fixtureProof' from private.payment_fixture_payments where scope_id='${f.scopeId}' and id='${f.paymentId}';`,
        ),
      );
    try {
      expect(await access()).toBe("ready");
      await f.observe("chargeback_debit");
      await f.apply();
      expect(f.view().projection.depositCreditCents).toBe(10500);
      expect(await access()).toBe(
        policy === "before_balance" ? "deposit_pending" : "balance_pending",
      );
      await f.observe("chargeback_restore");
      await f.apply();
      expect(f.view().projection.depositCreditCents).toBe(11501);
      expect(await access()).not.toBe("ready");
      const partialProof = proof();
      await f.observe("chargeback_restore_full");
      const restored = await f.apply();
      expect(restored.effects).toEqual(["restored"]);
      expect(f.view().projection.depositCreditCents).toBe(12501);
      expect(f.view().projection.totalCreditCents).toBe(
        policy === "after_balance" ? 25001 : 12501,
      );
      expect(await access()).toBe("ready");
      const fullProof = proof();
      expect(fullProof.debit).toEqual(partialProof.debit);
      expect(fullProof.reversals.slice(0, 1)).toEqual(partialProof.reversals);
      expect(fullProof.reversals).toHaveLength(2);
      expect(fullProof.reversals[1]).toMatchObject({
        value: 10,
        reversesDebitId: fullProof.debit.id,
      });
      const paymentsBefore = (
        await f.db
          .from("payments")
          .select("id,kind,amount_cents,method,status")
          .eq("order_id", f.sample.order_id)
          .order("id")
      ).data;
      await f.observe("chargeback_restore_full");
      expect((await f.apply()).effects).toEqual([]);
      await f.replay();
      expect(f.view().projection.depositCreditCents).toBe(12501);
      expect(
        f
          .view()
          .events.filter((e: { effect: string }) => e.effect === "received"),
      ).toHaveLength(1);
      expect(f.view().status).toBe("delivered");
      expect(protectedState()).toBe(protectedBefore);
      expect(
        (
          await f.db
            .from("payments")
            .select("id,kind,amount_cents,method,status")
            .eq("order_id", f.sample.order_id)
            .order("id")
        ).data,
      ).toEqual(paymentsBefore);
    } finally {
      await actor.auth.signOut({ scope: "local" });
    }
  },
  60000,
);
