import { beforeAll, afterAll, afterEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localSystem } from "../e2e/local-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { quoteSession } from "../e2e/quote-helper";
import {
  createMessageProcess,
  removeMessageProcess,
} from "../e2e/messages-helper";
vi.mock("server-only", () => ({}));
import {
  createLocalNotificationStore,
  type NotificationOutcome,
} from "../../src/modules/notifications/notification-store";

let db: ReturnType<typeof localSystem>,
  store: ReturnType<typeof createLocalNotificationStore>,
  processFixture: Awaited<ReturnType<typeof createMessageProcess>>;
const sessions: SupabaseClient[] = [];
const notices: string[] = [],
  requests: string[] = [],
  orders: string[] = [];
const list = (ids: string[]) => ids.map((id) => `'${id}'::uuid`).join(",");
function nonce() {
  const value = randomUUID();
  requests.push(value);
  return value;
}
async function notice(patch: Record<string, unknown> = {}) {
  const id = randomUUID();
  notices.push(id);
  const result = await db.from("notifications").insert({
    id,
    channel: "email",
    recipient: "destinatario-ficticio@exemplo.invalid",
    template: "order_queued",
    data: { fixture: "notification-dispatch", name: "Pessoa Fictícia" },
    dedup_key: `dispatch-fixture:${id}`,
    ...patch,
  });
  if (result.error) throw new Error("Aviso fictício não preparado.");
  return id;
}
function row(id: string) {
  return JSON.parse(
    sql(
      `select json_build_object('status',status,'attempts',attempts,'lastError',last_error,'sendAfter',send_after,'sentAt',sent_at,'cancelledAt',cancelled_at,'reason',cancellation_reason) from public.notifications where id='${id}';`,
    ),
  );
}
function history(id: string) {
  return JSON.parse(
    sql(
      `select json_build_object('attempts',(select count(*) from private.notification_dispatch_requests where notification_id='${id}' and disposition='reserved'),'receipts',(select count(*) from private.notification_dispatch_receipts z join private.notification_dispatch_requests r on r.request_id=z.request_id where r.notification_id='${id}'));`,
    ),
  );
}
function due(id: string) {
  sql(
    `update public.notifications set send_after=clock_timestamp()-interval '1 second' where id='${id}';`,
  );
}
function cancel(id: string) {
  sql(
    `update public.notifications set status='cancelled',cancelled_at=clock_timestamp(),cancellation_reason='order_ineligible' where id='${id}';`,
  );
}
async function claim(id: string, request = nonce()) {
  const reservation = await store.claim(request, "email", id);
  if (reservation.status !== "reserved")
    throw new Error("Reserva fictícia não disponível.");
  return reservation;
}
async function order() {
  const id = randomUUID();
  orders.push(id);
  const result = await db.from("orders").insert({
    id,
    process_id: processFixture.id,
    client_id: processFixture.clientId,
    calc_type: "initial",
    status: "queued",
    internal_due_date: "2026-10-19",
  });
  if (result.error) throw new Error("Pedido fictício não preparado.");
  return id;
}
beforeAll(async () => {
  db = localSystem();
  store = createLocalNotificationStore();
  processFixture = await createMessageProcess();
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions.push(await quoteSession(role));
  // O relógio da RPC nunca vem do cliente. O proprietário local injeta somente
  // leases das fixtures marcadas, antes do INSERT imutável, sem sleep/UPDATE.
  sql(`create function private.fixture_dispatch_expiry() returns trigger language plpgsql set search_path='' as $$begin
   if new.disposition='reserved' and new.snapshot->'data'->>'fixture'='dispatch-expired'
    and new.attempt>=(new.snapshot->'data'->>'expireAttempt')::integer then new.expires_at:=clock_timestamp()-interval '1 second'; end if;
   return new; end;$$;
   revoke all on function private.fixture_dispatch_expiry() from public,anon,authenticated,service_role;
   create trigger fixture_dispatch_expiry before insert on private.notification_dispatch_requests for each row execute function private.fixture_dispatch_expiry();`);
});
afterEach(() => {
  if (requests.length)
    sql(
      `delete from private.notification_dispatch_receipts where request_id in (${list(requests)}); delete from private.notification_dispatch_requests where request_id in (${list(requests)});`,
    );
  if (notices.length)
    sql(`delete from public.notifications where id in (${list(notices)});`);
  if (orders.length)
    sql(`delete from public.orders where id in (${list(orders)});`);
  notices.length = requests.length = orders.length = 0;
});
afterAll(async () => {
  try {
    sql(
      "drop trigger fixture_dispatch_expiry on private.notification_dispatch_requests; drop function private.fixture_dispatch_expiry();",
    );
    await Promise.all(
      sessions.map((session) => session.auth.signOut({ scope: "local" })),
    );
  } finally {
    if (processFixture) await removeMessageProcess(processFixture.id);
  }
});

it("duas reservas concorrentes não tomam o mesmo aviso", async () => {
  const id = await notice();
  const results = await Promise.all([
    store.claim(nonce(), "email", id),
    store.claim(nonce(), "email", id),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual(["empty", "reserved"]);
  expect(row(id)).toMatchObject({ status: "pending", attempts: 1 });
  expect(history(id)).toEqual({ attempts: 1, receipts: 0 });
});
it("mesmo nonce concorrente e repetido recupera a reserva, sem outra tentativa", async () => {
  const id = await notice(),
    request = nonce();
  const results = await Promise.all([claim(id, request), claim(id, request)]);
  expect(results[0]).toEqual(results[1]);
  expect(await store.claim(request, "email", id)).toEqual(results[0]);
  expect(await store.validate(request)).toBe(true);
  expect(history(id)).toEqual({ attempts: 1, receipts: 0 });
  await expect(store.claim(request, "whatsapp", id)).rejects.toThrow(
    "Reserva não confirmada",
  );
  expect(row(id).attempts).toBe(1);
});
it("reserva vazia é durável e respeita canal e agendamento", async () => {
  const id = await notice({ send_after: "2099-01-01T12:00:00Z" }),
    request = nonce();
  const empty = await store.claim(request, "email", id);
  expect(empty.status).toBe("empty");
  due(id);
  expect(await store.claim(request, "email", id)).toEqual(empty);
  expect((await store.claim(nonce(), "whatsapp", id)).status).toBe("empty");
  expect((await claim(id)).attempt).toBe(1);
});
it("deduplicação existente não gera uma segunda notificação", async () => {
  const id = await notice();
  expect(
    (
      await db.from("notifications").insert({
        channel: "email",
        recipient: "ficticio@exemplo.invalid",
        template: "order_queued",
        dedup_key: `dispatch-fixture:${id}`,
      })
    ).error?.code,
  ).toBe("23505");
  expect((await claim(id)).message.idempotencyKey).toBe(`notification:${id}`);
  expect(row(id).attempts).toBe(1);
});
it("resultado confirmado e resposta perdida recuperam recibo imutável", async () => {
  const id = await notice(),
    r = await claim(id);
  const receipt = await store.complete(r.requestId, "accepted");
  expect(receipt).toMatchObject({
    status: "sent",
    mode: "simulation",
    code: null,
  });
  expect(await store.complete(r.requestId, "accepted")).toEqual(receipt);
  expect(await store.claim(r.requestId, "email", id)).toEqual(r);
  expect(await store.validate(r.requestId)).toBe(false);
  await expect(store.complete(r.requestId, "retryable")).rejects.toThrow(
    "Resultado não confirmado",
  );
  expect(history(id)).toEqual({ attempts: 1, receipts: 1 });
  expect(row(id)).toMatchObject({
    status: "sent",
    attempts: 1,
    lastError: null,
  });
  expect(() =>
    sql(
      `update private.notification_dispatch_receipts set result='{}' where request_id='${r.requestId}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `update private.notification_dispatch_requests set expires_at=clock_timestamp() where request_id='${r.requestId}';`,
    ),
  ).toThrow();
});
it("cinco falhas comprovadamente repetíveis têm espera crescente e término", async () => {
  const id = await notice();
  let original: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await claim(id);
    expect(r.attempt).toBe(attempt);
    original ??= r.message;
    expect(r.message).toEqual(original);
    expect(await store.validate(r.requestId)).toBe(true);
    const receipt = await store.complete(r.requestId, "retryable");
    expect(await store.complete(r.requestId, "retryable")).toEqual(receipt);
    if (attempt < 5) {
      expect(receipt).toMatchObject({
        status: "pending",
        code: "retryable_failure",
      });
      const delay = Number(
        sql(
          `select round(extract(epoch from (n.send_after-z.created_at))) from public.notifications n join private.notification_dispatch_requests r on r.notification_id=n.id join private.notification_dispatch_receipts z on z.request_id=r.request_id where n.id='${id}' and r.attempt=${attempt};`,
        ),
      );
      expect(delay).toBe([60, 300, 900, 3600][attempt - 1]);
      expect((await store.claim(nonce(), "email", id)).status).toBe("empty");
      due(id);
    } else
      expect(receipt).toMatchObject({
        status: "failed",
        code: "attempts_exhausted",
        nextAt: null,
      });
  }
  expect(history(id)).toEqual({ attempts: 5, receipts: 5 });
  expect(row(id)).toMatchObject({
    status: "failed",
    attempts: 5,
    lastError: "attempts_exhausted",
  });
  expect((await store.claim(nonce(), "email", id)).status).toBe("empty");
  expect(() =>
    sql(`update public.notifications set attempts=6 where id='${id}';`),
  ).toThrow();
});
it.each(["accepted", "retryable", "rejected", "unknown"] as const)(
  "resultado %s após lease expirada recupera o mesmo bloqueio",
  async (inputOutcome) => {
    const id = await notice({
        data: { fixture: "dispatch-expired", expireAttempt: 1 },
      }),
      r = await claim(id);
    const receipt = await store.complete(r.requestId, inputOutcome);
    expect(receipt).toMatchObject({
      status: "held",
      code: "dispatch_outcome_unknown",
      mode: "simulation",
    });
    expect(await store.complete(r.requestId, inputOutcome)).toEqual(receipt);
    await expect(
      store.complete(
        r.requestId,
        inputOutcome === "accepted" ? "rejected" : "accepted",
      ),
    ).rejects.toThrow();
    expect(row(id)).toMatchObject({
      status: "failed",
      attempts: 1,
      sentAt: null,
    });
    expect((await store.claim(nonce(), "email", id)).status).toBe("empty");
  },
);
it("validação expira reserva antiga e não aceita crédito posterior", async () => {
  const id = await notice({
      data: { fixture: "dispatch-expired", expireAttempt: 1 },
    }),
    r = await claim(id);
  expect(await store.validate(r.requestId)).toBe(false);
  const receipt = await store.complete(r.requestId, "accepted");
  expect(receipt).toMatchObject({
    status: "held",
    code: "dispatch_outcome_unknown",
  });
  expect(await store.complete(r.requestId, "accepted")).toEqual(receipt);
  expect(row(id)).toMatchObject({ status: "failed", sentAt: null });
  expect(history(id)).toEqual({ attempts: 1, receipts: 1 });
});
it("outra requisição encontra lease perdida e a bloqueia sem reenvio", async () => {
  const id = await notice({
      data: { fixture: "dispatch-expired", expireAttempt: 1 },
    }),
    r = await claim(id);
  const request = nonce(),
    held = await store.claim(request, "email", id);
  expect(held.status).toBe("held");
  expect(await store.claim(request, "email", id)).toEqual(held);
  expect(await store.claim(r.requestId, "email", id)).toEqual(r);
  expect(await store.validate(r.requestId)).toBe(false);
  expect((await store.complete(r.requestId, "accepted")).status).toBe("held");
  expect(history(id)).toEqual({ attempts: 1, receipts: 1 });
});
it("quinta lease perdida termina failed com resultado incerto", async () => {
  const id = await notice({
    data: { fixture: "dispatch-expired", expireAttempt: 5 },
  });
  for (let attempt = 1; attempt < 5; attempt++) {
    const r = await claim(id);
    await store.complete(r.requestId, "retryable");
    due(id);
  }
  const r = await claim(id);
  expect(r.attempt).toBe(5);
  expect((await store.claim(nonce(), "email", id)).status).toBe("held");
  expect(await store.validate(r.requestId)).toBe(false);
  expect((await store.complete(r.requestId, "accepted")).status).toBe("held");
  expect(row(id)).toMatchObject({
    status: "failed",
    attempts: 5,
    sentAt: null,
  });
  expect(history(id)).toEqual({ attempts: 5, receipts: 5 });
});
it.each(["rejected", "unknown"] as const)(
  "%s é terminal e não volta à fila",
  async (inputOutcome) => {
    const id = await notice(),
      r = await claim(id);
    const receipt = await store.complete(r.requestId, inputOutcome);
    expect(receipt).toMatchObject({
      status: inputOutcome === "unknown" ? "held" : "failed",
      code:
        inputOutcome === "unknown"
          ? "dispatch_outcome_unknown"
          : "permanent_failure",
    });
    expect((await store.claim(nonce(), "email", id)).status).toBe("empty");
    expect(row(id)).toMatchObject({
      status: "failed",
      attempts: 1,
      sentAt: null,
    });
  },
);
it.each([true, false])(
  "cancelamento após seleção é preservado (validação=%s)",
  async (validateFirst) => {
    const id = await notice(),
      r = await claim(id);
    cancel(id);
    const before = row(id);
    if (validateFirst) expect(await store.validate(r.requestId)).toBe(false);
    const receipt = await store.complete(r.requestId, "accepted");
    expect(receipt).toMatchObject({
      status: "cancelled",
      code: "notification_cancelled",
    });
    expect(await store.complete(r.requestId, "accepted")).toEqual(receipt);
    expect(row(id)).toEqual(before);
    expect(history(id)).toEqual({ attempts: 1, receipts: 1 });
  },
);
it("lembrete reservado conserva vínculo original e cancelamento por prazo", async () => {
  const orderId = await order();
  const id = await notice({
    template: "deadline_one_day",
    data: { order_id: orderId, internal_due_date: "2026-10-19" },
    dedup_key: `deadline:${orderId}:deadline_one_day:2026-10-19:email`,
  });
  const r = await claim(id);
  expect(await store.validate(r.requestId)).toBe(true);
  expect(() =>
    sql(
      `update public.notifications set data=jsonb_build_object('order_id','${randomUUID()}') where id='${id}';`,
    ),
  ).toThrow();
  expect(
    (
      await db
        .from("orders")
        .update({ internal_due_date: "2026-10-20" })
        .eq("id", orderId)
    ).error,
  ).toBeNull();
  expect(row(id)).toMatchObject({
    status: "cancelled",
    reason: "deadline_changed",
  });
  expect(await store.validate(r.requestId)).toBe(false);
  expect((await store.complete(r.requestId, "accepted")).status).toBe(
    "cancelled",
  );
  expect(row(id).sentAt).toBeNull();
});
it("lembrete malformado ou prazo incoerente nunca valida", async () => {
  const orderId = await order();
  for (const data of [
    { order_id: "invalid" },
    { order_id: orderId, internal_due_date: "2026-10-20" },
  ]) {
    const id = await notice({ template: "deadline_one_day", data }),
      r = await claim(id);
    expect(await store.validate(r.requestId)).toBe(false);
    expect(row(id).sentAt).toBeNull();
  }
  expect(
    (
      await db
        .from("orders")
        .update({ internal_due_date: null })
        .eq("id", orderId)
    ).error,
  ).toBeNull();
  const withoutDue = await notice({
    template: "deadline_one_day",
    data: { order_id: orderId },
  });
  expect(await store.validate((await claim(withoutDue)).requestId)).toBe(false);
});
it("alteração do pedido e validação concorrentes terminam sem reativar lembrete", async () => {
  const orderId = await order();
  const id = await notice({
    template: "deadline_one_day",
    data: { order_id: orderId, internal_due_date: "2026-10-19" },
    dedup_key: `deadline:${orderId}:deadline_one_day:2026-10-19:email`,
  });
  const r = await claim(id);
  const [updated, validated] = await Promise.all([
    db
      .from("orders")
      .update({ internal_due_date: "2026-10-20" })
      .eq("id", orderId),
    store.validate(r.requestId),
  ]);
  expect(updated.error).toBeNull();
  expect(typeof validated).toBe("boolean");
  expect(await store.validate(r.requestId)).toBe(false);
  expect((await store.complete(r.requestId, "accepted")).status).toBe(
    "cancelled",
  );
  expect(row(id)).toMatchObject({ status: "cancelled", sentAt: null });
  expect(history(id)).toEqual({ attempts: 1, receipts: 1 });
});
it("resultados concorrentes conflitantes não criam dois recibos", async () => {
  const id = await notice(),
    r = await claim(id);
  const results = await Promise.allSettled([
    store.complete(r.requestId, "accepted"),
    store.complete(r.requestId, "rejected"),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([
    "fulfilled",
    "rejected",
  ]);
  const winner = results.find((r) => r.status === "fulfilled");
  if (!winner || winner.status !== "fulfilled")
    throw new Error("Resultado fictício indisponível.");
  expect(row(id).status).toBe(winner.value.status);
  expect(history(id)).toEqual({ attempts: 1, receipts: 1 });
});
it("conteúdo permanece congelado entre retries e serviço não altera a fila diretamente", async () => {
  const id = await notice(),
    r = await claim(id);
  expect(
    (
      await db
        .from("notifications")
        .update({ attempts: 5, status: "sent" })
        .eq("id", id)
    ).error,
  ).not.toBeNull();
  expect(() =>
    sql(
      `update public.notifications set recipient='outro-ficticio@exemplo.invalid' where id='${id}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `update public.notifications set template='another_template' where id='${id}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `update public.notifications set dedup_key='other-fixture-key' where id='${id}';`,
    ),
  ).toThrow();
  await store.complete(r.requestId, "retryable");
  due(id);
  expect((await claim(id)).message).toEqual(r.message);
});
it("rollback não consome nonce/tentativa nem deixa recibo parcial", async () => {
  const id = await notice(),
    request = nonce();
  sql(
    `begin; set local request.jwt.claims='{"role":"service_role"}'; set local role service_role; select public.claim_notification_local_system('${request}','email','${id}'); select public.complete_notification_local_system('${request}','accepted'); rollback;`,
  );
  expect(row(id)).toMatchObject({
    status: "pending",
    attempts: 0,
    sentAt: null,
  });
  expect(history(id)).toEqual({ attempts: 0, receipts: 0 });
  expect((await claim(id, request)).attempt).toBe(1);
});
it("anon e papéis humanos não acessam RPCs, fila ou registros privados", async () => {
  const id = await notice(),
    r = await claim(id),
    anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
  for (const session of [...sessions, anon]) {
    expect(
      (
        await session.rpc("claim_notification_local_system", {
          request_id: nonce(),
          channel: "email",
          target_notification: id,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await session.rpc("validate_notification_local_claim", {
          request_id: r.requestId,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await session.rpc("complete_notification_local_system", {
          request_id: r.requestId,
          outcome: "accepted",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (await session.from("notifications").select("id")).error,
    ).not.toBeNull();
  }
  expect(
    sql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name in ('notification_dispatch_requests','notification_dispatch_receipts') and grantee in ('anon','authenticated','service_role');",
    ),
  ).toBe("0");
  expect(
    sql(
      "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('notification_dispatch_reservation','expire_notification_dispatch','preserve_notification_dispatch_record','preserve_reserved_notification_content') and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'));",
    ),
  ).toBe("0");
  expect(row(id).attempts).toBe(1);
});
it("dados inválidos não consomem a reserva nem gravam erro bruto", async () => {
  const id = await notice(),
    r = await claim(id);
  for (const badOutcome of [
    null,
    "provider-error-with-private-payload",
    "accepted\n",
  ]) {
    expect(
      (
        await db.rpc("complete_notification_local_system", {
          request_id: r.requestId,
          outcome: badOutcome,
        })
      ).error,
    ).not.toBeNull();
  }
  await expect(
    store.complete(r.requestId, "invalid" as NotificationOutcome),
  ).rejects.toThrow("Resultado de processamento inválido");
  expect(history(id)).toEqual({ attempts: 1, receipts: 0 });
  expect(row(id)).toMatchObject({ status: "pending", lastError: null });
});
