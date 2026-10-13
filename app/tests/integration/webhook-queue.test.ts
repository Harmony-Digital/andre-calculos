import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
import {
  webhookJourneyFixture,
  webhookJourneyToken,
  webhookJourneyCronSecret,
} from "../e2e/webhook-journey-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { localSystem } from "../e2e/local-helper";
import { quoteSession } from "../e2e/quote-helper";
import { withWebhookHttpServer } from "./webhook-http-helper";
import {
  runFixturePaymentWebhookQueue,
  fixturePaymentWebhookCronResponse,
} from "@/modules/payments/webhook-queue";
import {
  claimFixturePaymentWebhook,
  queryFixturePaymentWebhook,
  webhookRunSchema,
} from "@/modules/payments/webhook-worker";
import { queryFixtureFinancialObservation } from "@/modules/payments/financial-worker";
import { receiveFixtureAsaasWebhook } from "@/modules/payments/webhook-receipt";
let f: Awaited<ReturnType<typeof webhookJourneyFixture>> | undefined;
const fixture = () => f!;
const expire = (runId: string) =>
  sql(
    `update private.payment_webhook_runs set lease_until=clock_timestamp()-interval '1 second' where id='${runId}';update private.payment_webhook_queue set lease_until=clock_timestamp()-interval '1 second' where worker_id=(select worker_id from private.payment_webhook_runs where id='${runId}') and state='processing';`,
  );
const cron = (secret = webhookJourneyCronSecret, search = "") =>
  fixturePaymentWebhookCronResponse(
    new Request("https://example.test/api/cron/payment-webhooks" + search, {
      headers: { authorization: "Bearer " + secret },
    }),
  );
beforeEach(async () => {
  f = await webhookJourneyFixture();
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_SCOPE_ID", f.scopeId);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID", "fixture-" + f.scopeId);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_TOKEN", webhookJourneyToken);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_CRON_SECRET", webhookJourneyCronSecret);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  sql(
    "drop trigger if exists webhook_queue_test_fault on public.audit_log;drop function if exists private.webhook_queue_test_fault();",
  );
  if (f) await f.cleanup();
  f = undefined;
}, 60000);
it("lote por pagamento percorre recepção/T/Y/fila e replay não consulta novamente", async () => {
  await fixture().capture();
  await fixture().receive();
  await fixture().receive();
  expect(await runFixturePaymentWebhookQueue()).toEqual({
    selected: 1,
    complete: 1,
    quarantined: 0,
    busy: 0,
    failed: 0,
  });
  expect(fixture().counts()).toMatchObject({
    runs: 1,
    claims: 1,
    gets: 1,
    applications: 1,
    done: 2,
  });
  expect(
    JSON.parse(
      sql(
        `select private.order_payment_credit('${fixture().sample.order_id}');`,
      ),
    ),
  ).toMatchObject({ depositCreditCents: 12501, uncertain: false });
  expect((await runFixturePaymentWebhookQueue()).selected).toBe(0);
  expect(fixture().counts()).toMatchObject({
    gets: 1,
    applications: 1,
    done: 2,
  });
});
it("workers concorrentes aplicam uma vez", async () => {
  await fixture().capture();
  await fixture().receive();
  const reports = await Promise.all([
    runFixturePaymentWebhookQueue(),
    runFixturePaymentWebhookQueue(),
  ]);
  expect(reports.reduce((n, r) => n + r.complete, 0)).toBe(1);
  expect(reports.reduce((n, r) => n + r.failed, 0)).toBe(0);
  expect(fixture().counts()).toMatchObject({
    runs: 1,
    claims: 1,
    gets: 1,
    applications: 1,
    done: 1,
  });
});
it("lease ativo fica fora do lote; reclaim de query registrada não repete GET", async () => {
  await fixture().capture();
  const e = await fixture().receive();
  const c = webhookRunSchema.parse(
    await claimFixturePaymentWebhook(e.eventId, randomUUID()),
  );
  const q = (await queryFixturePaymentWebhook(c)).run;
  expect((await runFixturePaymentWebhookQueue()).selected).toBe(0);
  expire(c.runId);
  expect((await runFixturePaymentWebhookQueue()).complete).toBe(1);
  expect(fixture().counts()).toMatchObject({
    runs: 1,
    gets: 1,
    applications: 1,
  });
  expect(
    sql(
      `select observation_id::text from private.payment_webhook_runs where id='${c.runId}';`,
    ),
  ).toBe(q.observationId);
});
it("queda depois do receipt T retoma query sem novo GET", async () => {
  await fixture().capture();
  const e = await fixture().receive();
  const c = webhookRunSchema.parse(
    await claimFixturePaymentWebhook(e.eventId, randomUUID()),
  );
  await queryFixtureFinancialObservation(fixture().chargeId, c.queryId);
  expire(c.runId);
  expect((await runFixturePaymentWebhookQueue()).complete).toBe(1);
  expect(fixture().counts()).toMatchObject({
    runs: 1,
    gets: 1,
    applications: 1,
  });
});
it("unmatched não repete tentativas e volta quando surge a charge", async () => {
  await fixture().receive();
  expect((await runFixturePaymentWebhookQueue()).quarantined).toBe(1);
  expect((await runFixturePaymentWebhookQueue()).selected).toBe(0);
  expect(fixture().counts()).toMatchObject({
    runs: 1,
    gets: 0,
    applications: 0,
  });
  await fixture().capture();
  expect((await runFixturePaymentWebhookQueue()).complete).toBe(1);
  expect(fixture().counts()).toMatchObject({
    runs: 2,
    gets: 1,
    applications: 1,
    done: 1,
  });
});
it("identidade divergente mantém quarentena inclusive entre claims concorrentes", async () => {
  await fixture().capture();
  const e = await fixture().receive({ customer: "cus_other_fixture" });
  const claims = await Promise.all([
    claimFixturePaymentWebhook(e.eventId, randomUUID()),
    claimFixturePaymentWebhook(e.eventId, randomUUID()),
  ]);
  const runs = claims.map((c) => webhookRunSchema.parse(c));
  expect(runs[0].runId).toBe(runs[1].runId);
  expect(runs[0].state).toBe("identity_mismatch");
  expect((await runFixturePaymentWebhookQueue()).selected).toBe(0);
  expect(fixture().counts()).toMatchObject({
    runs: 1,
    gets: 0,
    applications: 0,
  });
});
it("fonte nova durante lease invalida run e usa nova consulta", async () => {
  await fixture().capture();
  const e = await fixture().receive();
  const c = webhookRunSchema.parse(
    await claimFixturePaymentWebhook(e.eventId, randomUUID()),
  );
  await queryFixturePaymentWebhook(c);
  await fixture().receive();
  expect((await runFixturePaymentWebhookQueue()).complete).toBe(1);
  expect(
    sql(
      `select stage from private.payment_webhook_runs where id='${c.runId}';`,
    ),
  ).toBe("superseded");
  expect(fixture().counts()).toMatchObject({
    runs: 2,
    gets: 2,
    applications: 1,
    done: 2,
  });
});
it("query T mais recente invalida run mesmo com lease ativo", async () => {
  await fixture().capture();
  const e = await fixture().receive();
  const c = webhookRunSchema.parse(
    await claimFixturePaymentWebhook(e.eventId, randomUUID()),
  );
  await queryFixturePaymentWebhook(c);
  await queryFixtureFinancialObservation(fixture().chargeId, randomUUID());
  expect((await runFixturePaymentWebhookQueue()).complete).toBe(1);
  expect(fixture().counts()).toMatchObject({
    runs: 2,
    gets: 3,
    applications: 1,
    done: 1,
  });
});
it("lote é limitado e pagamentos em quarentena não bloqueiam os seguintes", async () => {
  for (let n = 0; n < 21; n++)
    await fixture().receive({ id: "pay_unmatched_" + n });
  expect(await runFixturePaymentWebhookQueue()).toEqual({
    selected: 20,
    complete: 0,
    quarantined: 20,
    busy: 0,
    failed: 0,
  });
  expect((await runFixturePaymentWebhookQueue()).quarantined).toBe(1);
  expect((await runFixturePaymentWebhookQueue()).selected).toBe(0);
  expect(fixture().counts()).toMatchObject({
    runs: 21,
    gets: 0,
    applications: 0,
    done: 0,
  });
});
it("outro scope não entra no lote da conta configurada", async () => {
  await fixture().capture();
  await fixture().receive();
  const body = JSON.parse(fixture().body({ id: "pay_other_scope" }));
  body.account.id = sql(
    `select account_id from private.payment_provider_scopes where id='${fixture().otherScopeId}';`,
  );
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_SCOPE_ID", fixture().otherScopeId);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID", body.account.id);
  try {
    await receiveFixtureAsaasWebhook(
      new Request("https://example.test/api/webhooks/asaas", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "asaas-access-token": webhookJourneyToken,
        },
        body: JSON.stringify(body),
      }),
    );
  } finally {
    vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_SCOPE_ID", fixture().scopeId);
    vi.stubEnv(
      "ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID",
      "fixture-" + fixture().scopeId,
    );
  }
  expect((await runFixturePaymentWebhookQueue()).complete).toBe(1);
  expect(
    sql(
      `select q.state from private.payment_webhook_queue q join private.payment_webhook_events e on e.id=q.event_id where e.scope_id='${fixture().otherScopeId}';`,
    ),
  ).toBe("pending");
});
it("conta inválida e marker desabilitado falham antes de claims", async () => {
  await fixture().capture();
  await fixture().receive();
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID", "fixture_wrong_account");
  await expect(runFixturePaymentWebhookQueue()).rejects.toThrow(
    "Fila de webhook indisponível.",
  );
  vi.stubEnv(
    "ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID",
    "fixture-" + fixture().scopeId,
  );
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  await expect(runFixturePaymentWebhookQueue()).rejects.toThrow(
    "Fila de webhook indisponível.",
  );
  expect(fixture().counts()).toMatchObject({
    runs: 0,
    gets: 0,
    applications: 0,
  });
});
it("clock do banco respeita disponibilidade futura", async () => {
  await fixture().capture();
  const e = await fixture().receive();
  sql(
    `update private.payment_webhook_queue set available_at=clock_timestamp()+interval '1 day' where event_id='${e.eventId}';`,
  );
  expect((await runFixturePaymentWebhookQueue()).selected).toBe(0);
  sql(
    `update private.payment_webhook_queue set available_at=clock_timestamp() where event_id='${e.eventId}';`,
  );
  expect((await runFixturePaymentWebhookQueue()).complete).toBe(1);
});
it.each(["client", "calculator", "admin"] as const)(
  "%s não seleciona a fila privada",
  async (role) => {
    const session = await quoteSession(role);
    try {
      expect(
        (
          await session.rpc("select_fixture_payment_webhooks", {
            target_scope: fixture().scopeId,
            expected_account: "fixture-" + fixture().scopeId,
            batch_limit: 20,
          })
        ).error,
      ).not.toBeNull();
    } finally {
      await session.auth.signOut({ scope: "local" });
    }
  },
);
it.each([0, 51])(
  "limite interno %s inválido é recusado",
  async (batchLimit) => {
    expect(
      (
        await localSystem().rpc("select_fixture_payment_webhooks", {
          target_scope: fixture().scopeId,
          expected_account: "fixture-" + fixture().scopeId,
          batch_limit: batchLimit,
        })
      ).error,
    ).not.toBeNull();
  },
);
it("erro parcial conserva T, continua lote e permite retomar finalização", async () => {
  await fixture().capture();
  await fixture().receive();
  await fixture().receive({ id: "pay_unmatched_after_error" });
  sql(
    `create function private.webhook_queue_test_fault() returns trigger language plpgsql set search_path='' as $$begin if new.action='payment_webhook_finalized' then raise exception 'Falha fictícia'; end if; return new;end;$$;revoke all on function private.webhook_queue_test_fault() from public,anon,authenticated,service_role;create trigger webhook_queue_test_fault before insert on public.audit_log for each row execute function private.webhook_queue_test_fault();`,
  );
  expect(await runFixturePaymentWebhookQueue()).toEqual({
    selected: 2,
    complete: 0,
    quarantined: 1,
    busy: 0,
    failed: 1,
  });
  expect(fixture().counts()).toMatchObject({
    gets: 1,
    applications: 0,
    done: 0,
  });
  sql(
    "drop trigger webhook_queue_test_fault on public.audit_log;drop function private.webhook_queue_test_fault();",
  );
  const run = sql(
    `select id from private.payment_webhook_runs where scope_id='${fixture().scopeId}' and stage='queried';`,
  );
  expire(run);
  expect((await runFixturePaymentWebhookQueue()).complete).toBe(1);
  expect(fixture().counts()).toMatchObject({
    gets: 1,
    applications: 1,
    done: 1,
  });
});
it("cron exige credencial distinta e recusa parâmetros de visitante", async () => {
  expect((await cron("errado")).status).toBe(401);
  expect((await cron(webhookJourneyToken)).status).toBe(401);
  expect(
    (await cron(webhookJourneyCronSecret, "?scope=outro&clock=2026-10-12"))
      .status,
  ).toBe(400);
  vi.stubEnv("ANDRE_WEBHOOK_FIXTURE_CRON_SECRET", webhookJourneyToken);
  expect((await cron(webhookJourneyToken)).status).toBe(503);
  expect(fixture().counts()).toMatchObject({ runs: 0, gets: 0 });
});
it.each([
  ["ANDRE_LOCAL_TESTS", "0"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://example.test"],
  ["VERCEL", "1"],
  ["VERCEL_ENV", "preview"],
  ["NODE_ENV", "production"],
])("cron desligado em %s=%s", async (name, value) => {
  const previous = process.env[name];
  vi.stubEnv(name, value);
  try {
    expect((await cron()).status).toBe(503);
  } finally {
    vi.stubEnv(name, previous);
  }
  expect(fixture().counts()).toMatchObject({ runs: 0, gets: 0 });
});
it("HTTP real recebe evento e cron processa a mesma fila com resposta só de contagens", async () => {
  await fixture().capture();
  await withWebhookHttpServer(
    {
      scopeId: fixture().scopeId,
      accountId: "fixture-" + fixture().scopeId,
      token: webhookJourneyToken,
      cronSecret: webhookJourneyCronSecret,
    },
    async (webhookUrl) => {
      expect(
        (
          await fetch(webhookUrl, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "asaas-access-token": webhookJourneyToken,
            },
            body: fixture().body(),
          })
        ).status,
      ).toBe(200);
      const url = new URL("/api/cron/payment-webhooks", webhookUrl);
      expect((await fetch(url)).status).toBe(401);
      expect((await fetch(url, { method: "POST" })).status).toBe(405);
      const response = await fetch(url, {
        headers: { authorization: "Bearer " + webhookJourneyCronSecret },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        selected: 1,
        complete: 1,
        quarantined: 0,
        busy: 0,
        failed: 0,
      });
      const replay = await fetch(url, {
        headers: { authorization: "Bearer " + webhookJourneyCronSecret },
      });
      expect((await replay.json()).selected).toBe(0);
    },
  );
  expect(fixture().counts()).toMatchObject({
    gets: 1,
    applications: 1,
    done: 1,
  });
}, 120000);
