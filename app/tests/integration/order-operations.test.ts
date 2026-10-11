import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { quoteSession, createQuoteDraft } from "../e2e/quote-helper";
import { localSystem, leaseLocalSettings } from "../e2e/local-helper";
import {
  createDeliveryFixture,
  deliveryProfessional,
} from "../e2e/delivery-helper";
import { localNotificationSql } from "../e2e/notification-helper";
import {
  operationReceiptSchema,
  operationalOrder,
  operationalEvents,
} from "@/modules/orders/operations";
import { transition, type OrderState } from "@/modules/orders/state-machine";
const sessions: Record<string, SupabaseClient> = {};
const db = () => localSystem();
let sample: Awaited<ReturnType<typeof createQuoteDraft>>;
async function status() {
  const r = await db()
    .from("orders")
    .select(
      "status,status_revision,resume_status,delivery_date,internal_due_date",
    )
    .eq("id", sample.order_id)
    .single();
  expect(r.error).toBeNull();
  return r.data!;
}
async function args(
  event = "start_analysis",
  reason = "",
  patch: Record<string, unknown> = {},
) {
  const s = await status();
  return {
    target_process: sample.process_id,
    target_order: sample.order_id,
    request_id: randomUUID(),
    payload: {
      event,
      expectedState: s.status,
      expectedRevision: s.status_revision,
      reason,
    },
    ...patch,
  };
}
async function operate(event: string, reason = "") {
  const r = await sessions.calculator.rpc(
    "operate_order",
    await args(event, reason),
  );
  expect(r.error).toBeNull();
  return operationReceiptSchema.parse(r.data);
}
beforeAll(async () => {
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
});
afterAll(async () => {
  await Promise.all(
    Object.values(sessions).map((s) => s.auth.signOut({ scope: "local" })),
  );
});
beforeEach(async () => {
  sample = await createQuoteDraft();
  expect(
    (
      await db()
        .from("orders")
        .update({
          status: "queued",
          delivery_date: "2026-11-20",
          internal_due_date: "2026-11-19",
        })
        .eq("id", sample.order_id)
    ).error,
  ).toBeNull();
});
afterEach(async () => {
  if (!sample) return;
  const id = sample.order_id,
    p = sample.process_id;
  localNotificationSql(`begin;
delete from public.audit_log where target_id in(select id from private.order_operation_receipts where order_id='${id}'::uuid) or target_id='${id}'::uuid;
delete from public.timeline_events where process_id='${p}'::uuid;
delete from public.deadlines where order_id='${id}'::uuid;
delete from public.checklists where order_id='${id}'::uuid;
delete from public.orders where id='${id}'::uuid;
delete from public.processes where id='${p}'::uuid;
commit;`);
});
it("só calculista opera; cliente alheio não lê pedido ou recibo", async () => {
  const anonymous = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    ),
    a = await args();
  for (const s of [
    sessions.client,
    sessions.clientB,
    sessions.admin,
    anonymous,
    db(),
  ])
    expect((await s.rpc("operate_order", a)).error).not.toBeNull();
  expect(
    (
      await sessions.clientB
        .from("orders")
        .select("id")
        .eq("id", sample.order_id)
    ).data,
  ).toEqual([]);
  const permissions = localNotificationSql(
    "select has_table_privilege('authenticated','private.order_operation_receipts','select')::text||':'||has_table_privilege('service_role','private.order_operation_receipts','select')::text;",
  );
  expect(permissions).toBe("false:false");
  expect((await status()).status).toBe("queued");
});
it("fluxo operacional grava recibos/eventos/auditoria e mantém prazos", async () => {
  const prior = await status();
  for (const [event, to, reason] of [
    ["start_analysis", "in_analysis", ""],
    ["start_calculation", "in_calculation", ""],
    ["submit_review", "in_review", ""],
    ["return_calculation", "in_calculation", "Conferência fictícia"],
    ["submit_review", "in_review", ""],
  ]) {
    const receipt = await operate(event, reason),
      s = await status();
    expect(s.status).toBe(to);
    expect(s.status_revision).toBe(receipt.revision);
    expect(s.delivery_date).toBe(prior.delivery_date);
    expect(s.internal_due_date).toBe(prior.internal_due_date);
    expect(
      (
        await db()
          .from("timeline_events")
          .select("actor_id,data")
          .eq("id", receipt.id)
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await db()
          .from("audit_log")
          .select("action")
          .eq("target_id", receipt.id)
      ).data,
    ).toEqual([{ action: `order_${event}` }]);
  }
});
it.each(["in_analysis", "in_calculation", "in_review"] as const)(
  "espera retoma exatamente %s",
  async (state) => {
    await db()
      .from("orders")
      .update({ status: state })
      .eq("id", sample.order_id);
    const s = await status(),
      pause = await operate(
        "request_information",
        "  Informação fictícia necessária  ",
      );
    expect(pause.resumeStatus).toBe(state);
    expect((await status()).resume_status).toBe(state);
    const resumed = await operate("receive_information");
    expect(resumed.to).toBe(state);
    expect((await status()).resume_status).toBeNull();
    expect((await status()).status_revision).toBe(s.status_revision + 2);
  },
);
it("retorno legado sem origem falha fechado", async () => {
  await db()
    .from("orders")
    .update({ status: "awaiting_client" })
    .eq("id", sample.order_id);
  expect(
    (
      await sessions.calculator.rpc(
        "operate_order",
        await args("receive_information"),
      )
    ).error?.code,
  ).toBe("PT409");
  expect((await status()).status).toBe("awaiting_client");
});
it("replay histórico não desfaz operação posterior e UUID não troca conteúdo/pedido", async () => {
  const a = await args(),
    first = await sessions.calculator.rpc("operate_order", a);
  expect(first.error).toBeNull();
  await operate("start_calculation");
  const replay = await sessions.calculator.rpc("operate_order", a);
  expect(replay.error).toBeNull();
  expect(replay.data).toEqual(first.data);
  expect((await status()).status).toBe("in_calculation");
  expect(
    (await db().from("timeline_events").select("id").eq("id", a.request_id))
      .data,
  ).toHaveLength(1);
  for (const patch of [
    { ...a.payload, reason: "outro texto" },
    { ...a.payload, event: "start_calculation" },
    { ...a.payload, expectedRevision: a.payload.expectedRevision + 1 },
  ])
    expect(
      (await sessions.calculator.rpc("operate_order", { ...a, payload: patch }))
        .error?.code,
    ).toBe("PT409");
  expect(
    (
      await sessions.calculator.rpc("operate_order", {
        ...a,
        target_process: randomUUID(),
      })
    ).error,
  ).not.toBeNull();
});
it("duas sessões da mesma revisão aplicam uma só operação", async () => {
  const a = await args(),
    r = await Promise.all([
      sessions.calculator.rpc("operate_order", a),
      sessions.calculator.rpc("operate_order", {
        ...a,
        request_id: randomUUID(),
      }),
    ]);
  expect(r.filter((x) => !x.error)).toHaveLength(1);
  expect(r.filter((x) => x.error?.code === "PT409")).toHaveLength(1);
  expect((await status()).status_revision).toBe(a.payload.expectedRevision + 1);
});
it("retorno ao cálculo e entrega concorrentes têm um só vencedor", async () => {
  const release = await leaseLocalSettings(),
    system = db(),
    prior = await system
      .from("settings")
      .select("technical_name,crc_number,crc_state,crc_category")
      .eq("singleton", true)
      .single();
  let f: Awaited<ReturnType<typeof createDeliveryFixture>> | undefined;
  const id = randomUUID();
  try {
    expect(
      (
        await system
          .from("settings")
          .update(deliveryProfessional)
          .eq("singleton", true)
      ).error,
    ).toBeNull();
    f = await createDeliveryFixture();
    const s = await system
      .from("orders")
      .select("status_revision")
      .eq("id", f.order.id)
      .single();
    const r = await Promise.all([
      sessions.calculator.rpc("operate_order", {
        target_process: f.process.id,
        target_order: f.order.id,
        request_id: id,
        payload: {
          event: "return_calculation",
          expectedState: "in_review",
          expectedRevision: s.data!.status_revision,
          reason: "Correção inteiramente fictícia",
        },
      }),
      sessions.calculator.rpc("confirm_order_delivery", f.input()),
    ]);
    expect(r.filter((x) => !x.error)).toHaveLength(1);
    expect(r.filter((x) => x.error?.code === "PT409")).toHaveLength(1);
    const final = await system
      .from("orders")
      .select("status,status_revision")
      .eq("id", f.order.id)
      .single();
    expect(final.data!.status).toBe(
      r[0].error ? "delivered" : "in_calculation",
    );
    expect(final.data!.status_revision).toBe(s.data!.status_revision + 1);
    expect(
      (await system.from("deliveries").select("id").eq("order_id", f.order.id))
        .data,
    ).toHaveLength(r[1].error ? 0 : 1);
  } finally {
    await system.from("audit_log").delete().eq("target_id", id);
    try {
      if (f) await f.cleanup();
    } finally {
      await system.from("settings").update(prior.data!).eq("singleton", true);
      await release();
    }
  }
});
it("voltar ao mesmo estado não torna comando antigo válido", async () => {
  await operate("start_analysis");
  await operate("start_calculation");
  const stale = await args("submit_review");
  await operate("submit_review");
  await operate("return_calculation", "Correção fictícia");
  expect(
    (await sessions.calculator.rpc("operate_order", stale)).error?.code,
  ).toBe("PT409");
});
it("falha da auditoria reverte estado, origem, evento e recibo", async () => {
  const a = await args(),
    before = await status();
  localNotificationSql(
    `create function private.order_operation_test_failure() returns trigger language plpgsql set search_path='' as $$begin if new.target_id='${a.request_id}'::uuid then raise exception 'Falha fictícia'; end if; return new; end$$; create trigger order_operation_test_failure before insert on public.audit_log for each row execute function private.order_operation_test_failure();`,
  );
  try {
    expect(
      (await sessions.calculator.rpc("operate_order", a)).error,
    ).not.toBeNull();
    expect(await status()).toEqual(before);
    expect(
      (await db().from("timeline_events").select("id").eq("id", a.request_id))
        .data,
    ).toEqual([]);
    expect(
      localNotificationSql(
        `select count(*) from private.order_operation_receipts where id='${a.request_id}'::uuid;`,
      ),
    ).toBe("0");
  } finally {
    localNotificationSql(
      "drop trigger order_operation_test_failure on public.audit_log;drop function private.order_operation_test_failure();",
    );
  }
  expect((await sessions.calculator.rpc("operate_order", a)).error).toBeNull();
});
it.each([
  null,
  {},
  { event: "cancel", expectedState: "queued", expectedRevision: 1, reason: "" },
  {
    event: "start_analysis",
    expectedState: "queued",
    expectedRevision: null,
    reason: "",
  },
  {
    event: "start_analysis",
    expectedState: "queued",
    expectedRevision: 1,
    reason: "",
    actor: "someone",
  },
  {
    event: "request_information",
    expectedState: "queued",
    expectedRevision: 1,
    reason: "\u00a0 \t",
  },
])("rejeita payload inválido %j", async (payload) => {
  expect(
    (
      await sessions.calculator.rpc("operate_order", {
        ...(await args()),
        payload,
      })
    ).error,
  ).not.toBeNull();
  expect((await status()).status).toBe("queued");
});
it("SQL e máquina concordam para todos os eventos e estados operacionais", async () => {
  for (const state of [
    "queued",
    "in_analysis",
    "in_calculation",
    "in_review",
    "in_adjustment",
    "awaiting_client",
  ] as const)
    for (const event of operationalEvents) {
      const resume = state === "awaiting_client" ? "in_review" : null;
      const fixture = await db()
        .from("orders")
        .update({ status: state, resume_status: resume })
        .eq("id", sample.order_id);
      expect(fixture.error).toBeNull();
      let target: OrderState | undefined;
      try {
        target = transition(operationalOrder(state, "owner", resume), event, {
          id: "calc",
          role: "calculator",
        }).state;
      } catch {}
      const r = await sessions.calculator.rpc(
        "operate_order",
        await args(event, "Motivo fictício"),
      );
      if (target) {
        expect(r.error).toBeNull();
        expect(operationReceiptSchema.parse(r.data).to).toBe(target);
      } else expect(r.error?.code).toBe("PT409");
    }
});
