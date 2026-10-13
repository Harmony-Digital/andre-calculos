import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import {
  webhookFinancialJourneyFixture,
  type WebhookJourneyPhase,
} from "../e2e/webhook-financial-journey-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import {
  claimFixturePaymentWebhook,
  queryFixturePaymentWebhook,
  webhookRunSchema,
} from "@/modules/payments/webhook-worker";
import {
  finalizeFixturePaymentWebhook,
  webhookFinalizationReceiptSchema,
} from "@/modules/payments/webhook-finalization";
import { queryFixtureFinancialObservation } from "@/modules/payments/financial-worker";
import { quoteSession } from "../e2e/quote-helper";
import { readFixtureInvoice } from "@/modules/payments/invoice-query";
import { parseCurrentOrderCredits } from "@/modules/payments/order-credit";
import { independentCleanup } from "../../src/lib/testing/independent-cleanup";

let f: Awaited<ReturnType<typeof webhookFinancialJourneyFixture>> | undefined;
const sessions: SupabaseClient[] = [];
async function actor(role: "client" | "calculator" = "client") {
  const db = await quoteSession(role);
  sessions.push(db);
  return db;
}
const fixture = () => f!;
async function setup(method = "PIX", phase: WebhookJourneyPhase = "deposit") {
  f = await webhookFinancialJourneyFixture(method, phase);
  return f;
}
afterEach(async () => {
  vi.restoreAllMocks();
  try {
    await Promise.all(
      sessions.map((db) => db.auth.signOut({ scope: "local" })),
    );
  } finally {
    try {
      await f?.cleanup();
    } finally {
      f = undefined;
      sessions.length = 0;
    }
  }
}, 60000);

async function hold(statement: string) {
  const name = "webhook_journey_" + randomUUID().replaceAll("-", "");
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
    released = false;
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.resume();
  const ended = new Promise<number | null>((resolve) => {
    child.on("exit", resolve);
    child.on("error", () => resolve(1));
  });
  const release = async () => {
    if (released) return;
    released = true;
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    expect(await ended).toBe(0);
  };
  try {
    child.stdin.write(
      `set application_name='${name}'; set statement_timeout=10000; set idle_in_transaction_session_timeout=10000; begin; ${statement};\n\\echo JOURNEY_LOCK_HELD\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("JOURNEY_LOCK_HELD");
    return { name, release };
  } catch (error) {
    await independentCleanup(
      [{ name: "holder", run: release }],
      true,
      (failed) =>
        console.info(
          JSON.stringify({ diagnostic: "webhook_lock_cleanup", failed }),
        ),
    );
    throw error;
  }
}
async function closeWait(
  holder: Awaited<ReturnType<typeof hold>>,
  pending: PromiseLike<unknown>,
  failed: boolean,
) {
  await independentCleanup(
    [
      { name: "holder", run: holder.release },
      {
        name: "pending-request",
        run: async () => {
          await pending;
        },
      },
    ],
    failed,
    (resources) =>
      console.info(
        JSON.stringify({
          diagnostic: "webhook_lock_cleanup",
          failed: resources,
        }),
      ),
  );
}
async function waitForHolder(name: string) {
  await expect
    .poll(
      () =>
        Number(
          sql(
            `select count(*) from pg_stat_activity b where b.wait_event_type='Lock' and exists(select 1 from pg_stat_activity a where a.application_name='${name}' and a.pid=any(pg_blocking_pids(b.pid)));`,
          ),
        ),
      { timeout: 3000 },
    )
    .toBeGreaterThan(0);
}
async function current(db: SupabaseClient) {
  const id = fixture().sample.order_id,
    r = await db.rpc("get_current_order_credits", { target_orders: [id] });
  expect(r.error).toBeNull();
  return parseCurrentOrderCredits(r.data, [id]).get(id)!;
}

it("sinal manual esperando pedido relê webhook pendente sobre residual legítimo", async () => {
  const j = await setup(),
    calc = await actor("calculator");
  await j.move("received");
  await j.move("refund_partial");
  expect(await current(calc)).toMatchObject({
    activeReservation: false,
    collectionState: "clear",
    projection: { depositCreditCents: 11500, remainingDepositCents: 1001 },
  });
  const request = randomUUID(),
    holder = await hold(
      `select id from public.orders where id='${j.sample.order_id}' for update`,
    );
  const pending = Promise.resolve(
    calc.rpc("confirm_manual_deposit", {
      target_quote: j.sample.id,
      expected_context: j.sample.contextHash,
      expected_remaining_cents: 1001,
      request_id: request,
      confirmed: true,
    }),
  );
  let failed = false;
  try {
    await waitForHolder(holder.name);
    // Novo envelope dos mesmos fatos: a incerteza é transitória da fila,
    // não uma reversão de estorno sem prova do provedor.
    await j.receive();
    expect(j.view().projection.depositCreditCents).toBeNull();
    await holder.release();
    expect((await pending).error?.code).toBe("PT409");
    expect(j.view().publicPayments).toBe(0);
    expect(
      sql(
        `select count(*) from private.manual_deposit_receipts where id='${request}';`,
      ),
    ).toBe("0");
    expect(
      sql(
        `select count(*) from public.audit_log where action='manual_deposit_confirmed' and target_id='${request}';`,
      ),
    ).toBe("0");
    expect((await j.process()).complete).toBe(1);
    expect((await current(calc)).projection.depositCreditCents).toBe(11500);
    const completed = await calc.rpc("confirm_manual_deposit", {
      target_quote: j.sample.id,
      expected_context: j.sample.contextHash,
      expected_remaining_cents: 1001,
      request_id: request,
      confirmed: true,
    });
    expect(completed.error).toBeNull();
    expect((await current(calc)).projection).toMatchObject({
      depositCreditCents: 12501,
      manualDepositCents: 1001,
    });
    expect(
      (
        await calc.rpc("confirm_manual_deposit", {
          target_quote: j.sample.id,
          expected_context: j.sample.contextHash,
          expected_remaining_cents: 1001,
          request_id: request,
          confirmed: true,
        })
      ).data,
    ).toEqual(completed.data);
    expect(j.view().publicPayments).toBe(1);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await closeWait(holder, pending, failed);
  }
}, 60000);

it("download esperando cliente recusa evento novo e não registra acesso indevido", async () => {
  const j = await setup("PIX", "balance"),
    client = await actor(),
    calc = await actor("calculator");
  await j.move("received");
  const delivery = (
    await j.db
      .from("deliveries")
      .select("id")
      .eq("order_id", j.sample.order_id)
      .single()
  ).data!.id;
  const file = randomUUID();
  expect(
    (
      await j.db.from("files").insert({
        id: file,
        process_id: j.sample.process_id,
        order_id: j.sample.order_id,
        uploaded_by: j.calculator.id,
        folder: "deliverables",
        name: "Arquivo fictício da espera financeira.pdf",
        mime: "application/pdf",
        path: `${j.calculator.id}/${j.sample.process_id}/${file}/ficticio.pdf`,
        size_bytes: 100,
        sha256: "0".repeat(64),
        expected_sha256: "0".repeat(64),
        upload_status: "uploaded",
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await j.db.from("delivery_files").insert({
        delivery_id: delivery,
        file_id: file,
        kind: "calculation",
        snapshot: { fixture: true },
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await calc.rpc("approve_existing_delivery_release", {
        target_delivery: delivery,
        policy: "after_balance",
        approved: true,
        request_id: randomUUID(),
      })
    ).error,
  ).toBeNull();
  expect((await client.from("files").select("id").eq("id", file)).data).toEqual(
    [{ id: file }],
  );
  const holder = await hold(
    `select id from public.clients where id='${j.owner.id}' for update`,
  );
  const pending = Promise.resolve(
    client.rpc("authorize_file_access", {
      target_file: file,
      access_kind: "file_download",
    }),
  );
  let failed = false;
  try {
    await waitForHolder(holder.name);
    j.mutation("refund_partial");
    await j.receive();
    await holder.release();
    expect((await pending).error).not.toBeNull();
    expect(
      sql(
        `select count(*) from public.audit_log where action in('file_view','file_download') and target_id='${file}';`,
      ),
    ).toBe("0");
    expect(
      (await client.from("files").select("id").eq("id", file)).data,
    ).toEqual([]);
    expect((await j.process()).complete).toBe(1);
    expect(j.view().projection.totalCreditCents).toBe(24000);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await closeWait(holder, pending, failed);
  }
}, 60000);

it.each(["deposit", "balance"] as const)(
  "%s: conclusão da fatura esperando cliente recusa contexto anterior ao webhook",
  async (phase) => {
    const j = await setup("PIX", phase),
      client = await actor();
    await j.move("current");
    const prepared = await client.rpc(
      phase === "deposit"
        ? "prepare_payment_invoice"
        : "prepare_payment_balance_invoice",
      { target_order: j.sample.order_id },
    );
    expect(prepared.error).toBeNull();
    const data = prepared.data as unknown as {
      queryId: string;
      expectation: unknown;
    };
    expect(data.queryId).toEqual(expect.any(String));
    expect(
      (await readFixtureInvoice(data.queryId, data.expectation)).kind,
    ).toBe("observed");
    const holder = await hold(
      `select id from public.clients where id='${j.owner.id}' for update`,
    );
    const pending = Promise.resolve(
      client.rpc("finish_payment_invoice", { target_query: data.queryId }),
    );
    let failed = false;
    try {
      await waitForHolder(holder.name);
      j.mutation("received");
      await j.receive();
      await holder.release();
      expect((await pending).error?.code).toBe("PT409");
      expect(j.view().publicPayments).toBe(0);
      expect(j.view().posts).toBe(1);
      expect((await j.process()).complete).toBe(1);
      expect((await current(client)).projection.totalCreditCents).toBe(
        phase === "deposit" ? 12501 : 25001,
      );
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      await closeWait(holder, pending, failed);
    }
  },
  60000,
);

const counts = () => {
  const j = fixture(),
    charge = j.target.chargeId,
    payment = j.target.paymentId;
  return JSON.parse(
    sql(`select json_build_object(
    'events',(select count(*) from private.payment_webhook_events where scope_id='${j.scopeId}' and provider_payment_id='${payment}'),
    'runs',(select count(*) from private.payment_webhook_runs where charge_id='${charge}'),
    'claims',(select count(*) from private.payment_webhook_claims where run_id in(select id from private.payment_webhook_runs where charge_id='${charge}')),
    'applications',(select count(*) from private.payment_financial_applications where charge_id='${charge}'),
    'done',(select count(*) from private.payment_webhook_queue where event_id in(select id from private.payment_webhook_events where scope_id='${j.scopeId}' and provider_payment_id='${payment}') and state='done'),
    'gets',(select count(*) from private.payment_fixture_requests where scope_id='${j.scopeId}' and operation='payment_get'),
    'posts',(select count(*) from private.payment_fixture_requests where scope_id='${j.scopeId}' and operation='payment_create' and payload->>'reference'='${j.target.intentId}'));
  `),
  ) as {
    events: number;
    runs: number;
    claims: number;
    applications: number;
    done: number;
    gets: number;
    posts: number;
  };
};
function confirmed() {
  const j = fixture();
  expect(j.view()).toMatchObject({
    publicPayments: 0,
    legacyOrigins: 0,
    legacyBindings: 0,
    posts: 1,
    projection: {
      depositCreditCents: 12501,
      totalCreditCents: j.phase === "deposit" ? 12501 : 25001,
      uncertain: false,
      manualDepositCents: 0,
    },
  });
  expect(counts().applications).toBe(1);
  expect(
    j
      .view()
      .notifications.filter(
        (n: { application: string }) =>
          n.application === j.receipt()!.applicationRequestId,
      ),
  ).toHaveLength(2);
}
async function claimed() {
  const event = await fixture().receive();
  return webhookRunSchema.parse(
    await claimFixturePaymentWebhook(event.eventId, randomUUID()),
  );
}
async function queried() {
  return (await queryFixturePaymentWebhook(await claimed())).run;
}
function expire(runId: string) {
  sql(
    `update private.payment_webhook_runs set lease_until=clock_timestamp()-interval '1 second' where id='${runId}'; update private.payment_webhook_queue set lease_until=clock_timestamp()-interval '1 second' where worker_id=(select worker_id from private.payment_webhook_runs where id='${runId}') and state='processing';`,
  );
}

it.each([
  ["PIX", "deposit"],
  ["BOLETO", "deposit"],
  ["CREDIT_CARD", "deposit"],
  ["PIX", "balance"],
  ["BOLETO", "balance"],
  ["CREDIT_CARD", "balance"],
] as const)(
  "%s/%s: dois workers produzem um crédito e um recibo",
  async (method, phase) => {
    const j = await setup(method, phase),
      before = counts();
    j.mutation("received");
    await j.receive();
    const reports = await Promise.all([j.process(), j.process()]);
    expect(reports.reduce((n, r) => n + r.complete, 0)).toBe(1);
    expect(reports.reduce((n, r) => n + r.failed, 0)).toBe(0);
    expect(counts()).toEqual({
      events: 1,
      runs: 1,
      claims: 1,
      applications: 1,
      done: 1,
      gets: before.gets + 1,
      posts: 1,
    });
    confirmed();
    const receipt = j.receipt()!,
      saved = j.stored(receipt.runId),
      history = j.view();
    expect(await j.replay(receipt.runId)).toEqual(receipt);
    expect(j.stored(receipt.runId)).toBe(saved);
    expect(j.view()).toEqual(history);
  },
  60000,
);

const operations = [
  "receive_fixture_payment_webhook",
  "claim_fixture_payment_webhook",
  "record_fixture_webhook_query",
  "finalize_fixture_payment_webhook",
] as const;
const losses = (["deposit", "balance"] as const).flatMap((phase) =>
  operations.flatMap((operation) =>
    (["before", "after"] as const).map(
      (when) => [phase, operation, when] as const,
    ),
  ),
);
it.each(losses)(
  "%s/%s/%s: perda de resposta recupera o percurso sem novo pagamento ou efeito",
  async (phase, operation, when) => {
    const j = await setup("PIX", phase),
      baseline = counts();
    j.mutation("received");
    const eventId = "evt_loss_" + randomUUID(),
      requestId = randomUUID();
    let event: Awaited<ReturnType<typeof j.receive>> | undefined;
    let claim: ReturnType<typeof webhookRunSchema.parse> | undefined;
    let query: ReturnType<typeof webhookRunSchema.parse> | undefined;
    if (operation !== "receive_fixture_payment_webhook")
      event = await j.receive({ eventId });
    if (
      operation === "record_fixture_webhook_query" ||
      operation === "finalize_fixture_payment_webhook"
    )
      claim = webhookRunSchema.parse(
        await claimFixturePaymentWebhook(event!.eventId, requestId),
      );
    if (operation === "finalize_fixture_payment_webhook")
      query = (await queryFixturePaymentWebhook(claim)).run;
    const invoke = async (): Promise<unknown> => {
      switch (operation) {
        case "receive_fixture_payment_webhook":
          return j.receive({ eventId });
        case "claim_fixture_payment_webhook":
          return claimFixturePaymentWebhook(event!.eventId, requestId);
        case "record_fixture_webhook_query":
          return queryFixturePaymentWebhook(claim);
        case "finalize_fixture_payment_webhook":
          return finalizeFixturePaymentWebhook(query);
      }
    };
    const originalFetch = globalThis.fetch;
    let dropped = false;
    const interception = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (...args) => {
        const input = args[0],
          url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
        const target = !dropped && url.endsWith("/rpc/" + operation);
        if (target && when === "before") {
          dropped = true;
          throw new Error("Falha fictícia antes de emitir a chamada.");
        }
        const response = await originalFetch(...args);
        if (target && when === "after" && response.ok) {
          dropped = true;
          throw new Error("Resposta fictícia perdida depois do commit.");
        }
        return response;
      });
    try {
      await expect(invoke()).rejects.toThrow();
      expect(dropped).toBe(true);
    } finally {
      interception.mockRestore();
    }
    if (operation === "receive_fixture_payment_webhook")
      expect(counts().events).toBe(when === "before" ? 0 : 1);
    if (operation === "claim_fixture_payment_webhook")
      expect(counts().claims).toBe(when === "before" ? 0 : 1);
    if (operation === "finalize_fixture_payment_webhook")
      expect(counts().applications).toBe(when === "before" ? 0 : 1);
    const recovered = await invoke();
    if (operation === "receive_fixture_payment_webhook")
      event = recovered as Awaited<ReturnType<typeof j.receive>>;
    if (operation === "claim_fixture_payment_webhook")
      claim = webhookRunSchema.parse(recovered);
    if (operation === "record_fixture_webhook_query")
      query = webhookRunSchema.parse((recovered as { run: unknown }).run);
    if (!claim)
      claim = webhookRunSchema.parse(
        await claimFixturePaymentWebhook(event!.eventId, requestId),
      );
    if (!query) query = (await queryFixturePaymentWebhook(claim)).run;
    const receipt =
      operation === "finalize_fixture_payment_webhook"
        ? webhookFinalizationReceiptSchema.parse(recovered)
        : await finalizeFixturePaymentWebhook(query);
    expect(counts()).toEqual({
      events: 1,
      runs: 1,
      claims: 1,
      applications: 1,
      done: 1,
      gets: baseline.gets + 1,
      posts: 1,
    });
    confirmed();
    const saved = j.stored(receipt.runId),
      history = j.view();
    expect(await j.replay(receipt.runId)).toEqual(receipt);
    expect(j.stored(receipt.runId)).toBe(saved);
    expect(j.view()).toEqual(history);
  },
  60000,
);

it.each(["deposit", "balance"] as const)(
  "%s: evento novo invalida callback antigo e só a consulta atual aplica crédito",
  async (phase) => {
    const j = await setup("PIX", phase),
      baseline = counts();
    j.mutation("current");
    const old = await queried();
    expect(counts().applications).toBe(0);
    j.mutation("received");
    await j.receive();
    await expect(finalizeFixturePaymentWebhook(old)).rejects.toThrow();
    expect(counts().applications).toBe(0);
    expect((await j.process()).complete).toBe(1);
    confirmed();
    expect(counts()).toMatchObject({
      events: 2,
      runs: 2,
      applications: 1,
      done: 2,
      gets: baseline.gets + 2,
    });
    const saved = j.stored(j.receipt()!.runId),
      state = j.view();
    await expect(finalizeFixturePaymentWebhook(old)).rejects.toThrow();
    expect(j.stored(j.receipt()!.runId)).toBe(saved);
    expect(j.view()).toEqual(state);
  },
  60000,
);

it.each(["deposit", "balance"] as const)(
  "%s: consulta mais recente impede a aplicação do callback obsoleto",
  async (phase) => {
    const j = await setup("PIX", phase),
      baseline = counts();
    j.mutation("current");
    const old = await queried();
    j.mutation("received");
    await queryFixtureFinancialObservation(j.target.chargeId, randomUUID());
    await expect(finalizeFixturePaymentWebhook(old)).rejects.toThrow();
    expect(counts().applications).toBe(0);
    expect((await j.process()).complete).toBe(1);
    confirmed();
    expect(counts()).toMatchObject({
      events: 1,
      runs: 2,
      applications: 1,
      done: 1,
      gets: baseline.gets + 3,
    });
  },
  60000,
);

it.each(["deposit", "balance"] as const)(
  "%s: reclaim reaproveita GET, troca worker e recusa callback anterior",
  async (phase) => {
    const j = await setup("PIX", phase),
      baseline = counts();
    j.mutation("received");
    const old = await queried();
    expire(old.runId);
    expect((await j.process()).complete).toBe(1);
    const receipt = j.receipt()!,
      saved = j.stored(receipt.runId),
      before = counts();
    expect(receipt.runId).toBe(old.runId);
    expect(receipt.workerId).not.toBe(old.workerId);
    expect(receipt.epoch).toBe(old.epoch + 1);
    expect(counts().gets).toBe(baseline.gets + 1);
    await expect(finalizeFixturePaymentWebhook(old)).rejects.toThrow();
    expect(counts()).toEqual(before);
    expect(j.stored(receipt.runId)).toBe(saved);
    confirmed();
  },
  60000,
);
