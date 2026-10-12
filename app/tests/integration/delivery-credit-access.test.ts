import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { financialJourneyFixture } from "../e2e/financial-journey-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { quoteSession } from "../e2e/quote-helper";
import { removeLocalUser } from "../e2e/local-helper";
import {
  parseDeliveryAccessContexts,
  deriveDeliveryCreditAccess,
} from "@/modules/delivery/credit-access";

let f: Awaited<ReturnType<typeof financialJourneyFixture>>;
let sessions: Record<string, SupabaseClient>;
let deliveryId: string, fileId: string, balanceId: string;
beforeEach(async () => {
  deliveryId = fileId = balanceId = "";
  f = await financialJourneyFixture();
  sessions = {};
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
}, 60000);
async function prepare(scenario: "received" | "partial" = "received") {
  await f.observe(scenario);
  await f.createOrigin();
  await f.apply();
  await f.bind();
  // A contratação deste helper é explícita; não transforma a fixture técnica legada.
  await f.deliver(f.sample);
  deliveryId = (
    await f.db
      .from("deliveries")
      .select("id")
      .eq("order_id", f.sample.order_id)
      .single()
  ).data!.id;
  fileId = randomUUID();
  balanceId = randomUUID();
  expect(
    (
      await f.db.from("files").insert({
        id: fileId,
        process_id: f.sample.process_id,
        order_id: f.sample.order_id,
        folder: "deliverables",
        uploaded_by: f.calculator.id,
        name: "Entrega fictícia do crédito.pdf",
        mime: "application/pdf",
        path:
          f.calculator.id +
          "/" +
          f.sample.process_id +
          "/" +
          fileId +
          "/ficticio.pdf",
        size_bytes: 100,
        sha256: "0".repeat(64),
        expected_sha256: "0".repeat(64),
        upload_status: "uploaded",
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await f.db.from("delivery_files").insert({
        delivery_id: deliveryId,
        file_id: fileId,
        kind: "calculation",
        snapshot: { fixture: true },
      })
    ).error,
  ).toBeNull();
}
afterEach(async () => {
  try {
    if (f) {
      sql(
        "update public.profiles set role='calculator' where id='" +
          f.calculator.id +
          "';",
      );
      sql(
        "update public.clients set owner_id='" +
          f.owner.owner_id +
          "',has_contract=false where id='" +
          f.owner.id +
          "';",
      );
      if (fileId)
        sql("delete from public.audit_log where target_id='" + fileId + "';");
    }
    await Promise.all(
      Object.values(sessions ?? {}).map((s) =>
        s.auth.signOut({ scope: "local" }),
      ),
    );
  } finally {
    if (f) await f.cleanup();
  }
}, 60000);
async function policy(
  value: "before_balance" | "after_balance",
  initial: "received" | "partial" = "received",
) {
  if (!deliveryId) await prepare(initial);
  expect(
    (
      await f.db.from("delivery_releases").insert({
        delivery_id: deliveryId,
        policy: value,
        approved_by: f.calculator.id,
      })
    ).error,
  ).toBeNull();
}
async function fullBalance() {
  expect(
    (
      await f.db.from("payments").insert({
        id: balanceId,
        order_id: f.sample.order_id,
        kind: "balance",
        method: "pix_manual",
        amount_cents: 12501,
        status: "confirmed",
      })
    ).error,
  ).toBeNull();
}
async function context(db = sessions.client, ids = [deliveryId]) {
  const r = await db.rpc("get_current_delivery_access_contexts", {
    target_process: f.sample.process_id,
    target_deliveries: ids,
  });
  expect(r.error).toBeNull();
  return parseDeliveryAccessContexts(
    r.data,
    f.sample.process_id,
    ids.map((id) => ({
      id,
      order_id: f.sample.order_id,
      process_id: f.sample.process_id,
    })),
  );
}
const audits = () =>
  Number(
    sql(
      "select count(*) from public.audit_log where target_id='" +
        fileId +
        "' and action in('file_view','file_download');",
    ),
  );
async function authorized(db = sessions.client, kind = "file_download") {
  return db.rpc("authorize_file_access", {
    target_file: fileId,
    access_kind: kind,
  });
}
async function visible(db = sessions.client) {
  const r = await db.from("files").select("id").eq("id", fileId);
  expect(r.error).toBeNull();
  return r.data!;
}
it("contexto estável e RLS concordam com sinal certo, sem efeitos de leitura", async () => {
  await policy("before_balance");
  const before = audits(),
    client = (await context()).get(deliveryId)!,
    calc = (await context(sessions.calculator)).get(deliveryId)!;
  expect(client).toEqual(calc);
  expect(client.credit.projection).toEqual(f.view().projection);
  expect(deriveDeliveryCreditAccess(client)).toBe("ready");
  expect(audits()).toBe(before);
  expect(await visible()).toHaveLength(1);
  const r = await authorized(sessions.client, "file_view");
  expect(r.error).toBeNull();
  expect(r.data).toMatchObject({
    id: fileId,
    name: "Entrega fictícia do crédito.pdf",
    upload_status: "uploaded",
  });
  expect(audits()).toBe(before + 1);
  expect(
    (await sessions.client.rpc("record_file_access", { target_file: fileId }))
      .error,
  ).toBeNull();
  expect(audits()).toBe(before + 2);
});
it("regra ausente bloqueia cliente e preserva acesso operacional do calculista", async () => {
  await prepare();
  expect(deriveDeliveryCreditAccess((await context()).get(deliveryId)!)).toBe(
    "policy_pending",
  );
  expect(await visible()).toEqual([]);
  expect((await authorized()).error).not.toBeNull();
  expect((await authorized(sessions.calculator)).error).toBeNull();
  expect(audits()).toBe(1);
});
it("depois do saldo exige total mesmo com contrato e bloqueia após estorno", async () => {
  await policy("after_balance");
  sql(
    "update public.clients set has_contract=true where id='" +
      f.owner.id +
      "';",
  );
  expect(deriveDeliveryCreditAccess((await context()).get(deliveryId)!)).toBe(
    "balance_pending",
  );
  expect(await visible()).toEqual([]);
  expect((await authorized()).error).not.toBeNull();
  await fullBalance();
  expect(deriveDeliveryCreditAccess((await context()).get(deliveryId)!)).toBe(
    "ready",
  );
  expect((await authorized()).error).toBeNull();
  const before = audits();
  sql(
    "update public.payments set status='refunded' where id='" +
      balanceId +
      "';",
  );
  expect(deriveDeliveryCreditAccess((await context()).get(deliveryId)!)).toBe(
    "balance_pending",
  );
  expect(await visible()).toEqual([]);
  expect((await authorized()).error).not.toBeNull();
  expect(audits()).toBe(before);
});
it("UNKNOWN bloqueia sinal e restauração conhecida devolve a elegibilidade", async () => {
  await policy("before_balance");
  await f.observe("unknown");
  await f.apply();
  expect(deriveDeliveryCreditAccess((await context()).get(deliveryId)!)).toBe(
    "financial_pending",
  );
  expect(await visible()).toEqual([]);
  expect((await authorized()).error).not.toBeNull();
  await f.observe("received");
  await f.apply();
  expect(deriveDeliveryCreditAccess((await context()).get(deliveryId)!)).toBe(
    "ready",
  );
  expect((await authorized()).error).toBeNull();
});
it("contrato vigente dispensa sinal incerto antes do saldo sem criar pagamento", async () => {
  await policy("before_balance");
  await f.observe("unknown");
  await f.apply();
  const before = f.view().posts;
  sql(
    "update public.clients set has_contract=true where id='" +
      f.owner.id +
      "';",
  );
  expect(deriveDeliveryCreditAccess((await context()).get(deliveryId)!)).toBe(
    "ready",
  );
  expect((await authorized()).error).toBeNull();
  expect(f.view().posts).toBe(before);
});
it.each(["partial", "refund_full"] as const)(
  "%s deixa entrega preservada e sinal insuficiente bloqueado",
  async (scenario) => {
    await policy(
      "before_balance",
      scenario === "partial" ? "partial" : "received",
    );
    if (scenario === "refund_full") {
      await f.observe(scenario);
      await f.apply();
    }
    expect(deriveDeliveryCreditAccess((await context()).get(deliveryId)!)).toBe(
      "deposit_pending",
    );
    expect(await visible()).toEqual([]);
    expect((await authorized()).error).not.toBeNull();
    expect(
      (await f.db.from("deliveries").select("id").eq("id", deliveryId)).data,
    ).toHaveLength(1);
    expect(audits()).toBe(0);
  },
);
it("recebimento anterior seguido de observação menor conserva a incerteza em vez de liberar", async () => {
  await policy("before_balance");
  await f.observe("partial");
  await f.apply();
  expect(deriveDeliveryCreditAccess((await context()).get(deliveryId)!)).toBe(
    "financial_pending",
  );
  expect(await visible()).toEqual([]);
  expect((await authorized()).error).not.toBeNull();
  expect(audits()).toBe(0);
});
it("excesso conhecido e reserva ativa não apagam cobertura nem repetem recebimento", async () => {
  await policy("before_balance");
  await f.observe("excess");
  await f.apply();
  const c = (await context()).get(deliveryId)!;
  expect(c.credit.projection.depositExcessCents).toBe(499);
  expect(c.credit.activeReservation).toBe(true);
  expect(deriveDeliveryCreditAccess(c)).toBe("ready");
  expect((await authorized()).error).toBeNull();
  expect(f.view().posts).toBe(1);
});
it("proposta que perdeu reconhecimento não é liberada por soma antiga ou contrato", async () => {
  await policy("before_balance");
  // Não altera recibo/contexto: deixa a proposta reconhecida incompatível.
  sql(
    "update public.clients set has_contract=true where id='" +
      f.owner.id +
      "';update public.orders set total_cents=total_cents+1 where id='" +
      f.sample.order_id +
      "';",
  );
  const c = (await context()).get(deliveryId)!;
  expect(c.credit.projection.requiredDepositCents).toBeNull();
  expect(deriveDeliveryCreditAccess(c)).toBe("financial_pending");
  expect((await authorized()).error).not.toBeNull();
});
it("cliente B, administrador, anônimo e service_role não recebem contexto ou audit de arquivo", async () => {
  await policy("before_balance");
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  for (const db of [sessions.clientB, sessions.admin, anon, f.db]) {
    expect(
      (
        await db.rpc("get_current_delivery_access_contexts", {
          target_process: f.sample.process_id,
          target_deliveries: [deliveryId],
        })
      ).error,
    ).not.toBeNull();
    expect((await authorized(db)).error).not.toBeNull();
  }
  expect(audits()).toBe(0);
});
it("lote recusa entrega desconhecida, repetição e mais de cinquenta sem resultado parcial", async () => {
  await policy("before_balance");
  for (const ids of [
    [deliveryId, randomUUID()],
    [deliveryId, deliveryId],
    Array(51).fill(deliveryId),
  ]) {
    const r = await sessions.client.rpc(
      "get_current_delivery_access_contexts",
      { target_process: f.sample.process_id, target_deliveries: ids },
    );
    expect(r.error).not.toBeNull();
    expect(r.data).toBeNull();
  }
  expect((await context(sessions.client, [])).size).toBe(0);
  expect(audits()).toBe(0);
});
it("cinquenta entregas do mesmo pedido conservam políticas distintas e crédito coerente", async () => {
  await policy("before_balance");
  const original = (
    await f.db.from("deliveries").select("*").eq("id", deliveryId).single()
  ).data!;
  const ids = Array.from({ length: 50 }, () => randomUUID());
  expect(
    (
      await f.db
        .from("deliveries")
        .insert(ids.map((id) => ({ ...original, id })))
    ).error,
  ).toBeNull();
  expect(
    (
      await f.db.from("delivery_releases").insert(
        ids.map((id, index) => ({
          delivery_id: id,
          policy: index % 2 ? "after_balance" : "before_balance",
          approved_by: f.calculator.id,
        })),
      )
    ).error,
  ).toBeNull();
  const rows = await context(sessions.client, ids);
  expect(rows.size).toBe(50);
  expect(rows.get(ids[0])!.credit).toEqual(rows.get(ids[49])!.credit);
  expect(deriveDeliveryCreditAccess(rows.get(ids[0])!)).toBe("ready");
  expect(deriveDeliveryCreditAccess(rows.get(ids[1])!)).toBe("balance_pending");
  expect(audits()).toBe(0);
  const invalid = await sessions.client.rpc(
    "get_current_delivery_access_contexts",
    {
      target_process: f.sample.process_id,
      target_deliveries: [...ids, deliveryId],
    },
  );
  expect(invalid.error).not.toBeNull();
  expect(invalid.data).toBeNull();
});
it("rollback reverte auditoria e assinaturas/grants preservam leitores sem escrita", async () => {
  await policy("before_balance");
  const before = audits();
  sql(
    'begin;select set_config(\'request.jwt.claims\',\'{"role":"authenticated","sub":"' +
      f.owner.owner_id +
      "\"}',true);set local role authenticated;select public.authorize_file_access('" +
      fileId +
      "');rollback;",
  );
  expect(audits()).toBe(before);
  const grants = JSON.parse(
    sql(
      "select json_build_object('readerStable',(select provolatile='s' from pg_proc where oid='public.get_current_delivery_access_contexts(uuid,uuid[])'::regprocedure),'writerVolatile',(select provolatile='v' from pg_proc where oid='public.authorize_file_access(uuid,text)'::regprocedure),'anon',has_function_privilege('anon','public.authorize_file_access(uuid,text)','execute'),'service',has_function_privilege('service_role','public.authorize_file_access(uuid,text)','execute'),'authenticated',has_function_privilege('authenticated','public.authorize_file_access(uuid,text)','execute'));",
    ),
  );
  expect(grants).toEqual({
    readerStable: true,
    writerVolatile: true,
    anon: false,
    service: false,
    authenticated: true,
  });
});

async function hold(statement: string) {
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_andre-calculos",
      "psql",
      "-U",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  const ended = new Promise<number | null>((resolve) =>
    child.once("exit", resolve),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Lock fictício não confirmado.")),
      5000,
    );
    lines.on("line", (line) => {
      if (line === "HELD") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  child.stdin.write(
    "set idle_in_transaction_session_timeout='10s';begin;" +
      statement +
      ";select 'HELD';\n",
  );
  try {
    await ready;
  } catch (error) {
    child.stdin.end("rollback;\n");
    await ended;
    throw error;
  }
  let finished = false;
  return {
    finish: async (change = "") => {
      if (finished) return;
      finished = true;
      child.stdin.end(change + (change ? ";" : "") + "commit;\n");
      const exit = await ended;
      lines.close();
      expect(exit).toBe(0);
    },
  };
}
async function waitForAccessLock() {
  await expect
    .poll(
      () =>
        Number(
          sql(
            "select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%authorize_file_access%' and pid<>pg_backend_pid();",
          ),
        ),
      { timeout: 5000 },
    )
    .toBeGreaterThan(0);
}
it("autorização relê saldo após espera real e não audita arquivo que perdeu cobertura", async () => {
  await policy("after_balance");
  await fullBalance();
  const holder = await hold(
    "select id from public.clients where id='" + f.owner.id + "' for update",
  );
  const pending = (async () => authorized())();
  try {
    await waitForAccessLock();
    await holder.finish(
      "update public.payments set status='refunded' where id='" +
        balanceId +
        "'",
    );
    expect((await pending).error).not.toBeNull();
    expect(audits()).toBe(0);
  } finally {
    await holder.finish();
    await pending;
  }
});
it("autorização relê papel revogado após espera no profile", async () => {
  await prepare();
  const holder = await hold(
    "select id from public.profiles where id='" +
      f.calculator.id +
      "' for update",
  );
  const pending = (async () => authorized(sessions.calculator))();
  try {
    await waitForAccessLock();
    await holder.finish(
      "update public.profiles set role='admin' where id='" +
        f.calculator.id +
        "'",
    );
    expect((await pending).error).not.toBeNull();
    expect(audits()).toBe(0);
  } finally {
    await holder.finish();
    await pending;
  }
});
it("troca do proprietário durante espera recusa acesso em vez de usar identidade antiga", async () => {
  await policy("before_balance");
  const other = randomUUID();
  let created = false;
  sql(
    "insert into private.user_provisioning_grants(user_id,purpose) values('" +
      other +
      "','Identidade fictícia para transferência concorrente');",
  );
  try {
    const user = await f.db.auth.admin.createUser({
      id: other,
      email: "an-owner-" + other + "@exemplo.com",
      password: process.env.ANDRE_TEST_PASSWORD!,
      email_confirm: true,
      user_metadata: { full_name: "Dono fictício temporário" },
    });
    expect(user.error).toBeNull();
    expect(user.data.user?.id).toBe(other);
    created = true;
    expect(
      (await f.db.from("profiles").select("role").eq("id", other).single()).data
        ?.role,
    ).toBe("client");
    // Remove apenas o cadastro vazio criado por este ensaio, preservando owner_id único.
    expect(
      (await f.db.from("clients").delete().eq("owner_id", other)).error,
    ).toBeNull();
    const holder = await hold(
      "select id from public.clients where id='" + f.owner.id + "' for update",
    );
    const pending = (async () => authorized())();
    try {
      await waitForAccessLock();
      await holder.finish(
        "update public.clients set owner_id='" +
          other +
          "' where id='" +
          f.owner.id +
          "'",
      );
      expect((await pending).error?.code).toBe("PT409");
      expect(audits()).toBe(0);
    } finally {
      await holder.finish();
      await pending;
    }
  } finally {
    try {
      sql(
        "update public.clients set owner_id='" +
          f.owner.owner_id +
          "' where id='" +
          f.owner.id +
          "';",
      );
      if (created) await removeLocalUser(other);
    } finally {
      sql(
        "delete from private.user_provisioning_grants where user_id='" +
          other +
          "';",
      );
    }
  }
}, 30000);
