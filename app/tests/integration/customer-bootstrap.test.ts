import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { provisionLocalUser } from "../../scripts/provision-local-user";
import { removeLocalUser } from "../e2e/local-helper";
import { paymentObligationFixture } from "../e2e/payment-obligation-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import {
  customerBootstrapViewSchema,
  advanceFixturePaymentCustomer,
} from "@/modules/payments/customer-bootstrap";
import { createDurableAsaasFixturePort } from "@/modules/payments/asaas/fixture-port";
import { createAsaasFixtureAdapter } from "@/modules/payments/asaas/adapter";
let fixture: Awaited<ReturnType<typeof paymentObligationFixture>>;
let priorEnabled: boolean;
let extraOwner: string | undefined;
async function requested(
  requestId: string = randomUUID(),
  role: "client" | "calculator" | "clientB" | "admin" = "client",
) {
  const db = await quoteSession(role);
  try {
    const r = await db.rpc("request_payment_customer", {
      target_client: fixture.owner.id,
      request_id: requestId,
    });
    expect(r.error).toBeNull();
    return customerBootstrapViewSchema.parse(r.data);
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
}
const stats = () =>
  JSON.parse(
    sql(`select json_build_object(
 'work',(select count(*) from private.payment_customer_work where scope_id='${fixture.scopeId}'),
 'bindings',(select count(*) from private.payment_provider_customers where scope_id='${fixture.scopeId}'),
 'customers',(select count(*) from private.payment_fixture_customers where scope_id='${fixture.scopeId}'),
 'posts',(select count(*) from private.payment_fixture_invocations i join private.payment_fixture_requests r on r.id=i.request_id where r.scope_id='${fixture.scopeId}' and r.operation='customer_create'),
 'getSlots',(select count(distinct slot_id) from private.payment_fixture_requests where scope_id='${fixture.scopeId}' and operation='customer_find'));`),
  );
const fault = (operation: string, behavior: string) =>
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior,calls_left) values('${fixture.scopeId}','${fixture.owner.id}','${operation}','${behavior}',1) on conflict(scope_id,client_id,operation) do update set behavior=excluded.behavior,calls_left=1;`,
  );
async function fakeCustomer() {
  const port = await createDurableAsaasFixturePort({
    scopeId: fixture.scopeId,
    clientId: fixture.owner.id,
    slotId: randomUUID(),
  });
  const r = await createAsaasFixtureAdapter(port.scope, port).createCustomer({
    clientId: fixture.owner.id,
    kind: "person",
    document: "11144477735",
    name: "Cliente inteiramente fictício",
  });
  expect(r.kind).toBe("created");
  if (r.kind !== "created") throw new Error("Cliente fictício ausente");
  return r.value;
}
async function claim(requestId: string) {
  const worker = randomUUID();
  const r = await fixture.db.rpc("claim_payment_customer_step", {
    target_request: requestId,
    worker_id: worker,
  });
  expect(r.error).toBeNull();
  return {
    worker,
    step: (
      r.data as unknown as {
        step: { id: string; action: string; scope: unknown };
      }
    ).step,
  };
}
async function start(c: Awaited<ReturnType<typeof claim>>) {
  const r = await fixture.db.rpc("start_payment_customer_step", {
    target_step: c.step.id,
    worker_id: c.worker,
  });
  expect(r.error).toBeNull();
  return r.data;
}
async function sendFind(c: Awaited<ReturnType<typeof claim>>) {
  const port = await createDurableAsaasFixturePort({
    scopeId: fixture.scopeId,
    clientId: fixture.owner.id,
    slotId: c.step.id,
  });
  return createAsaasFixtureAdapter(port.scope, port).findCustomer({
    scope: port.scope,
    clientId: fixture.owner.id,
    kind: "person",
    document: "11144477735",
  });
}
async function finish(c: Awaited<ReturnType<typeof claim>>) {
  const r = await fixture.db.rpc("finish_payment_customer_step", {
    target_step: c.step.id,
    worker_id: c.worker,
  });
  expect(r.error).toBeNull();
  return customerBootstrapViewSchema.parse(r.data);
}
beforeEach(async () => {
  extraOwner = undefined;
  fixture = await paymentObligationFixture();
  sql(
    `delete from private.payment_provider_customers where id='${fixture.bindingId}';`,
  );
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
      sql(`delete from public.audit_log where action like 'payment_customer_%' and target_id in(
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
    try {
      if (fixture) await fixture.cleanup();
    } finally {
      if (extraOwner) await removeLocalUser(extraOwner);
    }
  }
});
it("sem binding pré-semeado: solicitar, buscar zero, criar, vincular e preparar G, com um POST", async () => {
  expect(fixture.owner.id).not.toBe(fixture.owner.owner_id);
  const r = await requested();
  expect(r.currentOwnerId).toBe(fixture.owner.owner_id);
  expect(stats()).toMatchObject({ bindings: 0, customers: 0, posts: 0 });
  expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe(
    "ready_to_create",
  );
  const bound = await advanceFixturePaymentCustomer(r.requestId);
  expect(bound.state).toBe("bound");
  expect(stats()).toMatchObject({
    work: 1,
    bindings: 1,
    customers: 1,
    posts: 1,
  });
  const sample = await fixture.create(),
    db = await quoteSession();
  try {
    const g = await fixture.prepare(sample, db);
    expect(g.snapshot.status).toBe("ready");
    expect(g.snapshot.binding!.clientId).toBe(fixture.owner.id);
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  expect(
    sql(
      `select count(*) from public.audit_log where action='payment_customer_bound' and target_id='${r.requestId}' and actor_id is null;`,
    ),
  ).toBe("1");
});
it("replay humano e solicitações concorrentes convergem para uma operação e uma criação", async () => {
  const r = await requested();
  await requested(r.requestId);
  await requested();
  expect(stats().work).toBe(1);
  await Promise.all([
    advanceFixturePaymentCustomer(r.requestId),
    advanceFixturePaymentCustomer(r.requestId),
  ]).catch(() => {});
  // Uma etapa de leitura atrasada pode ser cercada; retomada usa nova observação.
  for (let i = 0; i < 4; i++) {
    if ((await advanceFixturePaymentCustomer(r.requestId)).state === "bound")
      break;
  }
  expect(stats()).toMatchObject({
    work: 1,
    bindings: 1,
    customers: 1,
    posts: 1,
  });
});
it("resposta perdida depois da criação: nova consulta encontra o cliente sem outro POST", async () => {
  const r = await requested();
  await advanceFixturePaymentCustomer(r.requestId);
  fault("customer_create", "lost_after_create");
  expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe("held");
  const recovered = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import {advanceFixturePaymentCustomer} from './src/modules/payments/customer-bootstrap-worker.ts'; const value=await advanceFixturePaymentCustomer(${JSON.stringify(r.requestId)}); process.stdout.write(JSON.stringify({pid:process.pid,requestId:value.requestId,state:value.state}));`,
      ],
      {
        env: process.env,
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 4096,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  expect(recovered).toMatchObject({ requestId: r.requestId, state: "bound" });
  expect(recovered.pid).not.toBe(process.pid);
  expect(stats()).toMatchObject({
    posts: 1,
    customers: 1,
    getSlots: 2,
    bindings: 1,
  });
});
it.each(["indeterminate_before", "not_dispatched"])(
  "%s conserva claim; zero posterior não permite novo POST",
  async (behavior) => {
    const r = await requested();
    await advanceFixturePaymentCustomer(r.requestId);
    fault("customer_create", behavior);
    expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe(
      "held",
    );
    for (let i = 0; i < 2; i++)
      expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe(
        "held",
      );
    expect(stats()).toMatchObject({
      posts: 1,
      customers: 0,
      bindings: 0,
      getSlots: 3,
    });
  },
);
it("queda após alocação e antes de start retoma busca e permite somente primeiro POST", async () => {
  const r = await requested();
  await advanceFixturePaymentCustomer(r.requestId);
  const c = await claim(r.requestId);
  expect(c.step.action).toBe("create");
  expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe(
    "ready_to_create",
  );
  expect(await start(c)).toBe(false);
  expect(stats()).toMatchObject({ posts: 0, customers: 0, bindings: 0 });
  expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe(
    "bound",
  );
  expect(stats()).toMatchObject({ posts: 1, customers: 1, bindings: 1 });
});
it("start consumível e worker incorreto não recebem permissão de repetir a etapa", async () => {
  const r = await requested(),
    c = await claim(r.requestId);
  expect(await start(c)).toBe(true);
  expect(await start(c)).toBe(false);
  const bad = await fixture.db.rpc("start_payment_customer_step", {
    target_step: c.step.id,
    worker_id: randomUUID(),
  });
  expect(bad.data).toBe(false);
  await sendFind(c);
  expect((await finish(c)).state).toBe("ready_to_create");
  expect((await finish(c)).state).toBe("ready_to_create");
});
it("queda após start consumido consulta e conserva pendência sem autorizar outro POST", async () => {
  const r = await requested();
  await advanceFixturePaymentCustomer(r.requestId);
  const c = await claim(r.requestId);
  expect(c.step.action).toBe("create");
  expect(await start(c)).toBe(true);
  for (let i = 0; i < 2; i++)
    expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe(
      "held",
    );
  expect(await start(c)).toBe(false);
  expect(stats()).toMatchObject({ posts: 0, customers: 0, bindings: 0 });
});
it("worker atrasado não sobrescreve leitura mais recente", async () => {
  const r = await requested(),
    c = await claim(r.requestId);
  await start(c);
  await sendFind(c);
  await fakeCustomer();
  expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe(
    "bound",
  );
  expect((await finish(c)).state).toBe("bound");
  expect(stats().bindings).toBe(1);
});
it.each(["not_found", "unavailable", "incomplete_list"])(
  "consulta %s não autoriza criação",
  async (behavior) => {
    const r = await requested();
    fault("customer_find", behavior);
    expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe(
      "held",
    );
    expect(stats().posts).toBe(0);
  },
);
it("candidatos múltiplos não vinculam", async () => {
  await fakeCustomer();
  await fakeCustomer();
  const r = await requested();
  const v = await advanceFixturePaymentCustomer(r.requestId);
  expect(v).toMatchObject({ state: "held", reason: "multiple_candidates" });
  expect(stats()).toMatchObject({ bindings: 0, posts: 2 });
});
it("cliente existente com notificações ativas não vincula", async () => {
  const c = await fakeCustomer();
  sql(
    `update private.payment_fixture_customers set notification_disabled=false where id='${c.customerId}';`,
  );
  const r = await requested();
  expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe("held");
  expect(stats().bindings).toBe(0);
});
it("binding existente válido exige GET e não gera criação", async () => {
  const c = await fakeCustomer();
  sql(
    `insert into private.payment_provider_customers(id,scope_id,client_id,customer_id,kind,document) values('${fixture.bindingId}','${fixture.scopeId}','${fixture.owner.id}','${c.customerId}','person','11144477735');`,
  );
  const r = await requested();
  expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe(
    "bound",
  );
  const another = await requested();
  expect(another.state).toBe("pending");
  expect((await advanceFixturePaymentCustomer(another.requestId)).state).toBe(
    "bound",
  );
  expect(stats()).toMatchObject({ posts: 1, bindings: 1 });
  expect(
    sql(
      `select count(*) from private.payment_fixture_requests where scope_id='${fixture.scopeId}' and operation='customer_get';`,
    ),
  ).toBe("2");
});
it("binding existente com GET404 é preservado e não substituído", async () => {
  sql(
    `insert into private.payment_provider_customers(id,scope_id,client_id,customer_id,kind,document) values('${fixture.bindingId}','${fixture.scopeId}','${fixture.owner.id}','cus_ausente','person','11144477735');`,
  );
  const r = await requested();
  for (let i = 0; i < 2; i++)
    expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe(
      "held",
    );
  expect(stats()).toMatchObject({ posts: 0, bindings: 1, customers: 0 });
  expect(
    sql(
      `select customer_id from private.payment_provider_customers where id='${fixture.bindingId}';`,
    ),
  ).toBe("cus_ausente");
});
it.each(["document", "kind", "owner", "scope"])(
  "%s alterado antes da finalização bloqueia binding",
  async (field) => {
    const r = await requested(),
      c = await claim(r.requestId);
    await start(c);
    await fakeCustomer();
    await sendFind(c);
    if (field === "document")
      sql(
        `update public.clients set document='52998224725' where id='${fixture.owner.id}';`,
      );
    else if (field === "kind")
      sql(
        `update public.clients set kind='company' where id='${fixture.owner.id}';`,
      );
    else if (field === "scope") fixture.scope(fixture.otherScopeId);
    else {
      const created = await provisionLocalUser({
        email: "owner-" + randomUUID() + "@exemplo.com",
        email_confirm: true,
        user_metadata: { full_name: "Proprietário fictício alternativo" },
      });
      extraOwner = created.data.user!.id;
      sql(
        `delete from public.clients where owner_id='${extraOwner}'; update public.clients set owner_id='${extraOwner}' where id='${fixture.owner.id}';`,
      );
    }
    expect(await finish(c)).toMatchObject({
      state: "held",
      reason: "context_changed",
    });
    expect(stats().bindings).toBe(0);
    if (field === "owner") {
      const old = await quoteSession();
      try {
        expect(
          (
            await old.rpc("get_payment_customer_request", {
              target_request: r.requestId,
            })
          ).error,
        ).not.toBeNull();
        expect(
          (
            await old.rpc("request_payment_customer", {
              target_client: fixture.owner.id,
              request_id: r.requestId,
            })
          ).error,
        ).not.toBeNull();
      } finally {
        await old.auth.signOut({ scope: "local" });
      }
    }
  },
);
it("autorização cruzada e papéis internos/públicos negados, getters sem dados privados", async () => {
  const r = await requested();
  for (const role of ["clientB", "admin"] as const) {
    const db = await quoteSession(role);
    try {
      expect(
        (
          await db.rpc("request_payment_customer", {
            target_client: fixture.owner.id,
            request_id: randomUUID(),
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await db.rpc("get_payment_customer_request", {
            target_request: r.requestId,
          })
        ).error,
      ).not.toBeNull();
    } finally {
      await db.auth.signOut({ scope: "local" });
    }
  }
  const db = await quoteSession();
  try {
    expect(
      (
        await db.rpc("claim_payment_customer_step", {
          target_request: r.requestId,
          worker_id: randomUUID(),
        })
      ).error,
    ).not.toBeNull();
    const view = (
      await db.rpc("get_payment_customer_request", {
        target_request: r.requestId,
      })
    ).data;
    expect(customerBootstrapViewSchema.safeParse(view).success).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(
      /11144477735|bodyText|customerId|scopeId|invoiceUrl/,
    );
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
  expect(
    (
      await fixture.db.rpc("request_payment_customer", {
        target_client: fixture.owner.id,
        request_id: randomUUID(),
      })
    ).error,
  ).not.toBeNull();
  for (const table of [
    "payment_customer_work",
    "payment_customer_requests",
    "payment_customer_steps",
  ]) {
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
it("marker desligado nega worker sem alterar fatos", async () => {
  const r = await requested();
  sql(
    "update private.payment_fixture_environment set enabled=false where singleton;",
  );
  await expect(advanceFixturePaymentCustomer(r.requestId)).rejects.toThrow(
    "Vínculo do cliente indisponível.",
  );
  expect(stats().posts).toBe(0);
});
it("POST incerto anterior à operação O impede criação depois de busca zero", async () => {
  fault("customer_create", "indeterminate_before");
  const port = await createDurableAsaasFixturePort({
    scopeId: fixture.scopeId,
    clientId: fixture.owner.id,
    slotId: randomUUID(),
  });
  const prior = await createAsaasFixtureAdapter(
    port.scope,
    port,
  ).createCustomer({
    clientId: fixture.owner.id,
    kind: "person",
    document: "11144477735",
    name: "Cliente inteiramente fictício",
  });
  expect(prior.kind).toBe("indeterminate");
  const r = await requested();
  for (let i = 0; i < 2; i++)
    expect((await advanceFixturePaymentCustomer(r.requestId)).state).toBe(
      "held",
    );
  expect(stats()).toMatchObject({
    posts: 1,
    customers: 0,
    bindings: 0,
    getSlots: 2,
  });
});
it("mudança de documento depois de claim e antes de start não despacha", async () => {
  const r = await requested();
  await advanceFixturePaymentCustomer(r.requestId);
  const c = await claim(r.requestId);
  sql(
    `update public.clients set document='52998224725' where id='${fixture.owner.id}';`,
  );
  expect(await start(c)).toBe(false);
  expect(stats()).toMatchObject({ posts: 0, bindings: 0 });
});
it("rollback da finalização preserva fato do transporte e reverte binding, etapa e auditoria", async () => {
  const r = await requested();
  await advanceFixturePaymentCustomer(r.requestId);
  const c = await claim(r.requestId);
  await start(c);
  const port = await createDurableAsaasFixturePort({
    scopeId: fixture.scopeId,
    clientId: fixture.owner.id,
    slotId: c.step.id,
  });
  const created = await createAsaasFixtureAdapter(
    port.scope,
    port,
  ).createCustomer({
    clientId: fixture.owner.id,
    kind: "person",
    document: "11144477735",
    name: sql(
      `select name from private.payment_customer_work where scope_id='${fixture.scopeId}';`,
    ),
  });
  expect(created.kind).toBe("created");
  sql(
    `begin; set local request.jwt.claims='{"role":"service_role"}'; select public.finish_payment_customer_step('${c.step.id}','${c.worker}'); rollback;`,
  );
  expect(stats()).toMatchObject({ posts: 1, customers: 1, bindings: 0 });
  expect(
    sql(
      `select result is null from private.payment_customer_steps where id='${c.step.id}';`,
    ),
  ).toBe("t");
  expect(
    sql(
      `select count(*) from public.audit_log where action in('payment_customer_step_finished','payment_customer_bound') and target_id in('${c.step.id}','${r.requestId}');`,
    ),
  ).toBe("0");
  expect((await finish(c)).state).toBe("bound");
  expect(stats()).toMatchObject({ posts: 1, bindings: 1 });
});
