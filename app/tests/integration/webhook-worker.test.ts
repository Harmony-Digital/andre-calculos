import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
vi.mock("server-only", () => ({}));
import { executionTransportFixture } from "../e2e/execution-transport-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { localSystem } from "../e2e/local-helper";
import { quoteSession } from "../e2e/quote-helper";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import {
  captureFixtureFinancialObservation,
  queryFixtureFinancialObservation,
} from "@/modules/payments/financial-worker";
import { receiveFixtureAsaasWebhook } from "@/modules/payments/webhook-receipt";
import {
  claimFixturePaymentWebhook,
  queryFixturePaymentWebhook,
  webhookRunSchema,
} from "@/modules/payments/webhook-worker";
let f: Awaited<ReturnType<typeof executionTransportFixture>> | undefined;
let charge: string, payment: string, event: string;
const token = "ficticio-webhook-worker-somente-teste-2026";
const fixture = () => f!;
const text = (
  eventId = "evt_fixture&" + randomUUID(),
  patch: Record<string, unknown> = {},
) => {
  const wire = JSON.parse(
    sql(
      `select private.payment_fixture_payment_wire(p)::text from private.payment_fixture_payments p where scope_id='${fixture().scopeId}' and id='${payment}';`,
    ),
  );
  return JSON.stringify({
    id: eventId,
    event: "PAYMENT_RECEIVED",
    dateCreated: "2026-10-12 10:00:00",
    account: { id: "fixture-" + fixture().scopeId },
    payment: { ...wire, ...patch },
  });
};
const receive = async (body = text()) =>
  receiveFixtureAsaasWebhook(
    new Request("https://example.test/api/webhooks/asaas", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": token,
      },
      body,
    }),
  );
const claim = async (requestId = randomUUID()) =>
  webhookRunSchema.parse(await claimFixturePaymentWebhook(event, requestId));
const state = () =>
  sql(
    `select json_build_object('status',(select status from public.orders where id='${fixture().sample.order_id}'),'payments',(select count(*) from public.payments where order_id='${fixture().sample.order_id}'),'positions',(select count(*) from private.payment_financial_positions where charge_id='${charge}'),'notices',(select count(*) from public.notifications where data->>'order_id'='${fixture().sample.order_id}'));`,
  );
const counts = () =>
  JSON.parse(
    sql(
      `select json_build_object('runs',(select count(*) from private.payment_webhook_runs where scope_id='${fixture().scopeId}'),'claims',(select count(*) from private.payment_webhook_claims where run_id in(select id from private.payment_webhook_runs where scope_id='${fixture().scopeId}')),'gets',(select count(*) from private.payment_fixture_requests where scope_id='${fixture().scopeId}' and operation='payment_get'));`,
    ),
  );
async function whilePaymentLocked<T>(operation: () => Promise<T>) {
  const name = "webhook_lock_" + randomUUID().replaceAll("-", "");
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_andre-calculos",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { env: process.env, stdio: ["pipe", "pipe", "pipe"] },
  );
  let output = "",
    pending: Promise<T> | undefined;
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", () => {});
  const done = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  try {
    child.stdin.write(
      `set application_name='${name}'; set statement_timeout=8000; set idle_in_transaction_session_timeout=8000; begin; select private.lock_webhook_payment('${fixture().scopeId}','${payment}');\n\\echo WEBHOOK_LOCK_HELD\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("WEBHOOK_LOCK_HELD");
    pending = operation();
    await expect
      .poll(
        () =>
          sql(
            `select count(*) from pg_stat_activity b where b.wait_event_type='Lock' and exists(select 1 from pg_stat_activity a where a.application_name='${name}' and a.pid=any(pg_blocking_pids(b.pid)));`,
          ),
        { timeout: 3000 },
      )
      .toBe("1");
    child.stdin.end("commit;\n\\q\n");
    expect(await done).toBe(0);
    return await pending;
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (pending) await pending;
  }
}
beforeEach(async () => {
  f = await executionTransportFixture();
  await advanceFixturePaymentExecution(f.requestId);
  const origin = sql(
    `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${f.intentId}' and o.facts is not null limit 1;`,
  );
  const captured = await captureFixtureFinancialObservation(origin);
  charge = captured.chargeId;
  payment = sql(
    `select provider_payment_id from private.payment_financial_charges where id='${charge}';`,
  );
  sql(
    `update private.payment_fixture_payments set status='RECEIVED',net_cents=value_cents-100,refunds='[]',chargeback=null where scope_id='${f.scopeId}' and id='${payment}';`,
  );
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_SCOPE_ID", f.scopeId);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID", "fixture-" + f.scopeId);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_TOKEN", token);
  event = (await receive()).eventId;
});
afterEach(async () => {
  vi.unstubAllEnvs();
  if (!f) return;
  try {
    sql(
      "drop trigger if exists webhook_claim_test_fault on public.audit_log;drop function if exists private.webhook_claim_test_fault();",
    );
    const scopes = `'${f.scopeId}','${f.otherScopeId}'`;
    sql(`update private.payment_fixture_environment set enabled=true where singleton;
     delete from public.audit_log where action in('payment_webhook_claimed','payment_webhook_queried') and target_id in(select request_id from private.payment_webhook_claims where run_id in(select id from private.payment_webhook_runs where scope_id in(${scopes})) union select id from private.payment_webhook_runs where scope_id in(${scopes}));
     delete from private.payment_webhook_claims where run_id in(select id from private.payment_webhook_runs where scope_id in(${scopes}));
     delete from private.payment_webhook_runs where scope_id in(${scopes});
     delete from public.audit_log where action in('payment_webhook_received','payment_webhook_conflict') and target_id in(select id from private.payment_webhook_events where scope_id in(${scopes}) union select c.id from private.payment_webhook_conflicts c join private.payment_webhook_events e on e.id=c.event_id where e.scope_id in(${scopes}));
     delete from private.payment_webhook_queue where event_id in(select id from private.payment_webhook_events where scope_id in(${scopes}));
     delete from private.payment_webhook_conflicts where event_id in(select id from private.payment_webhook_events where scope_id in(${scopes}));
     delete from private.payment_webhook_events where scope_id in(${scopes});`);
  } finally {
    await f.cleanup();
    f = undefined;
  }
}, 60000);
it("recepção→claim→GET T conserva origem e consulta durável sem aplicar crédito", async () => {
  const before = state(),
    c = await claim();
  expect(c).toMatchObject({
    state: "claimed",
    chargeId: charge,
    sourceCount: 1,
    epoch: 0,
  });
  const r = await queryFixturePaymentWebhook(c);
  expect(r.run).toMatchObject({
    state: "queried",
    runId: c.runId,
    queryId: c.queryId,
  });
  expect(
    sql(
      `select facts->'amounts'->>'receivedCents' from private.payment_financial_observations where id='${r.run.observationId}';`,
    ),
  ).toBe("12501");
  expect(state()).toBe(before);
  expect(counts()).toEqual({ runs: 1, claims: 1, gets: 1 });
});
it("claim e consulta retomados conservam recibo original e apenas um GET", async () => {
  const request = randomUUID(),
    c = await claim(request);
  const r = await queryFixturePaymentWebhook(c);
  expect(await claim(request)).toEqual(c);
  expect(await queryFixturePaymentWebhook(c)).toEqual(r);
  expect(counts()).toEqual({ runs: 1, claims: 1, gets: 1 });
});
it("dois workers concorrentes recebem um claim e um busy", async () => {
  const results = await Promise.all([
    claimFixturePaymentWebhook(event, randomUUID()),
    claimFixturePaymentWebhook(event, randomUUID()),
  ]);
  expect(results.map((r) => r.state).sort()).toEqual(["busy", "claimed"]);
  expect(counts()).toMatchObject({ runs: 1, claims: 1, gets: 0 });
});
it("lease expirado renova epoch/worker e conserva query para replay", async () => {
  const c = await claim(),
    first = await queryFixturePaymentWebhook(c);
  sql(
    `update private.payment_webhook_runs set lease_until=clock_timestamp()-interval '1 second' where id='${c.runId}';`,
  );
  const next = await claim();
  expect(next).toMatchObject({ runId: c.runId, queryId: c.queryId, epoch: 1 });
  expect(next.workerId).not.toBe(c.workerId);
  await expect(queryFixturePaymentWebhook(c)).rejects.toThrow(
    "Processamento de webhook indisponível.",
  );
  expect((await queryFixturePaymentWebhook(next)).run.observationId).toBe(
    first.run.observationId,
  );
  expect(counts().gets).toBe(1);
});
it("evento novo invalida o lote e novo claim usa outro run/query", async () => {
  const c = await claim();
  await receive();
  await expect(queryFixturePaymentWebhook(c)).rejects.toThrow();
  const next = await claim();
  expect(next.runId).not.toBe(c.runId);
  expect(next.queryId).not.toBe(c.queryId);
  expect(next.sourceCount).toBe(2);
  expect(
    sql(
      `select stage from private.payment_webhook_runs where id='${c.runId}';`,
    ),
  ).toBe("superseded");
  expect((await queryFixturePaymentWebhook(next)).run.state).toBe("queried");
});
it("conflito após GET impede registrar uma consulta para fonte antiga", async () => {
  const c = await claim(),
    observed = await queryFixtureFinancialObservation(charge, c.queryId);
  const id = sql(
    `select provider_event_id from private.payment_webhook_events where id='${event}';`,
  );
  await receive(text(id, { value: 124.01 }));
  const r = await localSystem().rpc("record_fixture_webhook_query", {
    target_run: c.runId,
    worker_id: c.workerId,
    expected_epoch: c.epoch,
    target_observation: observed.observationId,
  });
  expect(r.error?.code).toBe("PT412");
  expect(state()).toContain('"positions" : 0');
});
it.each(["customer", "externalReference"])(
  "identidade divergente em %s não consulta nem aplica",
  async (field) => {
    const id = sql(
      `select provider_event_id from private.payment_webhook_events where id='${event}';`,
    );
    // Novo evento com identidade diferente mantém a recepção original durável.
    await receive(
      text(undefined, {
        [field]: field === "customer" ? "cus_other_fixture" : randomUUID(),
      }),
    );
    const r = await claim();
    expect(r.state).toBe("identity_mismatch");
    expect(counts().gets).toBe(0);
    expect(id).toContain("evt_fixture");
  },
);
it("pagamento sem charge conhecida fica isolado sem fabricar vínculo", async () => {
  const other = await receive(text(undefined, { id: "pay_unmatched_fixture" }));
  const r = webhookRunSchema.parse(
    await claimFixturePaymentWebhook(other.eventId, randomUUID()),
  );
  expect(r).toMatchObject({ state: "unmatched", chargeId: null });
  expect(counts().gets).toBe(0);
});
it.each(["client", "calculator", "admin"] as const)(
  "%s não pode receber claim interno",
  async (role) => {
    const db = await quoteSession(role);
    try {
      const results = await Promise.all([
        db.rpc("claim_fixture_payment_webhook", {
          target_event: event,
          request_id: randomUUID(),
        }),
        db.rpc("get_fixture_webhook_context", {
          target_run: randomUUID(),
          worker_id: randomUUID(),
          expected_epoch: 0,
        }),
        db.rpc("record_fixture_webhook_query", {
          target_run: randomUUID(),
          worker_id: randomUUID(),
          expected_epoch: 0,
          target_observation: randomUUID(),
        }),
      ]);
      for (const result of results) expect(result.error).not.toBeNull();
    } finally {
      await db.auth.signOut({ scope: "local" });
    }
    expect(counts().runs).toBe(0);
  },
);
it("mesma solicitação com outro evento é recusada e preserva recibo", async () => {
  const request = randomUUID(),
    c = await claim(request),
    another = await receive();
  await expect(
    claimFixturePaymentWebhook(another.eventId, request),
  ).rejects.toThrow();
  expect(await claim(request)).toEqual(c);
});
it("rollback da auditoria não deixa run/claim nem fila em processamento", async () => {
  const request = randomUUID();
  sql(
    `create function private.webhook_claim_test_fault() returns trigger language plpgsql as $$begin if new.action='payment_webhook_claimed' and new.target_id='${request}' then raise exception 'Falha ficticia';end if;return new;end;$$;create trigger webhook_claim_test_fault before insert on public.audit_log for each row execute function private.webhook_claim_test_fault();`,
  );
  await expect(claim(request)).rejects.toThrow();
  expect(counts()).toMatchObject({ runs: 0, claims: 0, gets: 0 });
  expect(
    sql(
      `select state from private.payment_webhook_queue where event_id='${event}';`,
    ),
  ).toBe("pending");
  sql(
    "drop trigger webhook_claim_test_fault on public.audit_log;drop function private.webhook_claim_test_fault();",
  );
  expect((await claim(request)).state).toBe("claimed");
});
it("marker desligado e namespace privado permanecem protegidos", async () => {
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  await expect(claim()).rejects.toThrow();
  expect(
    sql(
      "select has_table_privilege('service_role','private.payment_webhook_runs','SELECT,INSERT,UPDATE,DELETE');",
    ),
  ).toBe("f");
});

it("consulta mais recente fora do run exige run/query novos para retomar", async () => {
  const old = await claim();
  await queryFixturePaymentWebhook(old);
  await queryFixtureFinancialObservation(charge, randomUUID());
  await expect(queryFixturePaymentWebhook(old)).rejects.toThrow();
  sql(
    `update private.payment_webhook_runs set lease_until=clock_timestamp()-interval '1 second' where id='${old.runId}';`,
  );
  const next = await claim();
  expect(next.runId).not.toBe(old.runId);
  expect(next.queryId).not.toBe(old.queryId);
  expect((await queryFixturePaymentWebhook(next)).run.state).toBe("queried");
});

it.each(["id", "customer", "externalReference"])(
  "identidade divergente em conflito de %s também isola a charge sem GET",
  async (field) => {
    const id = sql(
      `select provider_event_id from private.payment_webhook_events where id='${event}';`,
    );
    await receive(
      text(id, {
        [field]:
          field === "id"
            ? "pay_other_fixture"
            : field === "customer"
              ? "cus_other_fixture"
              : randomUUID(),
      }),
    );
    const result = await claim();
    expect(result.state).toBe("identity_mismatch");
    expect(counts().gets).toBe(0);
  },
);

it("conflito com pagamento diferente espera a barreira do pagamento original", async () => {
  const id = sql(
    `select provider_event_id from private.payment_webhook_events where id='${event}';`,
  );
  const r = await whilePaymentLocked(() =>
    receive(text(id, { id: "pay_other_fixture" })),
  );
  expect(r.kind).toBe("conflict");
  expect((await claim()).state).toBe("identity_mismatch");
});

it("evento mínimo e evento antigo consultam o estado atual sem decidir por timestamp", async () => {
  const body = JSON.parse(text());
  body.dateCreated = "2020-01-01 00:00:00";
  body.event = "PAYMENT_CREATED";
  body.payment = { id: payment };
  const minimal = await receive(JSON.stringify(body));
  const before = state();
  const c = webhookRunSchema.parse(
    await claimFixturePaymentWebhook(minimal.eventId, randomUUID()),
  );
  expect(c.sourceCount).toBe(2);
  const queried = await queryFixturePaymentWebhook(c);
  expect(queried.eventDisposition).toBe("query_required");
  expect(
    sql(
      `select facts->'amounts'->>'receivedCents' from private.payment_financial_observations where id='${queried.run.observationId}';`,
    ),
  ).toBe("12501");
  expect(state()).toBe(before);
});

it("falha ao auditar consulta conserva GET durável e retry não consulta novamente", async () => {
  const c = await claim();
  sql(
    `create function private.webhook_claim_test_fault() returns trigger language plpgsql as $$begin if new.action='payment_webhook_queried' and new.target_id='${c.runId}' then raise exception 'Falha ficticia';end if;return new;end;$$;create trigger webhook_claim_test_fault before insert on public.audit_log for each row execute function private.webhook_claim_test_fault();`,
  );
  await expect(queryFixturePaymentWebhook(c)).rejects.toThrow(
    "Processamento de webhook indisponível.",
  );
  expect(counts().gets).toBe(1);
  expect(
    sql(
      `select stage||':'||coalesce(observation_id::text,'null') from private.payment_webhook_runs where id='${c.runId}';`,
    ),
  ).toBe("claimed:null");
  expect(
    sql(
      `select count(*) from private.payment_financial_observations where source_kind='query' and source_id='${c.queryId}';`,
    ),
  ).toBe("1");
  sql(
    "drop trigger webhook_claim_test_fault on public.audit_log;drop function private.webhook_claim_test_fault();",
  );
  expect((await queryFixturePaymentWebhook(c)).run.state).toBe("queried");
  expect(counts().gets).toBe(1);
});

it("claim expirado não inicia GET e recepção continua pendente", async () => {
  const c = await claim();
  sql(
    `update private.payment_webhook_runs set lease_until=clock_timestamp()-interval '1 second' where id='${c.runId}';`,
  );
  await expect(queryFixturePaymentWebhook(c)).rejects.toThrow();
  expect(counts().gets).toBe(0);
  expect(
    sql(
      `select state from private.payment_webhook_queue where event_id='${event}';`,
    ),
  ).toBe("processing");
  expect((await queryFixturePaymentWebhook(await claim())).run.state).toBe(
    "queried",
  );
});

it("mesmo payment em outra conta não herda vínculo desta charge", async () => {
  const body = JSON.parse(text());
  body.account.id = "fixture-" + fixture().otherScopeId;
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_SCOPE_ID", fixture().otherScopeId);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID", body.account.id);
  const other = await receive(JSON.stringify(body));
  const c = webhookRunSchema.parse(
    await claimFixturePaymentWebhook(other.eventId, randomUUID()),
  );
  expect(c).toMatchObject({
    state: "unmatched",
    scopeId: fixture().otherScopeId,
    chargeId: null,
  });
  expect(counts().gets).toBe(0);
});

it.each(["claim_fixture_payment_webhook", "record_fixture_webhook_query"])(
  "resposta perdida após commit de %s retoma sem duplicar claim/GET/auditoria",
  async (operation) => {
    const request = randomUUID();
    const c =
      operation === "record_fixture_webhook_query"
        ? await claim(request)
        : null;
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
        if (!lost && url.endsWith("/rpc/" + operation) && response.ok) {
          lost = true;
          throw new Error("Resposta fictícia perdida depois do commit.");
        }
        return response;
      });
    try {
      await expect(
        c ? queryFixturePaymentWebhook(c) : claim(request),
      ).rejects.toThrow("Processamento de webhook indisponível.");
      expect(lost).toBe(true);
    } finally {
      interception.mockRestore();
    }
    const resumed = c ?? (await claim(request));
    expect((await queryFixturePaymentWebhook(resumed)).run.state).toBe(
      "queried",
    );
    expect(counts()).toEqual({ runs: 1, claims: 1, gets: 1 });
    expect(
      sql(
        `select count(*) from public.audit_log where (action='payment_webhook_claimed' and target_id='${request}') or(action='payment_webhook_queried' and target_id='${resumed.runId}');`,
      ),
    ).toBe("2");
  },
);
