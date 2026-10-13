import { beforeAll, afterAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { paymentObligationFixture } from "../e2e/payment-obligation-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { quoteSession } from "../e2e/quote-helper";
import {
  paymentIntentReceiptSchema,
  currentPaymentIntentSchema,
} from "@/modules/payments/intents";
let fixture: Awaited<ReturnType<typeof paymentObligationFixture>>;
type Sample = Awaited<ReturnType<typeof fixture.create>>;
const sessions: Record<string, SupabaseClient> = {};
const make = async (db = sessions.client) => {
  const sample = await fixture.create(),
    context = await fixture.prepare(sample, db);
  return { sample, context };
};
const reserve = (
  contextId: string,
  requestId = randomUUID(),
  db = sessions.client,
) =>
  db.rpc("reserve_payment_intent", {
    target_context: contextId,
    request_id: requestId,
  });
const reserved = async (contextId: string, db = sessions.client) => {
  const result = await reserve(contextId, randomUUID(), db);
  expect(result.error).toBeNull();
  return paymentIntentReceiptSchema.parse(result.data);
};
const get = (intentId: string, db = sessions.client) =>
  db.rpc("get_payment_intent", { target_intent: intentId });
const current = async (intentId: string, db = sessions.client) => {
  const result = await get(intentId, db);
  expect(result.error).toBeNull();
  return currentPaymentIntentSchema.parse(result.data);
};
const withdraw = (
  intentId: string,
  patch: Record<string, unknown> = {},
  db = sessions.client,
) =>
  db.rpc("withdraw_payment_intent", {
    target_intent: intentId,
    expected_revision: 0,
    request_id: randomUUID(),
    ...patch,
  });
const counts = (s: Sample) =>
  JSON.parse(
    sql(
      `select json_build_object('intents',(select count(*) from private.payment_intents where order_id='${s.order_id}'),'reservations',(select count(*) from private.payment_intent_reservations where order_id='${s.order_id}'),'requests',(select count(*) from private.payment_intent_requests r join private.payment_intents i on i.id=r.intent_id where i.order_id='${s.order_id}'),'withdrawals',(select count(*) from private.payment_intent_withdrawals w join private.payment_intents i on i.id=w.intent_id where i.order_id='${s.order_id}'));`,
    ),
  ) as {
    intents: number;
    reservations: number;
    requests: number;
    withdrawals: number;
  };
const audit = (id: string, action: string) =>
  Number(
    sql(
      `select count(*) from public.audit_log where target_id='${id}' and action='${action}';`,
    ),
  );
const payment = async (s: Sample, status = "confirmed") => {
  const id = randomUUID();
  expect(
    (
      await fixture.db.from("payments").insert({
        id,
        order_id: s.order_id,
        kind: "deposit",
        method: "pix_manual",
        amount_cents: 5000,
        status,
      })
    ).error,
  ).toBeNull();
  return id;
};
async function whileLocked<T>(
  lockSql: string,
  operation: () => PromiseLike<T>,
  releaseSql = "commit;",
) {
  const name = "intent-lock-" + randomUUID();
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
      `set application_name='${name}'; set statement_timeout=8000; set idle_in_transaction_session_timeout=8000; begin; ${lockSql}\n\\echo INTENT_LOCK_HELD\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("INTENT_LOCK_HELD");
    pending = Promise.resolve(operation());
    await expect
      .poll(
        () =>
          sql(
            `select count(*) from pg_stat_activity b where b.wait_event_type='Lock' and exists(select 1 from pg_stat_activity a where a.application_name='${name}' and a.pid=any(pg_blocking_pids(b.pid)));`,
          ),
        { timeout: 3000 },
      )
      .toBe("1");
    child.stdin.end(`${releaseSql}\n\\q\n`);
    expect(await done).toBe(0);
    return await pending;
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (pending) await pending;
  }
}
beforeAll(async () => {
  fixture = await paymentObligationFixture();
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
});
afterAll(async () => {
  try {
    await Promise.all(
      Object.values(sessions).map((db) => db.auth.signOut({ scope: "local" })),
    );
  } finally {
    if (fixture) await fixture.cleanup();
  }
});
it("proprietário/calculista reservam e consultam; terceiro/admin/anon/service não obtêm acesso", async () => {
  const { sample, context } = await make();
  const anonymous = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  for (const db of [sessions.clientB, sessions.admin, anonymous, fixture.db])
    expect((await reserve(context.id, randomUUID(), db)).error).not.toBeNull();
  const r = await reserved(context.id),
    id = r.snapshot.intent.id;
  expect(r).toMatchObject({
    semantics: "receipt_snapshot",
    action: "reserve",
    actorId: fixture.owner.owner_id,
    appliedRevision: 0,
    snapshot: {
      state: "reserved",
      currentOwnerId: fixture.owner.owner_id,
      intent: {
        reference: id,
        contextId: context.id,
        createdBy: fixture.owner.owner_id,
        obligation: { orderId: sample.order_id, remainingCents: 12501 },
      },
    },
  });
  expect(JSON.stringify(r)).not.toContain("11144477735");
  for (const db of [sessions.clientB, sessions.admin, anonymous, fixture.db]) {
    expect((await get(id, db)).error).not.toBeNull();
    expect((await withdraw(id, {}, db)).error).not.toBeNull();
    expect(
      (
        await db.rpc("get_order_payment_reservation", {
          target_order: sample.order_id,
        })
      ).error,
    ).not.toBeNull();
  }
  expect(await current(id, sessions.calculator)).toMatchObject({
    state: "reserved",
  });
  const another = await make(sessions.calculator),
    byCalculator = await reserved(another.context.id, sessions.calculator);
  expect(byCalculator.actorId).toBe(fixture.calculator.id);
  expect(
    sql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name in ('payment_intents','payment_intent_reservations','payment_intent_requests','payment_intent_withdrawals','payment_intent_dispatch_claims') and grantee in ('anon','authenticated','service_role');",
    ),
  ).toBe("0");
  expect(
    sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('payment_intents','payment_intent_reservations','payment_intent_requests','payment_intent_withdrawals','payment_intent_dispatch_claims') and c.relrowsecurity;",
    ),
  ).toBe("5");
  expect(
    sql(
      "select has_function_privilege('authenticated','private.payment_intent_view(uuid)','execute');",
    ),
  ).toBe("f");
});
it("mesmo UUID concorrente preserva uma intenção, referência e auditoria", async () => {
  const { sample, context } = await make(),
    request = randomUUID(),
    second = await quoteSession();
  try {
    const results = await Promise.all([
      reserve(context.id, request),
      reserve(context.id, request, second),
    ]);
    expect(results.map((r) => r.error)).toEqual([null, null]);
    expect(results[0].data).toEqual(results[1].data);
    const r = paymentIntentReceiptSchema.parse(results[0].data);
    expect(counts(sample)).toEqual({
      intents: 1,
      reservations: 1,
      requests: 1,
      withdrawals: 0,
    });
    expect(r.snapshot.intent.reference).toBe(r.snapshot.intent.id);
    expect(audit(r.snapshot.intent.id, "payment_intent_reserved")).toBe(1);
  } finally {
    await second.auth.signOut({ scope: "local" });
  }
});
it("UUIDs/contextos distintos concorrentes não sobrepõem cobrança", async () => {
  const { sample, context } = await make(),
    other = await fixture.prepare(sample, sessions.client),
    second = await quoteSession();
  try {
    const results = await Promise.all([
      reserve(context.id),
      reserve(other.id, randomUUID(), second),
    ]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.filter((r) => r.error?.code === "PT409")).toHaveLength(1);
    expect(counts(sample)).toEqual({
      intents: 1,
      reservations: 1,
      requests: 1,
      withdrawals: 0,
    });
  } finally {
    await second.auth.signOut({ scope: "local" });
  }
});
it("UUID reutilizado com contexto/ator/operação divergentes conflita", async () => {
  const a = await make(),
    b = await make(),
    request = randomUUID();
  const original = await reserve(a.context.id, request);
  expect(original.error).toBeNull();
  const id = paymentIntentReceiptSchema.parse(original.data).snapshot.intent.id;
  expect((await reserve(b.context.id, request)).error?.code).toBe("PT409");
  expect(
    (await reserve(a.context.id, request, sessions.calculator)).error?.code,
  ).toBe("PT409");
  expect((await withdraw(id, { request_id: request })).error?.code).toBe(
    "PT409",
  );
  expect(counts(b.sample).intents).toBe(0);
  expect((await current(id)).state).toBe("reserved");
});
it("retirada e nova reserva conservam ambos os replays antigos sem reativar/remover a nova", async () => {
  const { sample, context } = await make(),
    request = randomUUID();
  const first = await reserve(context.id, request);
  expect(first.error).toBeNull();
  const oldId = paymentIntentReceiptSchema.parse(first.data).snapshot.intent.id,
    withdrawalId = randomUUID();
  const removed = await withdraw(oldId, { request_id: withdrawalId });
  expect(removed.error).toBeNull();
  expect(await current(oldId)).toMatchObject({
    state: "withdrawn",
    revision: 1,
    reservationActive: false,
  });
  expect((await reserve(context.id, request)).data).toEqual(first.data);
  expect(counts(sample).reservations).toBe(0);
  const newer = await reserved(context.id),
    newId = newer.snapshot.intent.id;
  expect(newId).not.toBe(oldId);
  expect((await withdraw(oldId, { request_id: withdrawalId })).data).toEqual(
    removed.data,
  );
  expect((await reserve(context.id, request)).data).toEqual(first.data);
  const active = await sessions.client.rpc("get_order_payment_reservation", {
    target_order: sample.order_id,
  });
  expect(active.error).toBeNull();
  expect(currentPaymentIntentSchema.parse(active.data).intent.id).toBe(newId);
  expect(counts(sample)).toEqual({
    intents: 2,
    reservations: 1,
    requests: 3,
    withdrawals: 1,
  });
  expect(audit(oldId, "payment_intent_withdrawn")).toBe(1);
});
it.each(["same", "different"])(
  "retiradas concorrentes com UUID %s não duplicam efeito",
  async (mode) => {
    const { sample, context } = await make(),
      original = await reserved(context.id),
      id = original.snapshot.intent.id;
    const requestId = randomUUID(),
      otherRequest = mode === "same" ? requestId : randomUUID(),
      second = await quoteSession();
    try {
      const results = await Promise.all([
        withdraw(id, { request_id: requestId }),
        withdraw(id, { request_id: otherRequest }, second),
      ]);
      expect(results.filter((r) => r.error === null)).toHaveLength(
        mode === "same" ? 2 : 1,
      );
      if (mode === "same") expect(results[0].data).toEqual(results[1].data);
      else
        expect(results.filter((r) => r.error?.code === "PT409")).toHaveLength(
          1,
        );
      expect(counts(sample)).toEqual({
        intents: 1,
        reservations: 0,
        requests: 2,
        withdrawals: 1,
      });
      expect(audit(id, "payment_intent_withdrawn")).toBe(1);
    } finally {
      await second.auth.signOut({ scope: "local" });
    }
  },
);
it("retirada é permitida ao calculista atual sem mudar autor original", async () => {
  const { context } = await make(),
    r = await reserved(context.id),
    id = r.snapshot.intent.id;
  const result = await withdraw(id, {}, sessions.calculator);
  expect(result.error).toBeNull();
  expect(paymentIntentReceiptSchema.parse(result.data)).toMatchObject({
    actorId: fixture.calculator.id,
    snapshot: {
      withdrawnBy: fixture.calculator.id,
      intent: { createdBy: fixture.owner.owner_id },
    },
  });
});
it("qualquer claim durável impede retirada, sem depender de lease ou resultado", async () => {
  const { sample, context } = await make(),
    r = await reserved(context.id),
    id = r.snapshot.intent.id;
  sql(
    `insert into private.payment_intent_dispatch_claims(intent_id,run_id,claimed_at) values('${id}','${randomUUID()}','2000-01-01T00:00:00Z');`,
  );
  expect(await current(id)).toMatchObject({
    state: "dispatch_claimed",
    revision: 1,
    reservationActive: true,
    claimedAt: "2000-01-01T00:00:00+00:00",
  });
  for (const expected_revision of [0, 1])
    expect((await withdraw(id, { expected_revision })).error?.code).toBe(
      "PT409",
    );
  expect(counts(sample)).toEqual({
    intents: 1,
    reservations: 1,
    requests: 1,
    withdrawals: 0,
  });
  expect(() =>
    sql(
      `update private.payment_intent_dispatch_claims set claimed_at='2026-10-11' where intent_id='${id}';`,
    ),
  ).toThrow("Consulta das fixtures");
  expect(audit(id, "payment_intent_withdrawn")).toBe(0);
});
it("retirada aceita contexto obsoleto sem configuração/ready atual", async () => {
  const { context } = await make(),
    r = await reserved(context.id),
    id = r.snapshot.intent.id;
  try {
    sql("delete from private.payment_provider_configuration where singleton;");
    sql(
      `update public.clients set has_contract=true,document='52998224725' where id='${fixture.owner.id}';`,
    );
    const result = await withdraw(id);
    expect(result.error).toBeNull();
    expect(paymentIntentReceiptSchema.parse(result.data).snapshot.state).toBe(
      "withdrawn",
    );
  } finally {
    fixture.scope();
    sql(
      `update public.clients set has_contract=false,document='11144477735' where id='${fixture.owner.id}';`,
    );
  }
});
it("nova conta não contorna reserva e só pode usar contexto atual depois da retirada", async () => {
  const { sample, context } = await make(),
    original = await reserved(context.id);
  try {
    fixture.scope(fixture.otherScopeId);
    const changed = await fixture.prepare(sample, sessions.client);
    expect((await reserve(changed.id)).error?.code).toBe("PT409");
    expect((await withdraw(original.snapshot.intent.id)).error).toBeNull();
    expect((await reserve(context.id)).error?.code).toBe("PT409");
    const fresh = await reserved(changed.id);
    expect(fresh.snapshot.intent.obligation.binding?.scopeId).toBe(
      fixture.otherScopeId,
    );
    expect(counts(sample).intents).toBe(2);
  } finally {
    fixture.scope();
  }
});
it("reserva do sinal bloqueia saldo até retirada comprovada pré-despacho", async () => {
  const { sample, context } = await make(),
    original = await reserved(context.id);
  await fixture.deliver(sample);
  const balance = await fixture.prepare(sample, sessions.client, "balance");
  expect((await reserve(balance.id)).error?.code).toBe("PT409");
  expect((await withdraw(original.snapshot.intent.id)).error).toBeNull();
  const next = await reserved(balance.id);
  expect(next.snapshot.intent.obligation).toMatchObject({
    phase: "balance",
    remainingCents: 25001,
  });
});
it.each(["credit", "contract", "revision", "document", "account", "state"])(
  "contexto com %s alterado exige novo preparo e não escreve intenção",
  async (change) => {
    const { sample, context } = await make(),
      revision = context.snapshot.contractRevision;
    try {
      if (change === "credit") await payment(sample);
      if (change === "contract")
        sql(
          `update public.clients set has_contract=true where id='${fixture.owner.id}';`,
        );
      if (change === "revision")
        sql(
          `update public.clients set contract_revision=contract_revision+1 where id='${fixture.owner.id}';`,
        );
      if (change === "document")
        sql(
          `update public.clients set document='52998224725' where id='${fixture.owner.id}';`,
        );
      if (change === "account") fixture.scope(fixture.otherScopeId);
      if (change === "state")
        expect(
          (
            await fixture.db
              .from("orders")
              .update({ status: "cancelled" })
              .eq("id", sample.order_id)
          ).error,
        ).toBeNull();
      expect((await reserve(context.id)).error?.code).toBe("PT409");
      expect(counts(sample)).toEqual({
        intents: 0,
        reservations: 0,
        requests: 0,
        withdrawals: 0,
      });
    } finally {
      fixture.scope();
      sql(
        `update public.clients set has_contract=false,contract_revision=${revision},document='11144477735' where id='${fixture.owner.id}';`,
      );
    }
  },
);
it("revisão/IDs inválidos e contexto ausente falham sem recibo ou pagamento", async () => {
  const { sample, context } = await make();
  for (const [target_context, request_id] of [
    [null, randomUUID()],
    [context.id, null],
    [randomUUID(), randomUUID()],
  ])
    expect(
      (
        await sessions.client.rpc("reserve_payment_intent", {
          target_context,
          request_id,
        })
      ).error,
    ).not.toBeNull();
  const r = await reserved(context.id),
    id = r.snapshot.intent.id;
  for (const patch of [
    { expected_revision: 1 },
    { expected_revision: -1 },
    { expected_revision: null },
    { expected_revision: 2147483647 },
    { request_id: null },
    { target_intent: randomUUID() },
  ])
    expect((await withdraw(id, patch)).error).not.toBeNull();
  expect(counts(sample)).toEqual({
    intents: 1,
    reservations: 1,
    requests: 1,
    withdrawals: 0,
  });
  expect(
    (
      await fixture.db
        .from("payments")
        .select("id")
        .eq("order_id", sample.order_id)
    ).data,
  ).toEqual([]);
  expect(
    (
      await fixture.db
        .from("orders")
        .select("status")
        .eq("id", sample.order_id)
        .single()
    ).data?.status,
  ).toBe("awaiting_payment");
});
it("imutabilidade e FKs impedem contexto/pedido/reserva/recibo cruzados", async () => {
  const a = await make(),
    b = await make(),
    r = await reserved(a.context.id),
    id = r.snapshot.intent.id;
  for (const statement of [
    `update private.payment_intents set context_id='${b.context.id}' where id='${id}';`,
    `update private.payment_intent_reservations set order_id='${b.sample.order_id}' where intent_id='${id}';`,
    `update private.payment_intent_requests set actor_id='${fixture.calculator.id}' where id='${r.requestId}';`,
  ])
    expect(() => sql(statement)).toThrow("Consulta das fixtures");
  // O bloco deve capturar especificamente FK; unicidade/erro diferente falha o teste.
  sql(
    `do $fixture$ begin insert into private.payment_intents(context_id,order_id,created_by) values('${b.context.id}','${a.sample.order_id}','${fixture.owner.owner_id}'); raise exception 'FK ausente'; exception when foreign_key_violation then null; end $fixture$;`,
  );
  sql(
    `do $fixture$ begin delete from private.payment_intent_reservations where intent_id='${id}'; insert into private.payment_intent_reservations(order_id,intent_id) values('${b.sample.order_id}','${id}'); raise exception 'FK ausente'; exception when foreign_key_violation then null; end $fixture$;`,
  );
  expect((await current(id)).state).toBe("reserved");
  expect(counts(b.sample).intents).toBe(0);
  sql(
    `do $fixture$ begin insert into private.payment_intent_requests(id,action,context_id,intent_id,actor_id,result) values('${randomUUID()}','reserve','${b.context.id}','${id}','${fixture.owner.owner_id}','{}'::jsonb); raise exception 'FK ausente'; exception when foreign_key_violation then null; end $fixture$;`,
  );
  const other = await reserved(b.context.id);
  sql(
    `do $fixture$ begin insert into private.payment_intent_withdrawals(intent_id,request_id,withdrawn_at) values('${other.snapshot.intent.id}','${r.requestId}',clock_timestamp()); raise exception 'FK ausente'; exception when foreign_key_violation then null; end $fixture$;`,
  );
  expect(counts(a.sample).requests).toBe(1);
  expect(counts(b.sample).withdrawals).toBe(0);
});
it("rollback reverte intenção/reserva/recibo/auditoria e retirada conjuntamente", async () => {
  const { sample, context } = await make(),
    request = randomUUID();
  const output =
    sql(`begin; select set_config('request.jwt.claims','{"sub":"${fixture.owner.owner_id}","role":"authenticated"}',true);
    select public.reserve_payment_intent('${context.id}','${request}');
    select json_build_object('inside_intents',(select count(*) from private.payment_intents where order_id='${sample.order_id}'),'inside_requests',(select count(*) from private.payment_intent_requests where id='${request}'),'inside_audits',(select count(*) from public.audit_log where action='payment_intent_reserved' and target_id in(select id from private.payment_intents where order_id='${sample.order_id}'))); rollback;`);
  const inside = JSON.parse(
    output.split("\n").find((line) => line.includes('"inside_intents"'))!,
  );
  expect(inside).toEqual({
    inside_intents: 1,
    inside_requests: 1,
    inside_audits: 1,
  });
  expect(counts(sample)).toEqual({
    intents: 0,
    reservations: 0,
    requests: 0,
    withdrawals: 0,
  });
  const r = await reserved(context.id),
    id = r.snapshot.intent.id,
    withdrawalRequest = randomUUID();
  const removed =
    sql(`begin; select set_config('request.jwt.claims','{"sub":"${fixture.owner.owner_id}","role":"authenticated"}',true);
    select public.withdraw_payment_intent('${id}',0,'${withdrawalRequest}');
    select json_build_object('inside_withdrawals',(select count(*) from private.payment_intent_withdrawals where intent_id='${id}'),'inside_reservations',(select count(*) from private.payment_intent_reservations where intent_id='${id}'),'inside_audits',(select count(*) from public.audit_log where action='payment_intent_withdrawn' and target_id='${id}')); rollback;`);
  expect(
    JSON.parse(
      removed
        .split("\n")
        .find((line) => line.includes('"inside_withdrawals"'))!,
    ),
  ).toEqual({
    inside_withdrawals: 1,
    inside_reservations: 0,
    inside_audits: 1,
  });
  expect(counts(sample)).toEqual({
    intents: 1,
    reservations: 1,
    requests: 1,
    withdrawals: 0,
  });
  expect(audit(id, "payment_intent_withdrawn")).toBe(0);
  expect((await current(id)).state).toBe("reserved");
}, 20000);
it("crédito promovido durante reserva é visto antes de persistir intenção", async () => {
  const { sample, context } = await make(),
    id = await payment(sample, "pending");
  const result = await whileLocked(
    `update public.payments set status='confirmed' where id='${id}';`,
    () => reserve(context.id),
  );
  expect(result.error?.code).toBe("PT409");
  expect(counts(sample).intents).toBe(0);
  const fresh = await fixture.prepare(sample, sessions.client),
    r = await reserved(fresh.id);
  expect(r.snapshot.intent.obligation.remainingCents).toBe(7501);
}, 20000);
it("troca concorrente de dono nega reserva/consulta; getters posteriores distinguem dono vigente de capturado", async () => {
  const { sample, context } = await make(),
    original = await reserved(context.id),
    intentId = original.snapshot.intent.id;
  const empty = JSON.parse(
    sql(
      `select row_to_json(c) from public.clients c where owner_id='${fixture.calculator.id}';`,
    ),
  );
  expect(
    sql(`select count(*) from public.processes where client_id='${empty.id}';`),
  ).toBe("0");
  sql(`delete from public.clients where id='${empty.id}';`);
  try {
    const result = await whileLocked(
      `select id from public.clients where id='${fixture.owner.id}' for update;`,
      () => get(intentId),
      `update public.clients set owner_id='${fixture.calculator.id}' where id='${fixture.owner.id}'; commit;`,
    );
    expect(result.error).not.toBeNull();
    expect(audit(intentId, "payment_intent_viewed")).toBe(0);
    expect((await reserve(context.id)).error).not.toBeNull();
    sql(
      `update public.profiles set role='client' where id='${fixture.calculator.id}';`,
    );
    expect(await current(intentId, sessions.calculator)).toMatchObject({
      currentOwnerId: fixture.calculator.id,
      intent: { obligation: { ownerId: fixture.owner.owner_id } },
    });
    expect(
      (await withdraw(intentId, {}, sessions.calculator)).error,
    ).toBeNull();
  } finally {
    sql(
      `update public.clients set owner_id='${fixture.owner.owner_id}' where id='${fixture.owner.id}'; update public.profiles set role='calculator' where id='${fixture.calculator.id}'; insert into public.clients select (jsonb_populate_record(null::public.clients,'${JSON.stringify(empty).replaceAll("'", "''")}'::jsonb)).*;`,
    );
  }
  expect(counts(sample).reservations).toBe(0);
}, 25000);
it("mudança concorrente de papel nega reserva sem intenção/auditoria", async () => {
  const { sample, context } = await make();
  try {
    const result = await whileLocked(
      `update public.profiles set role='admin' where id='${fixture.owner.owner_id}';`,
      () => reserve(context.id),
    );
    expect(result.error).not.toBeNull();
    expect(counts(sample)).toEqual({
      intents: 0,
      reservations: 0,
      requests: 0,
      withdrawals: 0,
    });
  } finally {
    sql(
      `update public.profiles set role='client' where id='${fixture.owner.owner_id}';`,
    );
  }
}, 20000);
