import { beforeAll, afterAll, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { leaseLocalSettings, localSystem } from "../e2e/local-helper";
import {
  createMessageProcess,
  removeMessageProcess,
} from "../e2e/messages-helper";
const db = localSystem(),
  sessions: Record<string, SupabaseClient> = {},
  processes: string[] = [];
const files = Array.from({ length: 6 }, () => randomUUID()),
  firstMessage = randomUUID();
let processId: string,
  alternateId: string,
  foreignId: string,
  ownerId: string,
  calculatorId: string;
let previousSettings: {
    id: string;
    contact_email: string | null;
    contact_phone: string | null;
  },
  previousPreferences: Record<string, unknown>[] = [],
  release: (() => Promise<void>) | undefined;
function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
function input(overrides: Record<string, unknown> = {}) {
  return {
    target_process: processId,
    message_body: "Texto inteiramente fictício",
    attachments: [],
    request_id: randomUUID(),
    ...overrides,
  };
}
async function queued(id: string) {
  const result = await db
    .from("notifications")
    .select("channel,recipient,template,data,status")
    .in("dedup_key", [`message:${id}:email`, `message:${id}:whatsapp`]);
  expect(result.error).toBeNull();
  return result.data!;
}
async function preference(
  profileId: string,
  channel: string,
  enabled: boolean,
) {
  expect(
    (
      await db
        .from("notification_preferences")
        .upsert(
          { profile_id: profileId, event: "new_message", channel, enabled },
          { onConflict: "profile_id,event,channel" },
        )
    ).error,
  ).toBeNull();
}
beforeAll(async () => {
  release = await leaseLocalSettings();
  const settings = await db
    .from("settings")
    .select("id,contact_email,contact_phone")
    .eq("singleton", true)
    .single();
  if (settings.error) throw new Error("Configurações fictícias indisponíveis.");
  previousSettings = settings.data;
  for (const [role, email] of Object.entries({
    a: "clientea@exemplo.com",
    b: "clienteb@exemplo.com",
    calculator: "calculista@exemplo.com",
    admin: "admin@exemplo.com",
  })) {
    const session = client();
    if (
      (
        await session.auth.signInWithPassword({
          email,
          password: process.env.ANDRE_TEST_PASSWORD!,
        })
      ).error
    )
      throw new Error("Falha no login fictício de mensagens.");
    sessions[role] = session;
  }
  calculatorId = (await sessions.calculator.auth.getUser()).data.user!.id;
  const own = await createMessageProcess();
  processId = own.id;
  ownerId = own.authorId;
  processes.push(processId);
  alternateId = (await createMessageProcess()).id;
  processes.push(alternateId);
  const otherClient = await db
    .from("clients")
    .select("id")
    .eq("owner_id", (await sessions.b.auth.getUser()).data.user!.id)
    .single();
  foreignId = (await createMessageProcess(otherClient.data!.id)).id;
  processes.push(foreignId);
  const preferences = await db
    .from("notification_preferences")
    .select("*")
    .eq("event", "new_message")
    .in("profile_id", [ownerId, calculatorId]);
  if (preferences.error)
    throw new Error("Preferências fictícias indisponíveis.");
  previousPreferences = preferences.data;
  expect(
    (
      await db
        .from("settings")
        .update({
          contact_email: "calculista@exemplo.com",
          contact_phone: "+5561999999999",
        })
        .eq("id", previousSettings.id)
    ).error,
  ).toBeNull();
  await preference(calculatorId, "email", true);
  await preference(calculatorId, "whatsapp", true);
  await preference(ownerId, "email", true);
  // Metadados sintéticos para o teste de RLS; o e2e envia o objeto real ao Storage.
  expect(
    (
      await db.from("files").insert(
        files.map((id, index) => ({
          id,
          process_id: index === 5 ? foreignId : processId,
          uploaded_by: ownerId,
          folder: index === 3 ? "case" : index === 4 ? "triage" : "client",
          upload_status: index === 2 ? "pending" : "uploaded",
          path: `messages-rls/${id}.pdf`,
          name: "Anexo fictício de mensagens",
          mime: "application/pdf",
          size_bytes: 10,
        })),
      )
    ).error,
  ).toBeNull();
}, 15000);
afterAll(async () => {
  try {
    for (const id of processes) await removeMessageProcess(id);
    if (previousSettings) {
      expect(
        (
          await db
            .from("settings")
            .update(previousSettings)
            .eq("id", previousSettings.id)
        ).error,
      ).toBeNull();
      expect(
        (
          await db
            .from("notification_preferences")
            .delete()
            .eq("event", "new_message")
            .in("profile_id", [ownerId, calculatorId])
        ).error,
      ).toBeNull();
      if (previousPreferences.length)
        expect(
          (
            await db
              .from("notification_preferences")
              .insert(previousPreferences)
          ).error,
        ).toBeNull();
    }
    await Promise.all(
      Object.values(sessions).map((session) =>
        session.auth.signOut({ scope: "local" }),
      ),
    );
  } finally {
    await release?.();
  }
}, 15000);
it("envios iguais concorrentes criam uma mensagem, auditoria, evento e aviso por canal", async () => {
  const args = input({
    request_id: firstMessage,
    message_body: " \tTexto fictício\r\nLinha dois\u00a0",
    attachments: [files[1], files[0]],
  });
  const results = await Promise.all([
    sessions.a.rpc("send_process_message", args),
    sessions.a.rpc("send_process_message", args),
  ]);
  for (const result of results) {
    expect(result.error).toBeNull();
    expect(result.data).toBe(firstMessage);
  }
  const row = await sessions.a
    .from("messages")
    .select("body,attachment_ids,author_id")
    .eq("id", firstMessage)
    .single();
  expect(row.data).toEqual({
    body: "Texto fictício\nLinha dois",
    attachment_ids: files.slice(0, 2).sort(),
    author_id: ownerId,
  });
  expect(
    (
      await db
        .from("audit_log")
        .select("id")
        .eq("target_id", firstMessage)
        .eq("action", "message_sent")
    ).data,
  ).toHaveLength(1);
  const events = await db
    .from("timeline_events")
    .select("data")
    .eq("process_id", processId)
    .eq("kind", "message_sent");
  expect(events.data).toEqual([{ data: { message_id: firstMessage } }]);
  const notices = await queued(firstMessage);
  expect(notices).toHaveLength(2);
  expect(notices.map((row) => row.channel).sort()).toEqual([
    "email",
    "whatsapp",
  ]);
  for (const notice of notices) {
    expect(notice.template).toBe("new_message");
    expect(notice.status).toBe("pending");
    expect(notice.data).toEqual({
      process_id: processId,
      message_id: firstMessage,
    });
  }
  expect(
    (
      await sessions.a.rpc("send_process_message", {
        ...args,
        attachments: [files[0], files[1]],
      })
    ).data,
  ).toBe(firstMessage);
  expect(await queued(firstMessage)).toHaveLength(2);
});
it("a mesma chave não aceita outro autor, processo, corpo ou anexo", async () => {
  const args = input({
    request_id: firstMessage,
    message_body: "Texto fictício\nLinha dois",
    attachments: files.slice(0, 2),
  });
  for (const [session, overrides] of [
    [sessions.calculator, {}],
    [sessions.a, { target_process: alternateId }],
    [sessions.a, { message_body: "Outro conteúdo" }],
    [sessions.a, { attachments: [files[0]] }],
  ] as [SupabaseClient, Record<string, unknown>][])
    expect(
      (await session.rpc("send_process_message", { ...args, ...overrides }))
        .error,
    ).not.toBeNull();
  expect(
    (await db.from("messages").select("id").eq("process_id", processId)).data,
  ).toHaveLength(1);
});
it("anônimo, admin, service sem ator e outro cliente não enviam nem forjam autoria", async () => {
  for (const session of [client(), sessions.admin, sessions.b, db])
    expect(
      (await session.rpc("send_process_message", input())).error,
    ).not.toBeNull();
  for (const session of [sessions.a, sessions.calculator]) {
    expect(
      (
        await session.from("messages").insert({
          process_id: processId,
          author_id: ownerId,
          body: "Sem RPC",
        })
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await session
          .from("messages")
          .update({ body: "Alteração indevida" })
          .eq("id", firstMessage)
      ).error?.code,
    ).toBe("42501");
    expect(
      (await session.from("messages").delete().eq("id", firstMessage)).error
        ?.code,
    ).toBe("42501");
  }
  expect(
    (await sessions.b.from("messages").select("id").eq("process_id", processId))
      .data,
  ).toEqual([]);
  expect(
    (
      await sessions.admin
        .from("messages")
        .select("id")
        .eq("process_id", processId)
    ).data,
  ).toEqual([]);
});
it("texto e arrays inválidos ou anexos indisponíveis falham sem efeitos parciais", async () => {
  const variants = [
    { target_process: null },
    { request_id: null },
    { message_body: null },
    { message_body: "\t\n\u00a0\u2003" },
    { message_body: "x".repeat(10001) },
    { attachments: null },
    { attachments: [null] },
    { attachments: [files[0], files[0]] },
    { attachments: [[files[0]]] },
    { attachments: Array.from({ length: 11 }, () => randomUUID()) },
    ...[files[2], files[3], files[4], files[5], randomUUID()].map((id) => ({
      attachments: [id],
    })),
  ];
  for (const overrides of variants) {
    const args = input(overrides);
    expect(
      (await sessions.a.rpc("send_process_message", args)).error,
    ).not.toBeNull();
    if (args.request_id) {
      expect(
        (await db.from("messages").select("id").eq("id", args.request_id)).data,
      ).toEqual([]);
      expect(
        (
          await db
            .from("audit_log")
            .select("id")
            .eq("target_id", args.request_id)
        ).data,
      ).toEqual([]);
    }
    expect(await queued(String(args.request_id))).toEqual([]);
  }
  expect(
    (
      await db
        .from("timeline_events")
        .select("id")
        .eq("process_id", processId)
        .eq("kind", "message_sent")
    ).data,
  ).toHaveLength(1);
});
it("conteúdo enviado e metadados dos anexos ficam imutáveis; FK bloqueia exclusão", async () => {
  for (const change of [
    { name: "Novo nome" },
    { folder: "case" },
    { upload_status: "pending" },
    { process_id: alternateId },
    { path: "outro/caminho.pdf" },
  ])
    expect(
      (await db.from("files").update(change).eq("id", files[0])).error?.message,
    ).toContain("vinculado");
  expect((await db.from("files").delete().eq("id", files[0])).error?.code).toBe(
    "23503",
  );
  for (const change of [
    { body: "Novo texto" },
    { author_id: calculatorId },
    { attachment_ids: [] },
    { created_at: "2026-01-01T00:00:00Z" },
  ])
    expect(
      (await db.from("messages").update(change).eq("id", firstMessage)).error
        ?.message,
    ).toContain("não pode ser alterada");
});
it("o replay revalida a permissão atual do processo", async () => {
  const own = await db
      .from("processes")
      .select("client_id")
      .eq("id", processId)
      .single(),
    other = await db
      .from("processes")
      .select("client_id")
      .eq("id", foreignId)
      .single();
  try {
    expect(
      (
        await db
          .from("processes")
          .update({ client_id: other.data!.client_id })
          .eq("id", processId)
      ).error,
    ).toBeNull();
    expect(
      (
        await sessions.a.rpc(
          "send_process_message",
          input({
            request_id: firstMessage,
            message_body: "Texto fictício\nLinha dois",
            attachments: files.slice(0, 2),
          }),
        )
      ).error,
    ).not.toBeNull();
    expect(
      (
        await sessions.a.rpc("get_process_participants", {
          target_process: processId,
        })
      ).data,
    ).toEqual([]);
  } finally {
    expect(
      (
        await db
          .from("processes")
          .update({ client_id: own.data!.client_id })
          .eq("id", processId)
      ).error,
    ).toBeNull();
  }
});
it("alteração concorrente de anexo e envio não conseguem confirmar versões incompatíveis", async () => {
  for (let attempt = 0; attempt < 6; attempt++) {
    const id = randomUUID();
    expect(
      (
        await db.from("files").insert({
          id,
          process_id: processId,
          uploaded_by: ownerId,
          folder: "client",
          upload_status: "uploaded",
          path: `messages-rls/${id}.pdf`,
          name: "Anexo fictício de corrida",
          mime: "application/pdf",
          size_bytes: 10,
        })
      ).error,
    ).toBeNull();
    const [message, change] = await Promise.all([
      sessions.a.rpc("send_process_message", input({ attachments: [id] })),
      db.from("files").update({ folder: "case" }).eq("id", id),
    ]);
    // A ordem pode variar; exatamente uma das operações precisa vencer.
    expect(Number(!message.error) + Number(!change.error)).toBe(1);
    const stored = await db
      .from("files")
      .select("folder")
      .eq("id", id)
      .single();
    expect(stored.data?.folder).toBe(message.error ? "case" : "client");
  }
});
it("resposta usa o dono como destinatário; preferências controlam cada canal", async () => {
  const reply = input({ message_body: "Resposta fictícia do calculista" });
  expect(
    (await sessions.calculator.rpc("send_process_message", reply)).error,
  ).toBeNull();
  expect(await queued(reply.request_id)).toEqual([
    {
      channel: "email",
      recipient: "clientea@exemplo.com",
      template: "new_message",
      data: { process_id: processId, message_id: reply.request_id },
      status: "pending",
    },
  ]);
  await preference(ownerId, "email", false);
  const silentReply = input();
  expect(
    (await sessions.calculator.rpc("send_process_message", silentReply)).error,
  ).toBeNull();
  expect(await queued(silentReply.request_id)).toEqual([]);
  await preference(calculatorId, "email", false);
  await preference(calculatorId, "whatsapp", false);
  const silent = input();
  expect(
    (await sessions.a.rpc("send_process_message", silent)).error,
  ).toBeNull();
  expect(await queued(silent.request_id)).toEqual([]);
  await preference(calculatorId, "whatsapp", true);
  const onlyWhatsApp = input();
  expect(
    (await sessions.a.rpc("send_process_message", onlyWhatsApp)).error,
  ).toBeNull();
  expect(
    (await queued(onlyWhatsApp.request_id)).map((row) => row.channel),
  ).toEqual(["whatsapp"]);
});
it("participantes projetam apenas dono e autores da pasta, sem e-mail ou outro cliente", async () => {
  const participants = await sessions.a.rpc("get_process_participants", {
    target_process: processId,
  });
  expect(participants.error).toBeNull();
  expect(
    participants.data
      .map((row: { profile_id: string }) => row.profile_id)
      .sort(),
  ).toEqual([ownerId, calculatorId].sort());
  for (const row of participants.data)
    expect(Object.keys(row).sort()).toEqual([
      "display_name",
      "participant_role",
      "profile_id",
    ]);
  for (const session of [sessions.b, sessions.admin])
    expect(
      (
        await session.rpc("get_process_participants", {
          target_process: processId,
        })
      ).data,
    ).toEqual([]);
  expect(
    (
      await client().rpc("get_process_participants", {
        target_process: processId,
      })
    ).error,
  ).not.toBeNull();
});
