import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  financialJourneyFixture,
  type FinancialScenario,
} from "../e2e/financial-journey-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import {
  depositInfoSchema,
  depositReceiptSchema,
} from "@/modules/payments/deposit";
import {
  parseCurrentOrderCredits,
  deliveryCreditSchema,
} from "@/modules/payments/order-credit";
let f: Awaited<ReturnType<typeof financialJourneyFixture>>;
let sessions: Record<string, SupabaseClient>;
beforeEach(async () => {
  f = await financialJourneyFixture();
  sql(
    "update public.settings set pix_key='pix-ficticio-leitura-atual' where singleton;",
  );
  sessions = {};
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
}, 60000);
afterEach(async () => {
  try {
    await Promise.all(
      Object.values(sessions ?? {}).map((db) =>
        db.auth.signOut({ scope: "local" }),
      ),
    );
  } finally {
    if (f) await f.cleanup();
  }
}, 60000);
async function current(orderId = f.sample.order_id, db = sessions.client) {
  const r = await db.rpc("get_current_order_credits", {
    target_orders: [orderId],
  });
  expect(r.error).toBeNull();
  return parseCurrentOrderCredits(r.data, [orderId]).get(orderId)!;
}
async function signal(sample = f.sample, db = sessions.client) {
  const r = await db.rpc("get_process_deposit_instructions", {
    target_process: sample.process_id,
  });
  expect(r.error).toBeNull();
  return depositInfoSchema
    .array()
    .parse(r.data)
    .find((row) => row.orderId === sample.order_id)!;
}
async function initial(scenario: FinancialScenario = "received") {
  await f.observe(scenario);
  await f.createOrigin();
  await f.apply();
  await f.bind();
}
async function balance() {
  const ids = (
    await f.db.from("deliveries").select("id").eq("order_id", f.sample.order_id)
  ).data!.map((d) => d.id);
  const r = await sessions.client.rpc("get_delivery_credit_instructions", {
    target_process: f.sample.process_id,
    target_deliveries: ids,
  });
  expect(r.error).toBeNull();
  return deliveryCreditSchema.array().parse(r.data);
}
async function delivery() {
  await f.deliver(f.sample);
  const id = (
    await f.db
      .from("deliveries")
      .select("id")
      .eq("order_id", f.sample.order_id)
      .single()
  ).data!.id;
  expect(
    (
      await f.db.from("delivery_releases").insert({
        delivery_id: id,
        policy: "after_balance",
        approved_by: f.calculator.id,
      })
    ).error,
  ).toBeNull();
  return id;
}
it.each([
  ["partial", 10000, 2501, 0],
  ["excess", 13000, 0, 499],
] as const)(
  "leitores compartilham W em %s, sem somar novamente legado vinculado",
  async (scenario, paid, remaining, excess) => {
    await initial(scenario);
    const c = await current(),
      s = await signal(f.sample, sessions.calculator);
    expect(c.projection).toEqual(f.view().projection);
    expect(c.projection).toMatchObject({
      depositCreditCents: paid,
      remainingDepositCents: remaining,
      depositExcessCents: excess,
      manualDepositCents: 0,
      providerObservedDepositCents: paid,
    });
    expect(s.confirmedCents).toBe(paid);
    expect(s.remainingCents).toBe(remaining);
    expect(s.credit).toEqual(c);
    expect(s.canConfirm).toBe(false);
    expect(s.pixKey).toBeNull();
    expect(c.activeReservation).toBe(true);
    expect(c.collectionState).toBe(scenario === "excess" ? "excess" : "active");
  },
  30000,
);
it("recebimento bruto com taxa e terminal mostra crédito uma vez; claim histórico não bloqueia nova instrução", async () => {
  await initial();
  await f.resolve();
  const c = await current(),
    s = await signal(f.sample, sessions.calculator);
  expect(f.view().claims).toBe(1);
  expect(c.activeReservation).toBe(false);
  expect(c.collectionState).toBe("clear");
  expect(c.projection.depositCreditCents).toBe(12501);
  expect(f.view().position.feeCents).toBe(100);
  expect(s.receipt).toBeNull();
  expect(s.confirmedName).toBeNull();
  expect(s.canConfirm).toBe(false);
  await delivery();
  expect((await balance())[0]).toMatchObject({
    remainingCents: 12500,
    pixKey: expect.any(String),
  });
}, 30000);
it.each(["refund_pending", "unknown"] as const)(
  "%s preserva subtotal e histórico sem valores disponíveis ou Pix",
  async (scenario) => {
    await initial();
    await f.observe(scenario);
    await f.apply();
    const c = await current(),
      s = await signal(f.sample, sessions.calculator);
    expect(c.collectionState).toBe("reconcile");
    expect(c.projection.providerObservedDepositCents).toBe(12501);
    expect(s).toMatchObject({
      confirmedCents: null,
      remainingCents: null,
      canConfirm: false,
      pixKey: null,
    });
    const receipts = f.receipts();
    expect((await f.replay()).legacy).toEqual(receipts.legacy);
    expect((await f.replay()).binding).toEqual(receipts.binding);
  },
  30000,
);
it("refund integral recompõe o sinal para zero conhecido sem recontar pagamento histórico", async () => {
  await initial();
  await f.observe("refund_full");
  await f.apply();
  await f.resolve();
  const c = await current(),
    s = await signal(f.sample, sessions.calculator);
  expect(c.projection.depositCreditCents).toBe(0);
  expect(c.activeReservation).toBe(false);
  expect(s).toMatchObject({
    confirmedCents: 0,
    remainingCents: 12501,
    canConfirm: true,
    pixKey: expect.any(String),
  });
  expect(
    (
      await f.db
        .from("payments")
        .select("amount_cents,status")
        .eq("order_id", f.sample.order_id)
    ).data,
  ).toEqual([{ amount_cents: 12501, status: "confirmed" }]);
}, 30000);
it("reserva sem charge e de outro scope bloqueia sinal e saldo do pedido", async () => {
  const sample = await f.create();
  expect((await signal(sample, sessions.calculator)).canConfirm).toBe(true);
  f.scope(f.otherScopeId);
  const ctx = await f.prepare(sample, sessions.calculator),
    requestId = randomUUID();
  expect(
    (
      await sessions.calculator.rpc("reserve_payment_intent", {
        target_context: ctx.id,
        request_id: requestId,
      })
    ).error,
  ).toBeNull();
  expect(
    sql(
      `select count(*) from private.payment_financial_charges where order_id='${sample.order_id}';`,
    ),
  ).toBe("0");
  f.scope();
  const c = await current(sample.order_id),
    s = await signal(sample, sessions.calculator);
  expect(c.projection.depositCreditCents).toBe(0);
  expect(c.collectionState).toBe("active");
  expect(s.canConfirm).toBe(false);
  expect(s.pixKey).toBeNull();
  await f.deliver(sample);
  const d = (
    await f.db
      .from("deliveries")
      .select("id")
      .eq("order_id", sample.order_id)
      .single()
  ).data!.id;
  expect(
    (
      await f.db.from("delivery_releases").insert({
        delivery_id: d,
        policy: "after_balance",
        approved_by: f.calculator.id,
      })
    ).error,
  ).toBeNull();
  const r = await sessions.client.rpc("get_delivery_credit_instructions", {
    target_process: sample.process_id,
    target_deliveries: [d],
  });
  expect(r.error).toBeNull();
  expect(deliveryCreditSchema.array().parse(r.data)[0]).toMatchObject({
    pixKey: null,
    remainingCents: 25001,
    credit: { activeReservation: true },
  });
}, 30000);
it("manual atual conserva recibo imutável e inclui estorno nas leituras", async () => {
  const sample = await f.create(),
    r = await sessions.calculator.rpc("confirm_manual_deposit", {
      target_quote: sample.id,
      expected_context: sample.contextHash,
      expected_remaining_cents: 12501,
      request_id: randomUUID(),
      confirmed: true,
    });
  expect(r.error).toBeNull();
  const receipt = depositReceiptSchema.parse(r.data);
  expect((await signal(sample)).receipt).toEqual(receipt);
  expect((await current(sample.order_id)).projection).toMatchObject({
    depositCreditCents: 12501,
    manualDepositCents: 12501,
    providerObservedDepositCents: 0,
  });
  expect(
    (
      await f.db
        .from("payments")
        .update({ status: "refunded" })
        .eq("id", receipt.paymentId!)
    ).error,
  ).toBeNull();
  const now = await signal(sample, sessions.calculator);
  expect(now).toMatchObject({
    confirmedCents: 0,
    remainingCents: 12501,
    paymentStatus: "refunded",
    canConfirm: true,
  });
  expect(now.receipt).toEqual(receipt);
}, 30000);
it("manual comprovado sem recibo pode ser conferido por zero; provedor não ganha autoria manual", async () => {
  const sample = await f.create();
  expect(
    (
      await f.db.from("payments").insert({
        order_id: sample.order_id,
        amount_cents: 12501,
        method: "pix_manual",
        kind: "deposit",
        status: "confirmed",
      })
    ).error,
  ).toBeNull();
  const s = await signal(sample, sessions.calculator);
  expect(s).toMatchObject({
    confirmedCents: 12501,
    remainingCents: 0,
    canConfirm: true,
    receipt: null,
    pixKey: null,
  });
  await initial();
  await f.resolve();
  expect((await signal(f.sample, sessions.calculator)).canConfirm).toBe(false);
}, 30000);
it("contrato vigente dispensa sinal sem quitar crédito ou reduzir saldo artificialmente", async () => {
  const sample = await f.create();
  sql(`update public.clients set has_contract=true where id='${f.owner.id}';`);
  expect(await current(sample.order_id)).toMatchObject({
    hasContract: true,
    projection: { totalCreditCents: 0, remainingTotalCents: 25001 },
  });
  expect(await signal(sample, sessions.calculator)).toMatchObject({
    hasContract: true,
    canConfirm: false,
    pixKey: null,
  });
}, 30000);
it("legado sem origem não recebe certeza por referência nem valor observado", async () => {
  const sample = await f.create();
  expect(
    (
      await f.db.from("payments").insert({
        order_id: sample.order_id,
        amount_cents: 12501,
        method: "asaas",
        kind: "deposit",
        status: "confirmed",
        provider_ref: "referencia-ficticia-sem-origem",
      })
    ).error,
  ).toBeNull();
  expect((await current(sample.order_id)).projection).toMatchObject({
    unlinkedLegacyCount: 1,
    depositCreditCents: null,
    totalCreditCents: null,
    providerObservedDepositCents: 0,
  });
  expect(await signal(sample, sessions.calculator)).toMatchObject({
    canConfirm: false,
    pixKey: null,
    confirmedCents: null,
    remainingCents: null,
  });
}, 30000);
it("saldo atual retorna conciliação explícita e apenas a entrega mais recente por pedido", async () => {
  await initial();
  await f.resolve();
  const id = await delivery();
  const original = (
      await f.db.from("deliveries").select("*").eq("id", id).single()
    ).data!,
    latest = randomUUID();
  expect(
    (
      await f.db.from("deliveries").insert({
        ...original,
        id: latest,
        created_at: new Date(
          Date.parse(original.created_at) + 1000,
        ).toISOString(),
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await f.db.from("delivery_releases").insert({
        delivery_id: latest,
        policy: "after_balance",
        approved_by: f.calculator.id,
      })
    ).error,
  ).toBeNull();
  expect((await balance()).map((row) => row.deliveryId)).toEqual([latest]);
  await f.observe("unknown");
  await f.apply();
  const rows = await balance();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    deliveryId: latest,
    remainingCents: null,
    pixKey: null,
    credit: { collectionState: "reconcile" },
  });
  const legacy = await sessions.client.rpc(
    "get_delivery_payment_instructions",
    { target_process: f.sample.process_id, target_deliveries: [id, latest] },
  );
  expect(legacy.error).toBeNull();
  expect(legacy.data).toEqual([
    {
      delivery_id: latest,
      pix_key: null,
      remaining_cents: null,
      order_code: f.orderCode,
    },
  ]);
}, 30000);
it("lote é integral, restrito a50 pedidos e audita somente leituras autorizadas", async () => {
  const own = await f.create();
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const count = () =>
    sql(
      `select count(*) from public.audit_log where action='payment_credit_read' and target_id='${own.order_id}';`,
    );
  const before = count();
  for (const db of [sessions.clientB, sessions.admin, anon, f.db])
    expect(
      (
        await db.rpc("get_current_order_credits", {
          target_orders: [own.order_id],
        })
      ).error,
    ).not.toBeNull();
  for (const ids of [
    [own.order_id, randomUUID()],
    [own.order_id, own.order_id],
    Array(51).fill(own.order_id),
    [null],
  ])
    expect(
      (
        await sessions.client.rpc("get_current_order_credits", {
          target_orders: ids,
        })
      ).error,
    ).not.toBeNull();
  expect(count()).toBe(before);
  expect(
    (
      await sessions.client.rpc("get_current_order_credits", {
        target_orders: [],
      })
    ).data,
  ).toEqual([]);
  await current(own.order_id);
  expect(Number(count())).toBe(Number(before) + 1);
  expect(
    sql(
      "select count(*) from information_schema.routine_privileges where routine_schema='private' and routine_name in('current_order_credit','current_order_credits') and grantee in('anon','authenticated','service_role','PUBLIC');",
    ),
  ).toBe("0");
  for (const db of [sessions.clientB, sessions.admin, anon, f.db])
    expect(
      (
        await db.rpc("get_delivery_credit_instructions", {
          target_process: own.process_id,
          target_deliveries: [],
        })
      ).error,
    ).not.toBeNull();
}, 30000);
it("reserva posterior de saldo bloqueia instrução mesmo com claim antigo resolvido", async () => {
  await initial();
  await f.resolve();
  await delivery();
  const context = await f.prepare(f.sample, sessions.calculator, "balance");
  expect(
    (
      await sessions.calculator.rpc("reserve_payment_intent", {
        target_context: context.id,
        request_id: randomUUID(),
      })
    ).error,
  ).toBeNull();
  expect(await current()).toMatchObject({
    activeReservation: true,
    collectionState: "active",
    projection: { totalCreditCents: 12501, remainingTotalCents: 12500 },
  });
  expect((await balance())[0]).toMatchObject({
    remainingCents: 12500,
    pixKey: null,
  });
  expect(f.view().claims).toBe(1);
}, 30000);
it("conferência zero sob reserva existente preserva sua proteção e não cria pagamento", async () => {
  const sample = await f.create(),
    context = await f.prepare(sample, sessions.calculator);
  expect(
    (
      await sessions.calculator.rpc("reserve_payment_intent", {
        target_context: context.id,
        request_id: randomUUID(),
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await f.db.from("payments").insert({
        order_id: sample.order_id,
        amount_cents: 12501,
        method: "pix_manual",
        kind: "deposit",
        status: "confirmed",
      })
    ).error,
  ).toBeNull();
  const protection = sql(
    `select row_to_json(r) from private.payment_intent_reservations r where order_id='${sample.order_id}';`,
  );
  expect(await signal(sample, sessions.calculator)).toMatchObject({
    remainingCents: 0,
    canConfirm: true,
    pixKey: null,
    credit: { activeReservation: true },
  });
  const r = await sessions.calculator.rpc("confirm_manual_deposit", {
    target_quote: sample.id,
    expected_context: sample.contextHash,
    expected_remaining_cents: 0,
    request_id: randomUUID(),
    confirmed: true,
  });
  expect(r.error).toBeNull();
  expect(depositReceiptSchema.parse(r.data)).toMatchObject({
    amountCents: 0,
    paymentId: null,
  });
  expect(
    sql(
      `select count(*) from public.payments where order_id='${sample.order_id}';`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select row_to_json(r) from private.payment_intent_reservations r where order_id='${sample.order_id}';`,
    ),
  ).toBe(protection);
  expect((await signal(sample, sessions.calculator)).canConfirm).toBe(false);
}, 30000);
it("saldo conhecido combina fontes elegíveis, ignora triagem e pendência, zera e recompõe após estorno", async () => {
  await initial();
  await f.resolve();
  const deliveryId = await delivery();
  const r = await f.db
    .from("payments")
    .insert([
      {
        order_id: f.sample.order_id,
        amount_cents: 5000,
        method: "pix_manual",
        kind: "balance",
        status: "confirmed",
      },
      {
        order_id: f.sample.order_id,
        amount_cents: 7500,
        method: "pix_manual",
        kind: "balance",
        status: "pending",
      },
      {
        order_id: f.sample.order_id,
        amount_cents: 25001,
        method: "pix_manual",
        kind: "triage",
        status: "confirmed",
      },
    ])
    .select("id,status,kind");
  expect(r.error).toBeNull();
  const pendingId = r.data!.find((row) => row.status === "pending")!.id;
  expect((await current()).projection).toMatchObject({
    totalCreditCents: 17501,
    remainingTotalCents: 7500,
  });
  expect((await balance())[0]).toMatchObject({
    remainingCents: 7500,
    pixKey: "pix-ficticio-leitura-atual",
  });
  expect(
    (
      await f.db
        .from("payments")
        .update({ status: "confirmed" })
        .eq("id", pendingId)
    ).error,
  ).toBeNull();
  expect((await current()).projection).toMatchObject({
    totalCreditCents: 25001,
    remainingTotalCents: 0,
  });
  expect((await balance())[0]).toMatchObject({
    remainingCents: 0,
    pixKey: null,
  });
  expect(
    (
      await sessions.client.rpc("get_delivery_payment_instructions", {
        target_process: f.sample.process_id,
        target_deliveries: [deliveryId],
      })
    ).data,
  ).toEqual([]);
  expect(
    (
      await f.db
        .from("payments")
        .update({ status: "refunded" })
        .eq("id", pendingId)
    ).error,
  ).toBeNull();
  expect((await balance())[0]).toMatchObject({
    remainingCents: 7500,
    pixKey: "pix-ficticio-leitura-atual",
  });
}, 30000);
