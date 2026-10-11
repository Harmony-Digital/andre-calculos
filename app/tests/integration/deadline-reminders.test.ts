vi.mock("server-only", () => ({}));
import { runDeadlineReminders } from "../../src/modules/notifications/deadline-runner";
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  notificationFixture,
  localNotificationSql,
} from "../e2e/notification-helper";
import {
  createMessageProcess,
  removeMessageProcess,
} from "../e2e/messages-helper";
import { fictionalServiceSettings } from "../settings-fixture";
let fixture: Awaited<ReturnType<typeof notificationFixture>>,
  process: Awaited<ReturnType<typeof createMessageProcess>>,
  calculator: SupabaseClient;
let priorWindow: { deadline_window_start: string; deadline_window_end: string },
  ids: string[] = [];
const quotedIds = () => ids.map((id) => `'${id}'::uuid`).join(",");
async function cleanOrders() {
  if (!ids.length) return;
  localNotificationSql(
    `delete from private.deadline_reminder_receipts where order_id in (${quotedIds()}); delete from public.notifications where data->>'order_id' in (${ids.map((id) => `'${id}'`).join(",")}); delete from public.audit_log where target_id in (${quotedIds()});`,
  );
  expect(
    (await fixture.db.from("orders").delete().in("id", ids)).error,
  ).toBeNull();
  ids = [];
}
async function order(due = "2026-10-19", status = "queued") {
  const r = await fixture.db
    .from("orders")
    .insert({
      process_id: process.id,
      client_id: process.clientId,
      calc_type: "initial",
      internal_due_date: due,
      status,
    })
    .select("id,code")
    .single();
  if (r.error || !r.data)
    throw new Error("Pedido fictício de lembrete não criado.");
  ids.push(r.data.id);
  return r.data;
}
function at(
  id: string,
  due = "2026-10-19",
  event = "deadline_one_day",
  day = "2026-10-16",
  clock = "2026-10-16T12:00:00Z",
  one: string | null = "2026-10-19",
  two: string | null = "2026-10-20",
) {
  return localNotificationSql(
    `select private.enqueue_deadline_reminder_at('${id}','${due}','${event}','${day}',${one ? `'${one}'` : "null"},${two ? `'${two}'` : "null"},'${clock}');`,
  );
}
function receiptCount() {
  return Number(
    localNotificationSql(
      `select count(*) from private.deadline_reminder_receipts where order_id in (${quotedIds()});`,
    ),
  );
}
const notices = () =>
  fixture.db
    .from("notifications")
    .select(
      "status,template,data,recipient,cancelled_at,cancellation_reason,dedup_key",
    )
    .in("data->>order_id", ids);
beforeAll(async () => {
  fixture = await notificationFixture();
  priorWindow = (
    await fixture.db
      .from("settings")
      .select("deadline_window_start,deadline_window_end")
      .eq("singleton", true)
      .single()
  ).data!;
  process = await createMessageProcess();
  calculator = createClient(
    globalThis.process.env.NEXT_PUBLIC_SUPABASE_URL!,
    globalThis.process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  expect(
    (
      await calculator.auth.signInWithPassword({
        email: "calculista@exemplo.com",
        password: globalThis.process.env.ANDRE_TEST_PASSWORD!,
      })
    ).error,
  ).toBeNull();
});
beforeEach(async () => {
  await cleanOrders();
  expect(
    (
      await fixture.db
        .from("notification_preferences")
        .delete()
        .eq("profile_id", fixture.id)
    ).error,
  ).toBeNull();
  expect(
    (
      await fixture.db
        .from("settings")
        .update({
          deadline_window_start: "07:00",
          deadline_window_end: "21:00",
          contact_email: fictionalServiceSettings.contactEmail,
          contact_phone: fictionalServiceSettings.contactPhone,
        })
        .eq("singleton", true)
    ).error,
  ).toBeNull();
});
afterAll(async () => {
  try {
    await cleanOrders();
    if (process) await removeMessageProcess(process.id);
    if (calculator) await calculator.auth.signOut({ scope: "local" });
  } finally {
    if (fixture) {
      await fixture.db
        .from("settings")
        .update(priorWindow)
        .eq("singleton", true);
      await fixture.cleanup();
    }
  }
});
it("recibo único por pedido, tipo e prazo; payload contém só código/data e identificadores internos", async () => {
  const o = await order();
  expect(at(o.id)).toBe("consumed");
  expect(at(o.id)).toBe("duplicate");
  expect(receiptCount()).toBe(1);
  const rows = (await notices()).data!;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    template: "deadline_one_day",
    status: "pending",
    data: {
      order_id: o.id,
      code: o.code,
      internal_due_date: "2026-10-19",
      calendar_version: "br-processual-provisorio-v1",
    },
  });
  expect(Object.keys(rows[0].data as object).sort()).toEqual([
    "calendar_version",
    "code",
    "internal_due_date",
    "order_id",
  ]);
  expect(rows[0].dedup_key).toBe(
    `deadline:${o.id}:deadline_one_day:2026-10-19:email`,
  );
});
it("janela inclui 7h, exclui 21h e não consome tentativa fora dela", async () => {
  const o = await order();
  expect(
    at(o.id, undefined, undefined, undefined, "2026-10-16T09:59:59Z"),
  ).toBe("outside_window");
  expect(receiptCount()).toBe(0);
  expect(
    at(o.id, undefined, undefined, undefined, "2026-10-17T00:00:00Z"),
  ).toBe("outside_window");
  expect(receiptCount()).toBe(0);
  expect(
    at(o.id, undefined, undefined, undefined, "2026-10-16T10:00:00Z"),
  ).toBe("consumed");
});
it("canais desligados consomem ocorrência sem envio; reativar não recupera aviso antigo", async () => {
  const o = await order();
  expect(
    (
      await fixture.db.from("notification_preferences").insert({
        profile_id: fixture.id,
        event: "deadline_one_day",
        channel: "email",
        enabled: false,
      })
    ).error,
  ).toBeNull();
  expect(at(o.id)).toBe("consumed");
  expect((await notices()).data).toEqual([]);
  expect(
    (
      await fixture.db
        .from("notification_preferences")
        .update({ enabled: true })
        .eq("profile_id", fixture.id)
    ).error,
  ).toBeNull();
  expect(at(o.id)).toBe("duplicate");
  expect((await notices()).data).toEqual([]);
});
it("mudança de prazo cancela só pendentes, preserva histórico/recibo e não reabre prazo antigo", async () => {
  const a = await order(),
    b = await order(),
    c = await order();
  for (const o of [a, b, c]) expect(at(o.id)).toBe("consumed");
  expect(
    (
      await fixture.db
        .from("notifications")
        .update({ status: "sent" })
        .eq("data->>order_id", b.id)
    ).error,
  ).toBeNull();
  expect(
    (
      await fixture.db
        .from("notifications")
        .update({ status: "failed" })
        .eq("data->>order_id", c.id)
    ).error,
  ).toBeNull();
  expect(
    (
      await fixture.db
        .from("orders")
        .update({ internal_due_date: "2026-10-20" })
        .in("id", ids)
    ).error,
  ).toBeNull();
  expect((await notices()).data!.map((r) => r.status).sort()).toEqual([
    "cancelled",
    "failed",
    "sent",
  ]);
  expect(
    (await notices()).data!.find((r) => r.status === "cancelled"),
  ).toMatchObject({ cancellation_reason: "deadline_changed" });
  expect(receiptCount()).toBe(3);
  expect(at(a.id)).toBe("stale");
  expect(
    (
      await fixture.db
        .from("orders")
        .update({ internal_due_date: "2026-10-19" })
        .eq("id", a.id)
    ).error,
  ).toBeNull();
  expect(at(a.id)).toBe("duplicate");
});
it("prazo removido e saída da fila cancelam; transição dentro da fila conserva", async () => {
  const a = await order(),
    b = await order();
  for (const o of [a, b]) expect(at(o.id)).toBe("consumed");
  expect(
    (
      await fixture.db
        .from("orders")
        .update({ status: "in_analysis" })
        .eq("id", a.id)
    ).error,
  ).toBeNull();
  expect((await notices()).data!.every((r) => r.status === "pending")).toBe(
    true,
  );
  expect(
    (
      await fixture.db
        .from("orders")
        .update({ internal_due_date: null })
        .eq("id", a.id)
    ).error,
  ).toBeNull();
  expect(
    (
      await fixture.db
        .from("orders")
        .update({ status: "delivered" })
        .eq("id", b.id)
    ).error,
  ).toBeNull();
  expect(
    (await notices()).data!.map((r) => r.cancellation_reason).sort(),
  ).toEqual(["deadline_changed", "order_ineligible"]);
});
it("recesso e fim de semana só aceitam atraso; dia do snapshot obsoleto é recusado", async () => {
  const a = await order("2027-01-21");
  expect(
    at(
      a.id,
      "2027-01-21",
      "deadline_one_day",
      "2026-12-18",
      "2026-12-18T12:00:00Z",
      "2027-01-21",
      "2027-01-22",
    ),
  ).toBe("consumed");
  const b = await order("2026-10-19");
  expect(
    at(
      b.id,
      "2026-10-19",
      "deadline_one_day",
      "2026-10-17",
      "2026-10-17T12:00:00Z",
      null,
      null,
    ),
  ).toBe("stale");
  expect(
    at(
      b.id,
      "2026-10-19",
      "deadline_one_day",
      "2026-10-16",
      "2026-10-17T12:00:00Z",
    ),
  ).toBe("stale_day");
  const c = await order("2026-10-16");
  expect(
    at(
      c.id,
      "2026-10-16",
      "deadline_overdue",
      "2026-10-17",
      "2026-10-17T12:00:00Z",
      null,
      null,
    ),
  ).toBe("consumed");
});
it("RPC pública só aceita service_role; helper privado/relógio/recibos não são concedidos", async () => {
  const o = await order();
  const args = {
    target_order: o.id,
    expected_due: "2026-10-19",
    reminder_event: "deadline_one_day",
    reference_date: "2026-10-16",
    one_day: "2026-10-19",
    two_days: "2026-10-20",
  };
  expect(
    (await calculator.rpc("enqueue_deadline_reminder", args)).error,
  ).not.toBeNull();
  expect(
    (
      await fixture.db
        .schema("private")
        .from("deadline_reminder_receipts")
        .select("*")
    ).error,
  ).not.toBeNull();
  expect(
    localNotificationSql(
      "select has_function_privilege('service_role','private.enqueue_deadline_reminder_at(uuid,date,text,date,date,date,timestamptz)','execute'),has_table_privilege('service_role','private.deadline_reminder_receipts','select');",
    ),
  ).toBe("f|f");
  expect((await fixture.db.rpc("enqueue_deadline_reminder", args)).data).toBe(
    "stale_day",
  );
  expect(receiptCount()).toBe(0);
});
it("execuções concorrentes e alteração de prazo produzem no máximo um aviso válido", async () => {
  expect(
    (
      await fixture.db
        .from("settings")
        .update({
          deadline_window_start: "00:00",
          deadline_window_end: "23:59",
        })
        .eq("singleton", true)
    ).error,
  ).toBeNull();
  const o = await order("2026-09-01"),
    today = localNotificationSql(
      "select (clock_timestamp() at time zone 'America/Sao_Paulo')::date;",
    );
  const args = {
    target_order: o.id,
    expected_due: "2026-09-01",
    reminder_event: "deadline_overdue",
    reference_date: today,
  };
  const results = await Promise.all([
    fixture.db.rpc("enqueue_deadline_reminder", args),
    fixture.db.rpc("enqueue_deadline_reminder", args),
  ]);
  expect(results.every((r) => !r.error)).toBe(true);
  expect(results.map((r) => r.data).sort()).toEqual(["consumed", "duplicate"]);
  expect(receiptCount()).toBe(1);
  const b = await order("2026-09-01");
  const racing = await Promise.all([
    fixture.db.rpc("enqueue_deadline_reminder", {
      ...args,
      target_order: b.id,
    }),
    fixture.db
      .from("orders")
      .update({ internal_due_date: "2026-09-02" })
      .eq("id", b.id),
  ]);
  expect(racing.every((r) => !r.error)).toBe(true);
  expect(
    (await notices())
      .data!.filter((r) => (r.data as { order_id: string }).order_id === b.id)
      .every((r) => r.status === "cancelled"),
  ).toBe(true);
});
it("contato ausente não consome recibo; rollback conserva recibo/outbox/auditoria juntos", async () => {
  const o = await order();
  expect(
    (
      await fixture.db
        .from("settings")
        .update({ contact_email: null })
        .eq("singleton", true)
    ).error,
  ).toBeNull();
  expect(at(o.id)).toBe("unconfigured");
  expect(receiptCount()).toBe(0);
  expect(
    (
      await fixture.db
        .from("settings")
        .update({ contact_email: fictionalServiceSettings.contactEmail })
        .eq("singleton", true)
    ).error,
  ).toBeNull();
  localNotificationSql(
    `begin; select private.enqueue_deadline_reminder_at('${o.id}','2026-10-19','deadline_one_day','2026-10-16','2026-10-19','2026-10-20','2026-10-16T12:00:00Z'); rollback;`,
  );
  expect(receiptCount()).toBe(0);
  expect((await notices()).data).toEqual([]);
  expect(
    (
      await fixture.db
        .from("audit_log")
        .select("id")
        .eq("target_id", o.id)
        .eq("action", "deadline_reminder_consumed")
    ).data,
  ).toEqual([]);
});
it("janela inválida é recusada pela RPC sem mudar a revisão", async () => {
  const cfg = (
    await fixture.db
      .from("settings")
      .select("revision,deadline_window_start,deadline_window_end")
      .eq("singleton", true)
      .single()
  ).data!;
  for (const patch of [
    { deadlineWindowStart: "21:00", deadlineWindowEnd: "07:00" },
    { deadlineWindowStart: "07:00" },
    { deadlineWindowStart: null, deadlineWindowEnd: "21:00" },
    { deadlineWindowStart: "24:00", deadlineWindowEnd: "21:00" },
  ])
    expect(
      (
        await calculator.rpc("save_service_settings", {
          payload: { ...fictionalServiceSettings, ...patch },
          expected_revision: cfg.revision,
        })
      ).error,
    ).not.toBeNull();
  expect(
    (
      await fixture.db
        .from("settings")
        .select("revision,deadline_window_start,deadline_window_end")
        .eq("singleton", true)
        .single()
    ).data,
  ).toEqual(cfg);
});

it("runner percorre 205 pedidos no banco real e replay não duplica", async () => {
  expect(
    (
      await fixture.db
        .from("settings")
        .update({
          deadline_window_start: "00:00",
          deadline_window_end: "23:59",
        })
        .eq("singleton", true)
    ).error,
  ).toBeNull();
  const created = await fixture.db
    .from("orders")
    .insert(
      Array.from({ length: 205 }, () => ({
        process_id: process.id,
        client_id: process.clientId,
        calc_type: "initial",
        internal_due_date: "2026-09-01",
        status: "queued",
      })),
    )
    .select("id");
  expect(created.error).toBeNull();
  ids.push(...created.data!.map((row) => row.id));
  expect(await runDeadlineReminders(fixture.db)).toMatchObject({
    scanned: 205,
    consumed: 205,
  });
  expect(receiptCount()).toBe(205);
  expect((await notices()).data).toHaveLength(205);
  expect(await runDeadlineReminders(fixture.db)).toMatchObject({
    scanned: 205,
    consumed: 0,
  });
  expect(receiptCount()).toBe(205);
  expect((await notices()).data).toHaveLength(205);
});
