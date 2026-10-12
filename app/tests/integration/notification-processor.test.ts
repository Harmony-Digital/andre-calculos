import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { localSystem } from "../e2e/local-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { quoteSession } from "../e2e/quote-helper";
vi.mock("server-only", () => ({}));
import { createLocalNotificationStore } from "../../src/modules/notifications/notification-store";
import { processPending } from "../../src/modules/notifications/process-pending";

let db: ReturnType<typeof localSystem>;
const runs: string[] = [],
  notices: string[] = [];
const list = (values: string[]) => values.map((v) => `'${v}'::uuid`).join(",");
function input(targets: string[], limit = targets.length) {
  const runId = randomUUID();
  runs.push(runId);
  return {
    runId,
    channel: "email" as const,
    limit,
    targets,
    mode: "simulation" as const,
  };
}
async function notice(data: Record<string, unknown> = {}) {
  const id = randomUUID();
  notices.push(id);
  const inserted = await db.from("notifications").insert({
    id,
    channel: "email",
    recipient: "destinatario-ficticio@exemplo.invalid",
    template: "order_queued",
    data: {
      fixture: "local-processor",
      privateSentinel: "conteudo-ficticio-sigiloso",
      ...data,
    },
    dedup_key: `processor-fixture:${id}`,
  });
  if (inserted.error) throw new Error("Aviso fictício não preparado.");
  return id;
}
function history(id: string) {
  return JSON.parse(
    sql(`select json_build_object('status',n.status,'attempts',n.attempts,'code',n.last_error,
   'calls',(select count(*) from private.notification_local_calls where notification_id=n.id),
   'deliveries',(select count(*) from private.notification_local_deliveries where notification_id=n.id),
   'receipts',(select count(*) from private.notification_dispatch_receipts z join private.notification_dispatch_requests r on r.request_id=z.request_id where r.notification_id=n.id))
   from public.notifications n where n.id='${id}';`),
  );
}
function cancel(id: string) {
  sql(
    `update public.notifications set status='cancelled',cancelled_at=clock_timestamp(),cancellation_reason='order_ineligible' where id='${id}';`,
  );
}
function due(id: string) {
  sql(
    `update public.notifications set send_after=clock_timestamp()-interval '1 second' where id='${id}';`,
  );
}
async function stage(id: string) {
  const options = input([id]),
    store = createLocalNotificationStore();
  const run = await store.beginRun(options),
    requestId = run.requestIds[0];
  const claim = await store.claim(requestId, "email", id);
  if (claim.status !== "reserved")
    throw new Error("Reserva fictícia indisponível.");
  return { options, store, requestId, claim };
}
beforeAll(() => {
  db = localSystem();
  // Somente o proprietário local controla cenários e tempo das fixtures.
  sql(`create function private.fixture_processor_call() returns trigger language plpgsql set search_path='' as $$
   declare snapshot jsonb; begin
   select r.snapshot into snapshot from private.notification_dispatch_requests r where r.request_id=new.request_id;
   if snapshot->'data'->>'fixture'='local-processor' then
    new.outcome:=coalesce(snapshot->'data'->>'transportOutcome','accepted'); end if;
   return new; end;$$;
   revoke all on function private.fixture_processor_call() from public,anon,authenticated,service_role;
   create trigger fixture_processor_call before insert on private.notification_local_calls for each row execute function private.fixture_processor_call();
   create function private.fixture_processor_expiry() returns trigger language plpgsql set search_path='' as $$begin
   if new.snapshot->'data'->>'fixture'='local-processor' then
    if new.snapshot->'data'->>'expired'='true' then new.expires_at:=clock_timestamp()-interval '1 second';
    elsif new.snapshot->'data'->>'expireSoon'='true' then new.expires_at:=clock_timestamp()+interval '2 seconds'; end if;
   end if; return new; end;$$;
   revoke all on function private.fixture_processor_expiry() from public,anon,authenticated,service_role;
   create trigger fixture_processor_expiry before insert on private.notification_dispatch_requests for each row execute function private.fixture_processor_expiry();`);
});
afterEach(() => {
  vi.restoreAllMocks();
  if (notices.length) {
    sql(`delete from private.notification_local_calls where notification_id in (${list(notices)});
     delete from private.notification_local_deliveries where notification_id in (${list(notices)});`);
  }
  if (runs.length) {
    const match = `select unnest(request_ids) from private.notification_local_runs where run_id in (${list(runs)})`;
    sql(`delete from private.notification_dispatch_receipts where request_id in (${match});
     delete from private.notification_dispatch_requests where request_id in (${match});
     delete from private.notification_local_runs where run_id in (${list(runs)});`);
  }
  if (notices.length)
    sql(`delete from public.notifications where id in (${list(notices)});`);
  notices.length = runs.length = 0;
});
afterAll(() =>
  sql(`drop trigger fixture_processor_call on private.notification_local_calls; drop function private.fixture_processor_call();
 drop trigger fixture_processor_expiry on private.notification_dispatch_requests; drop function private.fixture_processor_expiry();`),
);

it("processa só os alvos fictícios e retorna contagens, sem rede externa ou logs", async () => {
  const selected = await notice(),
    untouched = await notice();
  const fetch = vi.spyOn(globalThis, "fetch"),
    log = vi.spyOn(console, "log"),
    warn = vi.spyOn(console, "warn"),
    error = vi.spyOn(console, "error");
  const result = await processPending(input([selected]));
  expect(result).toEqual({
    mode: "simulation",
    configured: true,
    paused: false,
    accepted: 1,
    retryable: 0,
    rejected: 0,
    cancelled: 0,
    held: 0,
    empty: 0,
  });
  expect(history(selected)).toMatchObject({
    status: "sent",
    attempts: 1,
    calls: 1,
    deliveries: 1,
    receipts: 1,
  });
  expect(history(untouched)).toMatchObject({
    status: "pending",
    attempts: 0,
    calls: 0,
  });
  expect(fetch).toHaveBeenCalled();
  for (const [url] of fetch.mock.calls)
    expect(String(url)).toMatch(/^http:\/\/127\.0\.0\.1:54321\//);
  expect(log).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toMatch(
    /exemplo|sigiloso|notificationId|requestId|runId/,
  );
});
it("execução completa repetida recupera os mesmos recibos sem novo efeito", async () => {
  const id = await notice(),
    options = input([id]);
  const first = await processPending(options);
  expect(await processPending(options)).toEqual(first);
  expect(history(id)).toMatchObject({
    attempts: 1,
    calls: 1,
    deliveries: 1,
    receipts: 1,
  });
});
it("dois executores com o mesmo runId produzem uma única aceitação", async () => {
  const id = await notice(),
    options = input([id]);
  const results = await Promise.all([
    processPending(options),
    processPending(options),
  ]);
  expect(results.every((r) => r.accepted === 1 && !r.paused)).toBe(true);
  expect(history(id)).toMatchObject({
    attempts: 1,
    calls: 1,
    deliveries: 1,
    receipts: 1,
  });
});
it.each([
  "simulate_notification_local_transport",
  "complete_notification_local_system",
])(
  "perda real da resposta de %s é reconciliada sem repetir efeito",
  async (rpc) => {
    const id = await notice(),
      options = input([id]);
    const nativeFetch = globalThis.fetch;
    let lose = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
      const response = await nativeFetch(...args);
      if (lose && String(args[0]).endsWith(`/rpc/${rpc}`) && response.ok) {
        lose = false;
        // A transação real terminou; somente sua resposta ao executor se perde.
        throw new Error("sentinela privada fictícia da resposta perdida");
      }
      return response;
    });
    const first = await processPending(options);
    expect(lose).toBe(false);
    expect(first).toMatchObject(
      rpc === "complete_notification_local_system"
        ? { accepted: 0, paused: true }
        : { accepted: 1, paused: false },
    );
    expect(await processPending(options)).toMatchObject({
      accepted: 1,
      paused: false,
    });
    expect(history(id)).toMatchObject({
      attempts: 1,
      calls: 1,
      deliveries: 1,
      receipts: 1,
    });
  },
);
it("lote de 25 processa 25 avisos e preserva o vigésimo sexto", async () => {
  const ids: string[] = [];
  for (let i = 0; i < 26; i++) ids.push(await notice());
  const options = input(ids.slice(0, 25), 25);
  expect(await processPending(options)).toMatchObject({
    accepted: 25,
    paused: false,
  });
  expect(await processPending(options)).toMatchObject({
    accepted: 25,
    paused: false,
  });
  for (const id of ids.slice(0, 25))
    expect(history(id)).toMatchObject({ attempts: 1, calls: 1, deliveries: 1 });
  expect(history(ids[25])).toMatchObject({
    attempts: 0,
    calls: 0,
    deliveries: 0,
    status: "pending",
  });
});
it("execuções diferentes concorrentes não tomam o mesmo aviso", async () => {
  const id = await notice();
  const results = await Promise.all([
    processPending(input([id])),
    processPending(input([id])),
  ]);
  expect(results.reduce((sum, r) => sum + r.accepted, 0)).toBe(1);
  expect(history(id)).toMatchObject({
    attempts: 1,
    calls: 1,
    deliveries: 1,
    receipts: 1,
  });
});
it.each(["accepted", "retryable", "rejected", "unknown"] as const)(
  "retoma resposta do transporte %s persistida e perdida",
  async (outcome) => {
    const id = await notice({ transportOutcome: outcome });
    const { options, store, requestId } = await stage(id);
    expect(await store.simulate(requestId)).toMatchObject({
      status: "result",
      outcome,
    });
    expect(await store.getReceipt(requestId)).toBeNull();
    const result = await processPending(options);
    expect(result[outcome === "unknown" ? "held" : outcome]).toBe(1);
    expect(result.paused).toBe(outcome === "unknown");
    expect(history(id)).toMatchObject({
      attempts: 1,
      calls: 1,
      deliveries: outcome === "accepted" ? 1 : 0,
      receipts: 1,
    });
  },
);
it.each(["accepted", "retryable", "rejected", "unknown"] as const)(
  "retoma resposta da conclusão %s persistida e perdida",
  async (outcome) => {
    const id = await notice({ transportOutcome: outcome });
    const { options, store, requestId } = await stage(id);
    await store.simulate(requestId);
    const receipt = await store.complete(requestId, outcome);
    expect(await store.getReceipt(requestId)).toEqual(receipt);
    const result = await processPending(options);
    expect(result[outcome === "unknown" ? "held" : outcome]).toBe(1);
    expect(history(id)).toMatchObject({ attempts: 1, calls: 1, receipts: 1 });
  },
);
it("resultado desconhecido interrompe antes do próximo alvo e não o reenvia", async () => {
  const id = await notice({ transportOutcome: "unknown" }),
    next = await notice();
  const options = input([id, next]);
  expect(await processPending(options)).toMatchObject({
    held: 1,
    accepted: 0,
    paused: true,
  });
  expect(await processPending(options)).toMatchObject({
    held: 1,
    paused: true,
  });
  expect(history(id)).toMatchObject({
    status: "failed",
    calls: 1,
    attempts: 1,
  });
  expect(history(next)).toMatchObject({ attempts: 0, calls: 0 });
});
it("falha repetível respeita espera e cada nova tentativa mantém o hash", async () => {
  const id = await notice({ transportOutcome: "retryable" });
  const first = await processPending(input([id]));
  expect(first.retryable).toBe(1);
  expect((await processPending(input([id]))).empty).toBe(1);
  for (let attempt = 2; attempt <= 5; attempt++) {
    due(id);
    const result = await processPending(input([id]));
    expect(result[attempt === 5 ? "rejected" : "retryable"]).toBe(1);
  }
  expect(history(id)).toMatchObject({
    attempts: 5,
    calls: 5,
    deliveries: 0,
    status: "failed",
    code: "attempts_exhausted",
  });
  expect(
    sql(
      `select count(distinct snapshot_hash) from private.notification_local_calls where notification_id='${id}';`,
    ),
  ).toBe("1");
});
it("falta de adaptador não cria execução nem consome tentativa", async () => {
  const id = await notice(),
    options = { ...input([id]), mode: undefined };
  expect(await processPending(options)).toMatchObject({
    configured: false,
    paused: true,
    accepted: 0,
  });
  expect(history(id)).toMatchObject({ attempts: 0, calls: 0 });
  expect(
    sql(
      `select count(*) from private.notification_local_runs where run_id='${options.runId}';`,
    ),
  ).toBe("0");
});
it("runId mantém slots e recusa canal, limite ou alvos diferentes", async () => {
  const id = await notice(),
    other = await notice(),
    options = input([id]);
  const store = createLocalNotificationStore(),
    first = await store.beginRun(options);
  expect(await store.beginRun(options)).toEqual(first);
  for (const changed of [
    { ...options, channel: "whatsapp" as const },
    { ...options, limit: 2 },
    { ...options, targets: [other] },
  ])
    await expect(store.beginRun(changed)).rejects.toThrow(
      "Execução não confirmada",
    );
  expect(history(id)).toMatchObject({ attempts: 0 });
});
it("limita o lote a 25 e recusa arrays vazios, duplicados ou maiores que o limite", async () => {
  const store = createLocalNotificationStore(),
    id = await notice();
  for (const options of [
    input([id], 0),
    input([id], 26),
    input([], 1),
    input([id, id], 2),
    input([id, randomUUID()], 1),
  ])
    await expect(store.beginRun(options)).rejects.toThrow("inválida");
  const options = { ...input([id]), limit: 25, targets: undefined };
  const run = await store.beginRun(options);
  expect(run.requestIds).toHaveLength(25);
  expect(new Set(run.requestIds).size).toBe(25);
  const invalid = await db.rpc("begin_notification_local_run", {
    run_id: options.runId,
    channel: "email",
    batch_limit: 26,
  });
  expect(invalid.error).not.toBeNull();
});
it("alvo inexistente não faz seleção global nem substitui a posição na retomada", async () => {
  const untouched = await notice(),
    options = input([randomUUID()]);
  expect(await processPending(options)).toMatchObject({
    empty: 1,
    accepted: 0,
  });
  expect(await processPending(options)).toMatchObject({ empty: 1 });
  expect(history(untouched)).toMatchObject({ attempts: 0 });
});
it("cancelamento antes do transporte preserva o recibo automático sem efeito", async () => {
  const id = await notice(),
    { options, store, requestId } = await stage(id);
  expect(await store.validate(requestId)).toBe(true);
  cancel(id);
  expect(await store.simulate(requestId)).toMatchObject({ status: "blocked" });
  expect(await store.getReceipt(requestId)).toMatchObject({
    status: "cancelled",
  });
  expect(await processPending(options)).toMatchObject({
    cancelled: 1,
    accepted: 0,
  });
  expect(history(id)).toMatchObject({
    status: "cancelled",
    calls: 0,
    deliveries: 0,
  });
});
it("cancelamento após aceitação conserva a prova, sem declarar enviado", async () => {
  const id = await notice(),
    { options, store, requestId } = await stage(id);
  await store.simulate(requestId);
  cancel(id);
  expect(await processPending(options)).toMatchObject({
    accepted: 0,
    cancelled: 1,
  });
  expect(history(id)).toMatchObject({
    status: "cancelled",
    deliveries: 1,
    calls: 1,
  });
});
it("expiração antes do transporte bloqueia e conserva o recibo automático", async () => {
  const id = await notice({ expired: true });
  expect(await processPending(input([id]))).toMatchObject({
    held: 1,
    accepted: 0,
    paused: true,
  });
  expect(history(id)).toMatchObject({
    status: "failed",
    calls: 0,
    deliveries: 0,
    receipts: 1,
  });
});
it("aceitação antes de expirar não renova lease nem vira sucesso tardio", async () => {
  const id = await notice({ expireSoon: true }),
    { options, store, requestId } = await stage(id);
  expect(await store.simulate(requestId)).toMatchObject({
    outcome: "accepted",
  });
  sql("select pg_sleep(2.1);");
  expect(await processPending(options)).toMatchObject({
    held: 1,
    accepted: 0,
    paused: true,
  });
  expect(history(id)).toMatchObject({
    status: "failed",
    calls: 1,
    deliveries: 1,
    receipts: 1,
  });
});
it("hash divergente recusa efeito e rollback mantém os registros intactos", async () => {
  const id = await notice(),
    { store, requestId } = await stage(id);
  sql(`insert into private.notification_local_deliveries(notification_id,idempotency_key,snapshot_hash)
   values('${id}','notification:${id}','${"f".repeat(64)}');`);
  await expect(store.simulate(requestId)).rejects.toThrow(
    "Resultado fictício não confirmado",
  );
  expect(history(id)).toMatchObject({
    calls: 0,
    deliveries: 1,
    receipts: 0,
    attempts: 1,
  });
});
it("aceitação fictícia existente com o mesmo hash não duplica o efeito", async () => {
  const id = await notice(),
    { options, claim } = await stage(id);
  sql(`insert into private.notification_local_deliveries(notification_id,idempotency_key,snapshot_hash)
   values('${id}','notification:${id}','${claim.message.snapshotHash}');`);
  expect(await processPending(options)).toMatchObject({
    accepted: 1,
    paused: false,
  });
  expect(history(id)).toMatchObject({ calls: 1, deliveries: 1, receipts: 1 });
});
it("transporte concorrente e replay após conclusão recuperam um único efeito", async () => {
  const id = await notice(),
    { store, requestId } = await stage(id);
  const results = await Promise.all([
    store.simulate(requestId),
    store.simulate(requestId).then(async (ack) => {
      if (ack.status === "result") await store.complete(requestId, ack.outcome);
      return ack;
    }),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(await store.simulate(requestId)).toEqual(results[0]);
  expect(history(id)).toMatchObject({ calls: 1, deliveries: 1, receipts: 1 });
});
it("tabelas privadas são imutáveis e inacessíveis diretamente ao sistema", async () => {
  const id = await notice(),
    staged = await stage(id);
  await staged.store.simulate(staged.requestId);
  for (const table of [
    "notification_local_runs",
    "notification_local_calls",
    "notification_local_deliveries",
  ]) {
    expect(
      sql(
        `select relrowsecurity from pg_class where oid='private.${table}'::regclass;`,
      ),
    ).toBe("t");
    expect(
      sql(
        `select has_table_privilege('service_role','private.${table}','SELECT') or has_table_privilege('service_role','private.${table}','UPDATE');`,
      ),
    ).toBe("f");
  }
  expect(() =>
    sql(
      `update private.notification_local_runs set batch_limit=2 where run_id='${staged.options.runId}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `update private.notification_local_calls set outcome='unknown' where request_id='${staged.requestId}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `update private.notification_local_deliveries set snapshot_hash='${"e".repeat(64)}' where notification_id='${id}';`,
    ),
  ).toThrow();
});
it("anônimo e pessoa autenticada não chamam execução, transporte ou getters", async () => {
  const session = await quoteSession("client"),
    id = await notice(),
    staged = await stage(id);
  const { createClient } = await import("@supabase/supabase-js");
  const anonymous = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  try {
    for (const client of [session, anonymous]) {
      expect(
        (
          await client.rpc("begin_notification_local_run", {
            run_id: staged.options.runId,
            channel: "email",
            batch_limit: 1,
          })
        ).error,
      ).not.toBeNull();
      for (const rpc of [
        "simulate_notification_local_transport",
        "get_notification_local_receipt",
        "get_notification_local_transport_result",
      ] as const)
        expect(
          (await client.rpc(rpc, { request_id: staged.requestId })).error,
        ).not.toBeNull();
    }
  } finally {
    await session.auth.signOut({ scope: "local" });
  }
});
