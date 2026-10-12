import { beforeAll, afterAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { acceptanceFixture } from "../e2e/acceptance-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import {
  paymentObligationSchema,
  paymentObligationReceiptSchema,
} from "@/modules/payments/obligations";
let fixture: Awaited<ReturnType<typeof acceptanceFixture>>;
type Sample = Awaited<ReturnType<typeof fixture.create>>;
const sessions: Record<string, SupabaseClient> = {};
const scopeId = randomUUID(),
  otherScopeId = randomUUID(),
  bindingId = randomUUID();
const orders: string[] = [],
  requests: string[] = [];
let priorClient: { kind: string; document: string | null }, priorScope: string;
const literal = (value: string | null) =>
  value === null ? "null" : "'" + value.replaceAll("'", "''") + "'";
const scope = (id: string = scopeId) =>
  sql(
    `insert into private.payment_provider_configuration(singleton,scope_id) values(true,'${id}') on conflict(singleton) do update set scope_id=excluded.scope_id;`,
  );
const sample = async (options: Parameters<typeof fixture.create>[0] = {}) => {
  const result = await fixture.create(options);
  orders.push(result.order_id);
  return result;
};
const accept = async (s: Sample) =>
  expect(
    (await fixture.db.rpc("accept_quote_system", s.args())).error,
  ).toBeNull();
const read = (s: Sample, phase = "deposit", db = sessions.client) =>
  db.rpc("get_payment_obligation", {
    target_order: s.order_id,
    target_phase: phase,
  });
const info = async (s: Sample, phase = "deposit", db = sessions.client) => {
  const r = await read(s, phase, db);
  expect(r.error).toBeNull();
  return paymentObligationSchema.parse(r.data);
};
const args = (s: Sample, patch: Record<string, unknown> = {}) => {
  const id = randomUUID();
  requests.push(id);
  return {
    target_order: s.order_id,
    target_phase: "deposit",
    expected_context: s.contextHash,
    expected_remaining_cents: 12501,
    billing_type: "PIX",
    due_date: "2026-10-20",
    request_id: id,
    ...patch,
  };
};
const prepare = (
  s: Sample,
  patch: Record<string, unknown> = {},
  db = sessions.client,
) => db.rpc("prepare_payment_obligation", args(s, patch));
const contexts = (s: Sample) =>
  Number(
    sql(
      `select count(*) from private.payment_obligation_contexts where order_id='${s.order_id}';`,
    ),
  );
const audits = (s: Sample) =>
  Number(
    sql(
      `select count(*) from public.audit_log where action='payment_obligation_viewed' and target_id='${s.order_id}';`,
    ),
  );
const payment = async (s: Sample, patch: Record<string, unknown> = {}) => {
  const id = randomUUID();
  expect(
    (
      await fixture.db.from("payments").insert({
        id,
        order_id: s.order_id,
        kind: "deposit",
        method: "pix_manual",
        amount_cents: 5000,
        status: "confirmed",
        ...patch,
      })
    ).error,
  ).toBeNull();
  return id;
};
const deliver = async (s: Sample) => {
  expect(
    (
      await fixture.db
        .from("orders")
        .update({ status: "delivered" })
        .eq("id", s.order_id)
    ).error,
  ).toBeNull();
  expect(
    (
      await fixture.db.from("deliveries").insert({
        id: randomUUID(),
        process_id: s.process_id,
        order_id: s.order_id,
        confirmed_by: fixture.calculator.id,
        pje_version: "FICTICIO",
        index_month: "2026-10",
        checklist: { liquidated: true, taxIdPresent: true, reviewed: true },
        professional: { name: "Profissional fictício", crc: "CRC FICTICIO" },
        payload: { fixture: true },
      })
    ).error,
  ).toBeNull();
};
async function whileLocked<T>(
  lockSql: string,
  operation: () => PromiseLike<T>,
  releaseSql = "commit;",
) {
  const name = "obligation-lock-" + randomUUID();
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
      `set application_name='${name}'; set statement_timeout=8000; set idle_in_transaction_session_timeout=8000; begin; ${lockSql}\n\\echo OBLIGATION_LOCK_HELD\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("OBLIGATION_LOCK_HELD");
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
  fixture = await acceptanceFixture();
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
  priorClient = JSON.parse(
    sql(
      `select row_to_json(c) from (select kind,document from public.clients where id='${fixture.owner.id}') c;`,
    ),
  );
  priorScope = sql(
    "select scope_id from private.payment_provider_configuration where singleton;",
  );
  sql(`update public.clients set kind='person',document='11144477735' where id='${fixture.owner.id}';
    insert into private.payment_provider_scopes(id,provider,mode,environment,account_id) values('${scopeId}','asaas','fixture','sandbox','fixture-${scopeId}'),('${otherScopeId}','asaas','fixture','sandbox','fixture-${otherScopeId}');
    insert into private.payment_provider_customers(id,scope_id,client_id,customer_id,kind,document) values('${bindingId}','${scopeId}','${fixture.owner.id}','cus_fixture_${bindingId}','person','11144477735');`);
  scope();
});
afterAll(async () => {
  try {
    if (fixture) {
      for (const id of orders)
        sql(
          `delete from public.audit_log where action='payment_obligation_prepared' and target_id in(select id from private.payment_obligation_contexts where order_id='${id}'); delete from private.payment_obligation_contexts where order_id='${id}'; delete from public.deliveries where order_id='${id}';`,
        );
      sql(
        `update public.clients set kind=${literal(priorClient.kind)},document=${literal(priorClient.document)},owner_id='${fixture.owner.owner_id}' where id='${fixture.owner.id}';`,
      );
      if (priorScope) scope(priorScope);
      else
        sql(
          "delete from private.payment_provider_configuration where singleton;",
        );
      sql(
        `delete from private.payment_provider_customers where scope_id in('${scopeId}','${otherScopeId}'); delete from private.payment_provider_scopes where id in('${scopeId}','${otherScopeId}');`,
      );
    }
    await Promise.all(
      Object.values(sessions).map((db) => db.auth.signOut({ scope: "local" })),
    );
  } finally {
    if (fixture) await fixture.cleanup();
  }
});
it("somente proprietário e calculista consultam/preparam; schema privado e dados pessoais não são expostos", async () => {
  const s = await sample();
  await accept(s);
  const anonymous = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  for (const db of [sessions.clientB, sessions.admin, anonymous, fixture.db]) {
    expect((await read(s, "deposit", db)).error).not.toBeNull();
    expect((await prepare(s, {}, db)).error).not.toBeNull();
  }
  for (const db of [sessions.client, sessions.calculator])
    expect(await info(s, "deposit", db)).toMatchObject({
      status: "ready",
      remainingCents: 12501,
      mode: "fixture",
      identityProof: "fixture_declared",
      binding: { id: bindingId, scopeId },
    });
  expect(JSON.stringify(await info(s))).not.toContain("11144477735");
  const prepared = await prepare(s, {}, sessions.calculator);
  expect(prepared.error).toBeNull();
  expect(paymentObligationReceiptSchema.parse(prepared.data).createdBy).toBe(
    fixture.calculator.id,
  );
  expect(() =>
    sql(
      `update private.payment_provider_scopes set account_id='another' where id='${scopeId}';`,
    ),
  ).toThrow("Consulta das fixtures");
  expect(() =>
    sql(
      `update private.payment_provider_customers set customer_id='another' where id='${bindingId}';`,
    ),
  ).toThrow("Consulta das fixtures");
  expect((await info(s)).binding).toMatchObject({
    id: bindingId,
    scope: { accountId: `fixture-${scopeId}` },
    customerId: `cus_fixture_${bindingId}`,
  });
  expect(
    sql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name like 'payment_%' and grantee in ('anon','authenticated','service_role');",
    ),
  ).toBe("0");
  expect(
    sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('payment_provider_scopes','payment_provider_configuration','payment_provider_customers','payment_obligation_contexts') and c.relrowsecurity;",
    ),
  ).toBe("4");
  expect(
    sql(
      "select has_function_privilege('authenticated','private.payment_obligation_preview(uuid,text)','execute');",
    ),
  ).toBe("f");
});
it("sem aceite, contexto, rejeitada ou simulação não permite preparo", async () => {
  for (const options of [{}, { context: false }, { simulation: true }]) {
    const s = await sample(options);
    expect(await info(s)).toMatchObject({
      status: "blocked",
      reason: "contract_missing",
      quoteId: null,
      remainingCents: null,
    });
    expect((await prepare(s)).error).not.toBeNull();
    expect(contexts(s)).toBe(0);
  }
  const s = await sample();
  expect(
    (
      await fixture.db.rpc("reject_quote_system", {
        ...s.args(),
        expected_revision: Number(
          sql(
            `select status_revision from public.orders where id='${s.order_id}';`,
          ),
        ),
        reason: "Recusa fictícia",
      })
    ).error,
  ).toBeNull();
  expect(await info(s)).toMatchObject({
    status: "blocked",
    reason: "contract_missing",
  });
  expect((await prepare(s)).error).not.toBeNull();
});
it("saldo exige entrega técnica além do estado entregue; sinal fora da fase não pode emitir", async () => {
  const s = await sample();
  await accept(s);
  expect(await info(s, "balance")).toMatchObject({
    status: "blocked",
    reason: "phase_unavailable",
  });
  await fixture.db
    .from("orders")
    .update({ status: "delivered" })
    .eq("id", s.order_id);
  expect(await info(s, "balance")).toMatchObject({
    status: "blocked",
    reason: "phase_unavailable",
  });
  expect(await info(s)).toMatchObject({
    status: "blocked",
    reason: "phase_unavailable",
  });
  await deliver(s);
  expect(await info(s, "balance")).toMatchObject({
    status: "ready",
    remainingCents: 25001,
    requiredCents: 25001,
  });
  expect(
    (
      await prepare(s, {
        target_phase: "balance",
        expected_remaining_cents: 25001,
      })
    ).error,
  ).toBeNull();
});
it("preserva parcela manual legada; pending/refunded/triagem e saldo não quitam o sinal", async () => {
  const s = await sample();
  await accept(s);
  await payment(s);
  await payment(s, { kind: "balance", amount_cents: 2500 });
  await payment(s, { kind: "triage", amount_cents: 100000 });
  await payment(s, { status: "pending", amount_cents: 100000 });
  await payment(s, { status: "refunded", amount_cents: 100000 });
  expect(await info(s)).toMatchObject({
    creditedCents: 5000,
    totalCreditedCents: 7500,
    remainingCents: 7501,
    status: "ready",
  });
  const r = await prepare(s, { expected_remaining_cents: 7501 });
  expect(r.error).toBeNull();
  expect(
    paymentObligationReceiptSchema.parse(r.data).snapshot.remainingCents,
  ).toBe(7501);
  await deliver(s);
  expect(await info(s, "balance")).toMatchObject({
    creditedCents: 7500,
    remainingCents: 17501,
  });
});
it("contrato vigente dispensa sinal e sua retirada restaura dívida; não quita saldo", async () => {
  const s = await sample({ contract: true });
  await accept(s);
  expect(await info(s)).toMatchObject({
    status: "waived",
    hasContract: true,
    remainingCents: 0,
  });
  expect((await prepare(s)).error).not.toBeNull();
  sql(
    `update public.clients set has_contract=false where id='${fixture.owner.id}';`,
  );
  await fixture.db
    .from("orders")
    .update({ status: "awaiting_payment" })
    .eq("id", s.order_id);
  expect(await info(s)).toMatchObject({
    status: "ready",
    hasContract: false,
    remainingCents: 12501,
  });
  sql(
    `update public.clients set has_contract=true where id='${fixture.owner.id}';`,
  );
  await deliver(s);
  expect(await info(s, "balance")).toMatchObject({
    status: "ready",
    remainingCents: 25001,
    hasContract: true,
  });
});
it("sinal ímpar pago deixa saldo correto e versões de entrega não duplicam dívida", async () => {
  const s = await sample();
  await accept(s);
  await payment(s, { amount_cents: 12501 });
  expect(await info(s)).toMatchObject({ status: "settled", remainingCents: 0 });
  expect((await prepare(s)).error).not.toBeNull();
  await deliver(s);
  await deliver(s);
  expect(await info(s, "balance")).toMatchObject({
    remainingCents: 12500,
    totalCents: 25001,
  });
  await payment(s, { kind: "balance", amount_cents: 12500 });
  expect(await info(s, "balance")).toMatchObject({
    status: "settled",
    remainingCents: 0,
  });
});
it("zero, fechado e crédito excessivo não criam obrigação cobravel", async () => {
  const zero = await sample({ zero: true });
  await accept(zero);
  expect(await info(zero)).toMatchObject({
    status: "settled",
    remainingCents: 0,
  });
  expect(
    (await prepare(zero, { expected_remaining_cents: 0 })).error,
  ).not.toBeNull();
  for (const status of ["cancelled", "refunded"]) {
    const s = await sample();
    await accept(s);
    await fixture.db.from("orders").update({ status }).eq("id", s.order_id);
    expect(await info(s)).toMatchObject({
      status: "blocked",
      reason: "order_closed",
      remainingCents: null,
    });
    expect((await prepare(s)).error).not.toBeNull();
  }
  const excess = await sample();
  await accept(excess);
  await payment(excess, { amount_cents: 13000 });
  expect(await info(excess)).toMatchObject({
    status: "blocked",
    reason: "credit_excess",
  });
  expect((await prepare(excess)).error).not.toBeNull();
  const unsafe = await sample();
  await accept(unsafe);
  await payment(unsafe, { amount_cents: "9007199254740992" });
  expect(await info(unsafe)).toMatchObject({
    status: "blocked",
    reason: "unsafe_amount",
    creditedCents: null,
    totalCreditedCents: null,
  });
  expect((await prepare(unsafe)).error).not.toBeNull();
});
it.each(["pending", "confirmed", "refunded"])(
  "Asaas legado %s exige conciliação sem crédito automático",
  async (status) => {
    const s = await sample();
    await accept(s);
    await payment(s, { method: "asaas", status });
    expect(await info(s)).toMatchObject({
      status: "blocked",
      reason: "legacy_provider_reconciliation",
      creditedCents: null,
      totalCreditedCents: null,
      remainingCents: null,
    });
    expect((await prepare(s)).error).not.toBeNull();
    expect(contexts(s)).toBe(0);
  },
);
it("conta não configurada, cliente não vinculado e documento alterado bloqueiam contexto", async () => {
  const s = await sample();
  await accept(s);
  try {
    sql("delete from private.payment_provider_configuration where singleton;");
    expect(await info(s)).toMatchObject({
      status: "blocked",
      reason: "scope_unconfigured",
      binding: null,
    });
    scope(otherScopeId);
    expect(await info(s)).toMatchObject({
      status: "blocked",
      reason: "customer_unbound",
      binding: null,
    });
    expect((await prepare(s)).error).not.toBeNull();
    scope();
    sql(
      `update public.clients set document='52998224725' where id='${fixture.owner.id}';`,
    );
    expect(await info(s)).toMatchObject({
      status: "blocked",
      reason: "customer_changed",
    });
    expect((await prepare(s)).error).not.toBeNull();
  } finally {
    scope();
    sql(
      `update public.clients set document='11144477735' where id='${fixture.owner.id}';`,
    );
  }
  expect(contexts(s)).toBe(0);
});
it("recibo persistente, imutável e auditado repete snapshot original após alteração de crédito/conta", async () => {
  const s = await sample();
  await accept(s);
  const request = args(s);
  const first = await sessions.client.rpc(
    "prepare_payment_obligation",
    request,
  );
  expect(first.error).toBeNull();
  const r = paymentObligationReceiptSchema.parse(first.data);
  expect(r).toMatchObject({
    id: request.request_id,
    createdBy: fixture.owner.owner_id,
    snapshot: {
      contextHash: s.contextHash,
      remainingCents: 12501,
      billingType: "PIX",
      dueDate: "2026-10-20",
      binding: { id: bindingId, scopeId },
    },
  });
  await payment(s);
  scope(otherScopeId);
  try {
    expect(
      (await sessions.client.rpc("prepare_payment_obligation", request)).data,
    ).toEqual(first.data);
    expect(
      (await sessions.calculator.rpc("prepare_payment_obligation", request))
        .error?.code,
    ).toBe("PT409");
    expect(
      (
        await sessions.client.rpc("prepare_payment_obligation", {
          ...request,
          due_date: "2026-10-21",
        })
      ).error?.code,
    ).toBe("PT409");
    expect(() =>
      sql(
        `update private.payment_obligation_contexts set remaining_cents=1 where id='${r.id}';`,
      ),
    ).toThrow("Consulta das fixtures");
    expect(contexts(s)).toBe(1);
    expect(
      sql(
        `select count(*) from public.audit_log where action='payment_obligation_prepared' and target_id='${r.id}';`,
      ),
    ).toBe("1");
  } finally {
    scope();
  }
});
it("duas sessões e UUID igual produzem um único contexto/auditoria", async () => {
  const s = await sample();
  await accept(s);
  const request = args(s),
    second = await quoteSession();
  try {
    const results = await Promise.all([
      sessions.client.rpc("prepare_payment_obligation", request),
      second.rpc("prepare_payment_obligation", request),
    ]);
    expect(results.map((r) => r.error)).toEqual([null, null]);
    expect(results[0].data).toEqual(results[1].data);
    expect(contexts(s)).toBe(1);
    expect(
      sql(
        `select count(*) from public.audit_log where action='payment_obligation_prepared' and target_id='${request.request_id}';`,
      ),
    ).toBe("1");
  } finally {
    await second.auth.signOut({ scope: "local" });
  }
});
it("hash/valor/fase/meio/UUID/data inválidos abortam sem contexto ou efeito financeiro", async () => {
  const s = await sample();
  await accept(s);
  for (const patch of [
    { expected_context: "0".repeat(64) },
    { expected_remaining_cents: 1 },
    { expected_remaining_cents: 0 },
    { expected_remaining_cents: "9007199254740992" },
    { target_phase: "triage" },
    { billing_type: "CASH" },
    { request_id: null },
    { due_date: "1899-12-31" },
    { due_date: "infinity" },
    { due_date: "2026-02-29" },
  ])
    expect((await prepare(s, patch)).error).not.toBeNull();
  expect(contexts(s)).toBe(0);
  expect(
    (await fixture.db.from("payments").select("id").eq("order_id", s.order_id))
      .data,
  ).toEqual([]);
  expect(
    (
      await fixture.db
        .from("orders")
        .select("status")
        .eq("id", s.order_id)
        .single()
    ).data?.status,
  ).toBe("awaiting_payment");
  expect(
    (
      await fixture.db
        .from("timeline_events")
        .select("kind")
        .eq("order_id", s.order_id)
        .eq("kind", "payment_confirmed")
    ).data,
  ).toEqual([]);
});
it.each(["1900-01-01", "9999-12-31"])(
  "RPC e recibo concordam no limite %s",
  async (due_date) => {
    const s = await sample();
    await accept(s);
    const request = args(s, { due_date });
    const result = await sessions.client.rpc(
      "prepare_payment_obligation",
      request,
    );
    expect(result.error).toBeNull();
    expect(
      paymentObligationReceiptSchema.parse(result.data).snapshot.dueDate,
    ).toBe(due_date);
    expect(
      (await sessions.client.rpc("prepare_payment_obligation", request)).data,
    ).toEqual(result.data);
  },
);
it("troca de proprietário concorrente bloqueia consulta e preparo sem auditoria/contexto", async () => {
  const s = await sample();
  await accept(s);
  // Retira temporariamente o cadastro vazio da fixture calculista e restaura seus campos no fim.
  const calculatorClient = JSON.parse(
    sql(
      `select row_to_json(c) from public.clients c where owner_id='${fixture.calculator.id}';`,
    ),
  );
  expect(
    sql(
      `select count(*) from public.processes where client_id='${calculatorClient.id}';`,
    ),
  ).toBe("0");
  sql(`delete from public.clients where id='${calculatorClient.id}';`);
  const owner = fixture.owner.owner_id;
  try {
    for (const operation of [() => read(s), () => prepare(s)]) {
      try {
        const r = await whileLocked(
          `select id from public.clients where id='${fixture.owner.id}' for update;`,
          operation,
          `update public.clients set owner_id='${fixture.calculator.id}' where id='${fixture.owner.id}'; commit;`,
        );
        expect(r.error).not.toBeNull();
        expect(contexts(s)).toBe(0);
        expect(audits(s)).toBe(0);
      } finally {
        sql(
          `update public.clients set owner_id='${owner}' where id='${fixture.owner.id}';`,
        );
      }
    }
  } finally {
    sql(
      `update public.clients set owner_id='${owner}' where id='${fixture.owner.id}'; insert into public.clients select (jsonb_populate_record(null::public.clients,${literal(JSON.stringify(calculatorClient))}::jsonb)).*;`,
    );
  }
}, 15000);
it("mudança concorrente de papel impede consulta e preparo sem auditoria/contexto", async () => {
  const s = await sample();
  await accept(s);
  for (const operation of [() => read(s), () => prepare(s)]) {
    try {
      const r = await whileLocked(
        `update public.profiles set role='admin' where id='${fixture.owner.owner_id}';`,
        operation,
      );
      expect(r.error).not.toBeNull();
      expect(contexts(s)).toBe(0);
      expect(audits(s)).toBe(0);
    } finally {
      sql(
        `update public.profiles set role='client' where id='${fixture.owner.owner_id}';`,
      );
    }
  }
}, 15000);
it("crédito promovido enquanto prepara exige reavaliar restante", async () => {
  const s = await sample();
  await accept(s);
  const id = await payment(s, { status: "pending" });
  const result = await whileLocked(
    `update public.payments set status='confirmed' where id='${id}';`,
    () => prepare(s),
  );
  expect(result.error?.code).toBe("PT409");
  expect(contexts(s)).toBe(0);
  expect(await info(s)).toMatchObject({
    status: "ready",
    remainingCents: 7501,
  });
}, 10000);
