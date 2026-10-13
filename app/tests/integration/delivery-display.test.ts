import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { financialJourneyFixture } from "../e2e/financial-journey-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { parseDeliveryDisplay } from "@/modules/delivery/display-context";
import type { SupabaseClient } from "@supabase/supabase-js";
let f: Awaited<ReturnType<typeof financialJourneyFixture>>;
let sessions: Record<string, SupabaseClient>;
let delivery: { id: string; order_id: string; created_at: string };
beforeEach(async () => {
  f = await financialJourneyFixture();
  sessions = {};
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
  await f.observe("received");
  await f.createOrigin();
  await f.apply();
  await f.bind();
  await f.deliver(f.sample);
  delivery = (
    await f.db
      .from("deliveries")
      .select("id,order_id,created_at")
      .eq("order_id", f.sample.order_id)
      .single()
  ).data!;
  expect(
    (
      await f.db.from("delivery_releases").insert({
        delivery_id: delivery.id,
        policy: "after_balance",
        approved_by: f.calculator.id,
      })
    ).error,
  ).toBeNull();
  sql(
    "update public.settings set pix_key='pix-ficticio-display' where singleton;",
  );
}, 60000);
afterEach(async () => {
  try {
    await Promise.all(
      Object.values(sessions ?? {}).map((s) =>
        s.auth.signOut({ scope: "local" }),
      ),
    );
  } finally {
    if (f) await f.cleanup();
  }
}, 60000);
async function read(db = sessions.client, rows = [delivery]) {
  const r = await db.rpc("get_delivery_display_context", {
    target_process: f.sample.process_id,
    target_deliveries: rows.map((d) => d.id),
  });
  expect(r.error).toBeNull();
  return parseDeliveryDisplay(r.data, f.sample.process_id, rows);
}
it("cliente e calculista recebem os mesmos contextos e crédito sem efeito de leitura", async () => {
  const before = f.view(),
    client = await read(),
    calculator = await read(sessions.calculator);
  expect(client).toEqual(calculator);
  expect(client.contexts.get(delivery.id)?.credit).toEqual(
    client.payments.get(delivery.id)?.credit,
  );
  expect(f.view()).toEqual(before);
});
it("UNKNOWN atualiza autorização e saldo no mesmo envelope, sem Pix", async () => {
  await f.observe("unknown");
  await f.apply();
  const result = await read(),
    payment = result.payments.get(delivery.id)!;
  expect(
    result.contexts.get(delivery.id)?.credit.projection.depositCreditCents,
  ).toBeNull();
  expect(payment.remainingCents).toBeNull();
  expect(payment.pixKey).toBeNull();
  expect(payment.credit).toEqual(result.contexts.get(delivery.id)?.credit);
});
it("entregas duplicadas do pedido escolhem uma obrigação por microsegundo e conservam política própria", async () => {
  const original = (
    await f.db.from("deliveries").select("*").eq("id", delivery.id).single()
  ).data!;
  const early = randomUUID(),
    late = randomUUID(),
    before = randomUUID();
  const copies = [
    { ...original, id: early, created_at: "2026-10-12T10:00:00.100001Z" },
    { ...original, id: late, created_at: "2026-10-12T10:00:00.100002Z" },
    { ...original, id: before, created_at: "2026-10-13T10:00:00Z" },
  ];
  expect((await f.db.from("deliveries").insert(copies)).error).toBeNull();
  expect(
    (
      await f.db.from("delivery_releases").insert(
        copies.map((d) => ({
          delivery_id: d.id,
          policy: d.id === before ? "before_balance" : "after_balance",
          approved_by: f.calculator.id,
        })),
      )
    ).error,
  ).toBeNull();
  const result = await read(sessions.client, copies);
  expect(result.contexts.size).toBe(3);
  expect(result.payments.size).toBe(1);
  expect(result.payments.has(late)).toBe(true);
  expect(result.contexts.get(before)?.releasePolicy).toBe("before_balance");
});
it("lote inválido ou de outro usuário não retorna apresentação parcial", async () => {
  for (const db of [sessions.clientB, sessions.admin, f.db])
    expect(
      (
        await db.rpc("get_delivery_display_context", {
          target_process: f.sample.process_id,
          target_deliveries: [delivery.id],
        })
      ).error,
    ).not.toBeNull();
  for (const ids of [
    [delivery.id, randomUUID()],
    [delivery.id, delivery.id],
    Array(51).fill(delivery.id),
  ])
    expect(
      (
        await sessions.client.rpc("get_delivery_display_context", {
          target_process: f.sample.process_id,
          target_deliveries: ids,
        })
      ).error,
    ).not.toBeNull();
  expect((await read(sessions.client, [])).contexts.size).toBe(0);
});
it("função de apresentação é STABLE e não tem entrada anônima ou service_role", () => {
  expect(
    JSON.parse(
      sql(
        "select json_build_object('stable',(select provolatile='s' from pg_proc where oid='public.get_delivery_display_context(uuid,uuid[])'::regprocedure),'definer',(select prosecdef from pg_proc where oid='public.get_delivery_display_context(uuid,uuid[])'::regprocedure),'anon',has_function_privilege('anon','public.get_delivery_display_context(uuid,uuid[])','execute'),'service',has_function_privilege('service_role','public.get_delivery_display_context(uuid,uuid[])','execute'),'authenticated',has_function_privilege('authenticated','public.get_delivery_display_context(uuid,uuid[])','execute'));",
      ),
    ),
  ).toEqual({
    stable: true,
    definer: true,
    anon: false,
    service: false,
    authenticated: true,
  });
});
