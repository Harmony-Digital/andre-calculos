import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fictionalChecklist } from "../../src/modules/checklist/fixtures";
import { fictionalCnj, removeLocalDraft } from "../e2e/draft-helper";
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
let draftId: string | undefined;
const draftAnswers = { ...fictionalChecklist, processNumber: fictionalCnj() };
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
  if (draftId) await removeLocalDraft(draftId);
  if (disposableId) {
    const system = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    await system.from("audit_log").delete().eq("actor_id", disposableId);
    await system.from("clients").delete().eq("owner_id", disposableId);
    await system.auth.admin.deleteUser(disposableId);
  }
  await Promise.all(
    Object.values(sessions).map((s) => s.auth.signOut({ scope: "local" })),
  );
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
  it("perfil é atualizado por RPC auditada, sem update direto", async () => {
    const {
      data: { user },
    } = await sessions.a.auth.getUser();
    const result = await sessions.a.rpc("update_own_profile", {
      full_name: "Cliente A de teste",
      phone: "+5561999999999",
      oab_number: "",
      oab_state: "",
      city: "Cidade fictícia",
      legal_name: "Cliente A de teste",
    });
    expect(result.error).toBeNull();
    expect(
      (
        await sessions.a
          .from("profiles")
          .update({ full_name: "Sem auditoria" })
          .eq("id", user!.id)
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await sessions.b
          .from("profiles")
          .update({ full_name: "Não permitido" })
          .eq("id", user!.id)
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await sessions.a
          .from("profiles")
          .select("full_name")
          .eq("id", user!.id)
          .single()
      ).data?.full_name,
    ).toBe("Cliente A de teste");
    expect(
      (
        await client().rpc("update_own_profile", {
          full_name: "Acesso anônimo",
          phone: "+5561999999999",
          oab_number: "",
          oab_state: "",
          city: "",
          legal_name: "Não permitido",
        })
      ).error,
    ).not.toBeNull();
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
  it("pedido de exclusão é idempotente e não apaga a conta", async () => {
    const system = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const fixture = await system.auth.admin.getUserById(disposableId!);
    const own = client();
    expect(
      (
        await own.auth.signInWithPassword({
          email: fixture.data.user!.email!,
          password,
        })
      ).error,
    ).toBeNull();
    const first = await own.rpc("request_account_deletion"),
      second = await own.rpc("request_account_deletion");
    expect(first.error).toBeNull();
    expect(second.data).toBe(first.data);
    expect(
      (
        await system
          .from("audit_log")
          .select("id")
          .eq("actor_id", disposableId!)
          .eq("action", "account_deletion_requested")
      ).data,
    ).toHaveLength(1);
    expect((await own.auth.getUser()).data.user?.id).toBe(disposableId);
    expect(
      (await sessions.admin.rpc("request_account_deletion")).error,
    ).not.toBeNull();
    await own.auth.signOut();
  });
  it("rascunho fica próprio, sem preço nem entrada na fila", async () => {
    const saved = await sessions.a.rpc("save_checklist_draft", {
      payload: { ...draftAnswers, status: "queued", total_cents: 1 },
      completed_step: 8,
    });
    expect(saved.error).toBeNull();
    draftId = saved.data[0].order_id;
    expect(
      (
        await sessions.a
          .from("orders")
          .select("status,total_cents")
          .eq("id", draftId)
          .single()
      ).data,
    ).toEqual({ status: "draft", total_cents: 0 });
    expect(
      (
        await sessions.b.rpc("save_checklist_draft", {
          payload: draftAnswers,
          completed_step: 8,
          draft_id: draftId,
          expected_revision: 1,
        })
      ).error,
    ).not.toBeNull();
  });
  it("revisão antiga não sobrescreve o rascunho e edição própria persiste", async () => {
    expect(
      (
        await sessions.a.rpc("save_checklist_draft", {
          payload: { ...draftAnswers, instructions: "Atualização fictícia" },
          completed_step: 8,
          draft_id: draftId,
          expected_revision: 1,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await sessions.a.rpc("save_checklist_draft", {
          payload: { ...draftAnswers, instructions: "Versão antiga" },
          completed_step: 8,
          draft_id: draftId,
          expected_revision: 1,
        })
      ).error?.message,
    ).toContain("outra sessão");
    const edit = await sessions.a.rpc("save_checklist_draft", {
      payload: {
        ...draftAnswers,
        court: "Unidade fictícia revisada",
        instructions: "Atualização fictícia",
      },
      completed_step: 8,
      draft_id: draftId,
      expected_revision: 2,
    });
    expect(edit.error).toBeNull();
    expect(edit.data[0].revision).toBe(3);
    expect(
      (
        await sessions.a
          .from("processes")
          .select("chamber")
          .eq("id", edit.data[0].process_id)
          .single()
      ).data?.chamber,
    ).toBe("Unidade fictícia revisada");
    expect(
      (
        await sessions.a
          .from("checklists")
          .select("answers")
          .eq("order_id", draftId)
          .single()
      ).data?.answers.instructions,
    ).toBe("Atualização fictícia");
  });
});
