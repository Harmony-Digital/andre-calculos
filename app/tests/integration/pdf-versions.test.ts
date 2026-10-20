import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localSystem } from "../e2e/local-helper";
import {
  createMessageProcess,
  removeMessageProcess,
} from "../e2e/messages-helper";
const db = localSystem(),
  sessions: Record<string, SupabaseClient> = {};
let processId: string,
  otherProcess: string,
  actor: string,
  oldFile: string,
  newFile: string;
const entryA = randomUUID(),
  entryMixed = randomUUID();
const anonymous = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const command = (
  payload: Record<string, unknown>,
  requestId = randomUUID(),
  role = "calculator",
) =>
  sessions[role].rpc("mutate_pdf_version", {
    target_process: processId,
    request_id: requestId,
    payload,
  });
const context = (fileId: string, start = 1) =>
  sessions.calculator.rpc("get_pdf_version_context", {
    target_file: fileId,
    start_page: start,
  });
const register = (
  fileId: string,
  pageCount: number,
  previousFileId: string | null = null,
  key = randomUUID(),
) =>
  command(
    {
      operation: "register",
      fileId,
      revision: 0,
      pageCount,
      previousFileId,
      confirmed: true,
    },
    key,
  );
const versionRevision = async (fileId: string) =>
  (await context(fileId)).data.review.revision as number;
async function file(patch: Record<string, unknown> = {}) {
  const id = randomUUID();
  const result = await db.from("files").insert({
    id,
    process_id: processId,
    uploaded_by: actor,
    name: `PDF fictício ${id}.pdf`,
    path: `pdf-version-fixture/${id}.pdf`,
    folder: "case",
    mime: "application/pdf",
    size_bytes: 100,
    sha256: "a".repeat(64),
    upload_status: "uploaded",
    ...patch,
  });
  if (result.error) throw new Error("Fixture de PDF indisponível.");
  return id;
}
const index = (
  fileId: string,
  pages: string,
  id = randomUUID(),
  revision = 0,
  action = "create",
  note = "Origem fictícia",
) =>
  sessions.calculator.rpc("mutate_process_page_index", {
    target_process: processId,
    request_id: randomUUID(),
    payload: {
      action,
      fileId,
      entryId: id,
      expectedRevision: revision,
      piece: "judgment",
      pages,
      note,
    },
  });
beforeAll(async () => {
  for (const [role, email] of Object.entries({
    client: "clientea@exemplo.com",
    clientB: "clienteb@exemplo.com",
    calculator: "calculista@exemplo.com",
    admin: "admin@exemplo.com",
  })) {
    const s = anonymous();
    if (
      (
        await s.auth.signInWithPassword({
          email,
          password: process.env.ANDRE_TEST_PASSWORD!,
        })
      ).error
    )
      throw new Error("Login fictício indisponível.");
    sessions[role] = s;
  }
  actor = (await sessions.calculator.auth.getUser()).data.user!.id;
  processId = (await createMessageProcess()).id;
  otherProcess = (await createMessageProcess()).id;
  oldFile = await file();
  newFile = await file();
  expect((await index(oldFile, "1", entryA)).error).toBeNull();
  expect((await index(oldFile, "1-3", entryMixed)).error).toBeNull();
});
afterAll(async () => {
  for (const id of [processId, otherProcess])
    if (id) await removeMessageProcess(id);
  await Promise.all(
    Object.values(sessions).map((s) => s.auth.signOut({ scope: "local" })),
  );
});
it("registra contagem/vínculo explícitos com recibo, sem alterar arquivos nem índices", async () => {
  const key = randomUUID();
  const first = await register(oldFile, 4, null, key);
  expect(first.error).toBeNull();
  expect((await register(oldFile, 4, null, key)).data).toEqual(first.data);
  expect((await register(oldFile, 5, null, key)).error).not.toBeNull();
  expect((await register(newFile, 4, oldFile)).error).toBeNull();
  const snapshot = await db
    .from("files")
    .select("version,pages,sha256")
    .eq("id", oldFile)
    .single();
  expect(snapshot.data).toEqual({
    version: 1,
    pages: null,
    sha256: "a".repeat(64),
  });
  expect((await context(newFile)).data.review).toMatchObject({
    sequence: 2,
    previousFileId: oldFile,
    pageCount: 4,
  });
  expect(
    (
      await db
        .from("files")
        .update({ sha256: "b".repeat(64) })
        .eq("id", oldFile)
    ).error,
  ).not.toBeNull();
});
it("limita a calculista, nega acesso cruzado e não concede DML nas tabelas privadas", async () => {
  for (const role of ["client", "clientB", "admin"]) {
    expect(
      (
        await command(
          {
            operation: "read",
            fileId: oldFile,
            revision: 1,
            pages: "1",
            read: true,
          },
          randomUUID(),
          role,
        )
      ).error,
    ).not.toBeNull();
    expect(
      (
        await sessions[role].rpc("get_pdf_version_context", {
          target_file: oldFile,
        })
      ).error,
    ).not.toBeNull();
  }
  for (const s of [anonymous(), db])
    expect(
      (await s.rpc("get_pdf_version_context", { target_file: oldFile })).error
        ?.code,
    ).toBe("42501");
  const cross = await file({ process_id: otherProcess });
  expect((await register(cross, 4)).error).not.toBeNull();
  for (const patch of [
    { mime: "text/plain" },
    { upload_status: "pending" },
    { folder: "triage" },
  ])
    expect((await register(await file(patch), 4)).error).not.toBeNull();
  expect(
    (
      await command({
        operation: "register",
        fileId: await file(),
        revision: 0,
        pageCount: 4,
        previousFileId: null,
        confirmed: true,
        extra: "rejeitar",
      })
    ).error,
  ).not.toBeNull();
});
it("marca explicitamente, preserva recibo após resposta perdida e verifica revisão concorrente", async () => {
  const key = randomUUID(),
    payload = {
      operation: "read",
      fileId: oldFile,
      revision: 1,
      pages: "1, 3-4",
      read: true,
    };
  const result = await command(payload, key);
  expect(result.error).toBeNull();
  expect((await context(oldFile)).data.readCount).toBe(3);
  const rev = await versionRevision(oldFile);
  const race = await Promise.all([
    command({ ...payload, revision: rev, pages: "2" }),
    command({ ...payload, revision: rev, pages: "2" }),
  ]);
  expect(race.filter((r) => !r.error)).toHaveLength(1);
  expect(race.find((r) => r.error)?.error?.code).toBe("PT409");
  expect((await command(payload, key)).data).toEqual(result.data);
  expect((await context(oldFile)).data.readCount).toBe(4);
  expect(
    (
      await command({
        ...payload,
        pages: "5",
        revision: await versionRevision(oldFile),
      })
    ).error,
  ).not.toBeNull();
});
it("correspondência é manual, bijetiva, limitada e mantém páginas novas pendentes", async () => {
  const revision = await versionRevision(newFile);
  const mapped = await command({
    operation: "map",
    fileId: newFile,
    revision,
    pairs: [
      { source: 3, target: 1 },
      { source: 1, target: 3 },
      { source: 4, target: 4 },
    ],
    confirmed: true,
  });
  expect(mapped.error).toBeNull();
  const data = (await context(newFile)).data;
  expect(data.pages.map((p: { read: boolean }) => p.read)).toEqual([
    true,
    false,
    true,
    true,
  ]);
  expect(data.unmappedPrevious).toBe(1);
  const before = data.pages;
  for (const pairs of [
    [{ source: 1, target: 2 }],
    [{ source: 8, target: 2 }],
    [{ source: 2, target: 5 }],
    [
      { source: 2, target: 2 },
      { source: 2, target: 1 },
    ],
  ])
    expect(
      (
        await command({
          operation: "map",
          fileId: newFile,
          revision: data.review.revision,
          pairs,
          confirmed: true,
        })
      ).error,
    ).not.toBeNull();
  expect((await context(newFile)).data.pages).toEqual(before);
  expect(
    (
      await command({
        operation: "map",
        fileId: newFile,
        revision: data.review.revision,
        pairs: [{ source: 2, target: 2 }],
        confirmed: false,
      })
    ).error,
  ).not.toBeNull();
});
it("copia só referência integral, protege concorrência e conserva snapshot de origem", async () => {
  let revision = await versionRevision(newFile);
  expect(
    (
      await command({
        operation: "copy",
        fileId: newFile,
        revision,
        entryId: entryMixed,
        entryRevision: 1,
      })
    ).error,
  ).not.toBeNull();
  const key = randomUUID(),
    payload = {
      operation: "copy",
      fileId: newFile,
      revision,
      entryId: entryA,
      entryRevision: 1,
    };
  const copies = await Promise.all([
    command(payload, key),
    command(payload, key),
  ]);
  expect(copies[0].error).toBeNull();
  expect(copies[1].data).toEqual(copies[0].data);
  const copied = copies[0].data.entryId;
  expect(
    (await db.from("page_index").select("pages,note").eq("id", copied).single())
      .data,
  ).toEqual({ pages: "3", note: "Origem fictícia" });
  expect(
    (await index(oldFile, "2", entryA, 1, "update", "Origem editada depois"))
      .error,
  ).toBeNull();
  const origins = await sessions.client.rpc("get_pdf_index_origins", {
    target_process: processId,
    entry_ids: [copied],
  });
  expect(origins.error).toBeNull();
  expect(origins.data[0]).toMatchObject({
    sourcePages: "1",
    sourceRevision: 1,
    requiresReview: false,
    edited: false,
  });
  for (const role of ["clientB", "admin"])
    expect(
      (
        await sessions[role].rpc("get_pdf_index_origins", {
          target_process: processId,
          entry_ids: [copied],
        })
      ).error,
    ).not.toBeNull();
  revision = await versionRevision(newFile);
  expect(
    (
      await command({
        operation: "map",
        fileId: newFile,
        revision,
        pairs: [{ source: null, target: 3 }],
        confirmed: true,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await sessions.calculator.rpc("get_pdf_index_origins", {
        target_process: processId,
        entry_ids: [copied],
      })
    ).data[0].requiresReview,
  ).toBe(true);
  expect(
    (await db.from("page_index").select("pages").eq("id", copied).single()).data
      ?.pages,
  ).toBe("3");
});
it("serializa cadastro e editor legado; só PDFs conferidos recebem limite de página", async () => {
  expect((await index(oldFile, "5")).error).not.toBeNull();
  const fresh = await file();
  expect((await index(fresh, "5")).error).toBeNull();
  expect((await register(fresh, 4)).error).not.toBeNull();
  expect((await register(fresh, 5)).error).toBeNull();
  const raceFile = await file();
  const race = await Promise.all([register(raceFile, 1), index(raceFile, "2")]);
  expect(race.filter((r) => !r.error)).toHaveLength(1);
  const state = (await context(raceFile)).data.review;
  const entries = await db
    .from("page_index")
    .select("pages")
    .eq("file_id", raceFile);
  if (state) expect(entries.data).toEqual([]);
  else expect(entries.data).toHaveLength(1);
});
it("não cria índice com mais de 100 referências e preserva revisão após recusa", async () => {
  const a = await file(),
    b = await file();
  expect((await register(a, 101)).error).toBeNull();
  expect((await register(b, 201, a)).error).toBeNull();
  const sourceId = randomUUID();
  expect((await index(a, "1-101", sourceId)).error).toBeNull();
  expect(
    (
      await command({
        operation: "map",
        fileId: b,
        revision: 1,
        pairs: Array.from({ length: 100 }, (_, n) => ({
          source: n + 1,
          target: n * 2 + 1,
        })),
        confirmed: true,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await command({
        operation: "map",
        fileId: b,
        revision: 2,
        pairs: [{ source: 101, target: 201 }],
        confirmed: true,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await command({
        operation: "copy",
        fileId: b,
        revision: 3,
        entryId: sourceId,
        entryRevision: 1,
      })
    ).error?.message,
  ).toBe("Divida a referência antes de reaproveitar");
  expect(await versionRevision(b)).toBe(3);
  expect(
    (await db.from("page_index").select("id").eq("file_id", b)).data,
  ).toEqual([]);
});
it("pagina páginas e referências sem misturar arquivo/processo nem truncar cursor", async () => {
  const a = await file(),
    b = await file();
  expect((await register(a, 60)).error).toBeNull();
  expect((await register(b, 60, a)).error).toBeNull();
  const page1 = (await context(b)).data;
  expect(page1.pages).toHaveLength(50);
  expect((await context(b, 51)).data.pages).toHaveLength(10);
  expect((await context(b, 61)).error).not.toBeNull();
  const rows = Array.from({ length: 51 }, () => ({
    id: randomUUID(),
    process_id: processId,
    file_id: a,
    piece: "other",
    pages: "1",
    recorded_by: actor,
    created_at: "2026-10-19T03:00:00.123456Z",
  }));
  expect((await db.from("page_index").insert(rows)).error).toBeNull();
  const first = (await context(b)).data;
  expect(first.entries).toHaveLength(50);
  expect(first.hasMoreEntries).toBe(true);
  const last = first.entries[49];
  const second = await sessions.calculator.rpc("get_pdf_version_context", {
    target_file: b,
    ref_after_at: last.created_at,
    ref_after_id: last.id,
  });
  expect(second.error).toBeNull();
  expect(second.data.entries).toHaveLength(1);
  expect(
    [...first.entries, ...second.data.entries].map(
      (row: { id: string }) => row.id,
    ),
  ).toEqual(
    rows
      .map((row) => row.id)
      .sort()
      .reverse(),
  );
});
it("projeta a sequência explícita nas duas visões sem alterar metadados nem liberar outros perfis", async () => {
  const a = await file(),
    b = await file();
  expect((await register(a, 4)).error).toBeNull();
  expect((await register(b, 4, a)).error).toBeNull();
  const projection = await sessions.client.rpc("get_pdf_version_sequences", {
    target_process: processId,
  });
  expect(projection.error).toBeNull();
  expect(projection.data).toContainEqual({ fileId: a, sequence: 1 });
  expect(projection.data).toContainEqual({ fileId: b, sequence: 2 });
  expect(
    (await db.from("files").select("version").eq("id", b).single()).data
      ?.version,
  ).toBe(1);
  for (const role of ["clientB", "admin"])
    expect(
      (
        await sessions[role].rpc("get_pdf_version_sequences", {
          target_process: processId,
        })
      ).error,
    ).not.toBeNull();
});
