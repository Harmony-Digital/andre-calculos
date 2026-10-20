import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { removeLocalUser } from "../e2e/local-helper";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => session,
}));
vi.mock("@/modules/auth/session", () => ({
  authorize: async (roles: readonly string[]) => {
    const user = (await session.auth.getUser()).data.user;
    const p = user
      ? await session
          .from("profiles")
          .select("id,role")
          .eq("id", user.id)
          .single()
      : null;
    if (!p?.data || !roles.includes(p.data.role))
      throw new Error("Acesso não autorizado.");
    return { profile: p.data };
  },
}));
import { financialJourneyFixture } from "../e2e/financial-journey-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import {
  readFixtureInvoice,
  getPaymentInvoice,
} from "@/modules/payments/invoice-query";
import { parseInvoicePresentation } from "@/modules/payments/invoice-presentation";

let f: Awaited<ReturnType<typeof financialJourneyFixture>>;
let session: Awaited<ReturnType<typeof quoteSession>>;
function diagnosticSql(statement: string) {
  try {
    return execFileSync(
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
      {
        env: process.env,
        input: statement,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    throw new Error(
      stderr
        .split("\n")
        .filter((line) => line.includes("ERROR:"))
        .join("\n"),
    );
  }
}
beforeEach(async () => {
  f = await financialJourneyFixture();
  // A fixture inicial tem refunds=null (desconhecido). O provedor confirma
  // lista vazia. PENDING continua sem comprovar crédito recebido.
  sql(
    `update private.payment_fixture_payments set refunds='[]' where scope_id='${f.scopeId}' and id='${f.paymentId}';`,
  );
  await f.observe("current");
  await f.apply();
  session = await quoteSession();
}, 60000);
afterEach(async () => {
  await session?.auth.signOut({ scope: "local" });
  if (f) await f.cleanup();
}, 60000);
async function prepare(actor = session) {
  const r = await actor.rpc("prepare_payment_invoice", {
    target_order: f.sample.order_id,
  });
  expect(r.error).toBeNull();
  return r.data as unknown as {
    queryId: string | null;
    ownerId: string;
    scope: unknown;
    expectation: unknown;
    presentation: unknown;
  };
}
async function read(actor = session) {
  const p = await prepare(actor);
  if (p.queryId === null)
    return parseInvoicePresentation(p.presentation, {
      orderId: f.sample.order_id,
      processId: f.sample.process_id,
      scope: p.scope,
    });
  const invoice = await readFixtureInvoice(p.queryId, p.expectation);
  const r = await actor.rpc("finish_payment_invoice", {
    target_query: p.queryId,
  });
  expect(r.error).toBeNull();
  const current = r.data as unknown as {
    presentation: Record<string, unknown>;
  };
  return parseInvoicePresentation(
    {
      ...current.presentation,
      invoiceUrl:
        current.presentation.state === "active" && invoice.kind === "observed"
          ? invoice.value
          : null,
    },
    {
      orderId: f.sample.order_id,
      processId: f.sample.process_id,
      scope: p.scope,
    },
  );
}
const moneyState = () =>
  sql(`select md5(json_build_object(
 'run',(select row_to_json(r) from private.payment_execution_runs r where intent_id='${f.intentId}'),
 'claim',(select row_to_json(c) from private.payment_intent_dispatch_claims c where intent_id='${f.intentId}'),
 'reservation',(select row_to_json(v) from private.payment_intent_reservations v where intent_id='${f.intentId}'),
 'payments',(select json_agg(p order by p.id) from public.payments p where order_id='${f.sample.order_id}'),
 'charge',(select row_to_json(c) from private.payment_financial_charges c where id='${f.chargeId}'),
 'position',(select row_to_json(p) from private.payment_financial_positions p where charge_id='${f.chargeId}'),
 'posts',(select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${f.intentId}')
 )::text);`);
it("proprietário consulta fatura atual sem emitir, creditar ou liberar proteção", async () => {
  const before = moneyState();
  const result = await getPaymentInvoice(
    f.sample.order_id,
    f.sample.process_id,
  );
  expect(result).toMatchObject({
    state: "active",
    reason: "pending",
    invoiceAmountCents: 12501,
    remainingCents: null,
  });
  expect(result.invoiceUrl).toBe(`https://sandbox.asaas.com/i/${f.paymentId}`);
  expect(moneyState()).toBe(before);
  const stored = sql(
    `select coalesce(json_agg(row_to_json(q))::text,'[]') from private.payment_invoice_queries q where order_id='${f.sample.order_id}';`,
  );
  expect(stored).not.toMatch(
    /https?:|invoiceUrl|bodyText|cpfCnpj|document|email|mobilePhone/,
  );
  expect(
    sql(
      `select count(*) from public.audit_log where action='payment_invoice_viewed' and target_id='${f.sample.order_id}';`,
    ),
  ).toBe("1");
});

it("calculista consulta a fatura do pedido pelo caso de uso servidor", async () => {
  await session.auth.signOut({ scope: "local" });
  session = await quoteSession("calculator");
  expect(
    (await getPaymentInvoice(f.sample.order_id, f.sample.process_id)).state,
  ).toBe("active");
});
it.each(["clientB", "admin"] as const)(
  "%s não prepara nem obtém a fatura de outro proprietário",
  async (role) => {
    const actor = await quoteSession(role);
    try {
      expect(
        (
          await actor.rpc("prepare_payment_invoice", {
            target_order: f.sample.order_id,
          })
        ).error,
      ).not.toBeNull();
      expect(
        sql(
          `select count(*) from private.payment_invoice_queries where order_id='${f.sample.order_id}';`,
        ),
      ).toBe("0");
    } finally {
      await actor.auth.signOut({ scope: "local" });
    }
  },
);
it("anon e service_role não usam entradas de sessão; authenticated não usa transporte ou writer", async () => {
  const anon = await quoteSession();
  await anon.auth.signOut({ scope: "local" });
  expect(
    (
      await anon.rpc("prepare_payment_invoice", {
        target_order: f.sample.order_id,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await f.db.rpc("prepare_payment_invoice", {
        target_order: f.sample.order_id,
      })
    ).error,
  ).not.toBeNull();
  const p = await prepare();
  expect(
    (
      await session.rpc("read_payment_invoice_fixture", {
        target_query: p.queryId!,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await session.rpc("record_payment_invoice_result", {
        target_query: p.queryId!,
        available: true,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (await f.db.rpc("finish_payment_invoice", { target_query: p.queryId! }))
      .error,
  ).not.toBeNull();
  expect(
    (
      await session
        .schema("private")
        .from("payment_invoice_queries")
        .select("*")
    ).error,
  ).not.toBeNull();
});
it("troca de usuário entre consulta e retorno não transfere o link", async () => {
  const p = await prepare();
  expect((await readFixtureInvoice(p.queryId!, p.expectation)).kind).toBe(
    "observed",
  );
  for (const role of ["clientB", "calculator"] as const) {
    const actor = await quoteSession(role);
    try {
      expect(
        (
          await actor.rpc("finish_payment_invoice", {
            target_query: p.queryId!,
          })
        ).error,
      ).not.toBeNull();
    } finally {
      await actor.auth.signOut({ scope: "local" });
    }
  }
  expect(
    (await session.rpc("finish_payment_invoice", { target_query: p.queryId! }))
      .error,
  ).toBeNull();
});
it("novo dono não recebe consulta preparada pelo dono anterior", async () => {
  const p = await prepare(),
    owner = randomUUID(),
    email = `invoice-owner-${owner}@exemplo.com`;
  let created = false;
  const other = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  sql(
    `insert into private.user_provisioning_grants(user_id,purpose) values('${owner}','Identidade fictícia para transferência concorrente');`,
  );
  try {
    const r = await f.db.auth.admin.createUser({
      id: owner,
      email,
      password: process.env.ANDRE_TEST_PASSWORD!,
      email_confirm: true,
      user_metadata: { full_name: "Dono fictício temporário" },
    });
    expect(r.error).toBeNull();
    created = true;
    expect(
      (await f.db.from("clients").delete().eq("owner_id", owner)).error,
    ).toBeNull();
    expect(
      (
        await other.auth.signInWithPassword({
          email,
          password: process.env.ANDRE_TEST_PASSWORD!,
        })
      ).error,
    ).toBeNull();
    sql(
      `update public.clients set owner_id='${owner}' where id='${f.owner.id}';`,
    );
    await expect(
      readFixtureInvoice(p.queryId!, p.expectation),
    ).rejects.toThrow();
    expect(
      (
        await session.rpc("finish_payment_invoice", {
          target_query: p.queryId!,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (await other.rpc("finish_payment_invoice", { target_query: p.queryId! }))
        .error,
    ).not.toBeNull();
  } finally {
    sql(
      `update public.clients set owner_id='${f.owner.owner_id}' where id='${f.owner.id}';delete from private.user_provisioning_grants where user_id='${owner}';`,
    );
    await other.auth.signOut({ scope: "local" });
    if (created) await removeLocalUser(owner);
  }
});
it("papel revogado durante espera impede retorno, mesmo com URL validada no servidor", async () => {
  const p = await prepare();
  await readFixtureInvoice(p.queryId!, p.expectation);
  try {
    sql(
      `update public.profiles set role='admin' where id='${f.owner.owner_id}';`,
    );
    expect(
      (
        await session.rpc("finish_payment_invoice", {
          target_query: p.queryId!,
        })
      ).error,
    ).not.toBeNull();
  } finally {
    sql(
      `update public.profiles set role='client' where id='${f.owner.owner_id}';`,
    );
  }
});
it("troca da conta configurada entre GET e retorno não reutiliza link de outra conta", async () => {
  const p = await prepare();
  await readFixtureInvoice(p.queryId!, p.expectation);
  f.scope(f.otherScopeId);
  try {
    expect(
      (
        await session.rpc("finish_payment_invoice", {
          target_query: p.queryId!,
        })
      ).error?.code,
    ).toBe("PT409");
  } finally {
    f.scope();
  }
});
it("documento atual incompatível com o vínculo impede consulta sem expor documento", async () => {
  const p = await prepare();
  try {
    sql(
      `update public.clients set document='00000000191' where id='${f.owner.id}';`,
    );
    await expect(
      readFixtureInvoice(p.queryId!, p.expectation),
    ).rejects.toThrow();
  } finally {
    sql(
      `update public.clients set document='11144477735' where id='${f.owner.id}';`,
    );
  }
});
it("crédito manual novo durante espera bloqueia fatura antiga sem alterar o pagamento", async () => {
  const p = await prepare();
  await readFixtureInvoice(p.queryId!, p.expectation);
  const payment = randomUUID();
  try {
    expect(
      (
        await f.db.from("payments").insert({
          id: payment,
          order_id: f.sample.order_id,
          kind: "deposit",
          method: "pix_manual",
          amount_cents: 100,
          status: "confirmed",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await session.rpc("finish_payment_invoice", {
          target_query: p.queryId!,
        })
      ).error?.code,
    ).toBe("PT409");
    expect(
      sql(`select amount_cents from public.payments where id='${payment}';`),
    ).toBe("100");
  } finally {
    await f.db.from("payments").delete().eq("id", payment);
  }
});
it("mudança do snapshot do provedor depois do GET invalida o link capturado", async () => {
  const p = await prepare();
  await readFixtureInvoice(p.queryId!, p.expectation);
  sql(
    `update private.payment_fixture_payments set value_cents=value_cents+1 where scope_id='${f.scopeId}' and id='${f.paymentId}';`,
  );
  expect(
    (await session.rpc("finish_payment_invoice", { target_query: p.queryId! }))
      .error?.code,
  ).toBe("PT409");
});
it.each([
  "status='RECEIVED'",
  "value_cents=1",
  "deleted=true",
  'refunds=\'[{"value":1,"status":"DONE","dateCreated":"2026-10-12 10:00:00"}]\'',
  'chargeback=\'{"status":"IN_DISPUTE"}\'',
])(
  "snapshot incompatível %s não oferece fatura nem presume crédito",
  async (patch) => {
    diagnosticSql(
      `update private.payment_fixture_payments set ${patch} where scope_id='${f.scopeId}' and id='${f.paymentId}';`,
    );
    const before = moneyState(),
      result = await read();
    expect(result).toMatchObject({
      state: "uncertain",
      remainingCents: null,
      invoiceUrl: null,
      invoiceAmountCents: null,
    });
    expect(moneyState()).toBe(before);
  },
);
it("identidade do provedor é imutável; expectativa forjada não libera fatura", async () => {
  const before = moneyState(),
    p = await prepare();
  expect(() =>
    diagnosticSql(
      `update private.payment_fixture_payments set customer_id='cus_forjado' where scope_id='${f.scopeId}' and id='${f.paymentId}';`,
    ),
  ).toThrow("Identidade financeira preservada");
  const invoice = await readFixtureInvoice(p.queryId!, {
    ...(p.expectation as Record<string, unknown>),
    customerId: "cus_forjado",
  });
  expect(invoice.kind).toBe("reconcile");
  const r = await session.rpc("finish_payment_invoice", {
    target_query: p.queryId!,
  });
  expect(r.error).toBeNull();
  expect(r.data).toMatchObject({
    presentation: { state: "uncertain", invoiceUrl: null },
  });
  expect(moneyState()).toBe(before);
});
it("consulta expirou ou foi consumida: novo ID faz novo GET, sem nova emissão", async () => {
  const p = await prepare();
  sql(
    `update private.payment_invoice_queries set expires_at=clock_timestamp()-interval '1 second' where id='${p.queryId}';`,
  );
  await expect(readFixtureInvoice(p.queryId!, p.expectation)).rejects.toThrow();
  const second = await prepare();
  await readFixtureInvoice(second.queryId!, second.expectation);
  await expect(
    readFixtureInvoice(second.queryId!, second.expectation),
  ).rejects.toThrow();
  expect(
    (
      await session.rpc("finish_payment_invoice", {
        target_query: second.queryId!,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await session.rpc("finish_payment_invoice", {
        target_query: second.queryId!,
      })
    ).error?.code,
  ).toBe("PT409");
  const before = moneyState();
  expect((await read()).state).toBe("active");
  expect(moneyState()).toBe(before);
});
it("resposta perdida após gravação e reenvio consultam novamente sem duplicar cobrança", async () => {
  const before = moneyState(),
    first = await read();
  expect((await read()).invoiceUrl).toBe(first.invoiceUrl);
  expect(moneyState()).toBe(before);
  expect(
    sql(
      `select count(*) from private.payment_invoice_queries where order_id='${f.sample.order_id}' and completed_at is not null;`,
    ),
  ).toBe("2");
});
it("indisponibilidade do GET conserva conciliação nula; repetição nova recupera leitura", async () => {
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior,calls_left) values('${f.scopeId}','${f.owner.id}','payment_get','not_found',1);`,
  );
  expect(await read()).toMatchObject({
    state: "uncertain",
    remainingCents: null,
    invoiceUrl: null,
  });
  expect((await read()).state).toBe("active");
});
it("recebimento aplicado apresenta sinal confirmado sem nova consulta ou URL", async () => {
  await f.observe("received");
  await f.apply();
  await f.createOrigin();
  await f.bind();
  await f.resolve();
  expect(await read()).toMatchObject({
    state: "paid",
    reason: "credit_confirmed",
    remainingCents: 0,
    invoiceUrl: null,
    invoiceAmountCents: null,
  });
  expect(
    sql(
      `select count(*) from private.payment_invoice_queries where order_id='${f.sample.order_id}';`,
    ),
  ).toBe("0");
});
it("provider desligado não inventa escopo nem transfere link", async () => {
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  expect(await read()).toMatchObject({
    state: "blocked",
    reason: "provider_not_ready",
    invoiceUrl: null,
  });
});
it("histórico recebido seguido de estorno não usa exceção PENDING", async () => {
  await f.observe("received");
  await f.apply();
  await f.observe("refund_full");
  await f.apply();
  sql(
    `update private.payment_fixture_payments set status='PENDING',refunds='[]' where scope_id='${f.scopeId}' and id='${f.paymentId}';`,
  );
  await f.observe("current");
  await f.apply();
  expect((await read()).invoiceUrl).toBeNull();
});
it("auditoria e consumo da consulta têm rollback atômico", async () => {
  const p = await prepare();
  await readFixtureInvoice(p.queryId!, p.expectation);
  sql(
    `create function private.invoice_test_audit_fail() returns trigger language plpgsql set search_path='' as $$begin if new.action='payment_invoice_viewed' and new.target_id='${f.sample.order_id}'::uuid then raise exception 'Auditoria ficticia indisponivel'; end if;return new;end$$;create trigger invoice_test_audit_fail before insert on public.audit_log for each row execute function private.invoice_test_audit_fail();`,
  );
  try {
    expect(
      (
        await session.rpc("finish_payment_invoice", {
          target_query: p.queryId!,
        })
      ).error,
    ).not.toBeNull();
    expect(
      sql(
        `select completed_at is null from private.payment_invoice_queries where id='${p.queryId}';`,
      ),
    ).toBe("t");
  } finally {
    sql(
      "drop trigger invoice_test_audit_fail on public.audit_log;drop function private.invoice_test_audit_fail();",
    );
  }
  expect(
    (await session.rpc("finish_payment_invoice", { target_query: p.queryId! }))
      .error,
  ).toBeNull();
});

async function duringLock<T>(
  lock: string,
  action: () => PromiseLike<T>,
  release = "commit;",
) {
  const name = "invoice-lock-" + randomUUID();
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
      `set application_name='${name}';set statement_timeout=8000;set idle_in_transaction_session_timeout=8000;begin;${lock}\n\\echo INVOICE_LOCK\n`,
    );
    await expect
      .poll(() => output, { timeout: 3000 })
      .toContain("INVOICE_LOCK");
    pending = Promise.resolve(action());
    await expect
      .poll(
        () =>
          sql(
            `select count(*) from pg_stat_activity b where b.wait_event_type='Lock' and exists(select 1 from pg_stat_activity a where a.application_name='${name}' and a.pid=any(pg_blocking_pids(b.pid)));`,
          ),
        { timeout: 3000 },
      )
      .toBe("1");
    child.stdin.end(`${release}\n\\q\n`);
    expect(await done).toBe(0);
    return await pending;
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (pending) await pending;
  }
}
it("espera pelo lock de configuração relê a conta após commit concorrente", async () => {
  const p = await prepare();
  await readFixtureInvoice(p.queryId!, p.expectation);
  try {
    const result = await duringLock(
      "select singleton from private.payment_provider_configuration where singleton for update;",
      () => session.rpc("finish_payment_invoice", { target_query: p.queryId! }),
      `update private.payment_provider_configuration set scope_id='${f.otherScopeId}' where singleton;commit;`,
    );
    expect(result.error?.code).toBe("PT409");
  } finally {
    f.scope();
  }
});
