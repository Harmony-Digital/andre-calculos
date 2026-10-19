import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { calculationUpdateFixture } from "../e2e/calculation-update-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql } from "../e2e/notification-helper";
let f: Awaited<ReturnType<typeof calculationUpdateFixture>>,
  id: string,
  revision: number,
  requestId: string;
beforeAll(async () => {
  f = await calculationUpdateFixture();
});
afterAll(async () => {
  await f?.cleanup();
});
it("recusa outros papéis, processo/PJC divergentes e arquivo não entregue", async () => {
  for (const role of ["clientB", "calculator", "admin"] as const) {
    const s = await quoteSession(role);
    try {
      expect(
        (
          await s.rpc("create_calculation_update", {
            target_process: f.sample.process_id,
            source_order: f.sample.order_id,
            request_id: randomUUID(),
            source_file: f.files[1],
          })
        ).error,
      ).not.toBeNull();
    } finally {
      await s.auth.signOut({ scope: "local" });
    }
  }
  expect(
    (
      await f.client.rpc("create_calculation_update", {
        target_process: randomUUID(),
        source_order: f.sample.order_id,
        request_id: randomUUID(),
        source_file: f.files[1],
      })
    ).error,
  ).not.toBeNull();
  expect((await f.createUpdate(f.files[0])).error).not.toBeNull();
});
it("concorrência cria um único pedido e replay exato recupera sem alterar o original", async () => {
  requestId = randomUUID();
  const attempts = await Promise.all([
    f.createUpdate(f.files[1], requestId),
    f.createUpdate(f.files[1], randomUUID()),
  ]);
  expect(attempts.filter((r) => r.error === null)).toHaveLength(1);
  id = attempts.find((r) => r.error === null)!.data;
  // A tentativa vencedora é recuperável pela sua chave (descobre qual venceu sem refazer criação).
  const context = JSON.parse(
    localNotificationSql(
      `select to_jsonb(u) from private.calculation_updates u where order_id='${id}';`,
    ),
  );
  requestId = context.request_id;
  expect((await f.createUpdate(f.files[1], requestId)).data).toBe(id);
  expect((await f.createUpdate(null, requestId)).error).not.toBeNull();
  expect(
    (
      await f.db
        .from("orders")
        .select("status,calc_type,total_cents")
        .eq("id", id)
        .single()
    ).data,
  ).toMatchObject({ status: "draft", calc_type: "update" });
  expect(f.snapshot()).toBe(f.original);
});
it("exige revisão sequencial, nova data-base e confirmação na revisão corrente", async () => {
  const chk = (
    await f.db
      .from("checklists")
      .select("answers,revision,completed_step")
      .eq("order_id", id)
      .single()
  ).data!;
  revision = chk.revision;
  expect(chk.answers.baseDate).toBe("");
  expect(chk.answers.noticeDate).toBe("");
  const answers = {
    ...f.sample.answers,
    calculationType: "update",
    baseDate: "2099-11-01",
  };
  const save = (step: number, patch = {}) =>
    f.client.rpc("save_checklist_draft", {
      draft_id: id,
      expected_revision: revision,
      completed_step: step,
      payload: { ...answers, ...patch },
    });
  expect((await save(8)).error).not.toBeNull();
  expect(
    (
      await f.client.rpc("complete_calculation_update", {
        target_order: id,
        expected_revision: revision,
        confirm_review: true,
      })
    ).error,
  ).not.toBeNull();
  for (let step = 0; step < 9; step++) {
    const r = await save(step);
    expect(r.error).toBeNull();
    revision = r.data[0].revision;
  }
  const bad = await save(8, { baseDate: f.sample.answers.baseDate });
  expect(bad.error).toBeNull();
  revision = bad.data[0].revision;
  expect(
    (
      await f.client.rpc("complete_calculation_update", {
        target_order: id,
        expected_revision: revision,
        confirm_review: true,
      })
    ).error,
  ).not.toBeNull();
  const good = await save(8);
  expect(good.error).toBeNull();
  revision = good.data[0].revision;
  expect(
    (
      await f.client.rpc("complete_calculation_update", {
        target_order: id,
        expected_revision: revision,
        confirm_review: true,
      })
    ).error,
  ).toBeNull();
  expect((await save(8, { calculationType: "initial" })).error).not.toBeNull();
  expect(
    (
      await f.db
        .from("files")
        .update({ name: "Alterado.pjc" })
        .eq("id", f.files[1])
    ).error,
  ).not.toBeNull();
  const edited = await save(8);
  revision = edited.data[0].revision;
  expect(
    (
      await f.db.from("quotes").insert({
        order_id: id,
        number: `TEST-${randomUUID()}`,
        items: [],
        total_cents: 100,
        valid_until: "2099-11-01T12:00:00Z",
      })
    ).error?.message,
  ).toContain("Revisão da atualização pendente");
  expect(f.snapshot()).toBe(f.original);
});
it("ausência é explícita e só um novo upload próprio pode resolver; repetir não duplica", async () => {
  expect(
    (
      await f.db
        .from("orders")
        .update({ status: "cancelled" })
        .eq("process_id", f.sample.process_id)
        .neq("id", f.sample.order_id)
    ).error,
  ).toBeNull();
  const created = await f.createUpdate(null);
  expect(created.error).toBeNull();
  const missing = created.data;
  const context = (
    await f.client.rpc("get_calculation_update", { target_order: missing })
  ).data;
  expect(context.file).toBeNull();
  expect(context.missingRequested).toBe(true);
  expect(
    (await f.client.from("messages").select("body").eq("id", missing).single())
      .data?.body,
  ).toContain("PJC ausente");
  expect(
    (
      await f.client.rpc("complete_calculation_update", {
        target_order: missing,
        expected_revision: 1,
        source_file: f.files[1],
      })
    ).error,
  ).not.toBeNull();
  const upload = randomUUID();
  const hash = "a".repeat(64);
  expect(
    (
      await f.db.from("files").insert({
        id: upload,
        process_id: f.sample.process_id,
        folder: "client",
        uploaded_by: f.owner.owner_id,
        name: "Reenvio fictício.pjc",
        path: `fixture/${upload}`,
        size_bytes: 1,
        mime: "application/octet-stream",
        sha256: hash,
        expected_sha256: hash,
        upload_status: "pending",
      })
    ).error,
  ).toBeNull();
  const args = {
    target_order: missing,
    expected_revision: 1,
    source_file: upload,
  };
  expect(
    (await f.client.rpc("complete_calculation_update", args)).error,
  ).not.toBeNull();
  expect(
    (
      await f.db
        .from("files")
        .update({ upload_status: "uploaded" })
        .eq("id", upload)
    ).error,
  ).toBeNull();
  expect(
    (await f.client.rpc("complete_calculation_update", args)).error,
  ).toBeNull();
  expect(
    (await f.client.rpc("complete_calculation_update", args)).error,
  ).toBeNull();
  expect(
    (await f.client.rpc("get_calculation_update", { target_order: missing }))
      .data.file,
  ).toMatchObject({ id: upload, origin: "client_upload" });
  expect(
    localNotificationSql(
      `select count(*) from public.timeline_events where order_id='${missing}' and data->>'operation'='update_pjc_attached';`,
    ),
  ).toBe("1");
  expect(f.snapshot()).toBe(f.original);
});
it("origem é privada e papéis sem autorização não consultam o novo vínculo", async () => {
  const s = await quoteSession("clientB");
  try {
    expect(
      (await s.rpc("get_calculation_update", { target_order: id })).error,
    ).not.toBeNull();
  } finally {
    await s.auth.signOut({ scope: "local" });
  }
  expect(
    localNotificationSql(
      "select has_table_privilege('authenticated','private.calculation_updates','SELECT')::text;",
    ),
  ).toBe("false");
  expect(
    localNotificationSql(
      "select has_function_privilege('anon','public.create_calculation_update(uuid,uuid,uuid,uuid)','EXECUTE')::text;",
    ),
  ).toBe("false");
  expect(
    (await f.calculator.rpc("get_calculation_update", { target_order: id }))
      .data.sourceOrderId,
  ).toBe(f.sample.order_id);
});

it("preserva snapshots não vazios do índice e da decisão, sem gerar outra concordância", async () => {
  await f.db
    .from("orders")
    .update({ status: "cancelled" })
    .eq("process_id", f.sample.process_id)
    .neq("id", f.sample.order_id);
  const file = randomUUID(),
    entry = randomUUID(),
    decision = randomUUID(),
    hash = "b".repeat(64);
  expect(
    (
      await f.db.from("files").insert({
        id: file,
        process_id: f.sample.process_id,
        folder: "case",
        uploaded_by: (await f.calculator.auth.getUser()).data.user!.id,
        name: "Peça fictícia.pdf",
        path: `fixture/${file}`,
        size_bytes: 10,
        mime: "application/pdf",
        sha256: hash,
        expected_sha256: hash,
        upload_status: "uploaded",
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await f.db.from("page_index").insert({
        id: entry,
        file_id: file,
        process_id: f.sample.process_id,
        piece: "judgment",
        pages: "1",
        note: "Origem fictícia",
        recorded_by: (await f.calculator.auth.getUser()).data.user!.id,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await f.calculator.rpc("record_process_decision", {
        target_process: f.sample.process_id,
        decision_parameter: "correction_index",
        decision_value: "Índice fictício de origem",
        decision_source: "judgment",
        decision_page: 1,
        decision_rationale: "Peça fictícia na página indicada",
        request_id: decision,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await f.client.rpc("confirm_process_decision", {
        target_decision: decision,
      })
    ).error,
  ).toBeNull();
  const created = await f.createUpdate();
  expect(created.error).toBeNull();
  const context = (
    await f.client.rpc("get_calculation_update", { target_order: created.data })
  ).data;
  expect(context).toMatchObject({ indexCount: 1, decisionCount: 1 });
  const saved = JSON.parse(
    localNotificationSql(
      `select jsonb_build_object('index',source_index,'decisions',source_decisions) from private.calculation_updates where order_id='${created.data}';`,
    ),
  );
  expect(saved.index[0]).toMatchObject({
    id: entry,
    file_id: file,
    pages: "1",
    revision: 1,
  });
  expect(saved.decisions[0]).toMatchObject({
    id: decision,
    client_confirmed_by: f.owner.owner_id,
  });
  expect(
    (
      await f.db
        .from("page_index")
        .update({ pages: "2", revision: 2 })
        .eq("id", entry)
    ).error,
  ).toBeNull();
  expect(
    JSON.parse(
      localNotificationSql(
        `select source_index from private.calculation_updates where order_id='${created.data}';`,
      ),
    )[0].pages,
  ).toBe("1");
  expect(
    (
      await f.db
        .from("decisions")
        .select("id")
        .eq("process_id", f.sample.process_id)
    ).data,
  ).toHaveLength(1);
});
