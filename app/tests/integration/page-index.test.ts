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
  fileIds = Array.from({ length: 4 }, () => randomUUID()),
  entryId = randomUUID(),
  createKey = randomUUID();
let processId: string, alternateId: string, calculatorId: string;
const anonymous = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const input = (patch: Record<string, unknown> = {}, key = randomUUID()) => ({
  target_process: processId,
  request_id: key,
  payload: {
    action: "create",
    entryId: randomUUID(),
    fileId: fileIds[0],
    expectedRevision: 0,
    piece: "judgment",
    pages: " 120 - 135 , 140 ",
    note: " \tObservação\r\nfictícia\u00a0",
    ...patch,
  },
});
const rpc = (args: ReturnType<typeof input>, role = "calculator") =>
  sessions[role].rpc("mutate_process_page_index", args);
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
      throw new Error("Login fictício do índice não concluído.");
    sessions[role] = session;
  }
  calculatorId = (await sessions.calculator.auth.getUser()).data.user!.id;
  processId = (await createMessageProcess()).id;
  alternateId = (await createMessageProcess()).id;
  for (let n = 0; n < fileIds.length; n++) {
    const result = await db.from("files").insert({
      id: fileIds[n],
      process_id: n === 3 ? alternateId : processId,
      folder: "case",
      path: `${calculatorId}/${processId}/${fileIds[n]}/indice-ficticio.pdf`,
      name: "Índice fictício.pdf",
      mime: n === 2 ? "text/plain" : "application/pdf",
      size_bytes: 100,
      uploaded_by: calculatorId,
      upload_status: n === 1 ? "pending" : "uploaded",
      sha256: n === 1 ? null : "0".repeat(64),
      version: n + 1,
    });
    expect(result.error).toBeNull();
  }
});
afterAll(async () => {
  for (const id of [processId, alternateId])
    if (id) await removeMessageProcess(id);
  await Promise.all(
    Object.values(sessions).map((s) => s.auth.signOut({ scope: "local" })),
  );
});
it("cria uma única entrada/evento/auditoria em chamadas concorrentes e normaliza as páginas", async () => {
  const args = input({ entryId }, createKey),
    results = await Promise.all([rpc(args), rpc(args)]);
  for (const result of results) {
    expect(result.error).toBeNull();
    expect(result.data).toBe(entryId);
  }
  const row = await sessions.client
    .from("page_index")
    .select("pages,note,revision,recorded_by,file_id")
    .eq("id", entryId)
    .single();
  expect(row.data).toEqual({
    pages: "120-135, 140",
    note: "Observação\nfictícia",
    revision: 1,
    recorded_by: calculatorId,
    file_id: fileIds[0],
  });
  expect(
    (
      await db
        .from("timeline_events")
        .select("id")
        .contains("data", { entry_id: entryId })
    ).data,
  ).toHaveLength(1);
  expect(
    (await db.from("audit_log").select("id").eq("target_id", entryId)).data,
  ).toHaveLength(1);
});
it("valida peças, páginas, limites, revisão e PDF confirmado do processo", async () => {
  for (const patch of [
    { piece: "sentence" },
    { piece: null },
    { pages: "0" },
    { pages: "4-3" },
    { pages: "1,,2" },
    { pages: "1e3" },
    { pages: "1–2" },
    { pages: "100001" },
    { pages: "1\n-2" },
    { note: "a".repeat(2001) },
    { expectedRevision: 1 },
    { expectedRevision: null },
    { expectedRevision: 0.5 },
    { fileId: fileIds[1] },
    { fileId: fileIds[2] },
    { fileId: fileIds[3] },
    { fileId: randomUUID() },
    { extra: true },
  ])
    expect((await rpc(input(patch))).error).not.toBeNull();
  expect(
    (
      await rpc({ ...input(), request_id: null } as unknown as ReturnType<
        typeof input
      >)
    ).error,
  ).not.toBeNull();
  expect(
    (await rpc({ ...input(), target_process: randomUUID() })).error,
  ).not.toBeNull();
  for (const patch of [
    { pages: "12" },
    { piece: "other" },
    { fileId: fileIds[3] },
    { note: "outro" },
    { entryId: randomUUID() },
  ])
    expect(
      (await rpc(input({ entryId, ...patch }, createKey))).error,
    ).not.toBeNull();
});
it("cliente lê; outro cliente/admin não leem nem escrevem; apps não fazem DML", async () => {
  for (const role of ["client", "clientB", "admin"])
    expect((await rpc(input(), role)).error).not.toBeNull();
  for (const role of ["clientB", "admin"])
    expect(
      (
        await sessions[role]
          .from("page_index")
          .select("id")
          .eq("process_id", processId)
      ).data,
    ).toEqual([]);
  expect(
    (await anonymous().rpc("mutate_process_page_index", input())).error,
  ).not.toBeNull();
  expect(
    (await db.rpc("mutate_process_page_index", input())).error,
  ).not.toBeNull();
  for (const role of ["client", "calculator"]) {
    expect(
      (
        await sessions[role]
          .from("page_index")
          .update({ pages: "1" })
          .eq("id", entryId)
      ).error?.code,
    ).toBe("42501");
    expect(
      (await sessions[role].from("page_index").delete().eq("id", entryId)).error
        ?.code,
    ).toBe("42501");
  }
});
it("duas edições concorrentes não sobrescrevem silenciosamente; replay usa o recibo original", async () => {
  const first = input({
      action: "update",
      entryId,
      expectedRevision: 1,
      pages: "2-3",
      note: "Atualização fictícia",
    }),
    second = input({
      action: "update",
      entryId,
      expectedRevision: 1,
      pages: "5",
      note: "Outra atualização fictícia",
    });
  const results = await Promise.all([rpc(first), rpc(second)]);
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  expect(results.find((r) => r.error)?.error?.code).toBe("PT409");
  const winning = !results[0].error ? first : second;
  expect((await rpc(winning)).error).toBeNull();
  expect((await rpc(input({ entryId }, createKey))).error).toBeNull();
  const row = await db
    .from("page_index")
    .select("pages,revision")
    .eq("id", entryId)
    .single();
  expect(row.data?.revision).toBe(2);
  expect(row.data?.pages).toBe(winning.payload.pages);
  expect(
    (await db.from("audit_log").select("id").eq("target_id", entryId)).data,
  ).toHaveLength(2);
});
it("índice não migra de arquivo/versão e um PDF indisponível recusa novas alterações", async () => {
  for (const patch of [
    { file_id: fileIds[3] },
    { process_id: alternateId },
    { id: randomUUID() },
    { recorded_by: null },
  ])
    expect(
      (await db.from("page_index").update(patch).eq("id", entryId)).error,
    ).not.toBeNull();
  expect(
    (await db.from("files").update({ version: 10 }).eq("id", fileIds[0])).error,
  ).not.toBeNull();
  expect(
    (
      await db
        .from("files")
        .update({ path: "outro-ficticio.pdf" })
        .eq("id", fileIds[0])
    ).error,
  ).not.toBeNull();
  expect(
    (
      await db
        .from("files")
        .update({ upload_status: "failed" })
        .eq("id", fileIds[0])
    ).error,
  ).toBeNull();
  expect(
    (
      await rpc(
        input({ action: "update", entryId, expectedRevision: 2, pages: "6" }),
      )
    ).error,
  ).not.toBeNull();
  expect((await rpc(input({ entryId }, createKey))).error).toBeNull();
  expect(
    (
      await db
        .from("files")
        .update({ upload_status: "uploaded" })
        .eq("id", fileIds[0])
    ).error,
  ).toBeNull();
  // Uma versão nova do mesmo nome começa sem referências.
  const newFile = randomUUID();
  fileIds.push(newFile);
  expect(
    (
      await db.from("files").insert({
        id: newFile,
        process_id: processId,
        folder: "case",
        path: `${calculatorId}/${processId}/${newFile}/indice-ficticio.pdf`,
        name: "Índice fictício.pdf",
        mime: "application/pdf",
        size_bytes: 100,
        uploaded_by: calculatorId,
        upload_status: "uploaded",
        sha256: "0".repeat(64),
        version: 2,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await sessions.client
        .from("page_index")
        .select("id")
        .eq("file_id", newFile)
    ).data,
  ).toEqual([]);
});
it("remoção é auditada e replays continuam válidos depois de apagar entrada/arquivo", async () => {
  const removal = input({
      action: "delete",
      entryId,
      expectedRevision: 2,
      piece: "",
      pages: "",
      note: "",
    }),
    results = await Promise.all([rpc(removal), rpc(removal)]);
  for (const result of results) expect(result.error).toBeNull();
  expect(
    (await sessions.client.from("page_index").select("id").eq("id", entryId))
      .data,
  ).toEqual([]);
  expect(
    (await db.from("audit_log").select("id").eq("target_id", entryId)).data,
  ).toHaveLength(3);
  expect(
    (await db.from("files").delete().eq("id", fileIds[0])).error,
  ).toBeNull();
  expect((await rpc(removal)).error).toBeNull();
  expect((await rpc(input({ entryId }, createKey))).error).toBeNull();
  expect(
    (
      await rpc({
        ...removal,
        payload: { ...removal.payload, expectedRevision: 1 },
      })
    ).error,
  ).not.toBeNull();
});
