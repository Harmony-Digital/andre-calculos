import { beforeAll, afterAll, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { localSystem } from "../e2e/local-helper";
const db = localSystem(),
  sessions: Record<string, SupabaseClient> = {};
const fileId = randomUUID(),
  boundaryId = randomUUID(),
  missingId = randomUUID(),
  settingsId = randomUUID();
const ids: string[] = [],
  targetIds = [fileId, boundaryId, missingId, settingsId];
let actorId: string;
const call = (args: Record<string, unknown> = {}, role = "calculator") =>
  sessions[role].rpc("get_file_access_audit", args);
beforeAll(async () => {
  for (const [role, email] of Object.entries({
    a: "clientea@exemplo.com",
    b: "clienteb@exemplo.com",
    calculator: "calculista@exemplo.com",
    admin: "admin@exemplo.com",
  })) {
    const session = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    if (
      (
        await session.auth.signInWithPassword({
          email,
          password: process.env.ANDRE_TEST_PASSWORD!,
        })
      ).error
    )
      throw new Error("Login fictício indisponível.");
    sessions[role] = session;
  }
  actorId = (await sessions.a.auth.getUser()).data.user!.id;
  const inserted = await db.from("files").insert(
    [fileId, boundaryId].map((id) => ({
      id,
      process_id: "00000000-0000-4000-8000-000000000101",
      uploaded_by: actorId,
      folder: "case",
      path: `audit-fixture/${id}.pdf`,
      name: `Arquivo %_ fictício ${id}.pdf`,
      mime: "application/pdf",
      size_bytes: 10,
      upload_status: "uploaded",
    })),
  );
  if (inserted.error) throw new Error("Metadados fictícios indisponíveis.");
  const rows = Array.from({ length: 53 }, () => ({
    id: randomUUID(),
    actor_id: actorId,
    action: "file_view",
    target_type: "file",
    target_id: fileId,
    created_at: "2026-10-18T03:00:00.123456Z",
    ip: "127.0.0.1",
  }));
  ids.push(...rows.map((row) => row.id));
  const audit = await db.from("audit_log").insert(
    [
      ...rows,
      ...[
        "2026-10-18T02:59:59.999999Z",
        "2026-10-18T03:00:00Z",
        "2026-10-19T02:59:59.999999Z",
        "2026-10-19T03:00:00Z",
      ].map((created_at) => ({
        actor_id: actorId,
        action: "file_download",
        target_type: "file",
        target_id: boundaryId,
        created_at,
      })),
      {
        actor_id: null,
        action: "file_view",
        target_type: "file",
        target_id: missingId,
      },
      {
        actor_id: actorId,
        action: "upload_verified",
        target_type: "file",
        target_id: fileId,
      },
      {
        actor_id: actorId,
        action: "service_settings_saved",
        target_type: "settings",
        target_id: settingsId,
      },
    ],
    { defaultToNull: false },
  );
  if (audit.error) throw new Error("Auditorias fictícias indisponíveis.");
});
afterAll(async () => {
  const audit = await db.from("audit_log").delete().in("target_id", targetIds);
  const files = await db.from("files").delete().in("id", [fileId, boundaryId]);
  await Promise.all(
    Object.values(sessions).map((session) =>
      session.auth.signOut({ scope: "local" }),
    ),
  );
  if (audit.error || files.error)
    throw new Error("Limpeza das fixtures de consulta falhou.");
});
it("pagina por data/UUID sem perda, repetição ou arredondamento de microssegundos", async () => {
  const first = await call({ target_file: fileId });
  expect(first.error).toBeNull();
  expect(first.data.rows).toHaveLength(50);
  expect(first.data.has_more).toBe(true);
  expect(first.data.rows[49].created_at).toBe(
    "2026-10-18T03:00:00.123456+00:00",
  );
  const last = first.data.rows[49];
  const second = await call({
    target_file: fileId,
    cursor_created_at: last.created_at,
    cursor_id: last.id,
  });
  expect(second.error).toBeNull();
  expect(second.data.rows).toHaveLength(3);
  expect(second.data.has_more).toBe(false);
  expect(
    [...first.data.rows, ...second.data.rows].map(
      (row: { id: string }) => row.id,
    ),
  ).toEqual([...ids].sort().reverse());
  expect(Object.keys(first.data.rows[0]).sort()).toEqual(
    [
      "id",
      "created_at",
      "action",
      "actor_id",
      "actor_name",
      "file_id",
      "file_name",
      "file_version",
    ].sort(),
  );
});
it("filtra antes do limite por arquivo, autor, ação e dias inteiros de São Paulo", async () => {
  const result = await call({
    target_file: boundaryId,
    target_actor: actorId,
    access_action: "file_download",
    start_date: "2026-10-18",
    end_date: "2026-10-18",
  });
  expect(result.error).toBeNull();
  expect(
    result.data.rows.map((row: { created_at: string }) => row.created_at),
  ).toEqual(["2026-10-19T02:59:59.999999+00:00", "2026-10-18T03:00:00+00:00"]);
  expect(
    (await call({ target_file: boundaryId, access_action: "file_view" })).data
      .rows,
  ).toEqual([]);
  const actorName = result.data.rows[0].actor_name;
  const nameResult = await call({
    file_search: `Arquivo %_ fictício ${boundaryId}`,
    actor_search: actorName.toUpperCase(),
    page_size: 1,
  });
  expect(nameResult.data.rows).toHaveLength(1);
  expect(nameResult.data.has_more).toBe(true);
  expect(
    (await call({ target_file: boundaryId, actor_search: "não existe" })).data
      .rows,
  ).toEqual([]);
});
it("conserva referência de arquivo ausente e autor indisponível sem payload bruto", async () => {
  const result = await call({ target_file: missingId });
  expect(result.error).toBeNull();
  expect(result.data.rows[0]).toMatchObject({
    file_id: missingId,
    file_name: null,
    file_version: null,
    actor_id: null,
    actor_name: null,
  });
});
it("clientes, admin, anônimo e sistema não executam a consulta; admin não burla pelo SELECT legado", async () => {
  for (const role of ["a", "b", "admin"]) {
    expect((await call({ target_file: fileId }, role)).error).not.toBeNull();
    expect(
      (
        await sessions[role]
          .from("audit_log")
          .select("id")
          .eq("target_id", fileId)
      ).data,
    ).toEqual([]);
  }
  const anonymous = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  expect((await anonymous.rpc("get_file_access_audit")).error?.code).toBe(
    "42501",
  );
  expect((await db.rpc("get_file_access_audit")).error?.code).toBe("42501");
  expect(
    (
      await sessions.admin
        .from("audit_log")
        .select("action")
        .eq("target_id", settingsId)
    ).data,
  ).toEqual([{ action: "service_settings_saved" }]);
});
it("recusa filtros inconsistentes, datas infinitas, ações e limites fora do contrato", async () => {
  for (const args of [
    { page_size: 0 },
    { page_size: 51 },
    { page_size: null },
    { cursor_id: randomUUID() },
    { cursor_created_at: "infinity", cursor_id: randomUUID() },
    { start_date: "infinity" },
    { start_date: "2026-10-19", end_date: "2026-10-18" },
    { access_action: "upload_verified" },
    { file_search: "x".repeat(256) },
    { target_file: fileId, file_search: "arquivo" },
  ])
    expect((await call(args)).error).not.toBeNull();
});
