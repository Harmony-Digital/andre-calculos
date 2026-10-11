import { beforeAll, afterAll, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localSystem } from "../e2e/local-helper";
import {
  fictionalPriceParameters,
  fictionalServiceSettings,
} from "../settings-fixture";
import { classifyComplexity } from "../../src/modules/orders/complexity";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
  key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  password = process.env.ANDRE_TEST_PASSWORD!;
const system = localSystem(),
  sessions: Record<string, SupabaseClient> = {},
  created: string[] = [];
let previousSettings: Record<string, unknown>,
  previousActive: string | undefined,
  latest: number,
  firstId: string;
const seededOrder = "00000000-0000-4000-8000-000000000201";
let previousOrderTable: string | null;
beforeAll(async () => {
  const cfg = await system
    .from("settings")
    .select("*")
    .eq("singleton", true)
    .single();
  if (cfg.error) throw new Error("Configuração fictícia indisponível");
  previousSettings = cfg.data;
  const tables = await system
    .from("price_tables")
    .select("id,version,active")
    .order("version", { ascending: false });
  if (tables.error) throw new Error("Preços fictícios indisponíveis");
  latest = tables.data[0]?.version ?? 0;
  previousActive = tables.data.find((row) => row.active)?.id;
  previousOrderTable =
    (
      await system
        .from("orders")
        .select("price_table_id")
        .eq("id", seededOrder)
        .single()
    ).data?.price_table_id ?? null;
  for (const role of ["calculator", "admin", "client"]) {
    const db = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const result = await db.auth.signInWithPassword({
      email:
        role === "calculator"
          ? "calculista@exemplo.com"
          : role === "admin"
            ? "admin@exemplo.com"
            : "clientea@exemplo.com",
      password,
    });
    if (result.error) throw new Error("Login fictício não concluído");
    sessions[role] = db;
  }
});
afterAll(async () => {
  await system
    .from("orders")
    .update({ price_table_id: previousOrderTable })
    .eq("id", seededOrder);
  if (created.length)
    await system
      .from("price_tables")
      .update({ active: false })
      .in("id", created);
  if (previousActive)
    await system
      .from("price_tables")
      .update({ active: true })
      .eq("id", previousActive);
  const { id, created_at, updated_at, ...restore } = previousSettings;
  void created_at;
  void updated_at;
  await system.from("settings").update(restore).eq("id", id);
  await Promise.all(
    Object.values(sessions).map((db) => db.auth.signOut({ scope: "local" })),
  );
});
it("cliente e anônimo não gravam configurações ou preços", async () => {
  for (const db of [sessions.client, createClient(url, key)]) {
    expect(
      (
        await db.rpc("save_service_settings", {
          payload: fictionalServiceSettings,
          expected_revision: 1,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await db.rpc("save_price_version", {
          payload: fictionalPriceParameters,
          example: false,
          expected_version: latest,
          approved: true,
        })
      ).error,
    ).not.toBeNull();
  }
  expect((await sessions.client.from("settings").select("*")).data).toEqual([]);
  expect(
    (
      await sessions.admin
        .from("settings")
        .update({ pix_key: "invasao" })
        .eq("singleton", true)
    ).error?.code,
  ).toBe("42501");
});
it("configurações têm revisão, auditoria e projeção pública sem Pix", async () => {
  const current = (
    await sessions.admin
      .from("settings")
      .select("revision,approved_terms_version")
      .eq("singleton", true)
      .single()
  ).data!;
  const saved = await sessions.calculator.rpc("save_service_settings", {
    payload: {
      ...fictionalServiceSettings,
      approved_terms_version: "injetada",
    },
    expected_revision: current.revision,
  });
  expect(saved.error).toBeNull();
  expect(saved.data).toBe(current.revision + 1);
  const limits = await sessions.client.rpc("get_complexity_limits");
  expect(limits.error).toBeNull();
  expect(limits.data).toEqual({
    wageThreshold: 6,
    pageThreshold: 1000,
    claimantThreshold: 1,
  });
  expect(
    classifyComplexity(
      {
        wageItems: ["severance"],
        timecardFormat: "none",
        claimants: 1,
        processPages: 1001,
      },
      limits.data,
    ).level,
  ).toBe("high");
  expect(
    (
      await sessions.admin.rpc("save_service_settings", {
        payload: fictionalServiceSettings,
        expected_revision: current.revision,
      })
    ).error?.message,
  ).toContain("outra sessão");
  const publicInfo = await createClient(url, key).rpc(
    "get_public_service_info",
  );
  expect(publicInfo.error).toBeNull();
  expect(publicInfo.data?.[0]?.technical_name).toBe(
    fictionalServiceSettings.technicalName,
  );
  expect(publicInfo.data?.[0]).not.toHaveProperty("pix_key");
  expect(
    (
      await system
        .from("settings")
        .select("approved_terms_version")
        .eq("singleton", true)
        .single()
    ).data?.approved_terms_version,
  ).toBe(current.approved_terms_version);
  expect(
    (
      await sessions.admin
        .from("audit_log")
        .select("id")
        .eq("action", "service_settings_saved")
    ).data!.length,
  ).toBeGreaterThan(0);
});
it("preço inválido ou sem aprovação não cria versão; exemplo continua inativo", async () => {
  for (const input of [
    { ...fictionalPriceParameters, perWage: -1 },
    {
      ...fictionalPriceParameters,
      businessDays: { simple: 0, medium: 5, high: 8 },
    },
  ])
    expect(
      (
        await sessions.calculator.rpc("save_price_version", {
          payload: input,
          example: false,
          expected_version: latest,
          approved: true,
        })
      ).error,
    ).not.toBeNull();
  expect(
    (
      await sessions.calculator.rpc("save_price_version", {
        payload: fictionalPriceParameters,
        example: false,
        expected_version: latest,
        approved: false,
      })
    ).error,
  ).not.toBeNull();
  const example = await sessions.admin.rpc("save_price_version", {
    payload: fictionalPriceParameters,
    example: true,
    expected_version: latest,
  });
  expect(example.error).toBeNull();
  const row = example.data[0];
  created.push(row.table_id);
  latest = row.table_version;
  expect(row.is_active).toBe(false);
  expect(
    (
      await sessions.admin
        .from("price_items")
        .select("id")
        .eq("price_table_id", row.table_id)
    ).data?.length,
  ).toBe(9);
});
it("duas ativações concorrentes não sobrescrevem a mesma revisão", async () => {
  const input = {
    payload: fictionalPriceParameters,
    example: false,
    expected_version: latest,
    approved: true,
  };
  const results = await Promise.all([
    sessions.calculator.rpc("save_price_version", input),
    sessions.admin.rpc("save_price_version", input),
  ]);
  expect(results.filter((result) => !result.error)).toHaveLength(1);
  expect(results.find((result) => result.error)?.error?.message).toContain(
    "outra sessão",
  );
  const row = results.find((result) => !result.error)!.data[0];
  firstId = row.table_id;
  created.push(firstId);
  latest = row.table_version;
  expect(
    (await system.from("price_tables").select("id").eq("active", true)).data,
  ).toEqual([{ id: firstId }]);
});
it("ativação nova preserva a versão ligada ao pedido e bloqueia alteração dos itens antigos", async () => {
  expect(
    (
      await system
        .from("orders")
        .update({ price_table_id: firstId })
        .eq("id", seededOrder)
    ).error,
  ).toBeNull();
  const input = {
    ...fictionalPriceParameters,
    base: { ...fictionalPriceParameters.base, initial: 99999 },
  };
  const next = await sessions.admin.rpc("save_price_version", {
    payload: input,
    example: false,
    expected_version: latest,
    approved: true,
  });
  expect(next.error).toBeNull();
  created.push(next.data[0].table_id);
  latest = next.data[0].table_version;
  expect(
    (
      await system
        .from("orders")
        .select("price_table_id")
        .eq("id", seededOrder)
        .single()
    ).data?.price_table_id,
  ).toBe(firstId);
  const old = await system
    .from("price_tables")
    .select("parameters,active")
    .eq("id", firstId)
    .single();
  expect(old.data?.active).toBe(false);
  expect(old.data?.parameters.base.initial).toBe(15001);
  expect(
    (
      await system
        .from("price_tables")
        .update({ parameters: input, activated_at: null })
        .eq("id", firstId)
    ).error?.message,
  ).toContain("imutável");
  expect(
    (
      await system
        .from("price_items")
        .update({ amount_cents: 1 })
        .eq("price_table_id", firstId)
        .eq("code", "base_initial")
    ).error?.message,
  ).toContain("imutáveis");
  expect(
    (
      await system.from("price_items").insert({
        price_table_id: firstId,
        code: "injetado",
        label: "teste",
        kind: "addon",
        amount_cents: 1,
      })
    ).error?.message,
  ).toContain("imutáveis");
  expect(
    (await system.from("price_tables").delete().eq("id", firstId)).error
      ?.message,
  ).toContain("histórico");
});
