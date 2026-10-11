import { beforeAll, afterAll, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { localSystem } from "../e2e/local-helper";
import {
  createMessageProcess,
  removeMessageProcess,
} from "../e2e/messages-helper";
const db = localSystem(),
  sessions: Record<string, SupabaseClient> = {},
  firstId = randomUUID();
let processId: string, alternateId: string, calculatorId: string;
const anonymous = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const input = (extra: Record<string, unknown> = {}) => ({
  target_process: processId,
  note_body: "Nota fictícia",
  request_id: randomUUID(),
  ...extra,
});
beforeAll(async () => {
  for (const [role, email] of Object.entries({
    client: "clientea@exemplo.com",
    calculator: "calculista@exemplo.com",
    admin: "admin@exemplo.com",
    clientB: "clienteb@exemplo.com",
  })) {
    const session = anonymous();
    if (
      (
        await session.auth.signInWithPassword({
          email,
          password: process.env.ANDRE_TEST_PASSWORD!,
        })
      ).error
    )
      throw new Error("Login fictício de notas não concluído.");
    sessions[role] = session;
  }
  calculatorId = (await sessions.calculator.auth.getUser()).data.user!.id;
  processId = (await createMessageProcess()).id;
  alternateId = (await createMessageProcess()).id;
});
afterAll(async () => {
  for (const id of [processId, alternateId])
    if (id) await removeMessageProcess(id);
  await Promise.all(
    Object.values(sessions).map((session) =>
      session.auth.signOut({ scope: "local" }),
    ),
  );
});
it("notas concorrentes iguais criam um evento e uma auditoria, sem aviso externo", async () => {
  const args = input({
    request_id: firstId,
    note_body: " \tNota fictícia\r\nLinha dois\u00a0",
  });
  const results = await Promise.all([
    sessions.calculator.rpc("add_process_note", args),
    sessions.calculator.rpc("add_process_note", args),
  ]);
  for (const result of results) {
    expect(result.error).toBeNull();
    expect(result.data).toBe(firstId);
  }
  const event = await sessions.client
    .from("timeline_events")
    .select("kind,data,actor_id,order_id")
    .eq("id", firstId)
    .single();
  expect(event.data).toEqual({
    kind: "note_added",
    data: { note: "Nota fictícia\nLinha dois" },
    actor_id: calculatorId,
    order_id: null,
  });
  expect(
    (
      await db
        .from("audit_log")
        .select("id")
        .eq("target_id", firstId)
        .eq("action", "note_added")
    ).data,
  ).toHaveLength(1);
  expect(
    (
      await db
        .from("notifications")
        .select("id")
        .contains("data", { process_id: processId })
    ).data,
  ).toEqual([]);
  expect(
    (
      await sessions.calculator.rpc("add_process_note", {
        ...args,
        note_body: "Nota fictícia\nLinha dois",
      })
    ).data,
  ).toBe(firstId);
});
it("somente o calculista registra nota; escrita direta e helper interno são negados", async () => {
  for (const session of [
    anonymous(),
    sessions.client,
    sessions.clientB,
    sessions.admin,
    db,
  ])
    expect(
      (await session.rpc("add_process_note", input())).error,
    ).not.toBeNull();
  for (const session of [sessions.client, sessions.calculator]) {
    expect(
      (
        await session.from("timeline_events").insert({
          process_id: processId,
          kind: "note_added",
          data: { note: "Fora da RPC" },
          actor_id: calculatorId,
        })
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await session
          .from("timeline_events")
          .update({ data: { note: "Alteração" } })
          .eq("id", firstId)
      ).error?.code,
    ).toBe("42501");
    expect(
      (await session.from("timeline_events").delete().eq("id", firstId)).error
        ?.code,
    ).toBe("42501");
  }
  for (const session of [anonymous(), sessions.client, sessions.calculator, db])
    expect(
      (
        await session.schema("private").rpc("record_event", {
          target_process: processId,
          event_kind: "note_added",
          event_data: { note: "Forjado" },
          event_actor: calculatorId,
        })
      ).error,
    ).not.toBeNull();
  expect(
    (
      await sessions.clientB
        .from("timeline_events")
        .select("id")
        .eq("id", firstId)
    ).data,
  ).toEqual([]);
  expect(
    (
      await sessions.admin
        .from("timeline_events")
        .select("id")
        .eq("id", firstId)
    ).data,
  ).toEqual([]);
});
it("nota nula, vazia, grande ou sem identificadores não deixa evento nem auditoria", async () => {
  for (const extra of [
    { target_process: null },
    { request_id: null },
    { note_body: null },
    { note_body: "\t\n\u2003" },
    { note_body: "x".repeat(2001) },
    { target_process: randomUUID() },
  ]) {
    const args = input(extra);
    expect(
      (await sessions.calculator.rpc("add_process_note", args)).error,
    ).not.toBeNull();
    if (args.request_id)
      expect(
        (
          await db
            .from("audit_log")
            .select("id")
            .eq("target_id", args.request_id)
        ).data,
      ).toEqual([]);
  }
  expect(
    (await db.from("timeline_events").select("id").eq("process_id", processId))
      .data,
  ).toHaveLength(1);
});
it("replay divergir no texto, processo ou tipo é recusado", async () => {
  for (const extra of [
    { note_body: "Outro texto" },
    { target_process: alternateId },
  ])
    expect(
      (
        await sessions.calculator.rpc(
          "add_process_note",
          input({
            request_id: firstId,
            note_body: "Nota fictícia\nLinha dois",
            ...extra,
          }),
        )
      ).error,
    ).not.toBeNull();
  const collision = randomUUID();
  expect(
    (
      await db.from("timeline_events").insert({
        id: collision,
        process_id: alternateId,
        kind: "file_uploaded",
        actor_id: calculatorId,
        data: { note: "Nota fictícia" },
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await sessions.calculator.rpc(
        "add_process_note",
        input({ target_process: alternateId, request_id: collision }),
      )
    ).error,
  ).not.toBeNull();
  expect(
    (await db.from("audit_log").select("id").eq("target_id", collision)).data,
  ).toEqual([]);
});
it("replay revalida o papel atual do autor", async () => {
  try {
    expect(
      (
        await db
          .from("profiles")
          .update({ role: "client" })
          .eq("id", calculatorId)
      ).error,
    ).toBeNull();
    expect(
      (
        await sessions.calculator.rpc(
          "add_process_note",
          input({
            request_id: firstId,
            note_body: "Nota fictícia\nLinha dois",
          }),
        )
      ).error,
    ).not.toBeNull();
  } finally {
    expect(
      (
        await db
          .from("profiles")
          .update({ role: "calculator" })
          .eq("id", calculatorId)
      ).error,
    ).toBeNull();
  }
});
it("eventos preservam todos os campos de conteúdo, mesmo em escrita administrativa local", async () => {
  for (const change of [
    { id: randomUUID() },
    { data: { note: "Nova nota" } },
    { kind: "message_sent" },
    { actor_id: null },
    { process_id: alternateId },
    { created_at: "2026-01-01T00:00:00Z" },
  ])
    expect(
      (await db.from("timeline_events").update(change).eq("id", firstId)).error
        ?.message,
    ).toContain("não pode ser alterada");
  expect(
    (
      await db
        .from("timeline_events")
        .update({ updated_at: "2026-01-01T00:00:00Z" })
        .eq("id", firstId)
    ).error,
  ).toBeNull();
});
