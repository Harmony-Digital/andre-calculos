import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { paymentObligationFixture } from "../e2e/payment-obligation-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { advanceFixturePaymentCustomer } from "@/modules/payments/customer-bootstrap-worker";
import {
  paymentIntentReceiptSchema,
  currentPaymentIntentSchema,
} from "@/modules/payments/intents";
import {
  allocateFixturePaymentExecution,
  startFixturePaymentExecution,
} from "@/modules/payments/execution-system";
import { paymentExecutionViewSchema } from "@/modules/payments/execution-data";
let fixture: Awaited<ReturnType<typeof paymentObligationFixture>>;
let priorEnabled: boolean;
let sample: Awaited<ReturnType<typeof fixture.create>>;
let intentId: string, requestId: string;
const stats = () =>
  JSON.parse(
    sql(`select json_build_object(
 'runs',(select count(*) from private.payment_execution_runs where intent_id='${intentId}'),
 'claims',(select count(*) from private.payment_intent_dispatch_claims where intent_id='${intentId}'),
 'active',(select count(*) from private.payment_intent_reservations where intent_id='${intentId}'),
 'starts',(select count(*) from private.payment_execution_steps s join private.payment_execution_runs r on r.id=s.run_id where r.intent_id='${intentId}' and s.started and s.action='create'),
 'posts',(select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${intentId}'));`),
  );
async function reserve() {
  sample = await fixture.create();
  const db = await quoteSession();
  try {
    const context = await fixture.prepare(sample, db);
    requestId = randomUUID();
    const r = await db.rpc("reserve_payment_intent", {
      target_context: context.id,
      request_id: requestId,
    });
    expect(r.error).toBeNull();
    intentId = paymentIntentReceiptSchema.parse(r.data).snapshot.intent.id;
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
}
const claim = () => allocateFixturePaymentExecution(requestId);
const start = (c: Awaited<ReturnType<typeof claim>>) =>
  startFixturePaymentExecution({
    stepId: c.step!.id,
    workerId: c.step!.workerId,
  });
beforeEach(async () => {
  fixture = await paymentObligationFixture();
  priorEnabled =
    sql(
      "select enabled from private.payment_fixture_environment where singleton;",
    ) === "t";
  sql(
    `update private.payment_fixture_environment set enabled=true where singleton; delete from private.payment_provider_customers where id='${fixture.bindingId}';`,
  );
  const db = await quoteSession(),
    customerRequest = randomUUID();
  try {
    expect(
      (
        await db.rpc("request_payment_customer", {
          target_client: fixture.owner.id,
          request_id: customerRequest,
        })
      ).error,
    ).toBeNull();
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  expect((await advanceFixturePaymentCustomer(customerRequest)).state).toBe(
    "ready_to_create",
  );
  expect((await advanceFixturePaymentCustomer(customerRequest)).state).toBe(
    "bound",
  );
  await reserve();
});
afterEach(async () => {
  try {
    if (fixture) {
      const scopes = `'${fixture.scopeId}','${fixture.otherScopeId}'`;
      sql(`delete from public.audit_log where action like 'payment_execution_%' and target_id in(
 select i.id from private.payment_intents i join private.payment_obligation_contexts c on c.id=i.context_id where c.client_id='${fixture.owner.id}'
 union select s.id from private.payment_execution_steps s join private.payment_execution_runs r on r.id=s.run_id where r.scope_id in(${scopes}));
 update private.payment_execution_runs set current_step=null where scope_id in(${scopes});
 delete from private.payment_execution_steps where run_id in(select id from private.payment_execution_runs where scope_id in(${scopes}));
 delete from private.payment_execution_runs where scope_id in(${scopes});
 delete from public.audit_log where action like 'payment_customer_%' and target_id in(
 select id from private.payment_customer_requests where work_id in(select id from private.payment_customer_work where scope_id in(${scopes}))
 union select id from private.payment_customer_steps where work_id in(select id from private.payment_customer_work where scope_id in(${scopes})));
 update private.payment_customer_work set current_step=null where scope_id in(${scopes});
 delete from private.payment_customer_steps where work_id in(select id from private.payment_customer_work where scope_id in(${scopes}));
 delete from private.payment_customer_requests where work_id in(select id from private.payment_customer_work where scope_id in(${scopes}));
 delete from private.payment_customer_work where scope_id in(${scopes});
 delete from public.audit_log where action='payment_fixture_transport' and target_id in(select id from private.payment_fixture_requests where scope_id in(${scopes}));
 delete from private.payment_fixture_invocations where request_id in(select id from private.payment_fixture_requests where scope_id in(${scopes}));
 delete from private.payment_fixture_requests where scope_id in(${scopes});
 delete from private.payment_fixture_controls where scope_id in(${scopes});
 delete from private.payment_fixture_payments where scope_id in(${scopes});
 delete from private.payment_fixture_customers where scope_id in(${scopes});
 update private.payment_fixture_environment set enabled=${priorEnabled} where singleton;`);
    }
  } finally {
    if (fixture) await fixture.cleanup();
  }
});
it("jornada cliente→G→L→run/start usa reserva autenticada e um claim sem emitir", async () => {
  const c = await claim();
  expect(c.step?.action).toBe("create");
  expect(stats()).toMatchObject({ runs: 1, claims: 0, posts: 0 });
  expect(await start(c)).toBe(true);
  expect(stats()).toMatchObject({ claims: 1, starts: 1, posts: 0, active: 1 });
  expect(
    sql(
      `select run_id from private.payment_intent_dispatch_claims where intent_id='${intentId}';`,
    ),
  ).toBe(c.view.runId);
  expect(
    sql(
      `select count(*) from public.audit_log where target_id='${c.step!.id}' and action='payment_execution_step_started' and actor_id is null;`,
    ),
  ).toBe("1");
});
it("alocação repetida preserva run e revoga start do worker antigo", async () => {
  const a = await claim(),
    b = await claim();
  expect(a.view.runId).toBe(b.view.runId);
  expect(a.step!.id).not.toBe(b.step!.id);
  expect(await start(a)).toBe(false);
  expect(await start(b)).toBe(true);
  expect(await start(b)).toBe(false);
  expect(stats()).toMatchObject({ runs: 1, claims: 1, starts: 1 });
});
it("dois workers alocados concorrentemente recebem no máximo um start", async () => {
  const claims = await Promise.all([claim(), claim()]);
  const starts = await Promise.all(claims.map(start));
  expect(starts.filter(Boolean)).toHaveLength(1);
  expect(stats()).toMatchObject({ runs: 1, claims: 1, starts: 1 });
});
it("queda antes do start permite primeiro envio; após start só novas consultas", async () => {
  const before = await claim(),
    retry = await claim();
  expect(await start(before)).toBe(false);
  expect(await start(retry)).toBe(true);
  for (let i = 0; i < 2; i++) {
    const resumed = await claim();
    expect(resumed.step!.action).toBe("find");
    expect(await start(resumed)).toBe(true);
  }
  expect(stats()).toMatchObject({ claims: 1, starts: 1, posts: 0, active: 1 });
});
it("token de outro worker não inicia a etapa", async () => {
  const c = await claim();
  expect(
    await startFixturePaymentExecution({
      stepId: c.step!.id,
      workerId: randomUUID(),
    }),
  ).toBe(false);
  expect(stats().claims).toBe(0);
});
it("retirada anterior ao start interrompe execução sem claim", async () => {
  const c = await claim(),
    db = await quoteSession();
  try {
    expect(
      (
        await db.rpc("withdraw_payment_intent", {
          target_intent: intentId,
          expected_revision: 0,
          request_id: randomUUID(),
        })
      ).error,
    ).toBeNull();
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  expect(await start(c)).toBe(false);
  const resumed = await claim();
  expect(resumed.step).toBeNull();
  expect(resumed.view).toMatchObject({
    state: "stopped",
    reservationActive: false,
  });
  expect(stats()).toMatchObject({ claims: 0, active: 0 });
});
it("start anterior à retirada conserva claim/reserva e recibo reserve histórico", async () => {
  const c = await claim();
  await start(c);
  const db = await quoteSession();
  try {
    expect(
      (
        await db.rpc("withdraw_payment_intent", {
          target_intent: intentId,
          expected_revision: 0,
          request_id: randomUUID(),
        })
      ).error?.code,
    ).toBe("PT409");
    const current = await db.rpc("get_payment_intent", {
      target_intent: intentId,
    });
    expect(current.error).toBeNull();
    expect(currentPaymentIntentSchema.parse(current.data).state).toBe(
      "dispatch_claimed",
    );
    const context = sql(
      `select context_id from private.payment_intents where id='${intentId}';`,
    );
    const replay = await db.rpc("reserve_payment_intent", {
      target_context: context,
      request_id: requestId,
    });
    expect(replay.error).toBeNull();
    expect(paymentIntentReceiptSchema.parse(replay.data).snapshot.state).toBe(
      "reserved",
    );
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  expect(stats()).toMatchObject({ claims: 1, active: 1, posts: 0 });
});
it.each(["document", "scope", "debt", "role"])(
  "%s alterado depois de alocar impede primeiro start",
  async (field) => {
    const c = await claim();
    if (field === "document")
      sql(
        `update public.clients set document='52998224725' where id='${fixture.owner.id}';`,
      );
    else if (field === "scope") fixture.scope(fixture.otherScopeId);
    else if (field === "debt")
      expect(
        (
          await fixture.db.from("payments").insert({
            order_id: sample.order_id,
            kind: "deposit",
            method: "pix_manual",
            amount_cents: 100,
            status: "confirmed",
          })
        ).error,
      ).toBeNull();
    else
      sql(
        `update public.profiles set role='admin' where id='${fixture.owner.owner_id}';`,
      );
    try {
      expect(await start(c)).toBe(false);
      expect(stats().claims).toBe(0);
      expect((await claim()).view.state).toBe("held");
    } finally {
      if (field === "role")
        sql(
          `update public.profiles set role='client' where id='${fixture.owner.owner_id}';`,
        );
    }
  },
);
it("mudança após claim conserva run e consulta snapshot capturado", async () => {
  const c = await claim();
  await start(c);
  fixture.scope(fixture.otherScopeId);
  sql(
    `update public.clients set document='52998224725' where id='${fixture.owner.id}';`,
  );
  const next = await claim();
  expect(next.step!.action).toBe("find");
  expect(next.step!.scopeId).toBe(fixture.scopeId);
  expect(next.step!.snapshot.customer.document).toBe("11144477735");
  expect(await start(next)).toBe(true);
  expect(stats().claims).toBe(1);
});
it("claim preexistente utiliza o mesmo run_id e nunca aloca novo create", async () => {
  const runId = randomUUID();
  sql(
    `insert into private.payment_intent_dispatch_claims(intent_id,run_id) values('${intentId}','${runId}');`,
  );
  const c = await claim();
  expect(c.view.runId).toBe(runId);
  expect(c.step!.action).toBe("find");
  expect(await start(c)).toBe(true);
  expect(stats().claims).toBe(1);
});
it("rollback do start reverte consumo, claim e auditoria na mesma transação", async () => {
  const c = await claim();
  sql(
    `begin; set local request.jwt.claims='{"role":"service_role"}'; select public.start_payment_execution_step('${c.step!.id}','${c.step!.workerId}'); rollback;`,
  );
  expect(stats()).toMatchObject({ claims: 0, starts: 0 });
  expect(
    sql(
      `select count(*) from public.audit_log where action='payment_execution_step_started' and target_id='${c.step!.id}';`,
    ),
  ).toBe("0");
  expect(await start(c)).toBe(true);
  expect(stats().claims).toBe(1);
});
it("não usa recibo withdraw ou UUID inexistente como autoridade", async () => {
  await expect(allocateFixturePaymentExecution(randomUUID())).rejects.toThrow(
    "Execução fictícia indisponível.",
  );
  const db = await quoteSession(),
    withdrawId = randomUUID();
  try {
    expect(
      (
        await db.rpc("withdraw_payment_intent", {
          target_intent: intentId,
          expected_revision: 0,
          request_id: withdrawId,
        })
      ).error,
    ).toBeNull();
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  await expect(allocateFixturePaymentExecution(withdrawId)).rejects.toThrow(
    "Execução fictícia indisponível.",
  );
  expect(stats().claims).toBe(0);
});
it("getter humano autorizado e mínimo; papéis de sistema/públicos separados", async () => {
  const c = await claim();
  for (const role of ["client", "calculator", "clientB", "admin"] as const) {
    const db = await quoteSession(role);
    try {
      const r = await db.rpc("get_payment_execution", {
        target_intent: intentId,
      });
      if (role === "client" || role === "calculator") {
        expect(r.error).toBeNull();
        const v = paymentExecutionViewSchema.parse(r.data);
        expect(v.runId).toBe(c.view.runId);
        expect(JSON.stringify(v)).not.toMatch(
          /11144477735|snapshot|scopeId|customerId|invoiceUrl|bodyText/,
        );
      } else expect(r.error).not.toBeNull();
      expect(
        (
          await db.rpc("claim_payment_execution_step", {
            target_request: requestId,
            worker_id: randomUUID(),
          })
        ).error,
      ).not.toBeNull();
    } finally {
      await db.auth.signOut({ scope: "local" });
    }
  }
  expect(
    (await fixture.db.rpc("get_payment_execution", { target_intent: intentId }))
      .error,
  ).not.toBeNull();
  for (const table of ["payment_execution_runs", "payment_execution_steps"]) {
    expect(
      sql(
        `select relrowsecurity from pg_class where oid='private.${table}'::regclass;`,
      ),
    ).toBe("t");
    for (const role of ["anon", "authenticated", "service_role"])
      expect(
        sql(
          `select has_table_privilege('${role}','private.${table}','SELECT');`,
        ),
      ).toBe("f");
  }
});
it("marker desligado impede run/start sem alterar claim", async () => {
  const c = await claim();
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  await expect(claim()).rejects.toThrow("Execução fictícia indisponível.");
  await expect(start(c)).rejects.toThrow("Execução fictícia indisponível.");
  expect(stats().claims).toBe(0);
});
it.each(["semantics", "action"])(
  "recibo durável sem %s é recusado antes de criar execução",
  async (key) => {
    sql(`with prior as(delete from private.payment_intent_requests where id='${requestId}' returning *)
 insert into private.payment_intent_requests(id,action,context_id,intent_id,actor_id,expected_revision,result,recorded_at)
 select id,action,context_id,intent_id,actor_id,expected_revision,result-'${key}',recorded_at from prior;`);
    await expect(claim()).rejects.toThrow("Execução fictícia indisponível.");
    expect(stats()).toMatchObject({ runs: 0, claims: 0 });
  },
);
it("retirada e start concorrentes têm um único vencedor", async () => {
  const c = await claim(),
    db = await quoteSession();
  try {
    const [started, withdrawn] = await Promise.all([
      start(c),
      db.rpc("withdraw_payment_intent", {
        target_intent: intentId,
        expected_revision: 0,
        request_id: randomUUID(),
      }),
    ]);
    if (started) {
      expect(withdrawn.error?.code).toBe("PT409");
      expect(stats()).toMatchObject({ claims: 1, active: 1 });
    } else {
      expect(withdrawn.error).toBeNull();
      expect(stats()).toMatchObject({ claims: 0, active: 0 });
    }
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
});
