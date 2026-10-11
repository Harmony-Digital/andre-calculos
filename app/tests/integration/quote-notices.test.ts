import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  notificationFixture,
  localNotificationSql,
  setFixtureNotificationRecipient,
  setFixtureCalculatorRole,
} from "../e2e/notification-helper";
import { queueFixture } from "../e2e/queue-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localSystem } from "../e2e/local-helper";
import { fictionalServiceSettings } from "../settings-fixture";

let fixture: Awaited<ReturnType<typeof notificationFixture>>,
  sampleQueue: Awaited<ReturnType<typeof queueFixture>>;
const sessions: Record<string, SupabaseClient> = {};
function offer() {
  const id = randomUUID();
  // Testa somente o formato legado com dados sintéticos no banco local.
  // Não flexibiliza o CHECK nem emite um snapshot comercial pela RPC.
  return {
    id,
    order_id: sampleQueue.orders[0].id,
    number: `TESTE-M2.14-${id}`,
    items: [],
    total_cents: 12345,
    valid_until: new Date(Date.now() + 86400000).toISOString(),
  };
}
async function notices(id: string) {
  const result = await fixture.db
    .from("notifications")
    .select("channel,recipient,template,data,status,attempts,sent_at,dedup_key")
    .in("dedup_key", [`quote:${id}:email`, `quote:${id}:whatsapp`])
    .order("channel");
  expect(result.error).toBeNull();
  return result.data!;
}
async function preference(channel: "email" | "whatsapp", enabled: boolean) {
  expect(
    (
      await fixture.db.from("notification_preferences").insert({
        profile_id: fixture.id,
        event: "quote_created",
        channel,
        enabled,
      })
    ).error,
  ).toBeNull();
}
async function insert(row = offer()) {
  expect((await fixture.db.from("quotes").insert(row)).error).toBeNull();
  return row;
}
beforeAll(async () => {
  fixture = await notificationFixture();
  sampleQueue = await queueFixture([{ status: "quoted", due: null }]);
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
});
beforeEach(async () => {
  setFixtureNotificationRecipient(fixture.id);
  setFixtureCalculatorRole(fixture.id, "calculator");
  expect(
    (
      await fixture.db
        .from("notification_preferences")
        .delete()
        .eq("profile_id", fixture.id)
        .eq("event", "quote_created")
    ).error,
  ).toBeNull();
});
afterAll(async () => {
  try {
    if (sampleQueue) await sampleQueue.cleanup();
    await Promise.all(
      Object.values(sessions).map((db) => db.auth.signOut({ scope: "local" })),
    );
  } finally {
    if (fixture) await fixture.cleanup();
  }
});
it("cria e-mail sem aceite com payload mínimo e sem enviar nem alterar o pedido", async () => {
  const row = await insert();
  const queued = await notices(row.id);
  expect(queued).toEqual([
    {
      channel: "email",
      recipient: fictionalServiceSettings.contactEmail,
      template: "quote_created",
      data: {
        quote_id: row.id,
        order_id: sampleQueue.orders[0].id,
        process_id: sampleQueue.process.id,
        number: row.number,
        code: sampleQueue.orders[0].code,
        path: `/painel/processos/${sampleQueue.process.id}`,
      },
      status: "pending",
      attempts: 0,
      sent_at: null,
      dedup_key: `quote:${row.id}:email`,
    },
  ]);
  expect(
    (
      await fixture.db
        .from("orders")
        .select("status")
        .eq("id", row.order_id)
        .single()
    ).data?.status,
  ).toBe("quoted");
});
it("WhatsApp exige opt-in e e-mail desligado não é recuperado após ligar", async () => {
  await preference("email", false);
  const skipped = await insert();
  expect(await notices(skipped.id)).toEqual([]);
  await preference("whatsapp", true);
  const whatsapp = await insert();
  expect((await notices(whatsapp.id)).map((n) => n.channel)).toEqual([
    "whatsapp",
  ]);
  expect(
    (
      await fixture.db
        .from("notification_preferences")
        .update({ enabled: true })
        .eq("profile_id", fixture.id)
        .eq("event", "quote_created")
        .eq("channel", "email")
    ).error,
  ).toBeNull();
  expect(
    (
      await fixture.db
        .from("quotes")
        .update({ total_cents: 54321 })
        .eq("id", skipped.id)
    ).error,
  ).toBeNull();
  expect(await notices(skipped.id)).toEqual([]);
  const both = await insert();
  expect((await notices(both.id)).map((n) => n.channel)).toEqual([
    "email",
    "whatsapp",
  ]);
});
it("repetição concorrente da inserção e UPDATE não duplicam avisos", async () => {
  await preference("whatsapp", true);
  const row = offer();
  const results = await Promise.all(
    [0, 1].map(() =>
      fixture.db.from("quotes").upsert(row, {
        onConflict: "id",
        ignoreDuplicates: true,
      }),
    ),
  );
  expect(results.some((r) => !r.error)).toBe(true);
  // A disputa pode atingir primeiro a chave única do número, além da PK.
  // A tentativa rejeitada não pode criar aviso; o replay depois do commit
  // abaixo é somente leitura e deve terminar normalmente.
  for (const result of results)
    if (result.error) expect(result.error.code).toBe("23505");
  expect(
    (
      await fixture.db.from("quotes").upsert(row, {
        onConflict: "id",
        ignoreDuplicates: true,
      })
    ).error,
  ).toBeNull();
  const prior = await notices(row.id);
  expect(prior).toHaveLength(2);
  expect(
    (
      await fixture.db
        .from("quotes")
        .update({ total_cents: 54321 })
        .eq("id", row.id)
    ).error,
  ).toBeNull();
  expect(await notices(row.id)).toEqual(prior);
});
it("espera pela edição das preferências e usa os dois canais da mesma revisão", async () => {
  const row = offer(),
    tag = randomUUID(),
    nameA = `quote-pref-${tag}`,
    nameB = `quote-insert-${tag}`,
    requestA = fixture.remember(randomUUID()),
    requestB = fixture.remember(randomUUID());
  function open(name: string) {
    localSystem();
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
    // Não levar a saída SQL/claims nem o stderr ao histórico de teste.
    child.stderr.on("data", () => {});
    const done = new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", resolve);
    });
    child.stdin.write(
      `set application_name='${name}'; set statement_timeout='8s';\n`,
    );
    return { child, done, output: () => output };
  }
  const a = open(nameA),
    b = open(nameB);
  try {
    a.child.stdin.write(
      `begin; select set_config('request.jwt.claim.sub','${fixture.id}',true); set local role authenticated;
select public.set_my_notification_preference('quote_created','email',false,0,'${requestA}'::uuid);
select public.set_my_notification_preference('quote_created','whatsapp',true,0,'${requestB}'::uuid);
\\echo PREF_READY
`,
    );
    await expect.poll(a.output, { timeout: 3000 }).toContain("PREF_READY");
    b.child.stdin.write(
      `set role service_role; insert into public.quotes(id,order_id,number,items,total_cents,valid_until)
values('${row.id}'::uuid,'${row.order_id}'::uuid,'${row.number}','[]',12345,now()+interval '1 day');\n`,
    );
    await expect
      .poll(
        () =>
          localNotificationSql(
            `select count(*) from pg_stat_activity b where b.application_name='${nameB}' and b.wait_event_type='Lock' and exists(select 1 from pg_stat_activity a where a.application_name='${nameA}' and a.pid=any(pg_blocking_pids(b.pid)));`,
          ),
        { timeout: 3000 },
      )
      .toBe("1");
    a.child.stdin.end("commit;\n\\q\n");
    expect(await a.done).toBe(0);
    b.child.stdin.end("\\q\n");
    expect(await b.done).toBe(0);
    expect((await notices(row.id)).map((notice) => notice.channel)).toEqual([
      "whatsapp",
    ]);
  } finally {
    for (const session of [a, b])
      if (session.child.exitCode === null && !session.child.stdin.destroyed)
        session.child.stdin.end("rollback;\n\\q\n");
    await Promise.allSettled([a.done, b.done]);
  }
}, 15000);
it("simulações não entram na outbox, mesmo com os dois canais ligados", async () => {
  await preference("whatsapp", true);
  const row = offer();
  expect(
    (await fixture.db.from("quotes").insert({ ...row, is_simulation: true }))
      .error,
  ).toBeNull();
  expect(await notices(row.id)).toEqual([]);
});
it("vínculo ausente, papel diferente e contato ausente não enfileiram nem recuperam", async () => {
  setFixtureNotificationRecipient(null);
  const missingBinding = await insert();
  expect(await notices(missingBinding.id)).toEqual([]);
  setFixtureNotificationRecipient(fixture.id);
  setFixtureCalculatorRole(fixture.id, "admin");
  const wrongRole = await insert();
  expect(await notices(wrongRole.id)).toEqual([]);
  setFixtureCalculatorRole(fixture.id, "calculator");
  const before = (
    await fixture.db
      .from("settings")
      .select("contact_email,contact_phone")
      .eq("singleton", true)
      .single()
  ).data!;
  try {
    expect(
      (
        await fixture.db
          .from("settings")
          .update({ contact_email: null, contact_phone: null })
          .eq("singleton", true)
      ).error,
    ).toBeNull();
    const noContact = await insert();
    expect(await notices(noContact.id)).toEqual([]);
    expect(
      (
        await fixture.db
          .from("quotes")
          .update({ total_cents: 54321 })
          .in("id", [missingBinding.id, wrongRole.id, noContact.id])
      ).error,
    ).toBeNull();
    for (const id of [missingBinding.id, wrongRole.id, noContact.id])
      expect(await notices(id)).toEqual([]);
  } finally {
    expect(
      (await fixture.db.from("settings").update(before).eq("singleton", true))
        .error,
    ).toBeNull();
  }
});
it("falha no segundo canal reverte a proposta e o aviso do primeiro", async () => {
  await preference("whatsapp", true);
  const row = offer();
  localNotificationSql(
    `create function private.fixture_fail_quote_notice() returns trigger language plpgsql set search_path='' as $$begin if new.channel='whatsapp' and new.dedup_key='quote:${row.id}:whatsapp' then raise exception 'Fixture de falha'; end if; return new; end;$$; create trigger fixture_fail_quote_notice before insert on public.notifications for each row execute function private.fixture_fail_quote_notice();`,
  );
  try {
    expect((await fixture.db.from("quotes").insert(row)).error).not.toBeNull();
    expect(await notices(row.id)).toEqual([]);
    expect(
      (await fixture.db.from("quotes").select("id").eq("id", row.id)).data,
    ).toEqual([]);
  } finally {
    localNotificationSql(
      "drop trigger fixture_fail_quote_notice on public.notifications; drop function private.fixture_fail_quote_notice();",
    );
  }
  await insert(row);
  expect(await notices(row.id)).toHaveLength(2);
});
it("sessões operacionais não forjam proposta, aviso ou invocação do trigger", async () => {
  const anonymous = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  for (const db of [...Object.values(sessions), anonymous]) {
    expect((await db.from("quotes").insert(offer())).error).not.toBeNull();
    expect(
      (
        await db.from("notifications").insert({
          channel: "email",
          recipient: fictionalServiceSettings.contactEmail,
          template: "quote_created",
          data: {},
          dedup_key: `quote:forjado:${randomUUID()}`,
        })
      ).error,
    ).not.toBeNull();
    expect((await db.from("notifications").select("id")).error).not.toBeNull();
  }
  expect(
    localNotificationSql(
      "select bool_and(not has_function_privilege(role,'private.notify_quote_created()','EXECUTE')) from unnest(array['anon','authenticated','service_role']) as role;",
    ),
  ).toBe("t");
});
