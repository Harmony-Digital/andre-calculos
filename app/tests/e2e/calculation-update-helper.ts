import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { acceptanceFixture } from "./acceptance-helper";
import { quoteSession } from "./quote-helper";
import { pdfFixture } from "./pdf-helper";
import { localNotificationSql } from "./notification-helper";
export async function calculationUpdateFixture() {
  const f = await acceptanceFixture(),
    sample = await f.create(),
    paths: string[] = [],
    files: string[] = [];
  const calculator = await quoteSession("calculator"),
    client = await quoteSession();
  const must = (r: { error: unknown }) => {
    if (r.error)
      throw new Error(
        "Preparação fictícia da atualização falhou: " + JSON.stringify(r.error),
      );
  };
  must(await f.db.rpc("accept_quote_system", sample.args()));
  const order = (
    await f.db.from("orders").select("*").eq("id", sample.order_id).single()
  ).data!;
  must(
    await f.db.from("payments").insert({
      order_id: order.id,
      kind: "deposit",
      method: "pix_manual",
      amount_cents: order.deposit_cents,
      status: "confirmed",
    }),
  );
  must(
    await f.db
      .from("orders")
      .update({ status: "in_review" })
      .eq("id", order.id),
  );
  must(
    await f.db
      .from("settings")
      .update({ delivery_release_policy: "before_balance" })
      .eq("singleton", true),
  );
  const pdf = await readFile(pdfFixture);
  for (const [name, mime, bytes] of [
    ["Cálculo fictício.pdf", "application/pdf", pdf],
    [
      "Original fictício.pjc",
      "application/octet-stream",
      Buffer.from("PJC fictício, sem processo real."),
    ],
    ["Parecer fictício.pdf", "application/pdf", pdf],
  ] as const) {
    const id = randomUUID(),
      path = `${f.calculator.id}/${sample.process_id}/${id}/ficticio`;
    paths.push(path);
    files.push(id);
    must(
      await f.db.storage
        .from("processos")
        .upload(path, bytes, { contentType: mime }),
    );
    const hash = createHash("sha256").update(bytes).digest("hex");
    must(
      await f.db.from("files").insert({
        id,
        process_id: sample.process_id,
        order_id: order.id,
        folder: "deliverables",
        uploaded_by: f.calculator.id,
        name,
        mime,
        path,
        size_bytes: bytes.length,
        sha256: hash,
        expected_sha256: hash,
        upload_status: "uploaded",
      }),
    );
  }
  const deliveryId = randomUUID();
  must(
    await calculator.rpc("confirm_order_delivery", {
      target_process: sample.process_id,
      target_order: order.id,
      request_id: deliveryId,
      payload: {
        calculationFile: files[0],
        pjcFile: files[1],
        reportFile: files[2],
        attachments: [],
        pjeVersion: "2.13.1",
        indexMonth: "2026-10",
        liquidated: true,
        taxIdPresent: true,
        reviewed: true,
      },
    }),
  );
  const snapshot = () =>
    localNotificationSql(
      `select jsonb_build_object('order',(select to_jsonb(o) from public.orders o where id='${order.id}'),'files',(select jsonb_agg(to_jsonb(x) order by id) from public.files x where order_id='${order.id}'),'delivery',(select to_jsonb(d) from public.deliveries d where id='${deliveryId}'),'acceptance',(select to_jsonb(a) from private.quote_acceptances a where quote_id='${sample.id}'),'payments',(select jsonb_agg(to_jsonb(p) order by id) from public.payments p where order_id='${order.id}'),'checklist',(select to_jsonb(c) from public.checklists c where order_id='${order.id}'));`,
    );
  const original = snapshot();
  return {
    ...f,
    sample,
    client,
    calculator,
    files,
    deliveryId,
    original,
    snapshot,
    createUpdate: (
      fileId: string | null = files[1],
      requestId: string = randomUUID(),
    ) =>
      client.rpc("create_calculation_update", {
        target_process: sample.process_id,
        source_order: order.id,
        request_id: requestId,
        source_file: fileId ?? undefined,
      }),
    cleanup: async () => {
      try {
        // Limpeza exclusiva da pasta sintética criada acima; a origem só é apagada depois das asserções.
        localNotificationSql(
          `delete from private.calculation_updates where process_id='${sample.process_id}'; delete from private.quote_requests where order_id in(select id from public.orders where process_id='${sample.process_id}' and id<>'${order.id}'); delete from public.quotes where order_id in(select id from public.orders where process_id='${sample.process_id}' and id<>'${order.id}'); delete from public.checklists where order_id in(select id from public.orders where process_id='${sample.process_id}' and id<>'${order.id}'); delete from public.messages where process_id='${sample.process_id}'; delete from public.timeline_events where process_id='${sample.process_id}'; delete from public.audit_log where target_id in(select id from public.orders where process_id='${sample.process_id}' and id<>'${order.id}'); delete from public.orders where process_id='${sample.process_id}' and id<>'${order.id}'; delete from public.audit_log where target_id in(select id from public.page_index where process_id='${sample.process_id}' union select id from public.decisions where process_id='${sample.process_id}'); delete from public.page_index where process_id='${sample.process_id}'; delete from public.decisions where process_id='${sample.process_id}'; delete from public.deliveries where id='${deliveryId}';`,
        );
        const all = await f.db
          .from("files")
          .select("id,path")
          .eq("process_id", sample.process_id);
        for (const file of all.data ?? []) {
          await f.db.storage.from("processos").remove([file.path]);
          await f.db.from("audit_log").delete().eq("target_id", file.id);
          must(await f.db.from("files").delete().eq("id", file.id));
        }
      } finally {
        await client.auth.signOut({ scope: "local" });
        await calculator.auth.signOut({ scope: "local" });
        await f.cleanup();
      }
    },
  };
}
