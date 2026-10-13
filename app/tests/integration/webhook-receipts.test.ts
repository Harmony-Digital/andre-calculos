import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import { executionTransportFixture } from "../e2e/execution-transport-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { localSystem } from "../e2e/local-helper";
import { quoteSession } from "../e2e/quote-helper";
import { receiveFixtureAsaasWebhook } from "@/modules/payments/webhook-receipt";
import { POST } from "@/app/api/webhooks/asaas/route";
import { normalizeAsaasFinancialEvent } from "@/modules/payments/asaas/financial";
import { scopeSchema } from "@/modules/payments/asaas/scope-data";
import { withWebhookHttpServer } from "./webhook-http-helper";
let fixture: Awaited<ReturnType<typeof executionTransportFixture>> | undefined;
let eventId: string;
const token = "ficticio-webhook-recepcao-somente-teste-2026";
const f = () => fixture!;
const account = () => "fixture-" + f().scopeId;
const text = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: eventId,
    event: "PAYMENT_RECEIVED",
    dateCreated: "2026-10-12 10:00:00",
    account: { id: account() },
    payment: {
      id: "pay_unmatched_fixture",
      customer: "cus_fixture",
      externalReference: f().intentId,
      value: 125.01,
      netValue: 124.01,
      status: "RECEIVED",
      billingType: "PIX",
      dueDate: "2026-10-20",
      deleted: false,
      refunds: [],
      ...patch,
    },
  });
const request = (body = text(), suppliedToken = token) =>
  new Request("https://example.test/api/webhooks/asaas", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "asaas-access-token": suppliedToken,
    },
    body,
  });
const literal = (v: string) => "'" + v.replaceAll("'", "''") + "'";
const counters = () =>
  JSON.parse(
    sql(`select json_build_object(
 'events',(select count(*) from private.payment_webhook_events where scope_id='${f().scopeId}'),
 'conflicts',(select count(*) from private.payment_webhook_conflicts c join private.payment_webhook_events e on e.id=c.event_id where e.scope_id='${f().scopeId}'),
 'queue',(select count(*) from private.payment_webhook_queue q join private.payment_webhook_events e on e.id=q.event_id where e.scope_id='${f().scopeId}'),
 'received_audits',(select count(*) from public.audit_log a join private.payment_webhook_events e on e.id=a.target_id where e.scope_id='${f().scopeId}' and a.action='payment_webhook_received'),
 'conflict_audits',(select count(*) from public.audit_log a join private.payment_webhook_conflicts c on c.id=a.target_id join private.payment_webhook_events e on e.id=c.event_id where e.scope_id='${f().scopeId}' and a.action='payment_webhook_conflict'));`),
  );
const effects = () =>
  sql(`select json_build_object(
 'payments',coalesce((select json_agg(row_to_json(p) order by id) from public.payments p where order_id='${f().sample.order_id}'),'[]'::json),
 'positions',(select count(*) from private.payment_financial_positions where charge_id in(select id from private.payment_financial_charges where scope_id='${f().scopeId}')),
 'status',(select status from public.orders where id='${f().sample.order_id}'),
 'notices',(select count(*) from public.notifications where data->>'order_id'='${f().sample.order_id}'),
 'posts',(select count(*) from private.payment_fixture_requests where scope_id='${f().scopeId}' and operation='payment_create'));`);
const journal = () =>
  sql(
    `select json_agg(row_to_json(e) order by id)::text from private.payment_webhook_events e where scope_id='${f().scopeId}';`,
  );
const queue = () =>
  JSON.parse(
    sql(
      `select row_to_json(q) from private.payment_webhook_queue q join private.payment_webhook_events e on e.id=q.event_id where e.scope_id='${f().scopeId}';`,
    ),
  );
async function direct(body: string) {
  return localSystem().rpc("receive_fixture_payment_webhook", {
    target_scope: f().scopeId,
    body_text: body,
    source_hash: createHash("sha256").update(body).digest("hex"),
  });
}
function fault(
  action: "payment_webhook_received" | "payment_webhook_conflict",
) {
  sql(`create function private.webhook_c2_audit_fault() returns trigger language plpgsql as $$ begin
   if new.action='${action}' and (exists(select 1 from private.payment_webhook_events where scope_id='${f().scopeId}' and id=new.target_id)
    or exists(select 1 from private.payment_webhook_conflicts c join private.payment_webhook_events e on e.id=c.event_id where e.scope_id='${f().scopeId}' and c.id=new.target_id))
   then raise exception 'Falha ficticia sem confirmar recepcao'; end if;return new;end;$$;
   create trigger webhook_c2_audit_fault before insert on public.audit_log for each row execute function private.webhook_c2_audit_fault();`);
}
const clearFault = () =>
  sql(
    "drop trigger if exists webhook_c2_audit_fault on public.audit_log;drop function if exists private.webhook_c2_audit_fault();",
  );
beforeEach(async () => {
  fixture = await executionTransportFixture();
  eventId = "evt_fixture&" + randomUUID();
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_SCOPE_ID", f().scopeId);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID", account());
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_TOKEN", token);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  if (!fixture) return;
  try {
    clearFault();
    const scopes = `'${f().scopeId}','${f().otherScopeId}'`;
    sql(`update private.payment_fixture_environment set enabled=true where singleton;
     delete from public.audit_log where action in('payment_webhook_received','payment_webhook_conflict') and target_id in(
      select id from private.payment_webhook_events where scope_id in(${scopes}) union select c.id from private.payment_webhook_conflicts c join private.payment_webhook_events e on e.id=c.event_id where e.scope_id in(${scopes}));
     delete from private.payment_webhook_queue where event_id in(select id from private.payment_webhook_events where scope_id in(${scopes}));
     delete from private.payment_webhook_conflicts where event_id in(select id from private.payment_webhook_events where scope_id in(${scopes}));
     delete from private.payment_webhook_events where scope_id in(${scopes});`);
  } finally {
    await fixture.cleanup();
    fixture = undefined;
  }
}, 60000);

it("HTTP200 segue commit durável mesmo para pagamento ainda sem vínculo, sem crédito ou exposição", async () => {
  const before = effects(),
    response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ received: true });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(counters()).toEqual({
    events: 1,
    conflicts: 0,
    queue: 1,
    received_audits: 1,
    conflict_audits: 0,
  });
  expect(queue()).toMatchObject({
    state: "pending",
    revision: 0,
    worker_id: null,
    lease_until: null,
  });
  expect(effects()).toBe(before);
});

it("rota Next recebe HTTP real sem sessão de usuário e confirma commit/replay/conflito", async () => {
  const before = effects();
  await withWebhookHttpServer(
    { scopeId: f().scopeId, accountId: account(), token },
    async (url) => {
      expect((await fetch(url)).status).toBe(405);
      const post = (body: string, supplied = token) =>
        fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "asaas-access-token": supplied,
          },
          body,
        });
      expect((await post(text(), "token_ficticio_invalido")).status).toBe(401);
      expect(counters()).toMatchObject({ events: 0, queue: 0 });
      const response = await post(text());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true });
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect((await post(text())).status).toBe(200);
      expect(counters()).toMatchObject({
        events: 1,
        queue: 1,
        received_audits: 1,
      });
      expect((await post(text({ value: 124.01 }))).status).toBe(200);
      expect(queue()).toMatchObject({
        state: "needs_reconciliation",
        revision: 1,
      });
      expect(effects()).toBe(before);
    },
  );
}, 90000);
it("duas entregas simultâneas gravam uma origem e uma fila, com replay da mesma identidade", async () => {
  const [a, b] = await Promise.all([
    receiveFixtureAsaasWebhook(request()),
    receiveFixtureAsaasWebhook(request()),
  ]);
  expect([a.kind, b.kind].sort()).toEqual(["recorded", "replay"]);
  expect(a.eventId).toBe(b.eventId);
  expect(counters()).toMatchObject({ events: 1, queue: 1, received_audits: 1 });
});
it("replay após resposta perdida conserva origem/tempo/auditoria e aceita formatação equivalente", async () => {
  const first = await receiveFixtureAsaasWebhook(request()),
    original = journal();
  const changed = text().replace('"value":125.01', '"value":125.010');
  const replay = await receiveFixtureAsaasWebhook(
    request("  " + changed + "\n"),
  );
  expect(replay).toMatchObject({ kind: "replay", eventId: first.eventId });
  expect(journal()).toBe(original);
  expect(counters()).toMatchObject({ events: 1, queue: 1, received_audits: 1 });
});

it("resposta perdida depois do commit não recebe ACK e retry conserva uma única origem", async () => {
  const originalFetch = globalThis.fetch;
  let lost = false;
  const interception = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (...args) => {
      const response = await originalFetch(...args);
      const input = args[0];
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (!lost && url.includes("/rpc/receive_fixture_payment_webhook")) {
        lost = true;
        throw new TypeError("Resposta ficticia perdida depois do commit");
      }
      return response;
    });
  try {
    expect((await POST(request())).status).toBe(503);
    expect(lost).toBe(true);
    expect(counters()).toMatchObject({
      events: 1,
      queue: 1,
      received_audits: 1,
    });
    const original = journal();
    expect((await POST(request())).status).toBe(200);
    expect(journal()).toBe(original);
    expect(counters()).toMatchObject({
      events: 1,
      queue: 1,
      received_audits: 1,
    });
  } finally {
    interception.mockRestore();
  }
});

it("expoente conserva o token original e a recusa do contrato financeiro", async () => {
  const original = text().replace('"value":125.01', '"value":12501e-2');
  expect((await direct(original)).error).toBeNull();
  const stored = sql(
    `select minimal_body from private.payment_webhook_events where scope_id='${f().scopeId}';`,
  );
  expect(stored).toContain('"value":12501e-2');
  const scope = scopeSchema.parse({
    provider: "asaas",
    environment: "sandbox",
    accountId: account(),
  });
  const expected = {
    scope,
    phase: "observation",
    paymentId: "pay_unmatched_fixture",
    customerId: "cus_fixture",
    reference: f().intentId,
    contractedCents: 12501,
    billingType: "PIX",
    dueDate: "2026-10-20",
  };
  expect(() =>
    normalizeAsaasFinancialEvent(original, scope, expected),
  ).toThrow();
  expect(() => normalizeAsaasFinancialEvent(stored, scope, expected)).toThrow();
});
it("conflito preserva original, invalida revisão/lease e repetições não repetem auditoria", async () => {
  const first = await receiveFixtureAsaasWebhook(request()),
    original = journal(),
    before = effects();
  sql(
    `update private.payment_webhook_queue set state='processing',worker_id='${randomUUID()}',lease_until=clock_timestamp()+interval '1 minute' where event_id='${first.eventId}';`,
  );
  const conflicting = await receiveFixtureAsaasWebhook(
    request(text({ value: 124.01 })),
  );
  expect(conflicting).toMatchObject({
    kind: "conflict",
    eventId: first.eventId,
    queueState: "needs_reconciliation",
  });
  expect(queue()).toMatchObject({
    state: "needs_reconciliation",
    revision: 1,
    worker_id: null,
    lease_until: null,
  });
  expect(
    await receiveFixtureAsaasWebhook(request(text({ value: 124.01 }))),
  ).toEqual(conflicting);
  expect((await receiveFixtureAsaasWebhook(request())).queueState).toBe(
    "needs_reconciliation",
  );
  expect(journal()).toBe(original);
  expect(effects()).toBe(before);
  expect(counters()).toMatchObject({
    conflicts: 1,
    received_audits: 1,
    conflict_audits: 1,
  });
});
it("mesmo ID em outra conta pertence a outro journal", async () => {
  const a = await receiveFixtureAsaasWebhook(request());
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_SCOPE_ID", f().otherScopeId);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID", "fixture-" + f().otherScopeId);
  const other = JSON.parse(text());
  other.account.id = "fixture-" + f().otherScopeId;
  const b = await receiveFixtureAsaasWebhook(request(JSON.stringify(other)));
  expect(a.eventId).not.toBe(b.eventId);
  expect(b.kind).toBe("recorded");
  expect(
    sql(
      `select count(*) from private.payment_webhook_events where provider_event_id=${literal(eventId)};`,
    ),
  ).toBe("2");
});
it("token ou conta inválidos não recebem confirmação nem gravam evento", async () => {
  expect((await POST(request(text(), "token_ficticio_invalido"))).status).toBe(
    401,
  );
  const body = JSON.parse(text());
  body.account.id = "outra_conta";
  expect((await POST(request(JSON.stringify(body)))).status).toBe(403);
  expect(counters()).toMatchObject({ events: 0, queue: 0 });
});
it("configuração divergente ou ambiente externo falha fechado", async () => {
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID", "outra_conta");
  const body = JSON.parse(text());
  body.account.id = "outra_conta";
  expect((await POST(request(JSON.stringify(body)))).status).toBe(503);
  vi.stubEnv("VERCEL_ENV", "preview");
  expect((await POST(request())).status).toBe(503);
  expect(counters()).toMatchObject({ events: 0, queue: 0 });
});
it("marker desligado impede RPC e HTTP200", async () => {
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  expect((await POST(request())).status).toBe(503);
  expect(counters()).toMatchObject({ events: 0, queue: 0 });
});
it.each(["client", "calculator", "admin", "anon"])(
  "%s não recebe grant da recepção interna nem acesso privado",
  async (role) => {
    const db =
      role === "anon"
        ? createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { persistSession: false } },
          )
        : await quoteSession(role as "client" | "calculator" | "admin");
    try {
      expect(
        (
          await db.rpc("receive_fixture_payment_webhook", {
            target_scope: f().scopeId,
            body_text: text(),
            source_hash: "a".repeat(64),
          })
        ).error,
      ).not.toBeNull();
    } finally {
      if (role !== "anon") await db.auth.signOut({ scope: "local" });
    }
    expect(counters()).toMatchObject({ events: 0, queue: 0 });
  },
);
it.each([
  { invoiceUrl: "DADO_PRIVADO_FICTICIO" },
  { creditCard: { creditCardToken: "DADO_PRIVADO_FICTICIO" } },
  {
    refunds: [
      {
        value: 1,
        status: "DONE",
        dateCreated: "2026-10-12 10:00:00",
        transactionReceiptUrl: "DADO_PRIVADO_FICTICIO",
      },
    ],
  },
  {
    chargeback: { status: "IN_DISPUTE", fixtureProof: "DADO_PRIVADO_FICTICIO" },
  },
  { value: "DADO_PRIVADO_FICTICIO" },
  { customer: { email: "DADO_PRIVADO_FICTICIO" } },
])(
  "SQL rejeita atributos privados/incompatíveis mesmo sem o parser Node",
  async (patch) => {
    expect((await direct(text(patch))).error).not.toBeNull();
    expect(counters()).toMatchObject({ events: 0, queue: 0 });
  },
);
it("SQL também rejeita chave duplicada em qualquer nível e preserva moeda exata", async () => {
  const duplicate = text().replace(
    '"value":125.01',
    '"value":"DADO_PRIVADO_FICTICIO","value":125.01',
  );
  expect((await direct(duplicate)).error).not.toBeNull();
  const body = text().replace('"value":125.01', '"value":90071992547409.91');
  expect((await direct(body)).error).toBeNull();
  expect(
    sql(
      `select minimal_body::jsonb->'payment'->>'value' from private.payment_webhook_events where scope_id='${f().scopeId}';`,
    ),
  ).toBe("90071992547409.91");
  expect(journal()).not.toContain("DADO_PRIVADO_FICTICIO");
});
it("recepção descarta conteúdo privado antes de persistir e não o imprime", async () => {
  const logs = [
    vi.spyOn(console, "log"),
    vi.spyOn(console, "warn"),
    vi.spyOn(console, "error"),
  ];
  try {
    const response = await POST(
      request(
        text({
          invoiceUrl: "DADO_PRIVADO_FICTICIO",
          creditCard: { creditCardToken: "DADO_PRIVADO_FICTICIO" },
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(journal()).not.toContain("DADO_PRIVADO_FICTICIO");
    expect(JSON.stringify(logs.map((l) => l.mock.calls))).not.toContain(
      "DADO_PRIVADO_FICTICIO",
    );
    expect(JSON.stringify(logs.map((l) => l.mock.calls))).not.toContain(token);
  } finally {
    logs.forEach((l) => l.mockRestore());
  }
});
it("falha de auditoria reverte evento/fila e retry posterior confirma apenas um commit", async () => {
  fault("payment_webhook_received");
  expect((await POST(request())).status).toBe(503);
  expect(counters()).toMatchObject({ events: 0, queue: 0, received_audits: 0 });
  clearFault();
  expect((await POST(request())).status).toBe(200);
  expect(counters()).toMatchObject({ events: 1, queue: 1, received_audits: 1 });
});
it("rollback de conflito conserva original/revisão e retry registra somente um conflito", async () => {
  await receiveFixtureAsaasWebhook(request());
  const original = journal();
  fault("payment_webhook_conflict");
  expect((await POST(request(text({ value: 124.01 })))).status).toBe(503);
  expect(queue()).toMatchObject({ state: "pending", revision: 0 });
  expect(counters()).toMatchObject({
    events: 1,
    conflicts: 0,
    conflict_audits: 0,
  });
  expect(journal()).toBe(original);
  clearFault();
  expect((await POST(request(text({ value: 124.01 })))).status).toBe(200);
  expect(queue()).toMatchObject({ state: "needs_reconciliation", revision: 1 });
});
it("origem imutável e grants/RLS não permitem adulteração por papéis da aplicação", async () => {
  const receipt = await receiveFixtureAsaasWebhook(request()),
    original = journal();
  expect(() =>
    sql(
      `update private.payment_webhook_events set source_body_hash='${"b".repeat(64)}' where id='${receipt.eventId}';`,
    ),
  ).toThrow();
  expect(journal()).toBe(original);
  expect(
    sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in('payment_webhook_events','payment_webhook_conflicts','payment_webhook_queue') and c.relrowsecurity;",
    ),
  ).toBe("3");
  for (const role of ["anon", "authenticated", "service_role"])
    expect(
      sql(
        `select has_table_privilege('${role}','private.payment_webhook_events','SELECT,INSERT,UPDATE,DELETE');`,
      ),
    ).toBe("f");
});
