import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import {
  webhookFinancialJourneyFixture,
  type WebhookJourneyPhase,
} from "../e2e/webhook-financial-journey-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import {
  parseCurrentOrderCredits,
  deliveryCreditSchema,
} from "@/modules/payments/order-credit";
import { depositInfoSchema } from "@/modules/payments/deposit";
import {
  parseDeliveryAccessContexts,
  deriveDeliveryCreditAccess,
} from "@/modules/delivery/credit-access";
import { getPaymentInvoice } from "@/modules/payments/invoice-query";
import { contractReceiptSchema } from "@/modules/clients/contract";

let f: Awaited<ReturnType<typeof webhookFinancialJourneyFixture>> | undefined;
let session: SupabaseClient;
const sessions: SupabaseClient[] = [],
  contractRequests: string[] = [];
const fixture = () => f!;
async function setup(method = "PIX", phase: WebhookJourneyPhase = "deposit") {
  f = await webhookFinancialJourneyFixture(method, phase);
  session = await actor();
  return f;
}
async function actor(
  role: "client" | "clientB" | "calculator" | "admin" = "client",
) {
  const db = await quoteSession(role);
  sessions.push(db);
  return db;
}
afterEach(async () => {
  try {
    if (contractRequests.length) {
      const ids = contractRequests.map((id) => `'${id}'`).join(",");
      sql(
        `delete from public.audit_log where action='client_contract_changed' and target_id in(${ids}); delete from private.client_contract_changes where id in(${ids});`,
      );
    }
    await Promise.all(
      sessions.map((db) => db.auth.signOut({ scope: "local" })),
    );
  } finally {
    try {
      await f?.cleanup();
    } finally {
      f = undefined;
      sessions.length = contractRequests.length = 0;
    }
  }
}, 60000);

async function current(db = session) {
  const id = fixture().sample.order_id;
  const r = await db.rpc("get_current_order_credits", { target_orders: [id] });
  expect(r.error).toBeNull();
  return parseCurrentOrderCredits(r.data, [id]).get(id)!;
}
const financialState = () => {
  const j = fixture();
  return sql(
    `select md5(json_build_object('credit',private.order_payment_credit('${j.sample.order_id}'),'positions',(select json_agg(row_to_json(p) order by p.charge_id) from private.payment_financial_positions p join private.payment_financial_charges c on c.id=p.charge_id where c.scope_id='${j.scopeId}'),'reservations',(select json_agg(row_to_json(r) order by r.intent_id) from private.payment_intent_reservations r where r.order_id='${j.sample.order_id}'),'payments',(select json_agg(row_to_json(p) order by p.id) from public.payments p where p.order_id='${j.sample.order_id}'),'posts',(select count(*) from private.payment_fixture_requests where scope_id='${j.scopeId}' and operation='payment_create'))::text);`,
  );
};
const commercialState = () => {
  const j = fixture();
  return sql(
    `select md5(json_build_object('acceptances',(select json_agg(row_to_json(a) order by a.quote_id) from private.quote_acceptances a where quote_id='${j.sample.id}'),'context',(select row_to_json(c) from private.quote_contract_contexts c where quote_id='${j.sample.id}'),'contract',(select json_build_object('flag',has_contract,'revision',contract_revision) from public.clients where id='${j.owner.id}'))::text);`,
  );
};
const queueState = () => {
  const j = fixture();
  return JSON.parse(
    sql(
      `select json_build_object('status',(select status from public.orders where id='${j.sample.order_id}'),'audits',(select count(*) from public.audit_log where action='order_queued' and target_id='${j.sample.order_id}'),'notices',(select count(*) from public.notifications where dedup_key='queued:${j.sample.order_id}:email'),'deliveries',(select count(*) from public.deliveries where order_id='${j.sample.order_id}'));`,
    ),
  );
};
async function document(folder = "case") {
  const j = fixture(),
    id = randomUUID(),
    uploader = folder === "deliverables" ? j.calculator.id : j.owner.owner_id;
  expect(
    (
      await j.db.from("files").insert({
        id,
        process_id: j.sample.process_id,
        order_id: j.sample.order_id,
        uploaded_by: uploader,
        name: "Documento fictício do percurso webhook.pdf",
        mime: "application/pdf",
        path: `${uploader}/${j.sample.process_id}/${id}/webhook-ficticio.pdf`,
        folder,
        size_bytes: 100,
        expected_sha256: "0".repeat(64),
        upload_status: "pending",
      })
    ).error,
  ).toBeNull();
  return {
    id,
    args: {
      target_file: id,
      actor: uploader,
      observed_hash: "0".repeat(64),
      observed_size: 100,
    },
  };
}
async function deliveryFile() {
  const j = fixture();
  const delivery = (
    await j.db
      .from("deliveries")
      .select("id")
      .eq("order_id", j.sample.order_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
  ).data!.id;
  const file = await document("deliverables");
  expect(
    (
      await j.db.rpc("complete_file_system", {
        ...file.args,
        actor: j.calculator.id,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await j.db.from("delivery_files").insert({
        delivery_id: delivery,
        file_id: file.id,
        kind: "calculation",
        snapshot: { fixture: true },
      })
    ).error,
  ).toBeNull();
  return { delivery, file: file.id };
}
async function access(delivery: string, db = session) {
  const j = fixture();
  const r = await db.rpc("get_current_delivery_access_contexts", {
    target_process: j.sample.process_id,
    target_deliveries: [delivery],
  });
  expect(r.error).toBeNull();
  return parseDeliveryAccessContexts(r.data, j.sample.process_id, [
    {
      id: delivery,
      order_id: j.sample.order_id,
      process_id: j.sample.process_id,
    },
  ]).get(delivery)!;
}
async function authorize(file: string, db = session) {
  return db.rpc("authorize_file_access", {
    target_file: file,
    access_kind: "file_download",
  });
}
async function visible(file: string, db = session) {
  const r = await db.from("files").select("id").eq("id", file);
  expect(r.error).toBeNull();
  return r.data!;
}
async function policy(
  delivery: string,
  value: "before_balance" | "after_balance",
) {
  const calc = await actor("calculator");
  expect(
    (
      await calc.rpc("approve_existing_delivery_release", {
        target_delivery: delivery,
        policy: value,
        approved: true,
        request_id: randomUUID(),
      })
    ).error,
  ).toBeNull();
}
async function readings(
  expectedDeposit: number | null,
  expectedTotal: number | null,
  expectedDeliveryInstructions = 0,
) {
  const j = fixture(),
    before = financialState();
  const calc = await actor("calculator");
  const clientCredit = await current(),
    calculatorCredit = await current(calc);
  expect(clientCredit).toEqual(calculatorCredit);
  expect(clientCredit.projection).toMatchObject({
    depositCreditCents: expectedDeposit,
    totalCreditCents: expectedTotal,
    manualDepositCents: 0,
  });
  for (const db of [session, calc]) {
    const r = await db.rpc("get_process_deposit_instructions", {
      target_process: j.sample.process_id,
    });
    expect(r.error).toBeNull();
    const signal = depositInfoSchema
      .array()
      .parse(r.data)
      .find((row) => row.orderId === j.sample.order_id)!;
    expect(signal.confirmedCents).toBe(expectedDeposit);
    expect(signal.credit).toEqual(clientCredit);
    const deliveries = (
      await j.db
        .from("deliveries")
        .select("id")
        .eq("order_id", j.sample.order_id)
    ).data!;
    const balance = await db.rpc("get_delivery_credit_instructions", {
      target_process: j.sample.process_id,
      target_deliveries: deliveries.map((d) => d.id),
    });
    expect(balance.error).toBeNull();
    const rows = deliveryCreditSchema.array().parse(balance.data);
    expect(rows).toHaveLength(expectedDeliveryInstructions);
    for (const row of rows) {
      expect(row.credit).toEqual(clientCredit);
      expect(row.remainingCents).toBe(
        expectedTotal === null ? null : Math.max(25001 - expectedTotal, 0),
      );
    }
  }
  expect(financialState()).toBe(before);
  const originalSession = session;
  for (const db of [originalSession, calc]) {
    session = db;
    const invoice = await getPaymentInvoice(
      j.sample.order_id,
      j.sample.process_id,
      j.phase,
    );
    expect(invoice.phase).toBe(j.phase);
    expect(invoice.invoiceUrl).toBeNull();
    expect(financialState()).toBe(before);
  }
  session = originalSession;
  expect(j.view()).toMatchObject({
    publicPayments: 0,
    legacyOrigins: 0,
    legacyBindings: 0,
    posts: 1,
  });
}

it.each(["PIX", "BOLETO", "CREDIT_CARD"])(
  "%s/sinal só entra na fila após documento mínimo; recibo e avisos não se repetem",
  async (method) => {
    const j = await setup(method),
      commercial = commercialState();
    const result = await j.move("received");
    expect(result.report.complete).toBe(1);
    const saved = j.stored(result.receipt!.runId);
    const history = j.view().events;
    expect(
      history.filter(
        (event: { effect: string }) => event.effect === "received",
      ),
    ).toHaveLength(1);
    const notices = j
      .view()
      .notifications.filter(
        (notice: { application: string }) =>
          notice.application === result.receipt!.applicationRequestId,
      );
    expect(notices).toHaveLength(2);
    await readings(12501, 12501);
    expect(commercialState()).toBe(commercial);
    expect(queueState()).toEqual({
      status: "awaiting_documents",
      audits: 0,
      notices: 0,
      deliveries: 0,
    });
    const d = await document(),
      before = queueState();
    expect(
      (
        await j.db.rpc("complete_file_system", {
          ...d.args,
          observed_hash: "1".repeat(64),
        })
      ).error,
    ).not.toBeNull();
    expect(queueState()).toEqual(before);
    const triage = await document("triage");
    expect(
      (await j.db.rpc("complete_file_system", triage.args)).error,
    ).toBeNull();
    expect(queueState()).toEqual(before);
    expect((await j.db.rpc("complete_file_system", d.args)).error).toBeNull();
    expect(queueState()).toEqual({
      status: "queued",
      audits: 1,
      notices: 1,
      deliveries: 0,
    });
    expect((await j.db.rpc("complete_file_system", d.args)).error).toBeNull();
    await j.replay(result.receipt!.runId);
    expect(j.stored(result.receipt!.runId)).toBe(saved);
    expect(j.view().events).toEqual(history);
    expect(
      j
        .view()
        .notifications.filter(
          (notice: { application: string }) =>
            notice.application === result.receipt!.applicationRequestId,
        ),
    ).toEqual(notices);
    expect(queueState()).toEqual({
      status: "queued",
      audits: 1,
      notices: 1,
      deliveries: 0,
    });
    expect(commercialState()).toBe(commercial);
  },
  60000,
);

it.each(["PIX", "BOLETO", "CREDIT_CARD"])(
  "%s/saldo não aprova D6 nem revisão técnica; RLS e autorização acompanham crédito atual",
  async (method) => {
    const j = await setup(method, "balance"),
      commercial = commercialState();
    const d = await deliveryFile();
    expect(deriveDeliveryCreditAccess(await access(d.delivery))).toBe(
      "policy_pending",
    );
    await j.move("received");
    await readings(12501, 25001);
    expect(commercialState()).toBe(commercial);
    expect(deriveDeliveryCreditAccess(await access(d.delivery))).toBe(
      "policy_pending",
    );
    expect(await visible(d.file)).toEqual([]);
    expect((await authorize(d.file)).error).not.toBeNull();
    await policy(d.delivery, "after_balance");
    expect(deriveDeliveryCreditAccess(await access(d.delivery))).toBe("ready");
    expect(await visible(d.file)).toEqual([{ id: d.file }]);
    expect((await authorize(d.file)).error).toBeNull();
    expect(
      (
        await j.db
          .from("orders")
          .update({ status: "in_review" })
          .eq("id", j.sample.order_id)
      ).error,
    ).toBeNull();
    await j.move("current");
    expect(deriveDeliveryCreditAccess(await access(d.delivery))).toBe(
      "review_pending",
    );
    expect(await visible(d.file)).toEqual([]);
    expect((await authorize(d.file)).error).not.toBeNull();
    expect(
      (await authorize(d.file, await actor("calculator"))).error,
    ).toBeNull();
    expect(queueState().status).toBe("in_review");
    expect(commercialState()).toBe(commercial);
  },
  60000,
);

it.each([
  ["partial", 10000],
  ["excess", 13000],
  ["refund_partial", 11500],
  ["refund_full", 0],
  ["refund_pending", null],
  ["unknown", null],
  ["chargeback_dispute", null],
  ["chargeback_debit", 10500],
  ["chargeback_restore", 11501],
  ["chargeback_restore_full", 12501],
] as const)(
  "sinal %s: consumidores e documento respeitam crédito %s sem aprovação automática",
  async (scenario, expected) => {
    const j = await setup(
        scenario.startsWith("chargeback") ? "CREDIT_CARD" : "PIX",
      ),
      commercial = commercialState();
    if (scenario !== "partial") await j.move("received");
    await j.move(scenario);
    await readings(expected, expected);
    const d = await document();
    expect((await j.db.rpc("complete_file_system", d.args)).error).toBeNull();
    const eligible = expected !== null && expected >= 12501;
    if (scenario === "partial") {
      expect(await current()).toMatchObject({
        activeReservation: true,
        collectionState: "active",
        projection: { remainingDepositCents: 2501 },
      });
    }
    expect(queueState()).toEqual({
      status: eligible
        ? "queued"
        : scenario === "partial"
          ? "awaiting_payment"
          : "awaiting_documents",
      audits: eligible ? 1 : 0,
      notices: eligible ? 1 : 0,
      deliveries: 0,
    });
    expect(commercialState()).toBe(commercial);
  },
  60000,
);

it.each([
  ["partial", 10000, "balance_pending"],
  ["excess", 13000, "ready"],
  ["refund_partial", 11499, "balance_pending"],
  ["refund_full", 0, "balance_pending"],
  ["refund_pending", null, "financial_pending"],
  ["unknown", null, "financial_pending"],
  ["chargeback_dispute", null, "financial_pending"],
  ["chargeback_debit", 10499, "balance_pending"],
  ["chargeback_restore", 11500, "balance_pending"],
  ["chargeback_restore_full", 12500, "ready"],
] as const)(
  "saldo %s: liberação posterior usa crédito %s e preserva sinal",
  async (scenario, expected, wanted) => {
    const j = await setup(
        scenario.startsWith("chargeback") ? "CREDIT_CARD" : "PIX",
        "balance",
      ),
      commercial = commercialState();
    const d = await deliveryFile();
    await policy(d.delivery, "after_balance");
    if (scenario !== "partial") await j.move("received");
    await j.move(scenario);
    await readings(12501, expected === null ? null : 12501 + expected, 1);
    expect(deriveDeliveryCreditAccess(await access(d.delivery))).toBe(wanted);
    expect((await visible(d.file)).length).toBe(wanted === "ready" ? 1 : 0);
    expect((await authorize(d.file)).error === null).toBe(wanted === "ready");
    expect(commercialState()).toBe(commercial);
    // Cada entrega fictícia recebe sua regra; a regra anterior é imutável.
    await j.deliver(j.sample);
    const next = await deliveryFile();
    await policy(next.delivery, "before_balance");
    expect(deriveDeliveryCreditAccess(await access(next.delivery))).toBe(
      "ready",
    );
    expect((await authorize(next.file)).error).toBeNull();
  },
  60000,
);

it("contrato explícito permite fila sem transformar conciliação em dinheiro recebido", async () => {
  const j = await setup();
  await j.move("received");
  await j.move("unknown");
  const d = await document();
  expect((await j.db.rpc("complete_file_system", d.args)).error).toBeNull();
  expect(queueState().status).toBe("awaiting_documents");
  const before = financialState(),
    requestId = randomUUID();
  contractRequests.push(requestId);
  const calc = await actor("calculator"),
    args = {
      target_client: j.owner.id,
      has_contract: true,
      reason:
        "Contrato fictício explícito para testar o consumidor do webhook.",
      expected_revision: j.owner.contract_revision,
      request_id: requestId,
    };
  const r = await calc.rpc("set_client_contract", args);
  expect(r.error).toBeNull();
  const receipt = contractReceiptSchema.parse(r.data);
  expect(queueState()).toEqual({
    status: "queued",
    audits: 1,
    notices: 1,
    deliveries: 0,
  });
  expect((await current()).projection.totalCreditCents).toBeNull();
  expect(financialState()).toBe(before);
  expect(
    contractReceiptSchema.parse(
      (await calc.rpc("set_client_contract", args)).data,
    ),
  ).toEqual(receipt);
  expect(queueState().notices).toBe(1);
}, 60000);

it.each(["clientB", "admin"] as const)(
  "%s não lê fatura, crédito ou arquivos após webhook recebido",
  async (role) => {
    const j = await setup("PIX", "balance");
    const d = await deliveryFile();
    await policy(d.delivery, "after_balance");
    await j.move("received");
    const before = financialState();
    const other = await actor(role);
    expect(
      (
        await other.rpc("get_current_order_credits", {
          target_orders: [j.sample.order_id],
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await other.rpc("get_current_delivery_access_contexts", {
          target_process: j.sample.process_id,
          target_deliveries: [d.delivery],
        })
      ).error,
    ).not.toBeNull();
    expect(await visible(d.file, other)).toEqual([]);
    expect((await authorize(d.file, other)).error).not.toBeNull();
    session = other;
    await expect(
      getPaymentInvoice(j.sample.order_id, j.sample.process_id, "balance"),
    ).rejects.toThrow();
    expect(financialState()).toBe(before);
  },
  60000,
);

it.each(["deposit", "balance"] as const)(
  "%s: redução do valor recebido sem estorno mantém conciliação nos consumidores",
  async (phase) => {
    const j = await setup("PIX", phase),
      commercial = commercialState();
    const original = await j.move("received"),
      historical = j.stored(original.receipt!.runId);
    await j.move("partial");
    await readings(phase === "deposit" ? null : 12501, null);
    expect((await current()).collectionState).toBe("reconcile");
    expect(commercialState()).toBe(commercial);
    expect(j.stored(original.receipt!.runId)).toBe(historical);
    if (phase === "deposit") {
      const d = await document();
      expect((await j.db.rpc("complete_file_system", d.args)).error).toBeNull();
      expect(queueState().status).toBe("awaiting_documents");
      expect(queueState().notices).toBe(0);
    } else {
      const d = await deliveryFile();
      await policy(d.delivery, "after_balance");
      expect(deriveDeliveryCreditAccess(await access(d.delivery))).toBe(
        "financial_pending",
      );
      expect((await authorize(d.file)).error).not.toBeNull();
    }
  },
  60000,
);

it.each([
  ["simulação", { simulation: true }],
  ["contexto contratual ausente", { context: false }],
] as const)(
  "webhook não contrata proposta de %s nem reaproveita origem de outro pedido",
  async (_label, options) => {
    const j = await setup();
    const before = new Set(
      (await j.db.from("quotes").select("id")).data!.map((row) => row.id),
    );
    await expect(j.create(options)).rejects.toThrow(
      "Aceite da fixture indisponível.",
    );
    const added = (
      await j.db.from("quotes").select("id,order_id,is_simulation")
    ).data!.filter((row) => !before.has(row.id));
    expect(added).toHaveLength(1);
    const quote = added[0],
      financial = financialState();
    const invalid = await j.move("current", {
      patch: { externalReference: quote.order_id },
    });
    expect(invalid.report).toMatchObject({
      complete: 0,
      quarantined: 1,
      failed: 0,
    });
    expect(financialState()).toBe(financial);
    expect(
      JSON.parse(
        sql(
          `select json_build_object('accepted',exists(select 1 from private.quote_acceptances where quote_id='${quote.id}'),'status',(select status from public.orders where id='${quote.order_id}'),'deliveries',(select count(*) from public.deliveries where order_id='${quote.order_id}'),'applications',(select count(*) from private.payment_financial_charges where order_id='${quote.order_id}'));`,
        ),
      ),
    ).toEqual({
      accepted: false,
      status: "quoted",
      deliveries: 0,
      applications: 0,
    });
    expect(quote.is_simulation).toBe(
      "simulation" in options ? options.simulation : false,
    );
  },
  60000,
);
