import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.ANDRE_TEST_PASSWORD;
if (
  url !== "http://127.0.0.1:54321" ||
  !key ||
  !password ||
  process.env.ANDRE_LOCAL_TESTS !== "1"
)
  throw new Error(
    "Teste permitido somente no Supabase local do André, pelo dev-env.sh.",
  );
const client = () =>
  createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
const sessions: Record<string, SupabaseClient> = {};
let disposableId: string | undefined;
const processId = "00000000-0000-4000-8000-000000000101";
beforeAll(async () => {
  for (const [role, email] of Object.entries({
    a: "clientea@exemplo.com",
    b: "clienteb@exemplo.com",
    calculator: "calculista@exemplo.com",
    admin: "admin@exemplo.com",
  })) {
    sessions[role] = client();
    const { error } = await sessions[role].auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error("Falha no login das fixtures locais.");
  }
});
afterAll(async () => {
  if (disposableId) {
    const system = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    await system.from("clients").delete().eq("owner_id", disposableId);
    await system.auth.admin.deleteUser(disposableId);
  }
  await Promise.all(Object.values(sessions).map((s) => s.auth.signOut()));
});
describe("RLS com sessões reais", () => {
  it.each([
    "processes",
    "orders",
    "checklists",
    "quotes",
    "payments",
    "files",
    "messages",
    "decisions",
    "timeline_events",
  ])("B não lê os registros de A em %s", async (table) => {
    const a = await sessions.a.from(table).select("id");
    const b = await sessions.b.from(table).select("id");
    expect(a.error).toBeNull();
    expect(a.data!.length).toBeGreaterThan(0);
    expect(b.error).toBeNull();
    expect(b.data).toEqual([]);
  });
  it("cliente não altera seu papel nem marca contrato", async () => {
    const {
      data: { user },
    } = await sessions.a.auth.getUser();
    const role = await sessions.a
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", user!.id);
    const contract = await sessions.a
      .from("clients")
      .update({ has_contract: true })
      .eq("owner_id", user!.id);
    expect(role.error?.code).toBe("42501");
    expect(contract.error?.code).toBe("42501");
    const own = await sessions.a
      .from("profiles")
      .select("role")
      .eq("id", user!.id)
      .single();
    expect(own.data?.role).toBe("client");
  });
  it("cliente não confirma pagamento nem muda o dono de processo", async () => {
    expect(
      (
        await sessions.a
          .from("payments")
          .update({ status: "confirmed" })
          .neq("id", "00000000-0000-4000-8000-000000000000")
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await sessions.b
          .from("processes")
          .update({ chamber: "tentativa" })
          .eq("id", processId)
      ).error?.code,
    ).toBe("42501");
  });
  it("cliente só atualiza campos permitidos do próprio perfil", async () => {
    const {
      data: { user },
    } = await sessions.a.auth.getUser();
    const change = await sessions.a
      .from("profiles")
      .update({ full_name: "Cliente A de teste" })
      .eq("id", user!.id)
      .select("id");
    expect(change.error).toBeNull();
    expect(change.data).toHaveLength(1);
    const other = await sessions.b
      .from("profiles")
      .update({ full_name: "Não permitido" })
      .eq("id", user!.id)
      .select("id");
    expect(other.data).toEqual([]);
  });
  it("admin acessa configurações e finanças, mas não conteúdo de processos", async () => {
    expect(
      (await sessions.admin.from("settings").select("id")).data,
    ).toHaveLength(1);
    expect(
      (await sessions.admin.from("payments").select("id")).data!.length,
    ).toBeGreaterThan(0);
    for (const table of [
      "processes",
      "files",
      "messages",
      "decisions",
      "checklists",
    ])
      expect((await sessions.admin.from(table).select("id")).data).toEqual([]);
  });
  it("calculista acessa processos e arquivos", async () => {
    expect(
      (await sessions.calculator.from("processes").select("id")).data!.length,
    ).toBeGreaterThan(0);
    expect(
      (await sessions.calculator.from("files").select("id")).data!.length,
    ).toBeGreaterThan(0);
  });
  it("anônimo não lê tabelas e cliente não lê a fila de envio", async () => {
    expect((await client().from("profiles").select("id")).error?.code).toBe(
      "42501",
    );
    expect(
      (await sessions.a.from("notifications").select("id")).error?.code,
    ).toBe("42501");
  });
  it("metadata enviada no cadastro não cria um administrador", async () => {
    const system = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const created = await system.auth.admin.createUser({
      email: `${randomBytes(8).toString("hex")}@exemplo.com`,
      password,
      email_confirm: true,
      user_metadata: { role: "admin", full_name: "Fixture temporária" },
    });
    expect(created.error).toBeNull();
    disposableId = created.data.user!.id;
    const result = await system
      .from("profiles")
      .select("role")
      .eq("id", disposableId)
      .single();
    expect(result.data?.role).toBe("client");
  });
});
