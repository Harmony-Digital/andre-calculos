import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { provisionLocalUser } from "../../scripts/provision-local-user";
import {
  notificationFixture,
  localNotificationSql,
  setFixtureNotificationRecipient,
  setFixtureCalculatorRole,
} from "../e2e/notification-helper";
import {
  createMessageProcess,
  removeMessageProcess,
} from "../e2e/messages-helper";
import { removeLocalUser } from "../e2e/local-helper";
import { notificationEvents } from "../../src/modules/notifications/preferences";
const sessions: Record<string, SupabaseClient> = {};
let fixture: Awaited<ReturnType<typeof notificationFixture>>, processId: string;
const anon = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
const change = (
  event = "new_message",
  channel = "email",
  enabled = false,
  revision = 0,
) => ({
  event,
  channel,
  enabled,
  expected_revision: revision,
  request_id: fixture.remember(randomUUID()),
});
async function message() {
  const id = randomUUID();
  expect(
    (
      await sessions.client.rpc("send_process_message", {
        target_process: processId,
        message_body: "Mensagem fictícia para preferências",
        attachments: [],
        request_id: id,
      })
    ).error,
  ).toBeNull();
  const queued = await fixture.db
    .from("notifications")
    .select("channel,status")
    .in("dedup_key", [`message:${id}:email`, `message:${id}:whatsapp`]);
  expect(queued.error).toBeNull();
  return { id, rows: queued.data! };
}
beforeAll(async () => {
  fixture = await notificationFixture();
  for (const [role, email] of Object.entries({
    client: "clientea@exemplo.com",
    calculator: "calculista@exemplo.com",
    admin: "admin@exemplo.com",
  })) {
    const s = anon();
    if (
      (
        await s.auth.signInWithPassword({
          email,
          password: process.env.ANDRE_TEST_PASSWORD!,
        })
      ).error
    )
      throw new Error("Login fictício de preferências não concluído.");
    sessions[role] = s;
  }
  processId = (await createMessageProcess()).id;
});
beforeEach(async () => {
  setFixtureCalculatorRole(fixture.id, "calculator");
  setFixtureNotificationRecipient(fixture.id);
  expect(
    (
      await fixture.db
        .from("notification_preferences")
        .delete()
        .eq("profile_id", fixture.id)
    ).error,
  ).toBeNull();
});
afterAll(async () => {
  try {
    if (processId) await removeMessageProcess(processId);
    await Promise.all(
      Object.values(sessions).map((s) => s.auth.signOut({ scope: "local" })),
    );
  } finally {
    if (fixture) await fixture.cleanup();
  }
});
it("contexto exige calculista; preferências e tabelas internas não dão escrita direta", async () => {
  expect(
    (await sessions.calculator.rpc("get_calculator_notification_context")).data,
  ).toEqual({ isRecipient: true, canClaim: false });
  for (const s of [sessions.client, sessions.admin, anon(), fixture.db])
    expect(
      (await s.rpc("get_calculator_notification_context")).error,
    ).not.toBeNull();
  for (const s of [
    sessions.calculator,
    sessions.client,
    sessions.admin,
    anon(),
  ]) {
    expect(
      (
        await s.from("notification_preferences").insert({
          profile_id: fixture.id,
          event: "new_message",
          channel: "email",
          enabled: false,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await s
          .schema("private")
          .from("calculator_notification_recipient")
          .select("*")
      ).error,
    ).not.toBeNull();
    expect(
      (
        await s
          .schema("private")
          .from("notification_preference_changes")
          .select("*")
      ).error,
    ).not.toBeNull();
  }
});
it("RPC limita ator, evento, canal, booleano e revisão; catálogo inteiro é aceito", async () => {
  for (const s of [sessions.client, sessions.admin, anon(), fixture.db])
    expect(
      (await s.rpc("set_my_notification_preference", change())).error,
    ).not.toBeNull();
  for (const patch of [
    { event: "delivery_ready" },
    { event: "arbitrary" },
    { channel: "sms" },
    { enabled: null },
    { expected_revision: -1 },
    { request_id: null },
  ])
    expect(
      (
        await sessions.calculator.rpc("set_my_notification_preference", {
          ...change(),
          ...patch,
        })
      ).error,
    ).not.toBeNull();
  for (const event of Object.keys(notificationEvents))
    expect(
      (
        await sessions.calculator.rpc(
          "set_my_notification_preference",
          change(event),
        )
      ).error,
    ).toBeNull();
  const own = await sessions.calculator
    .from("notification_preferences")
    .select("profile_id,event");
  expect(own.data).toHaveLength(Object.keys(notificationEvents).length);
  expect(own.data!.every((row) => row.profile_id === fixture.id)).toBe(true);
  expect(
    (await sessions.client.from("notification_preferences").select("id")).data,
  ).toEqual([]);
  expect(
    (await sessions.admin.from("notification_preferences").select("id")).data,
  ).toEqual([]);
});
it("duas criações concorrentes têm um vencedor; replay imutável não desfaz alteração posterior", async () => {
  const first = change(),
    second = change("new_message", "email", true);
  const results = await Promise.all(
    [first, second].map((args) =>
      sessions.calculator.rpc("set_my_notification_preference", args),
    ),
  );
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  expect(results.find((r) => r.error)?.error?.code).toBe("PT409");
  const winner = results[0].error ? second : first;
  const later = change("new_message", "email", !winner.enabled, 1);
  expect(
    (await sessions.calculator.rpc("set_my_notification_preference", later))
      .data,
  ).toMatchObject({ revision: 2, enabled: later.enabled });
  expect(
    (await sessions.calculator.rpc("set_my_notification_preference", winner))
      .data,
  ).toMatchObject({ revision: 1, enabled: winner.enabled });
  expect(
    (
      await fixture.db
        .from("notification_preferences")
        .select("enabled,revision")
        .eq("profile_id", fixture.id)
        .eq("event", "new_message")
        .eq("channel", "email")
        .single()
    ).data,
  ).toEqual({ enabled: later.enabled, revision: 2 });
  expect(
    (
      await sessions.calculator.rpc("set_my_notification_preference", {
        ...winner,
        enabled: !winner.enabled,
      })
    ).error?.code,
  ).toBe("PT409");
  const audit = await fixture.db
    .from("audit_log")
    .select("id")
    .in("target_id", [winner.request_id, later.request_id]);
  expect(audit.data).toHaveLength(2);
  expect(() =>
    localNotificationSql(
      `update private.notification_preference_changes set enabled=not enabled where id='${winner.request_id}'::uuid;`,
    ),
  ).toThrow();
});
it("a escolha controla novas mensagens sem cancelar fila anterior nem repor ocorrências omitidas", async () => {
  const pending = await message();
  expect(pending.rows).toEqual([{ channel: "email", status: "pending" }]);
  expect(
    (await sessions.calculator.rpc("set_my_notification_preference", change()))
      .error,
  ).toBeNull();
  const omitted = await message();
  expect(omitted.rows).toEqual([]);
  expect(
    (
      await sessions.calculator.rpc(
        "set_my_notification_preference",
        change("new_message", "email", true, 1),
      )
    ).error,
  ).toBeNull();
  expect((await message()).rows).toEqual([
    { channel: "email", status: "pending" },
  ]);
  expect(
    (
      await fixture.db
        .from("notifications")
        .select("channel,status")
        .eq("dedup_key", `message:${pending.id}:email`)
    ).data,
  ).toEqual(pending.rows);
  expect(
    (
      await fixture.db
        .from("notifications")
        .select("id")
        .in("dedup_key", [
          `message:${omitted.id}:email`,
          `message:${omitted.id}:whatsapp`,
        ])
    ).data,
  ).toEqual([]);
  expect(
    (
      await sessions.calculator.rpc(
        "set_my_notification_preference",
        change("new_message", "whatsapp", true),
      )
    ).error,
  ).toBeNull();
  expect((await message()).rows.map((r) => r.channel).sort()).toEqual([
    "email",
    "whatsapp",
  ]);
});
it("outro calculista não sobrepõe o destinatário nem usa seus contatos globais", async () => {
  const email = `calculista-ficticio-${randomUUID()}@exemplo.com`,
    created = await provisionLocalUser({
      email,
      password: process.env.ANDRE_TEST_PASSWORD!,
      email_confirm: true,
      user_metadata: { full_name: "Outro calculista fictício" },
    });
  expect(created.error).toBeNull();
  const id = created.data.user!.id,
    other = anon();
  try {
    setFixtureCalculatorRole(id, "calculator");
    expect(
      (
        await other.auth.signInWithPassword({
          email,
          password: process.env.ANDRE_TEST_PASSWORD!,
        })
      ).error,
    ).toBeNull();
    expect(
      (await other.rpc("get_calculator_notification_context")).data,
    ).toEqual({ isRecipient: false, canClaim: false });
    expect(
      (await other.rpc("set_my_notification_preference", change())).error,
    ).not.toBeNull();
    expect(
      (
        await sessions.calculator.rpc(
          "set_my_notification_preference",
          change(),
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await sessions.calculator.rpc(
          "set_my_notification_preference",
          change("new_message", "whatsapp", true),
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await fixture.db.from("notification_preferences").insert([
          {
            profile_id: id,
            event: "new_message",
            channel: "email",
            enabled: true,
          },
          {
            profile_id: id,
            event: "new_message",
            channel: "whatsapp",
            enabled: false,
          },
        ])
      ).error,
    ).toBeNull();
    expect((await message()).rows.map((r) => r.channel)).toEqual(["whatsapp"]);
    setFixtureCalculatorRole(fixture.id, "admin");
    try {
      expect((await message()).rows).toEqual([]);
      expect(
        (await other.rpc("get_calculator_notification_context")).data,
      ).toEqual({ isRecipient: false, canClaim: false });
      expect(
        (
          await other.rpc(
            "set_my_notification_preference",
            change("new_signup"),
          )
        ).error,
      ).not.toBeNull();
    } finally {
      setFixtureCalculatorRole(fixture.id, "calculator");
    }
    setFixtureNotificationRecipient(null);
    expect(
      (await sessions.calculator.rpc("get_calculator_notification_context"))
        .data,
    ).toEqual({ isRecipient: false, canClaim: false });
    expect(
      (
        await sessions.calculator.rpc(
          "set_my_notification_preference",
          change("new_signup"),
        )
      ).error,
    ).not.toBeNull();
    expect((await message()).rows).toEqual([]);
  } finally {
    setFixtureNotificationRecipient(fixture.id);
    await other.auth.signOut({ scope: "local" });
    await removeLocalUser(id);
  }
});
it("vínculo inválido bloqueia novos avisos sem escolher outro perfil", async () => {
  setFixtureCalculatorRole(fixture.id, "admin");
  try {
    expect((await message()).rows).toEqual([]);
    expect(
      (await sessions.calculator.rpc("get_calculator_notification_context"))
        .error,
    ).not.toBeNull();
  } finally {
    setFixtureCalculatorRole(fixture.id, "calculator");
  }
});
it("primeira preferência confirma o único calculista quando o vínculo ainda está pendente", async () => {
  setFixtureNotificationRecipient(null);
  expect(
    (await sessions.calculator.rpc("get_calculator_notification_context")).data,
  ).toEqual({ isRecipient: false, canClaim: true });
  expect((await message()).rows).toEqual([]);
  expect(
    (
      await sessions.calculator.rpc(
        "set_my_notification_preference",
        change("new_signup", "email", false, 1),
      )
    ).error?.code,
  ).toBe("PT409");
  expect(
    (await sessions.calculator.rpc("get_calculator_notification_context")).data,
  ).toEqual({ isRecipient: false, canClaim: true });
  const args = change("new_signup"),
    both = await Promise.all(
      [1, 2].map(() =>
        sessions.calculator.rpc("set_my_notification_preference", args),
      ),
    );
  expect(both.every((result) => !result.error)).toBe(true);
  expect(both[0].data).toEqual(both[1].data);
  expect(
    (
      await fixture.db
        .from("audit_log")
        .select("id")
        .eq("target_id", args.request_id)
    ).data,
  ).toHaveLength(1);
  expect(
    (await sessions.calculator.rpc("get_calculator_notification_context")).data,
  ).toEqual({ isRecipient: true, canClaim: false });
  expect((await message()).rows).toEqual([
    { channel: "email", status: "pending" },
  ]);
});
