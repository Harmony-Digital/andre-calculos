import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { paymentObligationFixture } from "../e2e/payment-obligation-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import {
  createDurableAsaasFixturePort,
  getDurableFixtureTransportReceipt,
} from "@/modules/payments/asaas/fixture-port";
import { createAsaasFixtureAdapter } from "@/modules/payments/asaas/adapter";
import { paymentIntentReceiptSchema } from "@/modules/payments/intents";
let fixture: Awaited<ReturnType<typeof paymentObligationFixture>>;
let priorEnabled: boolean;
let baselineCredits = 0;
let baselineNotices = 0;
const customerInput = () => ({
  clientId: fixture.owner.id,
  kind: "person" as const,
  name: "Cliente inteiramente fictício",
  document: "11144477735",
});
const target = (slotId = randomUUID(), scopeId = fixture.scopeId) => ({
  scopeId,
  clientId: fixture.owner.id,
  slotId,
});
const adapter = async (input = target()) => {
  const port = await createDurableAsaasFixturePort(input);
  return createAsaasFixtureAdapter(port.scope, port);
};
const createdCustomer = async () => {
  const a = await adapter();
  const result = await a.createCustomer(customerInput());
  expect(result.kind).toBe("created");
  if (result.kind !== "created") throw new Error("Cliente fictício ausente.");
  return result.value;
};
const stats = () => {
  const value = JSON.parse(
    sql(`select json_build_object(
 'customers',(select count(*) from private.payment_fixture_customers where scope_id='${fixture.scopeId}'),
 'payments',(select count(*) from private.payment_fixture_payments where scope_id='${fixture.scopeId}'),
 'requests',(select count(*) from private.payment_fixture_requests where scope_id='${fixture.scopeId}'),
 'invocations',(select count(*) from private.payment_fixture_invocations i join private.payment_fixture_requests r on r.id=i.request_id where r.scope_id='${fixture.scopeId}'),
 'posts',(select count(*) from private.payment_fixture_invocations i join private.payment_fixture_requests r on r.id=i.request_id where r.scope_id='${fixture.scopeId}' and r.operation in('customer_create','payment_create')),
 'replays',(select count(*) from private.payment_fixture_invocations i join private.payment_fixture_requests r on r.id=i.request_id where r.scope_id='${fixture.scopeId}' and i.replayed),
 'credits',(select count(*) from public.payments p join public.orders o on o.id=p.order_id where o.client_id='${fixture.owner.id}'),
 'payment_notices',(select count(*) from public.notifications where template='payment_confirmed' and data->>'order_id' in(select id::text from public.orders where client_id='${fixture.owner.id}')));`),
  );
  return {
    ...value,
    credits: value.credits - baselineCredits,
    payment_notices: value.payment_notices - baselineNotices,
  };
};
const fault = (operation: string, behavior: string) =>
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior,calls_left) values('${fixture.scopeId}','${fixture.owner.id}','${operation}','${behavior}',1) on conflict(scope_id,client_id,operation) do update set behavior=excluded.behavior,calls_left=1;`,
  );
const paymentSetup = async (claim = true) => {
  const customer = await createdCustomer();
  sql(
    `delete from private.payment_provider_customers where id='${fixture.bindingId}'; insert into private.payment_provider_customers(id,scope_id,client_id,customer_id,kind,document) values('${fixture.bindingId}','${fixture.scopeId}','${fixture.owner.id}','${customer.customerId}','person','11144477735');`,
  );
  const sample = await fixture.create();
  const session = await quoteSession();
  let context;
  let intent;
  try {
    context = await fixture.prepare(sample, session);
    const reserved = await session.rpc("reserve_payment_intent", {
      target_context: context.id,
      request_id: randomUUID(),
    });
    expect(reserved.error).toBeNull();
    intent = paymentIntentReceiptSchema.parse(reserved.data).snapshot.intent;
  } finally {
    await session.auth.signOut({ scope: "local" });
  }
  if (claim)
    sql(
      `insert into private.payment_intent_dispatch_claims(intent_id,run_id) values('${intent.id}','${randomUUID()}');`,
    );
  return {
    sample,
    intent,
    customer,
    input: {
      customer: {
        scope: customer.scope,
        customerId: customer.customerId,
        clientId: customer.clientId,
        kind: customer.kind,
        document: customer.document,
      },
      reference: intent.id,
      contractedCents: context.snapshot.remainingCents!,
      dueDate: context.snapshot.dueDate,
      billingType: context.snapshot.billingType,
    },
    search: {
      scope: customer.scope,
      customerId: customer.customerId,
      reference: intent.id,
      contractedCents: context.snapshot.remainingCents!,
      dueDate: context.snapshot.dueDate,
      billingType: context.snapshot.billingType,
    },
  };
};
beforeEach(async () => {
  fixture = await paymentObligationFixture();
  baselineCredits = 0;
  baselineNotices = 0;
  const baseline = stats();
  baselineCredits = baseline.credits;
  baselineNotices = baseline.payment_notices;
  priorEnabled =
    sql(
      "select enabled from private.payment_fixture_environment where singleton;",
    ) === "t";
  sql(
    "update private.payment_fixture_environment set enabled=true where singleton;",
  );
});
afterEach(async () => {
  try {
    if (fixture) {
      const scopes = `'${fixture.scopeId}','${fixture.otherScopeId}'`;
      sql(`delete from public.audit_log where action='payment_fixture_transport' and target_id in(select id from private.payment_fixture_requests where scope_id in(${scopes}));
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
it("marker desligado e papéis públicos não obtêm transporte/recibo; tabelas privadas têm RLS sem grants", async () => {
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  await expect(adapter()).rejects.toThrow("Transporte fictício indisponível.");
  const session = await quoteSession();
  try {
    expect(
      (
        await session.rpc("get_payment_fixture_scope", {
          target_scope: fixture.scopeId,
          target_client: fixture.owner.id,
        })
      ).error,
    ).not.toBeNull();
    for (const signature of [
      "public.get_payment_fixture_scope(uuid,uuid)",
      "public.send_payment_fixture_request(uuid,uuid,uuid,uuid,text,text,jsonb)",
      "public.get_payment_fixture_receipt(uuid,uuid,uuid,uuid)",
    ])
      for (const role of ["anon", "authenticated"])
        expect(
          sql(
            `select has_function_privilege('${role}','${signature}','execute');`,
          ),
        ).toBe("f");
    expect(
      sql(
        "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'payment_fixture_%' and c.relrowsecurity;",
      ),
    ).toBe("6");
    expect(
      sql(
        "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name like 'payment_fixture_%' and grantee in('anon','authenticated','service_role');",
      ),
    ).toBe("0");
    expect(stats()).toMatchObject({
      customers: 0,
      payments: 0,
      requests: 0,
      invocations: 0,
    });
  } finally {
    await session.auth.signOut({ scope: "local" });
  }
});
it("replay em outra porta conserva cliente/recibo e conta ambas as invocações", async () => {
  const input = target(),
    a = await adapter(input),
    first = await a.createCustomer(customerInput());
  expect(first.kind).toBe("created");
  const receipt = await getDurableFixtureTransportReceipt({
    ...input,
    operation: "customer_create",
  });
  const another = await adapter(input),
    second = await another.createCustomer(customerInput());
  expect(second).toEqual(first);
  expect(
    await getDurableFixtureTransportReceipt({
      ...input,
      operation: "customer_create",
    }),
  ).toEqual(receipt);
  expect(stats()).toMatchObject({
    customers: 1,
    requests: 1,
    invocations: 2,
    posts: 2,
    replays: 1,
    credits: 0,
    payment_notices: 0,
  });
});
it("chave igual com corpo ou conta diferente conflita sem outro efeito", async () => {
  const input = target(),
    a = await adapter(input);
  expect((await a.createCustomer(customerInput())).kind).toBe("created");
  expect(
    (
      await a.createCustomer({
        ...customerInput(),
        name: "Outro nome fictício",
      })
    ).kind,
  ).toBe("indeterminate");
  const another = await adapter({ ...input, scopeId: fixture.otherScopeId });
  expect((await another.createCustomer(customerInput())).kind).toBe(
    "indeterminate",
  );
  expect(stats()).toMatchObject({
    customers: 1,
    requests: 1,
    invocations: 1,
    posts: 1,
  });
});
it("duas portas concorrentes com a mesma chave mantêm um fato e duas invocações", async () => {
  const input = target();
  const [a, b] = await Promise.all([adapter(input), adapter(input)]);
  const results = await Promise.all([
    a.createCustomer(customerInput()),
    b.createCustomer(customerInput()),
  ]);
  expect(results[0].kind).toBe("created");
  expect(results[1]).toEqual(results[0]);
  expect(stats()).toMatchObject({
    customers: 1,
    posts: 2,
    requests: 1,
    replays: 1,
  });
});
it("outro processo servidor recupera o recibo durável sem transportar outro POST", async () => {
  const input = target();
  expect(
    (await (await adapter(input)).createCustomer(customerInput())).kind,
  ).toBe("created");
  const receipt = await getDurableFixtureTransportReceipt({
    ...input,
    operation: "customer_create",
  });
  // Condição oficial do marcador server-only em um processo Node servidor.
  // Só IDs e PID saem do filho; corpo fiscal e ambiente nunca são impressos.
  const code = `import { getDurableFixtureTransportReceipt } from './src/modules/payments/asaas/fixture-port.ts';
    const r=await getDurableFixtureTransportReceipt(${JSON.stringify({ ...input, operation: "customer_create" })});
    if(!r) throw new Error('Recibo fictício ausente');
    process.stdout.write(JSON.stringify({pid:process.pid,requestId:r.requestId,recordedAt:r.recordedAt}));`;
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        code,
      ],
      { env: process.env, encoding: "utf8", timeout: 10000, maxBuffer: 4096 },
    ),
  );
  expect(result.pid).not.toBe(process.pid);
  expect(result.requestId).toBe(receipt!.requestId);
  expect(result.recordedAt).toBe(receipt!.recordedAt);
  expect(stats()).toMatchObject({
    customers: 1,
    posts: 1,
    requests: 1,
    invocations: 1,
  });
});
it.each(["lost_after_create", "invalid_after_create"])(
  "cliente persistido com falha %s é recuperado por consulta sem novo POST",
  async (behavior) => {
    const input = target(),
      a = await adapter(input);
    fault("customer_create", behavior);
    expect((await a.createCustomer(customerInput())).kind).toBe(
      "indeterminate",
    );
    expect(stats()).toMatchObject({ customers: 1, posts: 1 });
    expect(
      (await (await adapter(input)).createCustomer(customerInput())).kind,
    ).toBe("indeterminate");
    const found = await (
      await adapter()
    ).findCustomer({
      scope: a.scope,
      clientId: fixture.owner.id,
      kind: "person",
      document: "11144477735",
    });
    expect(found.kind).toBe("observed");
    expect(stats()).toMatchObject({ customers: 1, posts: 2, replays: 1 });
  },
);
it("IDs aleatórios e referência duplicada expõem múltiplos clientes e paginação incompleta", async () => {
  const a = await createdCustomer(),
    b = await createdCustomer();
  expect(a.customerId).not.toBe(b.customerId);
  const read = await adapter(),
    expectation = {
      scope: read.scope,
      clientId: fixture.owner.id,
      kind: "person",
      document: "11144477735",
    };
  expect(await read.findCustomer(expectation)).toMatchObject({
    kind: "reconcile",
    reason: "multiple_candidates",
  });
  await createdCustomer();
  expect(await (await adapter()).findCustomer(expectation)).toMatchObject({
    kind: "reconcile",
    reason: "incomplete_list",
  });
  expect(stats()).toMatchObject({ customers: 3, posts: 3 });
});
it.each(["not_dispatched", "indeterminate_before", "unavailable"])(
  "sem efeito no cliente: %s mantém distinção do resultado",
  async (behavior) => {
    fault("customer_create", behavior);
    const result = await (await adapter()).createCustomer(customerInput());
    expect(result.kind).toBe(
      behavior === "not_dispatched" ? "not_dispatched" : "indeterminate",
    );
    expect(stats()).toMatchObject({
      customers: 0,
      requests: 1,
      invocations: 1,
    });
  },
);
it("zero/404/lista incompleta permanecem resultados insuficientes", async () => {
  const a = await adapter(),
    search = {
      scope: a.scope,
      clientId: fixture.owner.id,
      kind: "person",
      document: "11144477735",
    };
  expect(await a.findCustomer(search)).toMatchObject({
    kind: "reconcile",
    reason: "not_located",
  });
  expect(
    await a.getCustomer({ ...search, customerId: "cus_ausente" }),
  ).toMatchObject({ kind: "reconcile", reason: "unavailable" });
  await createdCustomer();
  fault("customer_find", "incomplete_list");
  expect(await (await adapter()).findCustomer(search)).toMatchObject({
    kind: "reconcile",
    reason: "incomplete_list",
  });
});
it.each([
  { name: 123 },
  { document: 11144477735 },
  { email: null },
  { mobilePhone: 123 },
  { notificationDisabled: false },
])(
  "RPC interna rejeita tipos/flags fora do contrato %# sem efeito",
  async (patch) => {
    const result = await fixture.db.rpc("send_payment_fixture_request", {
      target_scope: fixture.scopeId,
      target_client: fixture.owner.id,
      slot_id: randomUUID(),
      request_id: randomUUID(),
      operation: "customer_create",
      fingerprint: "a".repeat(64),
      payload: {
        name: "Cliente fictício",
        document: "11144477735",
        reference: fixture.owner.id,
        notificationDisabled: true,
        ...patch,
      },
    });
    expect(result.error).not.toBeNull();
    expect(stats()).toMatchObject({
      customers: 0,
      requests: 0,
      invocations: 0,
    });
  },
);
it("pagamento requer claim e não o cria; depois registra valor exato sem crédito/fila/aviso", async () => {
  const setup = await paymentSetup(false),
    a = await adapter();
  expect((await a.createPayment(setup.input)).kind).toBe("indeterminate");
  expect(stats()).toMatchObject({
    payments: 0,
    credits: 0,
    payment_notices: 0,
  });
  expect(
    sql(
      `select count(*) from private.payment_intent_dispatch_claims where intent_id='${setup.intent.id}';`,
    ),
  ).toBe("0");
  sql(
    `insert into private.payment_intent_dispatch_claims(intent_id,run_id) values('${setup.intent.id}','${randomUUID()}');`,
  );
  const result = await (await adapter()).createPayment(setup.input);
  expect(result.kind).toBe("created");
  if (result.kind !== "created") throw new Error("Pagamento fictício ausente.");
  expect(result.value).toMatchObject({
    valueCents: 12501,
    status: "PENDING",
    dueDate: "2026-10-20",
    reference: setup.intent.id,
  });
  expect(stats()).toMatchObject({
    payments: 1,
    credits: 0,
    payment_notices: 0,
  });
  expect(
    sql(
      `select count(*) from private.payment_intent_reservations where intent_id='${setup.intent.id}';`,
    ),
  ).toBe("1");
});
it("pagamento com resposta perdida resiste à nova porta e é encontrado sem novo POST", async () => {
  const setup = await paymentSetup(),
    a = await adapter();
  fault("payment_create", "lost_after_create");
  expect((await a.createPayment(setup.input)).kind).toBe("indeterminate");
  const before = stats();
  const found = await (await adapter()).findPayment(setup.search);
  expect(found.kind).toBe("observed");
  expect(stats()).toMatchObject({
    payments: 1,
    posts: before.posts,
    credits: 0,
    payment_notices: 0,
  });
});
it("pagamento duplicável torna dois POSTs distintos visíveis na conciliação", async () => {
  const setup = await paymentSetup();
  const first = await (await adapter()).createPayment(setup.input),
    second = await (await adapter()).createPayment(setup.input);
  expect(first.kind).toBe("created");
  expect(second.kind).toBe("created");
  if (first.kind !== "created" || second.kind !== "created")
    throw new Error("Pagamentos fictícios ausentes.");
  expect(first.value.paymentId).not.toBe(second.value.paymentId);
  expect(await (await adapter()).findPayment(setup.search)).toMatchObject({
    kind: "reconcile",
    reason: "multiple_candidates",
  });
  expect(stats()).toMatchObject({
    payments: 2,
    posts: 3,
    credits: 0,
    payment_notices: 0,
  });
});
it("valor, meio ou vencimento divergentes e notificações habilitadas não criam cobrança", async () => {
  const setup = await paymentSetup(),
    before = stats();
  for (const patch of [
    { contractedCents: 1 },
    { billingType: "BOLETO" },
    { dueDate: "2026-10-21" },
  ])
    expect(
      (await (await adapter()).createPayment({ ...setup.input, ...patch }))
        .kind,
    ).toBe("indeterminate");
  sql(
    `update private.payment_fixture_customers set notification_disabled=false where id='${setup.customer.customerId}';`,
  );
  expect((await (await adapter()).createPayment(setup.input)).kind).toBe(
    "not_dispatched",
  );
  expect(stats()).toMatchObject({
    payments: 0,
    posts: before.posts,
    credits: 0,
    payment_notices: 0,
  });
});
it.each([
  { amountCents: "12501" },
  { amountCents: null },
  { billingType: 123 },
  { dueDate: null },
])(
  "RPC interna do pagamento rejeita tipo inválido %# sem efeito",
  async (patch) => {
    const setup = await paymentSetup();
    const result = await fixture.db.rpc("send_payment_fixture_request", {
      target_scope: fixture.scopeId,
      target_client: fixture.owner.id,
      slot_id: randomUUID(),
      request_id: randomUUID(),
      operation: "payment_create",
      fingerprint: "a".repeat(64),
      payload: {
        customerId: setup.customer.customerId,
        reference: setup.intent.id,
        amountCents: 12501,
        billingType: "PIX",
        dueDate: "2026-10-20",
        ...patch,
      },
    });
    expect(result.error).not.toBeNull();
    expect(stats()).toMatchObject({
      payments: 0,
      credits: 0,
      payment_notices: 0,
    });
  },
);
