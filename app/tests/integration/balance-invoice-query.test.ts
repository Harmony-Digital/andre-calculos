import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => session,
}));
vi.mock("@/modules/auth/session", () => ({
  authorize: async (roles: readonly string[]) => {
    const user = (await session.auth.getUser()).data.user;
    const profile = user
      ? await session
          .from("profiles")
          .select("id,role")
          .eq("id", user.id)
          .single()
      : null;
    if (!profile?.data || !roles.includes(profile.data.role))
      throw new Error("Acesso não autorizado.");
    return { profile: profile.data };
  },
}));
import { balanceJourneyFixture } from "../e2e/balance-journey-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import {
  getPaymentInvoice,
  readFixtureInvoice,
} from "@/modules/payments/invoice-query";
import { parseInvoicePresentation } from "@/modules/payments/invoice-presentation";
import { resolveFixtureFinancialApplication } from "@/modules/payments/financial-resolution";
let f: Awaited<ReturnType<typeof balanceJourneyFixture>> | undefined;
let session: Awaited<ReturnType<typeof quoteSession>>;
async function setup(method = "PIX") {
  f = await balanceJourneyFixture(method);
  await f.reserve();
  await f.advance();
  await f.capture();
  await f.observe("pending");
  await f.apply();
  session = await quoteSession();
  return f;
}
afterEach(async () => {
  await session?.auth.signOut({ scope: "local" });
  await f?.cleanup();
  f = undefined;
}, 60000);
const read = () =>
  getPaymentInvoice(
    f!.signal.sample.order_id,
    f!.signal.sample.process_id,
    "balance",
  );
async function prepare() {
  const r = await session.rpc("prepare_payment_balance_invoice", {
    target_order: f!.signal.sample.order_id,
  });
  expect(r.error).toBeNull();
  return r.data as unknown as {
    queryId: string;
    expectation: unknown;
    scope: unknown;
  };
}
const financialState = () =>
  sql(`select md5(json_build_object(
 'runs',(select json_agg(row_to_json(r) order by r.id) from private.payment_execution_runs r where scope_id='${f!.signal.scopeId}'),
 'credit',private.order_payment_credit('${f!.signal.sample.order_id}'),
 'payments',(select json_agg(row_to_json(p) order by p.id) from public.payments p where order_id='${f!.signal.sample.order_id}'),
 'reservations',(select json_agg(row_to_json(r) order by r.intent_id) from private.payment_intent_reservations r where order_id='${f!.signal.sample.order_id}'),
 'posts',(select count(*) from private.payment_fixture_invocations v join private.payment_fixture_requests r on r.id=v.request_id where r.operation='payment_create' and r.payload->>'reference'='${f!.ids().intentId}'))::text);`);
it.each(["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"])(
  "%s consulta só fatura do saldo sem emitir ou creditar",
  async (method) => {
    const b = await setup(method),
      before = financialState();
    const result = await read();
    expect(result).toMatchObject({
      phase: "balance",
      state: "active",
      reason: "pending",
      invoiceAmountCents: 12500,
      remainingCents: null,
      billingType: method,
    });
    expect(result.invoiceUrl).toBe(
      `https://sandbox.asaas.com/i/${b.ids().paymentId}`,
    );
    expect(financialState()).toBe(before);
    const signal = await getPaymentInvoice(
      b.signal.sample.order_id,
      b.signal.sample.process_id,
    );
    expect(signal.phase).toBe("deposit");
    expect(signal.invoiceUrl).toBeNull();
    expect(signal.state).not.toBe("active");
    const stored = sql(
      `select coalesce(json_agg(row_to_json(q))::text,'[]') from private.payment_invoice_queries q where order_id='${b.signal.sample.order_id}';`,
    );
    expect(stored).toContain('"phase":"balance"');
    expect(stored).not.toMatch(
      /https?:|invoiceUrl|bodyText|cpfCnpj|document|email|mobilePhone/,
    );
  },
  60000,
);
it("calculista consulta saldo atual do proprietário", async () => {
  await setup();
  await session.auth.signOut({ scope: "local" });
  session = await quoteSession("calculator");
  expect(await read()).toMatchObject({ phase: "balance", state: "active" });
});
it.each(["clientB", "admin"] as const)(
  "%s não recebe fatura de saldo nem cria query",
  async (role) => {
    const b = await setup();
    await session.auth.signOut({ scope: "local" });
    session = await quoteSession(role);
    await expect(read()).rejects.toThrow();
    expect(
      sql(
        `select count(*) from private.payment_invoice_queries where order_id='${b.signal.sample.order_id}';`,
      ),
    ).toBe("0");
  },
);
it("anon/service_role não preparam saldo; sessão não usa transporte ou writer", async () => {
  const b = await setup(),
    q = await prepare();
  expect(
    (
      await session.rpc("read_payment_invoice_fixture", {
        target_query: q.queryId,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await session.rpc("record_payment_invoice_result", {
        target_query: q.queryId,
        available: true,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await b.signal.db.rpc("finish_payment_invoice", {
        target_query: q.queryId,
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await b.signal.db.rpc("prepare_payment_balance_invoice", {
        target_order: b.signal.sample.order_id,
      })
    ).error,
  ).not.toBeNull();
  await session.auth.signOut({ scope: "local" });
  expect(
    (
      await session.rpc("prepare_payment_balance_invoice", {
        target_order: b.signal.sample.order_id,
      })
    ).error,
  ).not.toBeNull();
});
it("fase persistida não pode ser trocada nem apontar à cobrança de outra fase", async () => {
  await setup();
  const q = await prepare();
  expect(() =>
    sql(
      `update private.payment_invoice_queries set phase='deposit' where id='${q.queryId}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `insert into private.payment_invoice_queries(order_id,charge_id,actor_id,owner_id,context_hash,phase) select order_id,charge_id,actor_id,owner_id,context_hash,'deposit' from private.payment_invoice_queries where id='${q.queryId}';`,
    ),
  ).toThrow();
  const invoice = await readFixtureInvoice(q.queryId, q.expectation);
  const current = await session.rpc("finish_payment_invoice", {
    target_query: q.queryId,
  });
  expect(current.error).toBeNull();
  const presentation = (
    current.data as unknown as { presentation: Record<string, unknown> }
  ).presentation;
  const result = {
    ...presentation,
    invoiceUrl: invoice.kind === "observed" ? invoice.value : null,
  };
  const expected = {
    orderId: f!.signal.sample.order_id,
    processId: f!.signal.sample.process_id,
    scope: q.scope,
  };
  expect(() => parseInvoicePresentation(result, expected)).toThrow();
  expect(
    parseInvoicePresentation(result, { ...expected, phase: "balance" }).phase,
  ).toBe("balance");
});
it("entrega retirada entre leitura e conclusão revoga a query de saldo", async () => {
  const b = await setup(),
    q = await prepare();
  await readFixtureInvoice(q.queryId, q.expectation);
  sql(
    `delete from public.deliveries where order_id='${b.signal.sample.order_id}';`,
  );
  expect(
    (await session.rpc("finish_payment_invoice", { target_query: q.queryId }))
      .error?.code,
  ).toBe("PT409");
  expect(await read()).toMatchObject({
    phase: "balance",
    state: "blocked",
    reason: "phase_unavailable",
    invoiceUrl: null,
  });
});
it("refund atual do sinal impede retornar fatura de saldo no valor anterior", async () => {
  const b = await setup(),
    q = await prepare();
  await readFixtureInvoice(q.queryId, q.expectation);
  await b.signal.observe("refund_partial");
  await b.signal.apply();
  expect(
    (await session.rpc("finish_payment_invoice", { target_query: q.queryId }))
      .error?.code,
  ).toBe("PT409");
  expect(await read()).toMatchObject({
    phase: "balance",
    state: "uncertain",
    remainingCents: null,
    invoiceUrl: null,
  });
  expect(b.view().projection.depositCreditCents).toBe(11500);
});
it("observação nova não aplicada do sinal bloqueia fatura do saldo até rederivar", async () => {
  const b = await setup();
  await b.signal.observe("received");
  expect(await read()).toMatchObject({
    state: "uncertain",
    remainingCents: null,
    invoiceUrl: null,
  });
  await b.signal.apply();
  expect((await read()).state).toBe("active");
});
it("perda da resposta e reenvio criam novas consultas sem repetir emissão", async () => {
  const b = await setup(),
    before = financialState(),
    first = await read();
  expect((await read()).invoiceUrl).toBe(first.invoiceUrl);
  expect(financialState()).toBe(before);
  expect(
    sql(
      `select count(*) from private.payment_invoice_queries where order_id='${b.signal.sample.order_id}' and phase='balance' and completed_at is not null;`,
    ),
  ).toBe("2");
});
it("404 do provedor mantém incerteza; nova consulta recupera fatura atual", async () => {
  const b = await setup();
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior,calls_left) values('${b.signal.scopeId}','${b.signal.owner.id}','payment_get','not_found',1);`,
  );
  expect(await read()).toMatchObject({
    phase: "balance",
    state: "uncertain",
    remainingCents: null,
    invoiceUrl: null,
  });
  expect((await read()).state).toBe("active");
  expect(b.view().posts).toBe(1);
});
it("saldo recebido não oferece outro pagamento; sinal continua separado", async () => {
  const b = await setup();
  await b.receive();
  expect(await read()).toMatchObject({
    phase: "balance",
    state: "paid",
    remainingCents: 0,
    invoiceAmountCents: null,
    invoiceUrl: null,
  });
  expect(
    await getPaymentInvoice(
      b.signal.sample.order_id,
      b.signal.sample.process_id,
    ),
  ).toMatchObject({ phase: "deposit", state: "paid" });
  expect(b.view().projection.depositCreditCents).toBe(12501);
});
it("saldo parcial informa restante conhecido e bloqueia fatura no valor antigo", async () => {
  const b = await setup();
  await b.receive("partial");
  expect(await read()).toMatchObject({
    phase: "balance",
    state: "blocked",
    reason: "context_changed",
    remainingCents: 1000,
    invoiceUrl: null,
  });
});
it("estorno integral do recebido libera proteção e não revive fatura antiga", async () => {
  const b = await setup();
  await b.receive("partial");
  await b.observe("refund");
  const a = await b.apply();
  await resolveFixtureFinancialApplication({
    applicationRequestId: a.requestId,
    requestId: randomUUID(),
  });
  expect(await read()).toMatchObject({
    state: "blocked",
    remainingCents: 12500,
    invoiceUrl: null,
  });
});
it("status desconhecido do saldo impede URL e certeza zero", async () => {
  const b = await setup();
  await b.observe("unknown");
  await b.apply();
  expect(await read()).toMatchObject({
    state: "uncertain",
    remainingCents: null,
    invoiceAmountCents: null,
    invoiceUrl: null,
  });
});
it("consulta expirada não finaliza, nova tentativa reconfere saldo", async () => {
  await setup();
  const q = await prepare();
  await readFixtureInvoice(q.queryId, q.expectation);
  sql(
    `update private.payment_invoice_queries set expires_at=clock_timestamp()-interval '1 second' where id='${q.queryId}';`,
  );
  expect(
    (await session.rpc("finish_payment_invoice", { target_query: q.queryId }))
      .error?.code,
  ).toBe("PT409");
  expect((await read()).state).toBe("active");
});
it("papel revogado e conta alterada durante a consulta impedem retorno antigo", async () => {
  const b = await setup(),
    q = await prepare();
  await readFixtureInvoice(q.queryId, q.expectation);
  try {
    sql(
      `update public.profiles set role='admin' where id='${b.signal.owner.owner_id}';`,
    );
    expect(
      (await session.rpc("finish_payment_invoice", { target_query: q.queryId }))
        .error,
    ).not.toBeNull();
  } finally {
    sql(
      `update public.profiles set role='client' where id='${b.signal.owner.owner_id}';`,
    );
  }
  const current = await prepare();
  await readFixtureInvoice(current.queryId, current.expectation);
  b.signal.scope(b.signal.otherScopeId);
  try {
    expect(
      (
        await session.rpc("finish_payment_invoice", {
          target_query: current.queryId,
        })
      ).error?.code,
    ).toBe("PT409");
  } finally {
    b.signal.scope();
  }
});
it("erro de auditoria reverte conclusão da fatura, mesma query recupera depois", async () => {
  const b = await setup(),
    q = await prepare();
  await readFixtureInvoice(q.queryId, q.expectation);
  const name = "balance_invoice_audit_" + randomUUID().replaceAll("-", "");
  try {
    sql(
      `create function private.${name}() returns trigger language plpgsql set search_path='' as $$ begin if new.action='payment_invoice_viewed' and new.target_id='${b.signal.sample.order_id}' then raise exception 'Falha ficticia'; end if;return new;end $$;create trigger ${name} before insert on public.audit_log for each row execute function private.${name}();`,
    );
    expect(
      (await session.rpc("finish_payment_invoice", { target_query: q.queryId }))
        .error,
    ).not.toBeNull();
    expect(
      sql(
        `select completed_at is null from private.payment_invoice_queries where id='${q.queryId}';`,
      ),
    ).toBe("t");
    expect(
      sql(
        `select count(*) from public.audit_log where action='payment_invoice_viewed' and target_id='${b.signal.sample.order_id}';`,
      ),
    ).toBe("0");
    sql(
      `drop trigger ${name} on public.audit_log;drop function private.${name}();`,
    );
    expect(
      (await session.rpc("finish_payment_invoice", { target_query: q.queryId }))
        .error,
    ).toBeNull();
    expect(
      sql(
        `select completed_at is not null from private.payment_invoice_queries where id='${q.queryId}';`,
      ),
    ).toBe("t");
  } finally {
    sql(
      `drop trigger if exists ${name} on public.audit_log;drop function if exists private.${name}();`,
    );
  }
});
it("consultas simultâneas têm queries distintas sem alterar posição ou emissão", async () => {
  const b = await setup(),
    before = financialState();
  const results = await Promise.all([read(), read()]);
  expect(results.map((v) => v.state)).toEqual(["active", "active"]);
  expect(financialState()).toBe(before);
  expect(
    sql(
      `select count(distinct id) from private.payment_invoice_queries where order_id='${b.signal.sample.order_id}' and phase='balance' and completed_at is not null;`,
    ),
  ).toBe("2");
});
it("nova cobrança após estorno completo usa reserva atual e conserva histórico", async () => {
  const b = await setup();
  await b.receive("partial");
  await b.observe("refund");
  const a = await b.apply();
  await resolveFixtureFinancialApplication({
    applicationRequestId: a.requestId,
    requestId: randomUUID(),
  });
  const oldPayment = b.ids().paymentId;
  await b.reserve();
  await b.advance();
  await b.capture();
  await b.observe("pending");
  await b.apply();
  expect(b.ids().paymentId).not.toBe(oldPayment);
  expect(await read()).toMatchObject({
    phase: "balance",
    state: "active",
    invoiceAmountCents: 12500,
    remainingCents: null,
    invoiceUrl: `https://sandbox.asaas.com/i/${b.ids().paymentId}`,
  });
  expect(
    sql(
      `select count(*) from private.payment_financial_charges where order_id='${b.signal.sample.order_id}';`,
    ),
  ).toBe("3");
  expect(b.view().projection.depositCreditCents).toBe(12501);
});
it("contrato dispensa sinal mas não dispensa a dívida do saldo", async () => {
  f = await balanceJourneyFixture();
  const b = f,
    calc = await quoteSession("calculator"),
    request = randomUUID();
  session = await quoteSession();
  try {
    const r = await calc.rpc("set_client_contract", {
      target_client: b.signal.owner.id,
      has_contract: true,
      expected_revision: Number(
        sql(
          `select contract_revision from public.clients where id='${b.signal.owner.id}';`,
        ),
      ),
      request_id: request,
      reason: "Condição exclusivamente fictícia da fatura de saldo",
    });
    expect(r.error).toBeNull();
    await b.reserve();
    await b.advance();
    await b.capture();
    await b.observe("pending");
    await b.apply();
    expect(await read()).toMatchObject({
      phase: "balance",
      state: "active",
      invoiceAmountCents: 12500,
    });
  } finally {
    await calc.auth.signOut({ scope: "local" });
    sql(
      `delete from public.audit_log where action='client_contract_changed' and target_id='${request}';delete from private.client_contract_changes where id='${request}';`,
    );
  }
});
it("proposta gratuita informa ausência de saldo sem simular pagamento", async () => {
  f = await balanceJourneyFixture();
  session = await quoteSession();
  const sample = await f.signal.create({ zero: true });
  await f.signal.deliver(sample);
  expect(
    await getPaymentInvoice(sample.order_id, sample.process_id, "balance"),
  ).toMatchObject({
    phase: "balance",
    state: "blocked",
    reason: "no_balance",
    remainingCents: 0,
    invoiceAmountCents: null,
    invoiceUrl: null,
  });
});
