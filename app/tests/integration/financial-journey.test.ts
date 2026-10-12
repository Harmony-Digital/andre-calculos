import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  financialJourneyFixture,
  type FinancialScenario,
} from "../e2e/financial-journey-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localSystem } from "../e2e/local-helper";
import { paymentIntentReceiptSchema } from "@/modules/payments/intents";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import { resumeFixturePaymentExecution } from "@/modules/payments/execution-resolution";
import { captureFixtureFinancialObservation } from "@/modules/payments/financial-worker";
import { deriveFixtureFinancialDecision } from "@/modules/payments/financial-projection";
let f: Awaited<ReturnType<typeof financialJourneyFixture>>;
beforeEach(async () => {
  f = await financialJourneyFixture();
});
afterEach(async () => {
  if (f) await f.cleanup();
});
const literal = (v: unknown) =>
  "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
const role = `select set_config('request.jwt.claims','{"role":"service_role"}',true);`;
async function initial(scenario: FinancialScenario = "received") {
  await f.observe(scenario);
  const o = await f.createOrigin(),
    a = await f.apply(),
    b = await f.bind();
  return { o, a, b };
}
const protection = () =>
  sql(
    `select json_build_object('run',(select row_to_json(r) from private.payment_execution_runs r where intent_id='${f.intentId}'),'claim',(select row_to_json(c) from private.payment_intent_dispatch_claims c where intent_id='${f.intentId}'),'reservation',(select row_to_json(v) from private.payment_intent_reservations v where intent_id='${f.intentId}'),'posts',(select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${f.intentId}'));`,
  );
const history = () =>
  sql(
    `select json_build_object('origin',(select row_to_json(o) from private.payment_legacy_origins o where charge_id='${f.chargeId}'),'binding',(select row_to_json(b) from private.payment_legacy_binding_receipts b where charge_id='${f.chargeId}'),'applications',(select json_agg(row_to_json(a) order by a.request_id) from private.payment_financial_applications a where charge_id='${f.chargeId}'),'context',(select row_to_json(c) from private.payment_obligation_contexts c where id=(select context_id from private.payment_intents where id='${f.intentId}')));`,
  );
const journals = () =>
  JSON.parse(
    sql(`select json_build_object(
 'bindings',(select count(*) from private.payment_legacy_bindings where charge_id='${f.chargeId}'),
 'receipts',(select count(*) from private.payment_legacy_binding_receipts where charge_id='${f.chargeId}'),
 'bindingAudits',(select count(*) from public.audit_log where action='payment_legacy_bound' and target_id in(select request_id from private.payment_legacy_binding_receipts where charge_id='${f.chargeId}')),
 'terminals',(select count(*) from private.payment_financial_resolutions where charge_id='${f.chargeId}'),
 'terminalAudits',(select count(*) from public.audit_log where action='payment_financial_resolved' and target_id in(select request_id from private.payment_financial_resolutions where charge_id='${f.chargeId}')),
 'manualPayments',(select count(*) from public.payments where order_id='${f.sample.order_id}' and method='pix_manual'),
 'manualReceipts',(select count(*) from private.manual_deposit_receipts where order_id='${f.sample.order_id}'),
 'queuedAudits',(select count(*) from public.audit_log where action='order_queued' and target_id='${f.sample.order_id}'),
 'queuedNotices',(select count(*) from public.notifications where dedup_key='queued:${f.sample.order_id}:email'))`),
  );
async function syntheticDocument() {
  const id = randomUUID();
  expect(
    (
      await f.db.from("files").insert({
        id,
        process_id: f.sample.process_id,
        order_id: f.sample.order_id,
        folder: "case",
        uploaded_by: f.owner.owner_id,
        name: "Documento sintético da barreira.pdf",
        mime: "application/pdf",
        path: `${f.owner.owner_id}/${f.sample.process_id}/${id}/barreira.pdf`,
        size_bytes: 100,
        sha256: "0".repeat(64),
        expected_sha256: "0".repeat(64),
        upload_status: "uploaded",
      })
    ).error,
  ).toBeNull();
}
it.each([
  ["partial", 10000, 2501, 0],
  ["excess", 13000, 0, 499],
] as const)(
  "legado %s conserva crédito/restante/excesso sem dupla contagem",
  async (scenario, credit, remaining, excess) => {
    await initial(scenario);
    const before = protection(),
      v = f.view();
    expect(v.projection.depositCreditCents).toBe(credit);
    expect(v.projection.remainingDepositCents).toBe(remaining);
    expect(v.projection.depositExcessCents).toBe(excess);
    expect(v.position.feeCents).toBe(100);
    expect(v.projection.manualDepositCents).toBe(0);
    const terminal = await f.resolve();
    if (scenario === "partial") {
      expect(terminal).toBeNull();
      expect(protection()).toBe(before);
    } else {
      expect(terminal?.reason).toBe("financial_received");
      expect(f.view().reservations).toBe(0);
    }
    expect(f.view().claims).toBe(1);
    expect(f.view().posts).toBe(1);
  },
);
it("refund parcial e integral em jornada vinculada debitam uma vez e terminal só na prova integral", async () => {
  const { o, b } = await initial();
  const before = protection();
  await f.observe("refund_partial");
  const partial = await f.apply();
  expect(partial.effects).toEqual(["debited"]);
  expect(f.view().projection.depositCreditCents).toBe(11500);
  expect(await f.resolve()).toBeNull();
  expect(protection()).toBe(before);
  await f.observe("refund_full");
  const full = await f.apply();
  expect(full.effects).toEqual(["debited"]);
  expect(f.view().projection.depositCreditCents).toBe(0);
  const terminal = await f.resolve();
  expect(terminal?.reason).toBe("financial_refunded");
  expect(f.view().claims).toBe(1);
  expect(f.view().reservations).toBe(0);
  const replay = await f.replay();
  expect(replay.legacy).toEqual(o);
  expect(replay.binding).toEqual(b);
  expect(replay.resolution).toEqual(terminal);
});
it("refund pendente mantém subtotal e proteção sem disponibilizar crédito", async () => {
  await initial();
  const before = protection();
  await f.observe("refund_pending");
  await f.apply();
  const v = f.view();
  expect(v.projection.depositCreditCents).toBeNull();
  expect(v.projection.providerObservedDepositCents).toBe(12501);
  expect(v.position.pendingRefundCents).toBe(1001);
  expect(await f.resolve()).toBeNull();
  expect(protection()).toBe(before);
});
it("chargeback efetivo, reversão e disputa conservam origem e não criam recebimento novo", async () => {
  await initial();
  const before = protection();
  await f.observe("chargeback_dispute");
  const disputed = await f.apply();
  expect(disputed.effects).toEqual(["debited", "reconcile"]);
  expect(f.view().projection.depositCreditCents).toBeNull();
  expect(await f.resolve()).toBeNull();
  await f.observe("chargeback_debit");
  const known = await f.apply();
  expect(known.effects).toEqual(["reconciled"]);
  expect(f.view().projection.depositCreditCents).toBe(10500);
  await f.observe("chargeback_restore");
  const restored = await f.apply();
  expect(restored.effects).toEqual(["restored"]);
  expect(f.view().projection.depositCreditCents).toBe(11501);
  expect(await f.resolve()).toBeNull();
  expect(protection()).toBe(before);
  expect(
    f.view().events.filter((e: { effect: string }) => e.effect === "received"),
  ).toHaveLength(1);
});
it("UNKNOWN e consulta equivalente em jornada ligada recuperam certeza com efeito novo único", async () => {
  const { o, b } = await initial();
  const before = protection();
  await f.observe("unknown");
  const uncertain = await f.apply();
  expect(uncertain.effects).toEqual(["reconcile"]);
  expect(f.view().projection.depositCreditCents).toBeNull();
  expect(await f.resolve()).toBeNull();
  await f.observe("current");
  const fresh = await f.apply();
  expect(fresh.effects).toEqual(["reconciled"]);
  expect(f.view().projection.depositCreditCents).toBe(12501);
  expect(protection()).toBe(before);
  expect((await f.replay()).legacy).toEqual(o);
  expect((await f.replay()).binding).toEqual(b);
  expect(
    f.view().events.filter((e: { effect: string }) => e.effect === "received"),
  ).toHaveLength(1);
});
it("conflito durável não é apagado por vínculo/replay nem por timestamp posterior", async () => {
  const { o, b } = await initial();
  const before = protection();
  await f.observe("current");
  const target = (await f.apply()).observationId;
  sql(
    `insert into private.payment_financial_conflicts(observation_id,attempt_hash) values('${target}','${"d".repeat(64)}');`,
  );
  await f.observe("current");
  await f.apply();
  expect(f.view().projection.depositCreditCents).toBeNull();
  expect(await f.resolve()).toBeNull();
  expect(protection()).toBe(before);
  expect((await f.replay()).legacy).toEqual(o);
  expect((await f.replay()).binding).toEqual(b);
  expect(
    sql(
      `select count(*) from private.payment_financial_conflicts where observation_id='${target}';`,
    ),
  ).toBe("1");
});
it.each(["refund_full", "chargeback_debit", "unknown"] as const)(
  "%s depois de vínculo/terminal e saldo real conserva ambas as proteções",
  async (scenario) => {
    const { o, a, b } = await initial(),
      terminal = await f.resolve(),
      old = protection(),
      oldHistory = history();
    await f.deliver(f.sample);
    const db = await quoteSession(),
      executionRequest = randomUUID();
    let fresh: string;
    try {
      const context = await f.prepare(f.sample, db, "balance"),
        r = await db.rpc("reserve_payment_intent", {
          target_context: context.id,
          request_id: executionRequest,
        });
      expect(r.error).toBeNull();
      fresh = paymentIntentReceiptSchema.parse(r.data).snapshot.intent.id;
    } finally {
      await db.auth.signOut({ scope: "local" });
    }
    expect((await advanceFixturePaymentExecution(executionRequest)).state).toBe(
      "identified",
    );
    const origin = sql(
      `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${fresh}' and o.facts is not null limit 1;`,
    );
    await captureFixtureFinancialObservation(origin);
    const next = () =>
        sql(
          `select json_build_object('reservation',(select row_to_json(v) from private.payment_intent_reservations v where intent_id='${fresh}'),'claim',(select row_to_json(c) from private.payment_intent_dispatch_claims c where intent_id='${fresh}'),'run',(select row_to_json(r) from private.payment_execution_runs r where intent_id='${fresh}'),'posts',(select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${fresh}'));`,
        ),
      before = next();
    const parsed = JSON.parse(before);
    expect(parsed.reservation.intent_id).toBe(fresh);
    expect(parsed.claim.run_id).toBe(parsed.run.id);
    expect(parsed.posts).toBe(1);
    await f.observe(scenario);
    const later = await f.apply();
    expect(later.effects).toContain(
      scenario === "unknown" ? "reconcile" : "debited",
    );
    expect(f.view().projection.depositCreditCents).toBe(
      scenario === "unknown" ? null : scenario === "refund_full" ? 0 : 10500,
    );
    expect(f.view().projection.depositUncertain).toBe(scenario === "unknown");
    const replay = await f.replay();
    expect(replay.legacy).toEqual(o);
    expect(replay.binding).toEqual(b);
    expect(replay.resolution).toEqual(terminal);
    expect(protection()).toBe(old);
    expect(next()).toBe(before);
    expect(await resumeFixturePaymentExecution(f.requestId)).toEqual(
      terminal!.view,
    );
    expect(
      (
        await localSystem().rpc("get_financial_application_receipt", {
          target_observation: a.observationId,
          request_id: a.requestId,
        })
      ).data,
    ).toEqual(a);
    // Histórico antigo é um subconjunto imutável; a nova aplicação é adicional.
    const oldData = JSON.parse(oldHistory),
      current = JSON.parse(history());
    expect(current.origin).toEqual(oldData.origin);
    expect(current.binding).toEqual(oldData.binding);
    expect(current.context).toEqual(oldData.context);
    expect(current.applications).toEqual(
      expect.arrayContaining(oldData.applications),
    );
  },
);

async function barrier<T>(
  operation: () => PromiseLike<T>,
  release: () => Promise<string>,
  waiters = 1,
  preparation = "",
) {
  const name = "financial-journey-" + randomUUID(),
    child = spawn(
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
    errors = "";
  child.stdout.on("data", (v: Buffer) => (output += v.toString()));
  child.stderr.on("data", (v: Buffer) => (errors += v.toString()));
  const done = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  let pending: Promise<T> | undefined;
  try {
    // NO KEY UPDATE bloqueia writers de domínio sem bloquear FK/KEY SHARE de N/T.
    child.stdin.write(
      `set application_name='${name}';set statement_timeout=12000;set idle_in_transaction_session_timeout=15000;begin;${role}select id from public.clients where id='${f.owner.id}' for no key update;${preparation}\n\\echo JOURNEY_LOCK\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("JOURNEY_LOCK");
    pending = Promise.resolve(operation());
    await expect
      .poll(
        () =>
          sql(
            `with recursive blocked(pid) as(select pid from pg_stat_activity where application_name='${name}' union select b.pid from pg_stat_activity b join blocked parent on parent.pid=any(pg_blocking_pids(b.pid)) where b.wait_event_type='Lock') select count(*)-1 from blocked;`,
          ),
        { timeout: 3000 },
      )
      .toBe(String(waiters));
    child.stdin.end((await release()) + "\n\\q\n");
    expect(await done, errors).toBe(0);
    return await pending;
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (pending) await pending;
  }
}
it.each(["bind_first", "resolve_first"] as const)(
  "vínculo/AC ordem %s após espera real termina uma vez",
  async (order) => {
    await f.observe("received");
    // Pré-condição sintética do ensaio SQL; bytes/upload reais são cobertos pela UI.
    await syntheticDocument();
    const o = await f.createOrigin(),
      a = await f.apply(),
      bindRequest = randomUUID(),
      resolveRequest = randomUUID(),
      before = protection(),
      position = f.view().position;
    const bindArgs = {
        target_origin: o.requestId,
        target_application: a.requestId,
        request_id: bindRequest,
      },
      resolveArgs = {
        target_application: a.requestId,
        request_id: resolveRequest,
      };
    const waiting = await barrier(
      () =>
        order === "bind_first"
          ? localSystem().rpc("resolve_financial_execution", resolveArgs)
          : localSystem().rpc("bind_fixture_legacy_payment", bindArgs),
      async () =>
        `${order === "bind_first" ? `select public.bind_fixture_legacy_payment('${o.requestId}','${a.requestId}','${bindRequest}');` : `select public.resolve_financial_execution('${a.requestId}','${resolveRequest}');`}commit;`,
    );
    expect(waiting.error).toBeNull();
    expect(waiting.data.requestId).toBe(
      order === "bind_first" ? resolveRequest : bindRequest,
    );
    const v = f.view();
    expect(v.reservations).toBe(0);
    expect(v.claims).toBe(1);
    expect(v.posts).toBe(1);
    expect(v.run.reason).toBe("financial_received");
    expect(v.status).toBe("queued");
    expect(v.position).toEqual(position);
    expect(journals()).toEqual({
      bindings: 1,
      receipts: 1,
      bindingAudits: 1,
      terminals: 1,
      terminalAudits: 1,
      manualPayments: 0,
      manualReceipts: 0,
      queuedAudits: 1,
      queuedNotices: 1,
    });
    const old = JSON.parse(before),
      now = JSON.parse(protection());
    expect(now.claim).toEqual(old.claim);
    expect(now.run.revision).toBe(old.run.revision + 1);
    expect(
      v.events.filter((e: { effect: string }) => e.effect === "received"),
    ).toHaveLength(1);
  },
  30000,
);
it("T/Y UNKNOWN durante duas esperas bloqueia AC e manual conservando reserva/claim", async () => {
  const { a } = await initial(),
    before = protection(),
    p = JSON.parse(
      sql(
        `select row_to_json(p) from private.payment_financial_positions p where charge_id='${f.chargeId}';`,
      ),
    ),
    db = await quoteSession("calculator");
  try {
    const result = await barrier(
      () =>
        Promise.all([
          Promise.resolve(
            localSystem().rpc("resolve_financial_execution", {
              target_application: a.requestId,
              request_id: randomUUID(),
            }),
          ),
          Promise.resolve(
            db.rpc("confirm_manual_deposit", {
              target_quote: f.sample.id,
              expected_context: f.sample.contextHash,
              expected_remaining_cents: 0,
              request_id: randomUUID(),
              confirmed: true,
            }),
          ),
        ]),
      async () => {
        const observation = await f.observe("unknown"),
          d = await deriveFixtureFinancialDecision(observation);
        expect(d.expectedChargeRevision).toBeGreaterThan(p.charge_revision);
        expect(d.expectedJournalFingerprint).not.toBe(p.journal_fingerprint);
        return `select public.apply_financial_observation('${observation}','${randomUUID()}',${d.expectedRevision},${d.expectedChargeRevision},'${d.expectedJournalFingerprint}','${d.action}',${literal(d.position)});commit;`;
      },
      2,
    );
    expect(result[0].error).toBeNull();
    expect(result[0].data).toBeNull();
    expect(result[1].error?.code).toBe("PT409");
    expect(protection()).toBe(before);
    const current = JSON.parse(
      sql(
        `select row_to_json(p) from private.payment_financial_positions p where charge_id='${f.chargeId}';`,
      ),
    );
    expect(current.revision).toBeGreaterThan(p.revision);
    expect(f.view().projection.depositCreditCents).toBeNull();
    expect(journals()).toEqual({
      bindings: 1,
      receipts: 1,
      bindingAudits: 1,
      terminals: 0,
      terminalAudits: 0,
      manualPayments: 0,
      manualReceipts: 0,
      queuedAudits: 0,
      queuedNotices: 0,
    });
    expect(f.view().events.map((e: { effect: string }) => e.effect)).toEqual([
      "received",
      "reconcile",
    ]);
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
}, 30000);

it("vínculo aguardando Y fresca recusa cobertura antiga e retry vincula uma vez", async () => {
  await f.observe("received");
  const o = await f.createOrigin(),
    a = await f.apply(),
    request = randomUUID(),
    before = protection(),
    freshRequest = randomUUID();
  let observation = "";
  const result = await barrier(
    () =>
      localSystem().rpc("bind_fixture_legacy_payment", {
        target_origin: o.requestId,
        target_application: a.requestId,
        request_id: request,
      }),
    async () => {
      observation = await f.observe("unknown");
      const d = await deriveFixtureFinancialDecision(observation);
      return `select public.apply_financial_observation('${observation}','${freshRequest}',${d.expectedRevision},${d.expectedChargeRevision},'${d.expectedJournalFingerprint}','${d.action}',${literal(d.position)});commit;`;
    },
  );
  expect(result.error?.code).toBe("PT412");
  expect(journals().bindings).toBe(0);
  expect(protection()).toBe(before);
  const retry = await localSystem().rpc("bind_fixture_legacy_payment", {
    target_origin: o.requestId,
    target_application: freshRequest,
    request_id: request,
  });
  expect(retry.error).toBeNull();
  expect(retry.data.projection.depositCreditCents).toBeNull();
  expect(journals().bindings).toBe(1);
  expect(journals().receipts).toBe(1);
  expect(protection()).toBe(before);
}, 30000);

it("rollback conjunto vínculo/AC restaura journals/fila/proteção e retry usa mesmos requests", async () => {
  await f.observe("received");
  await syntheticDocument();
  const o = await f.createOrigin(),
    a = await f.apply(),
    bindRequest = randomUUID(),
    resolveRequest = randomUUID(),
    before = {
      view: f.view(),
      history: history(),
      protection: protection(),
      journals: journals(),
    },
    db = await quoteSession("calculator");
  const bindSQL = `select public.bind_fixture_legacy_payment('${o.requestId}','${a.requestId}','${bindRequest}');`,
    resolveSQL = `select public.resolve_financial_execution('${a.requestId}','${resolveRequest}');`;
  try {
    const manual = await barrier(
      () =>
        db.rpc("confirm_manual_deposit", {
          target_quote: f.sample.id,
          expected_context: f.sample.contextHash,
          expected_remaining_cents: 12501,
          request_id: randomUUID(),
          confirmed: true,
        }),
      async () => "rollback;",
      1,
      `${bindSQL}${resolveSQL}do $$begin if not exists(select 1 from private.payment_legacy_binding_receipts where request_id='${bindRequest}') or not exists(select 1 from private.payment_financial_resolutions where request_id='${resolveRequest}') or exists(select 1 from private.payment_intent_reservations where intent_id='${f.intentId}') or not exists(select 1 from public.notifications where dedup_key='queued:${f.sample.order_id}:email') then raise exception 'Efeitos integrados nao executados';end if;end$$;`,
    );
    expect(manual.error?.code).toBe("PT409");
    expect({
      view: f.view(),
      history: history(),
      protection: protection(),
      journals: journals(),
    }).toEqual(before);
    const binding = await localSystem().rpc("bind_fixture_legacy_payment", {
        target_origin: o.requestId,
        target_application: a.requestId,
        request_id: bindRequest,
      }),
      terminal = await localSystem().rpc("resolve_financial_execution", {
        target_application: a.requestId,
        request_id: resolveRequest,
      });
    expect(binding.error).toBeNull();
    expect(terminal.error).toBeNull();
    expect(terminal.data.reason).toBe("financial_received");
    expect(journals()).toEqual({
      bindings: 1,
      receipts: 1,
      bindingAudits: 1,
      terminals: 1,
      terminalAudits: 1,
      manualPayments: 0,
      manualReceipts: 0,
      queuedAudits: 1,
      queuedNotices: 1,
    });
    expect(f.view().reservations).toBe(0);
    expect(
      (
        await localSystem().rpc("bind_fixture_legacy_payment", {
          target_origin: o.requestId,
          target_application: a.requestId,
          request_id: bindRequest,
        })
      ).data,
    ).toEqual(binding.data);
    expect(
      (
        await localSystem().rpc("resolve_financial_execution", {
          target_application: a.requestId,
          request_id: resolveRequest,
        })
      ).data,
    ).toEqual(terminal.data);
    expect(journals().queuedNotices).toBe(1);
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
}, 30000);
