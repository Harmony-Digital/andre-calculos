import { beforeAll, afterAll, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { localSystem } from "../e2e/local-helper";
const db = localSystem(),
  sessions: Record<string, SupabaseClient> = {};
const processId = "00000000-0000-4000-8000-000000000101",
  fileId = randomUUID(),
  deliveryId = randomUUID(),
  orderId = randomUUID();
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
      throw new Error("Falha no login fictício para auditoria de arquivos.");
    sessions[role] = session;
  }
  const processRecord = await db
    .from("processes")
    .select("client_id")
    .eq("id", processId)
    .single();
  const actor = (await sessions.a.auth.getUser()).data.user!.id;
  const order = await db.from("orders").insert({
    id: orderId,
    client_id: processRecord.data!.client_id,
    process_id: processId,
    calc_type: "initial",
    code: `P-FILE-${orderId}`,
  });
  if (order.error)
    throw new Error("Falha ao criar pedido fictício da auditoria.");
  // Metadados sintéticos para testar autorização; este ensaio não acessa o Storage.
  const files = await db.from("files").insert(
    [
      { id: fileId, folder: "case", path: `rls-fixture/${fileId}.pdf` },
      {
        id: deliveryId,
        folder: "deliverables",
        order_id: orderId,
        path: `rls-fixture/${deliveryId}.pdf`,
      },
    ].map((file) => ({
      ...file,
      process_id: processId,
      uploaded_by: actor,
      name: "PDF fictício de autorização",
      mime: "application/pdf",
      size_bytes: 10,
      upload_status: "uploaded",
    })),
  );
  if (files.error)
    throw new Error("Falha ao criar metadados fictícios da auditoria.");
});
afterAll(async () => {
  await db
    .from("audit_log")
    .delete()
    .eq("target_type", "file")
    .in("target_id", [fileId, deliveryId]);
  await db.from("files").delete().in("id", [fileId, deliveryId]);
  await db.from("orders").delete().eq("id", orderId);
  await Promise.all(
    Object.values(sessions).map((session) =>
      session.auth.signOut({ scope: "local" }),
    ),
  );
});
it("visualização e download próprios geram auditorias distintas", async () => {
  expect(
    (
      await sessions.a.rpc("record_file_access", {
        target_file: fileId,
        access_kind: "file_view",
      })
    ).error,
  ).toBeNull();
  expect(
    (await sessions.a.rpc("record_file_access", { target_file: fileId })).error,
  ).toBeNull();
  const audit = await db
    .from("audit_log")
    .select("action")
    .eq("target_id", fileId)
    .order("action");
  expect(audit.data?.map((row) => row.action)).toEqual([
    "file_download",
    "file_view",
  ]);
});
it("outro cliente, administrador e anônimo não autorizam leitura; calculista pode", async () => {
  for (const role of ["b", "admin"])
    expect(
      (
        await sessions[role].rpc("record_file_access", {
          target_file: fileId,
          access_kind: "file_view",
        })
      ).error,
    ).not.toBeNull();
  const anonymous = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  expect(
    (
      await anonymous.rpc("record_file_access", {
        target_file: fileId,
        access_kind: "file_view",
      })
    ).error?.code,
  ).toBe("42501");
  expect(
    (
      await sessions.calculator.rpc("record_file_access", {
        target_file: fileId,
        access_kind: "file_view",
      })
    ).error,
  ).toBeNull();
});
it("não permite inventar ações de auditoria nem ler arquivo pendente", async () => {
  for (const action of [null, "role_changed", "", "FILE_VIEW"])
    expect(
      (
        await sessions.a.rpc("record_file_access", {
          target_file: fileId,
          access_kind: action,
        })
      ).error,
    ).not.toBeNull();
  await db.from("files").update({ upload_status: "pending" }).eq("id", fileId);
  expect(
    (
      await sessions.a.rpc("record_file_access", {
        target_file: fileId,
        access_kind: "file_view",
      })
    ).error,
  ).not.toBeNull();
  await db.from("files").update({ upload_status: "uploaded" }).eq("id", fileId);
});
it("estado entregue sozinho não libera arquivo sem confirmação e política; calculista confere antes", async () => {
  expect(
    (
      await sessions.a.rpc("record_file_access", {
        target_file: deliveryId,
        access_kind: "file_view",
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await sessions.calculator.rpc("record_file_access", {
        target_file: deliveryId,
        access_kind: "file_view",
      })
    ).error,
  ).toBeNull();
  await db.from("orders").update({ status: "delivered" }).eq("id", orderId);
  expect(
    (
      await sessions.a.rpc("record_file_access", {
        target_file: deliveryId,
        access_kind: "file_view",
      })
    ).error,
  ).not.toBeNull();
});
