import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { rejectionFixture } from "../e2e/rejection-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
let fixture: Awaited<ReturnType<typeof rejectionFixture>>;
const sessions: Record<string, SupabaseClient> = {};
type Sample = Awaited<ReturnType<typeof fixture.create>>;
const reject = (sample: Sample, patch: Record<string, unknown> = {}) =>
  fixture.db.rpc("reject_quote_system", sample.rejectionArgs(patch));
const counts = (s: Sample) =>
  JSON.parse(
    sql(
      `select json_build_object('receipts',(select count(*) from private.quote_rejections where order_id='${s.order_id}'),'requests',(select count(*) from private.quote_rejection_requests where quote_id='${s.id}'),'acceptances',(select count(*) from private.quote_acceptances where quote_id='${s.id}'),'events',(select count(*) from public.timeline_events where order_id='${s.order_id}' and data->>'operation'='reject_quote'),'audits',(select count(*) from public.audit_log where target_id='${s.id}' and action='quote_rejected'));`,
    ),
  );
const projection = (s: Sample) =>
  JSON.parse(
    sql(
      `select json_build_object('order',(select to_jsonb(o) from public.orders o where id='${s.order_id}'),'quote',(select to_jsonb(q) from public.quotes q where id='${s.id}'),'context',(select to_jsonb(c) from private.quote_contract_contexts c where quote_id='${s.id}'),'files',(select coalesce(jsonb_agg(f order by f.id),'[]') from public.files f where process_id='${s.process_id}'),'payments',(select coalesce(jsonb_agg(p order by p.id),'[]') from public.payments p where order_id='${s.order_id}'),'contract',(select has_contract from public.clients where id=(select client_id from public.orders where id='${s.order_id}')),'notifications',(select coalesce(jsonb_agg(n.id order by n.id),'[]') from public.notifications n where data->>'process_id'='${s.process_id}'));`,
    ),
  );
beforeAll(async () => {
  fixture = await rejectionFixture();
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
it("recusa preserva proposta, contexto, arquivos, valores, contrato e avisos", async () => {
  const s = await fixture.create({ contract: true, documents: true }),
    before = projection(s);
  const result = await reject(s, { reason: " \nDecisão fictícia\u00a0 " });
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({
    quoteId: s.id,
    orderId: s.order_id,
    processId: s.process_id,
    number: s.number,
    contextHash: s.contextHash,
    reason: "Decisão fictícia",
    expectedRevision: s.statusRevision,
    revision: s.statusRevision + 1,
    status: "cancelled",
  });
  const after = projection(s);
  expect(after.order).toMatchObject({
    ...before.order,
    status: "cancelled",
    status_revision: s.statusRevision + 1,
    updated_at: after.order.updated_at,
  });
  for (const field of [
    "quote",
    "context",
    "files",
    "payments",
    "contract",
    "notifications",
  ])
    expect(after[field]).toEqual(before[field]);
  expect(counts(s)).toEqual({
    receipts: 1,
    requests: 1,
    acceptances: 0,
    events: 1,
    audits: 1,
  });
  expect(
    (
      await sessions.client.rpc("get_quote_contract_context", {
        target_quote: s.id,
      })
    ).data,
  ).toMatchObject({
    canAccept: false,
    canReject: false,
    status: "cancelled",
    statusRevision: s.statusRevision + 1,
    rejectionReceipt: result.data,
  });
  expect(
    (
      await sessions.calculator.rpc("get_quote_contract_context", {
        target_quote: s.id,
      })
    ).data,
  ).toMatchObject({ canReject: false, rejectionReceipt: result.data });
  expect(() =>
    sql(
      `update private.quote_rejections set reason='Adulterado' where quote_id='${s.id}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `update private.quote_rejection_requests set payload='{}' where quote_id='${s.id}';`,
    ),
  ).toThrow();
});
it("RPC privada exige sistema e ator proprietário atual", async () => {
  const s = await fixture.create(),
    anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
  for (const db of [...Object.values(sessions), anon])
    expect(
      (await db.rpc("reject_quote_system", s.rejectionArgs())).error,
    ).not.toBeNull();
  for (const role of ["clientB", "calculator", "admin"]) {
    const actor = (await sessions[role].auth.getUser()).data.user!.id;
    expect((await reject(s, { actor })).error).not.toBeNull();
  }
  expect(
    (
      await sessions.clientB.rpc("get_quote_contract_context", {
        target_quote: s.id,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await sessions.calculator.rpc("get_quote_contract_context", {
        target_quote: s.id,
      })
    ).data,
  ).toMatchObject({ canReject: false });
  expect(
    sql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name in ('quote_rejections','quote_rejection_requests') and grantee in ('anon','authenticated','service_role');",
    ),
  ).toBe("0");
  expect(
    sql(
      "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('accept_quote_system','get_quote_contract_context','can_reject_quote','quote_rejection_result') and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'));",
    ),
  ).toBe("0");
  expect(counts(s).receipts).toBe(0);
});
it.each([
  { confirmed: false },
  { expected_context: "a".repeat(64) },
  { expected_revision: -1 },
  { expected_revision: 2147483647 },
  { reason: "x".repeat(501) },
  { reason: null },
  { ip_address: "192.0.2.0/24" },
  { ip_address: "invalid" },
  { user_agent: "x".repeat(513) },
])("inválido não deixa efeito parcial %j", async (patch) => {
  const s = await fixture.create(),
    before = projection(s);
  expect((await reject(s, patch)).error).not.toBeNull();
  expect(projection(s)).toEqual(before);
  expect(counts(s)).toEqual({
    receipts: 0,
    requests: 0,
    acceptances: 0,
    events: 0,
    audits: 0,
  });
});
it("contexto ausente, simulação e preços divergentes impedem recusa", async () => {
  for (const mode of ["missing", "simulation", "price"]) {
    const s = await fixture.create({
      context: mode !== "missing",
      simulation: mode === "simulation",
    });
    if (mode === "price")
      sql(
        `update public.orders set total_cents=total_cents+1 where id='${s.order_id}';`,
      );
    const before = projection(s);
    expect((await reject(s)).error?.code).toBe("PT409");
    expect(projection(s)).toEqual(before);
  }
});
it("proposta vencida e mudança da versão atual não impedem recusa", async () => {
  const s = await fixture.create({ expired: true });
  await fixture.db
    .from("settings")
    .update({ approved_terms_version: null })
    .eq("singleton", true);
  try {
    expect(
      (
        await sessions.client.rpc("get_quote_contract_context", {
          target_quote: s.id,
        })
      ).data,
    ).toMatchObject({ canAccept: false, canReject: true });
    expect((await reject(s)).error).toBeNull();
  } finally {
    await fixture.db
      .from("settings")
      .update({ approved_terms_version: fixture.terms })
      .eq("singleton", true);
  }
});
it.each(
  ["deposit", "balance", "triage"].flatMap((kind) =>
    ["pending", "confirmed", "refunded"].map((status) => ({ kind, status })),
  ),
)("qualquer pagamento bloqueia recusa %j", async ({ kind, status }) => {
  const s = await fixture.create();
  expect(
    (
      await fixture.db.from("payments").insert({
        order_id: s.order_id,
        kind,
        status,
        method: "pix_manual",
        amount_cents: 1,
      })
    ).error,
  ).toBeNull();
  const before = projection(s);
  expect((await reject(s)).error?.code).toBe("PT409");
  expect(projection(s)).toEqual(before);
  expect(counts(s).receipts).toBe(0);
});
it.each(["accepted_at", "accepted_by", "accepted_ip", "accepted_user_agent"])(
  "aceite legado %s bloqueia qualquer recusa",
  async (field) => {
    const s = await fixture.create(),
      id = randomUUID();
    const value =
      field === "accepted_at"
        ? "now()"
        : field === "accepted_by"
          ? `'${s.actor}'::uuid`
          : field === "accepted_ip"
            ? "'192.0.2.44'::inet"
            : "'UA fictício'";
    try {
      sql(
        `insert into public.quotes(id,order_id,number,items,total_cents,valid_until,${field}) select '${id}',order_id,number||'-LEGADO',items,total_cents,valid_until,${value} from public.quotes where id='${s.id}';`,
      );
      expect((await reject(s)).error?.code).toBe("PT409");
      expect(counts(s).receipts).toBe(0);
    } finally {
      sql(`delete from public.quotes where id='${id}';`);
    }
  },
);
it("replay concorrente preserva instante/origem e UUID divergente conflita", async () => {
  const s = await fixture.create(),
    args = s.rejectionArgs({ reason: "Motivo fictício" });
  const [a, b] = await Promise.all([
    fixture.db.rpc("reject_quote_system", args),
    fixture.db.rpc(
      "reject_quote_system",
      s.rejectionArgs({ reason: args.reason }),
    ),
  ]);
  expect(a.error).toBeNull();
  expect(b.error).toBeNull();
  expect(b.data).toEqual(a.data);
  const origin = sql(
    `select rejected_ip||'|'||rejected_user_agent from private.quote_rejections where quote_id='${s.id}';`,
  );
  expect(
    (
      await fixture.db.rpc("reject_quote_system", {
        ...args,
        ip_address: "203.0.113.1",
        user_agent: "Outro navegador",
      })
    ).data,
  ).toEqual(a.data);
  expect(
    sql(
      `select rejected_ip||'|'||rejected_user_agent from private.quote_rejections where quote_id='${s.id}';`,
    ),
  ).toBe(origin);
  for (const patch of [
    { reason: "Outro motivo" },
    { expected_revision: s.statusRevision + 1 },
    { expected_context: "b".repeat(64) },
  ])
    expect(
      (await fixture.db.rpc("reject_quote_system", { ...args, ...patch })).error
        ?.code,
    ).toBe("PT409");
  const other = await fixture.create();
  expect(
    (await reject(other, { request_id: args.request_id })).error?.code,
  ).toBe("PT409");
  expect(counts(s)).toEqual({
    receipts: 1,
    requests: 2,
    acceptances: 0,
    events: 1,
    audits: 1,
  });
});
it("revisão antiga conflita e restaurar quoted não permite novo aceite", async () => {
  const stale = await fixture.create();
  sql(
    `update public.orders set status='cancelled' where id='${stale.order_id}'; update public.orders set status='quoted' where id='${stale.order_id}';`,
  );
  const before = projection(stale);
  expect((await reject(stale)).error?.code).toBe("PT409");
  expect(projection(stale)).toEqual(before);
  const s = await fixture.create(),
    args = s.rejectionArgs(),
    r = await fixture.db.rpc("reject_quote_system", args);
  expect(r.error).toBeNull();
  sql(`update public.orders set status='quoted' where id='${s.order_id}';`);
  expect(
    (await fixture.db.rpc("accept_quote_system", s.args())).error?.code,
  ).toBe("PT409");
  const restored = projection(s);
  expect((await fixture.db.rpc("reject_quote_system", args)).data).toEqual(
    r.data,
  );
  expect(projection(s)).toEqual(restored);
});
it.each(["audit_log", "timeline_events"])(
  "falha em %s reverte toda a decisão e permite mesmo UUID",
  async (table) => {
    const s = await fixture.create(),
      args = s.rejectionArgs(),
      before = projection(s),
      trigger = "quote_rejection_failure";
    const condition =
      table === "audit_log"
        ? `new.action='quote_rejected' and new.target_id='${s.id}'`
        : `new.order_id='${s.order_id}' and new.data->>'operation'='reject_quote'`;
    sql(
      `create function private.${trigger}() returns trigger language plpgsql set search_path='' as $$begin if ${condition} then raise exception 'Falha fictícia'; end if; return new; end$$; create trigger ${trigger} before insert on public.${table} for each row execute function private.${trigger}();`,
    );
    try {
      expect(
        (await fixture.db.rpc("reject_quote_system", args)).error,
      ).not.toBeNull();
      expect(projection(s)).toEqual(before);
      expect(counts(s).receipts).toBe(0);
      expect(counts(s).requests).toBe(0);
    } finally {
      sql(
        `drop trigger ${trigger} on public.${table}; drop function private.${trigger}();`,
      );
    }
    expect(
      (await fixture.db.rpc("reject_quote_system", args)).error,
    ).toBeNull();
  },
);
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
it.each(["accept", "reject", "payment"])(
  "espera reconfere decisão vencedora %s",
  async (winner) => {
    const s = await fixture.create(),
      name = "quote-race-" + randomUUID();
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
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", () => {});
    const done = new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", resolve);
    });
    const a = s.args(),
      r = s.rejectionArgs();
    const command =
      winner === "accept"
        ? `select public.accept_quote_system('${a.actor}','${a.target_quote}',${literal(a.expected_context)},'${a.request_id}',true,${literal(a.ip_address)},${literal(a.user_agent)});`
        : winner === "reject"
          ? `select public.reject_quote_system('${r.actor}','${r.target_quote}',${literal(r.expected_context)},${r.expected_revision},'${r.request_id}',true,${literal(r.reason)},${literal(r.ip_address)},${literal(r.user_agent)});`
          : `insert into public.payments(order_id,kind,method,amount_cents,status) values('${s.order_id}','triage','pix_manual',1,'pending');`;
    let pending: Promise<Awaited<ReturnType<typeof reject>>> | undefined;
    try {
      child.stdin.write(
        `set application_name='${name}'; begin; set local request.jwt.claims='{"role":"service_role"}'; ${command}\n\\echo APPLIED\n`,
      );
      await expect.poll(() => output, { timeout: 5000 }).toContain("APPLIED");
      pending = Promise.resolve(
        winner === "reject"
          ? fixture.db.rpc("accept_quote_system", a)
          : fixture.db.rpc("reject_quote_system", r),
      );
      await expect
        .poll(
          () =>
            sql(
              `select count(*) from pg_stat_activity b where b.wait_event_type='Lock' and exists(select 1 from pg_stat_activity a where a.application_name='${name}' and a.pid=any(pg_blocking_pids(b.pid)));`,
            ),
          { timeout: 5000 },
        )
        .toBe("1");
      child.stdin.end("commit;\n\\q\n");
      expect(await done).toBe(0);
      expect((await pending).error?.code).toBe("PT409");
      expect(counts(s)).toMatchObject({
        receipts: winner === "reject" ? 1 : 0,
        acceptances: winner === "accept" ? 1 : 0,
        events: winner === "reject" ? 1 : 0,
        audits: winner === "reject" ? 1 : 0,
      });
      expect(projection(s).order.status_revision).toBe(
        s.statusRevision + (winner === "payment" ? 0 : 1),
      );
    } finally {
      if (child.exitCode === null && !child.stdin.destroyed)
        child.stdin.end("rollback;\n\\q\n");
      await done;
      if (pending) await pending;
    }
  },
  20000,
);
