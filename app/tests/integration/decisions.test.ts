import { beforeAll, afterAll, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { localSystem, leaseLocalSettings } from "../e2e/local-helper";
import {
  createMessageProcess,
  removeMessageProcess,
} from "../e2e/messages-helper";
import { fictionalServiceSettings as cfg } from "../settings-fixture";
const db = localSystem(),
  sessions: Record<string, SupabaseClient> = {},
  firstId = randomUUID();
let processId: string,
  alternateId: string,
  calculatorId: string,
  clientId: string;
const anonymous = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const input = (patch: Record<string, unknown> = {}) => ({
  target_process: processId,
  request_id: randomUUID(),
  decision_parameter: "interest",
  decision_value: "1% fictício",
  decision_source: "judgment",
  decision_page: null,
  decision_rationale: "Justificativa fictícia.",
  ...patch,
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
      throw new Error("Login fictício de decisões não concluído.");
    sessions[role] = session;
  }
  calculatorId = (await sessions.calculator.auth.getUser()).data.user!.id;
  clientId = (await sessions.client.auth.getUser()).data.user!.id;
  processId = (await createMessageProcess()).id;
  alternateId = (await createMessageProcess()).id;
});
afterAll(async () => {
  for (const id of [processId, alternateId])
    if (id) await removeMessageProcess(id);
  await Promise.all(
    Object.values(sessions).map((s) => s.auth.signOut({ scope: "local" })),
  );
});
it("gravação concorrente e replay criam uma decisão/evento/auditoria com autoria da sessão", async () => {
  const args = input({
    request_id: firstId,
    decision_value: " \t1% fictício\r\nLinha 2\u00a0",
  });
  const results = await Promise.all([
    sessions.calculator.rpc("record_process_decision", args),
    sessions.calculator.rpc("record_process_decision", args),
  ]);
  for (const result of results) {
    expect(result.error).toBeNull();
    expect(result.data).toBe(firstId);
  }
  const row = await sessions.client
    .from("decisions")
    .select(
      "value,page,recorded_by,order_id,client_confirmed_at,client_confirmed_by",
    )
    .eq("id", firstId)
    .single();
  expect(row.data).toEqual({
    value: "1% fictício\nLinha 2",
    page: null,
    recorded_by: calculatorId,
    order_id: null,
    client_confirmed_at: null,
    client_confirmed_by: null,
  });
  expect(
    (
      await db
        .from("timeline_events")
        .select("id")
        .contains("data", { decision_id: firstId })
    ).data,
  ).toHaveLength(1);
  expect(
    (await db.from("audit_log").select("id").eq("target_id", firstId)).data,
  ).toHaveLength(1);
  const omitted = input({ decision_page: undefined });
  expect(
    (await sessions.calculator.rpc("record_process_decision", omitted)).error,
  ).toBeNull();
});
it("não aceita campos inválidos ou reaproveitamento da chave com outros dados", async () => {
  for (const patch of [
    { request_id: null },
    { target_process: null },
    { decision_parameter: null },
    { decision_parameter: "fixture" },
    { decision_source: null },
    { decision_source: "other" },
    { decision_value: null },
    { decision_value: "\u00a0 \t" },
    { decision_value: "a".repeat(1001) },
    { decision_rationale: null },
    { decision_rationale: " " },
    { decision_rationale: "a".repeat(2001) },
    { decision_page: 0 },
    { decision_page: -1 },
    { decision_page: 100001 },
  ])
    expect(
      (await sessions.calculator.rpc("record_process_decision", input(patch)))
        .error,
    ).not.toBeNull();
  const original = input({
    request_id: firstId,
    decision_value: "1% fictício\nLinha 2",
  });
  for (const patch of [
    { target_process: alternateId },
    { decision_parameter: "period" },
    { decision_value: "2%" },
    { decision_source: "lawyer" },
    { decision_page: 12 },
    { decision_rationale: "Outro motivo" },
  ])
    expect(
      (
        await sessions.calculator.rpc("record_process_decision", {
          ...original,
          ...patch,
        })
      ).error,
    ).not.toBeNull();
});
it("roles indevidos e DML direto são negados; replay revalida papel atual", async () => {
  for (const s of [
    sessions.client,
    sessions.clientB,
    sessions.admin,
    anonymous(),
    db,
  ])
    expect(
      (await s.rpc("record_process_decision", input())).error,
    ).not.toBeNull();
  for (const s of [sessions.calculator, sessions.client]) {
    expect(
      (
        await s.from("decisions").insert({
          id: randomUUID(),
          process_id: processId,
          recorded_by: calculatorId,
          parameter: "interest",
          value: "1%",
          source: "calculator",
          rationale: "Teste",
        })
      ).error?.code,
    ).toBe("42501");
    expect(
      (await s.from("decisions").update({ value: "Outro" }).eq("id", firstId))
        .error?.code,
    ).toBe("42501");
    expect(
      (await s.from("decisions").delete().eq("id", firstId)).error?.code,
    ).toBe("42501");
  }
  for (const s of [sessions.clientB, sessions.admin])
    expect(
      (await s.from("decisions").select("id").eq("process_id", processId)).data,
    ).toEqual([]);
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
          "record_process_decision",
          input({
            request_id: firstId,
            decision_value: "1% fictício\nLinha 2",
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
it("somente dono confirma; concorrência e replay mantêm uma concordância e não mudam a decisão", async () => {
  for (const s of [
    sessions.calculator,
    sessions.admin,
    sessions.clientB,
    anonymous(),
    db,
  ])
    expect(
      (await s.rpc("confirm_process_decision", { target_decision: firstId }))
        .error,
    ).not.toBeNull();
  const results = await Promise.all([
    sessions.client.rpc("confirm_process_decision", {
      target_decision: firstId,
    }),
    sessions.client.rpc("confirm_process_decision", {
      target_decision: firstId,
    }),
  ]);
  for (const r of results) {
    expect(r.error).toBeNull();
    expect(r.data).toBe(firstId);
  }
  const row = (
    await db
      .from("decisions")
      .select("client_confirmed_at,client_confirmed_by,recorded_by,value")
      .eq("id", firstId)
      .single()
  ).data!;
  expect(row.client_confirmed_at).not.toBeNull();
  expect(row.client_confirmed_by).toBe(clientId);
  expect(row.recorded_by).toBe(calculatorId);
  expect(row.value).toBe("1% fictício\nLinha 2");
  expect(
    (
      await db
        .from("audit_log")
        .select("id")
        .eq("target_id", firstId)
        .eq("action", "decision_confirmed")
    ).data,
  ).toHaveLength(1);
  expect(
    (
      await db
        .from("timeline_events")
        .select("id")
        .contains("data", { decision_id: firstId, confirmation: true })
    ).data,
  ).toHaveLength(1);
  expect(
    (
      await sessions.calculator.rpc(
        "record_process_decision",
        input({ request_id: firstId, decision_value: "1% fictício\nLinha 2" }),
      )
    ).error,
  ).toBeNull();
  expect(
    (
      await db
        .from("decisions")
        .select("client_confirmed_at")
        .eq("id", firstId)
        .single()
    ).data!.client_confirmed_at,
  ).toBe(row.client_confirmed_at);
});
it("conteúdo/autoria/timestamps e confirmação não podem ser reescritos mesmo pelo sistema", async () => {
  for (const patch of [
    { id: randomUUID() },
    { process_id: alternateId },
    { recorded_by: clientId },
    { parameter: "other" },
    { value: "Outro" },
    { source: "lawyer" },
    { page: 1 },
    { rationale: "Outro" },
    { created_at: "2020-01-01T00:00:00Z" },
    { client_confirmed_at: null, client_confirmed_by: null },
    { client_confirmed_by: calculatorId },
  ])
    expect(
      (await db.from("decisions").update(patch).eq("id", firstId)).error,
    ).not.toBeNull();
  const fresh = input();
  expect(
    (await sessions.calculator.rpc("record_process_decision", fresh)).error,
  ).toBeNull();
  expect(
    (
      await db
        .from("decisions")
        .update({
          client_confirmed_by: clientId,
          client_confirmed_at: new Date().toISOString(),
        })
        .eq("id", fresh.request_id)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await db
        .from("decisions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", firstId)
    ).error,
  ).toBeNull();
});
it("snapshot PDF exige identidade profissional, audita acesso e não expõe outro processo", async () => {
  const release = await leaseLocalSettings(),
    prior = (
      await db.from("settings").select("*").eq("singleton", true).single()
    ).data!;
  try {
    expect(
      (
        await db
          .from("settings")
          .update({
            technical_name: null,
            crc_number: null,
            crc_state: null,
            crc_category: null,
          })
          .eq("singleton", true)
      ).error,
    ).toBeNull();
    expect(
      (
        await sessions.client.rpc("get_process_decision_export", {
          target_process: processId,
        })
      ).error?.message,
    ).toBe("Identificação profissional pendente");
    expect(
      (
        await db
          .from("settings")
          .update({
            technical_name: cfg.technicalName,
            crc_number: cfg.crcNumber,
            crc_state: cfg.crcState,
            crc_category: cfg.crcCategory,
          })
          .eq("singleton", true)
      ).error,
    ).toBeNull();
    for (const s of [sessions.clientB, sessions.admin, anonymous(), db])
      expect(
        (
          await s.rpc("get_process_decision_export", {
            target_process: processId,
          })
        ).error,
      ).not.toBeNull();
    const result = await sessions.client.rpc("get_process_decision_export", {
      target_process: processId,
    });
    expect(result.error).toBeNull();
    expect(result.data.professional).toEqual({
      name: cfg.technicalName,
      crcNumber: cfg.crcNumber,
      crcState: cfg.crcState,
      category: cfg.crcCategory,
    });
    expect(
      result.data.decisions.find((d: { id: string }) => d.id === firstId),
    ).toMatchObject({
      recordedBy: "Calculista de teste",
      confirmedBy: "Cliente A de teste",
      value: "1% fictício\nLinha 2",
    });
    expect(result.data.professional).not.toHaveProperty("pix_key");
    expect(
      (
        await db
          .from("audit_log")
          .select("id")
          .eq("target_id", processId)
          .eq("action", "decisions_pdf_access")
      ).data,
    ).toHaveLength(1);
  } finally {
    expect(
      (await db.from("settings").update(prior).eq("singleton", true)).error,
    ).toBeNull();
    await release();
  }
});
