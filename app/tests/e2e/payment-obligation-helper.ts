import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acceptanceFixture } from "./acceptance-helper";
import { localNotificationSql as sql } from "./notification-helper";
import {
  paymentObligationSchema,
  paymentObligationReceiptSchema,
} from "@/modules/payments/obligation-data";
const literal = (value: string | null) =>
  value === null ? "null" : "'" + value.replaceAll("'", "''") + "'";
export async function paymentObligationFixture() {
  const fixture = await acceptanceFixture();
  type Sample = Awaited<ReturnType<typeof fixture.create>>;
  const scopeId = randomUUID(),
    otherScopeId = randomUUID(),
    bindingId = randomUUID(),
    otherBindingId = randomUUID(),
    orders: string[] = [];
  const scope = (id: string = scopeId) =>
    sql(
      `insert into private.payment_provider_configuration(singleton,scope_id) values(true,'${id}') on conflict(singleton) do update set scope_id=excluded.scope_id;`,
    );
  try {
    const prior = JSON.parse(
      sql(
        `select row_to_json(c) from (select kind,document from public.clients where id='${fixture.owner.id}') c;`,
      ),
    ) as { kind: string; document: string | null };
    const priorScope = sql(
      "select scope_id from private.payment_provider_configuration where singleton;",
    );
    sql(`begin; update public.clients set kind='person',document='11144477735' where id='${fixture.owner.id}';
      insert into private.payment_provider_scopes(id,provider,mode,environment,account_id) values('${scopeId}','asaas','fixture','sandbox','fixture-${scopeId}'),('${otherScopeId}','asaas','fixture','sandbox','fixture-${otherScopeId}');
      insert into private.payment_provider_customers(id,scope_id,client_id,customer_id,kind,document) values('${bindingId}','${scopeId}','${fixture.owner.id}','cus_fixture_${bindingId}','person','11144477735'),('${otherBindingId}','${otherScopeId}','${fixture.owner.id}','cus_fixture_${otherBindingId}','person','11144477735');
      insert into private.payment_provider_configuration(singleton,scope_id) values(true,'${scopeId}') on conflict(singleton) do update set scope_id=excluded.scope_id; commit;`);
    const prepare = async (
      s: Sample,
      db: SupabaseClient,
      phase: "deposit" | "balance" = "deposit",
      patch: Record<string, unknown> = {},
    ) => {
      const current = await db.rpc("get_payment_obligation", {
        target_order: s.order_id,
        target_phase: phase,
      });
      if (current.error) throw new Error("Obrigação da fixture indisponível.");
      const view = paymentObligationSchema.parse(current.data);
      const result = await db.rpc("prepare_payment_obligation", {
        target_order: s.order_id,
        target_phase: phase,
        expected_context: s.contextHash,
        expected_remaining_cents: view.remainingCents,
        request_id: randomUUID(),
        billing_type: "PIX",
        due_date: "2026-10-20",
        ...patch,
      });
      if (result.error) throw new Error("Contexto da fixture indisponível.");
      return paymentObligationReceiptSchema.parse(result.data);
    };
    return {
      ...fixture,
      scopeId,
      otherScopeId,
      bindingId,
      otherBindingId,
      scope,
      prepare,
      create: async (options: Parameters<typeof fixture.create>[0] = {}) => {
        const s = await fixture.create(options);
        orders.push(s.order_id);
        const accepted = await fixture.db.rpc("accept_quote_system", s.args());
        if (accepted.error) throw new Error("Aceite da fixture indisponível.");
        return s;
      },
      deliver: async (s: Sample) => {
        const a = await fixture.db
          .from("orders")
          .update({ status: "delivered" })
          .eq("id", s.order_id);
        const b = await fixture.db.from("deliveries").insert({
          id: randomUUID(),
          process_id: s.process_id,
          order_id: s.order_id,
          confirmed_by: fixture.calculator.id,
          pje_version: "FICTICIO",
          index_month: "2026-10",
          checklist: { liquidated: true, taxIdPresent: true, reviewed: true },
          professional: {
            name: "Profissional fictício",
            crc: "CRC FICTICIO",
          },
          payload: { fixture: true },
        });
        if (a.error || b.error)
          throw new Error("Entrega da fixture indisponível.");
      },
      cleanup: async () => {
        try {
          for (const id of orders)
            sql(`delete from public.audit_log where action like 'payment_intent_%' and target_id in(select id from private.payment_intents where order_id='${id}');
            delete from private.payment_intent_withdrawals where intent_id in(select id from private.payment_intents where order_id='${id}');
            delete from private.payment_intent_dispatch_claims where intent_id in(select id from private.payment_intents where order_id='${id}');
            delete from private.payment_intent_reservations where order_id='${id}';
            delete from private.payment_intent_requests where intent_id in(select id from private.payment_intents where order_id='${id}');
            delete from private.payment_intents where order_id='${id}';
            delete from public.audit_log where action='payment_obligation_prepared' and target_id in(select id from private.payment_obligation_contexts where order_id='${id}');
            delete from private.payment_obligation_contexts where order_id='${id}'; delete from public.deliveries where order_id='${id}';`);
          sql(
            `update public.clients set kind=${literal(prior.kind)},document=${literal(prior.document)},owner_id='${fixture.owner.owner_id}' where id='${fixture.owner.id}';`,
          );
          if (priorScope) scope(priorScope);
          else
            sql(
              "delete from private.payment_provider_configuration where singleton;",
            );
          sql(
            `delete from private.payment_provider_customers where scope_id in('${scopeId}','${otherScopeId}'); delete from private.payment_provider_scopes where id in('${scopeId}','${otherScopeId}');`,
          );
        } finally {
          await fixture.cleanup();
        }
      },
    };
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}
