import { beforeAll, afterAll, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { localSystem, leaseLocalSettings } from "../e2e/local-helper";
import {
  createDeliveryFixture,
  deliveryProfessional,
} from "../e2e/delivery-helper";
const db = localSystem(),
  sessions: Record<string, SupabaseClient> = {};
let prior: Record<string, unknown>, release: () => Promise<void>;
const anon = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
beforeAll(async () => {
  release = await leaseLocalSettings();
  prior = (
    await db
      .from("settings")
      .select(
        "technical_name,crc_number,crc_state,crc_category,delivery_release_policy",
      )
      .eq("singleton", true)
      .single()
  ).data!;
  expect(
    (
      await db
        .from("settings")
        .update({ ...deliveryProfessional, delivery_release_policy: null })
        .eq("singleton", true)
    ).error,
  ).toBeNull();
  for (const [role, email] of Object.entries({
    client: "clientea@exemplo.com",
    clientB: "clienteb@exemplo.com",
    calculator: "calculista@exemplo.com",
    admin: "admin@exemplo.com",
  })) {
    const s = anon();
    if (
      (
        await s.auth.signInWithPassword({
          email,
          password: process.env.ANDRE_TEST_PASSWORD!,
        })
      ).error
    )
      throw new Error("Login fictício de entrega não concluído.");
    sessions[role] = s;
  }
});
afterAll(async () => {
  await db.from("settings").update(prior).eq("singleton", true);
  await Promise.all(
    Object.values(sessions).map((s) => s.auth.signOut({ scope: "local" })),
  );
  await release();
});
it("confirma uma entrega/evento/auditoria/aviso sob chamadas concorrentes e preserva o snapshot", async () => {
  const f = await createDeliveryFixture();
  try {
    const args = f.input(),
      results = await Promise.all([
        sessions.calculator.rpc("confirm_order_delivery", args),
        sessions.calculator.rpc("confirm_order_delivery", args),
      ]);
    for (const r of results) {
      expect(r.error).toBeNull();
      expect(r.data).toBe(args.request_id);
    }
    const row = (
      await sessions.client
        .from("deliveries")
        .select("pje_version,professional")
        .eq("id", args.request_id)
        .single()
    ).data!;
    expect(row.pje_version).toBe("2.13.1");
    expect(row.professional).toMatchObject({
      name: deliveryProfessional.technical_name,
      crcNumber: deliveryProfessional.crc_number,
    });
    expect(
      (
        await db
          .from("delivery_files")
          .select("file_id")
          .eq("delivery_id", args.request_id)
      ).data,
    ).toHaveLength(4);
    for (const [table, key] of [
      ["timeline_events", "order_id"],
      ["audit_log", "target_id"],
      ["notifications", "dedup_key"],
    ]) {
      const result = await db
        .from(table)
        .select("id")
        .eq(
          key,
          table === "timeline_events"
            ? f.order.id
            : table === "notifications"
              ? `delivery:${args.request_id}:email`
              : args.request_id,
        );
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
    }
    expect(
      (await db.from("orders").select("status").eq("id", f.order.id).single())
        .data!.status,
    ).toBe("delivered");
    await db
      .from("settings")
      .update({ technical_name: "Outro nome fictício" })
      .eq("singleton", true);
    expect(
      (await sessions.calculator.rpc("confirm_order_delivery", args)).error,
    ).toBeNull();
    expect(
      (
        await sessions.calculator.rpc(
          "confirm_order_delivery",
          f.input(args.request_id, { pjeVersion: "2.14.0" }),
        )
      ).error,
    ).not.toBeNull();
    expect(
      (
        await db
          .from("deliveries")
          .select("professional")
          .eq("id", args.request_id)
          .single()
      ).data!.professional,
    ).toEqual(row.professional);
  } finally {
    await f.cleanup();
    await db
      .from("settings")
      .update(deliveryProfessional)
      .eq("singleton", true);
  }
});
it("somente calculista confirma; dono lê registros, outros papéis não recebem processo nem DML", async () => {
  const f = await createDeliveryFixture();
  try {
    for (const s of [
      sessions.client,
      sessions.clientB,
      sessions.admin,
      anon(),
      db,
    ])
      expect(
        (await s.rpc("confirm_order_delivery", f.input())).error,
      ).not.toBeNull();
    const args = f.input();
    expect(
      (await sessions.calculator.rpc("confirm_order_delivery", args)).error,
    ).toBeNull();
    for (const role of ["clientB", "admin"])
      expect(
        (
          await sessions[role]
            .from("deliveries")
            .select("id")
            .eq("id", args.request_id)
        ).data,
      ).toEqual([]);
    expect(
      (
        await sessions.client
          .from("deliveries")
          .select("id")
          .eq("id", args.request_id)
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await sessions.calculator
          .from("deliveries")
          .update({ pje_version: "hack" })
          .eq("id", args.request_id)
      ).error,
    ).not.toBeNull();
    expect(
      (
        await sessions.client.from("delivery_releases").insert({
          delivery_id: args.request_id,
          policy: "before_balance",
          approved_by: f.process.authorId,
        })
      ).error,
    ).not.toBeNull();
  } finally {
    await f.cleanup();
  }
});
it("checklist, fonte, integridade e identificação inválidos fazem rollback e não consomem a chave", async () => {
  const f = await createDeliveryFixture(),
    key = randomUUID();
  try {
    for (const patch of [
      { reviewed: false },
      { liquidated: "true" },
      { indexMonth: "2026-13" },
      { reportFile: f.ids[0] },
      { extra: true },
      { pjcFile: f.ids[2] },
    ])
      expect(
        (
          await sessions.calculator.rpc(
            "confirm_order_delivery",
            f.input(key, patch),
          )
        ).error,
      ).not.toBeNull();
    const calculator = (await sessions.calculator.auth.getUser()).data.user!.id;
    for (const patch of [
      { upload_status: "pending" },
      { sha256: "1".repeat(64) },
      { folder: "case" },
      { uploaded_by: f.process.authorId },
      { process_id: "00000000-0000-4000-8000-000000000101" },
    ]) {
      expect(
        (await db.from("files").update(patch).eq("id", f.ids[0])).error,
      ).toBeNull();
      expect(
        (await sessions.calculator.rpc("confirm_order_delivery", f.input(key)))
          .error,
      ).not.toBeNull();
      expect(
        (
          await db
            .from("files")
            .update({
              process_id: f.process.id,
              upload_status: "uploaded",
              sha256: "0".repeat(64),
              folder: "deliverables",
              uploaded_by: calculator,
            })
            .eq("id", f.ids[0])
        ).error,
      ).toBeNull();
    }
    await db
      .from("settings")
      .update({ crc_number: null })
      .eq("singleton", true);
    expect(
      (await sessions.calculator.rpc("confirm_order_delivery", f.input(key)))
        .error,
    ).not.toBeNull();
    await db
      .from("settings")
      .update(deliveryProfessional)
      .eq("singleton", true);
    expect(
      (await db.from("deliveries").select("id").eq("process_id", f.process.id))
        .data,
    ).toEqual([]);
    expect(
      (
        await db
          .from("timeline_events")
          .select("id")
          .eq("process_id", f.process.id)
      ).data,
    ).toEqual([]);
    expect(
      (await db.from("audit_log").select("id").eq("target_id", key)).data,
    ).toEqual([]);
    expect(
      (await db.from("orders").select("status").eq("id", f.order.id).single())
        .data!.status,
    ).toBe("in_review");
    expect(
      (await sessions.calculator.rpc("confirm_order_delivery", f.input(key)))
        .error,
    ).toBeNull();
  } finally {
    await f.cleanup();
    await db
      .from("settings")
      .update(deliveryProfessional)
      .eq("singleton", true);
  }
});
it("dois pedidos disputando os arquivos não duplicam entrega nem entram em deadlock", async () => {
  const f = await createDeliveryFixture();
  try {
    const other = randomUUID();
    expect(
      (
        await db.from("orders").insert({
          id: other,
          process_id: f.process.id,
          client_id: f.process.clientId,
          calc_type: "initial",
          status: "in_review",
          total_cents: 123456,
          deposit_cents: 61728,
        })
      ).error,
    ).toBeNull();
    const a = f.input(),
      b = { ...f.input(), target_order: other };
    const results = await Promise.all([
      sessions.calculator.rpc("confirm_order_delivery", a),
      sessions.calculator.rpc("confirm_order_delivery", b),
    ]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error)).toHaveLength(1);
    expect(
      (await db.from("deliveries").select("id").eq("process_id", f.process.id))
        .data,
    ).toHaveLength(1);
    const winner = results.findIndex((r) => !r.error),
      winnerArgs = winner === 0 ? a : b;
    const repeated = await sessions.calculator.rpc("confirm_order_delivery", {
      ...winnerArgs,
      request_id: randomUUID(),
    });
    expect(repeated.error?.code).toBe("PT409");
  } finally {
    await f.cleanup();
  }
});
it("snapshots e arquivos confirmados são imutáveis; replay continua após indisponibilidade", async () => {
  const f = await createDeliveryFixture();
  try {
    const args = f.input();
    expect(
      (await sessions.calculator.rpc("confirm_order_delivery", args)).error,
    ).toBeNull();
    for (const patch of [
      { sha256: "1".repeat(64) },
      { version: 2 },
      { name: "Outro.pdf" },
      { order_id: null },
      { path: "outro/caminho" },
    ])
      expect(
        (await db.from("files").update(patch).eq("id", f.ids[0])).error,
      ).not.toBeNull();
    expect(
      (
        await db
          .from("deliveries")
          .update({ pje_version: "outra" })
          .eq("id", args.request_id)
      ).error,
    ).not.toBeNull();
    expect(
      (
        await db
          .from("delivery_files")
          .update({ snapshot: { name: "outro" } })
          .eq("delivery_id", args.request_id)
      ).error,
    ).not.toBeNull();
    expect(
      (await db.from("files").delete().eq("id", f.ids[0])).error,
    ).not.toBeNull();
    expect(
      (
        await db
          .from("files")
          .update({ upload_status: "failed" })
          .eq("id", f.ids[0])
      ).error,
    ).toBeNull();
    expect(
      (await sessions.calculator.rpc("confirm_order_delivery", args)).error,
    ).toBeNull();
    await db
      .from("orders")
      .update({ status: "in_review" })
      .eq("id", f.order.id);
    expect(
      (await sessions.calculator.rpc("confirm_order_delivery", f.input()))
        .error,
    ).not.toBeNull();
  } finally {
    await f.cleanup();
  }
});
it("política ausente bloqueia; aprovação é capturada e saldo ignora triagem, pendência e estorno", async () => {
  for (const policy of [null, "before_balance", "after_balance"]) {
    await db
      .from("settings")
      .update({ delivery_release_policy: policy })
      .eq("singleton", true);
    const f = await createDeliveryFixture();
    try {
      const args = f.input();
      expect(
        (await sessions.calculator.rpc("confirm_order_delivery", args)).error,
      ).toBeNull();
      const allowed = async () =>
        !(
          await sessions.client.rpc("record_file_access", {
            target_file: f.ids[0],
            access_kind: "file_download",
          })
        ).error;
      expect(await allowed()).toBe(policy === "before_balance");
      if (policy === null) {
        await db
          .from("settings")
          .update({ delivery_release_policy: "before_balance" })
          .eq("singleton", true);
        expect(await allowed()).toBe(false);
      }
      if (policy === "after_balance") {
        const payment = (
          kind: string,
          amount_cents: number,
          status = "confirmed",
        ) => ({
          order_id: f.order.id,
          kind,
          amount_cents,
          status,
          method: "pix_manual",
        });
        expect(
          (
            await db
              .from("payments")
              .insert([
                payment("deposit", 61728),
                payment("triage", 123456),
                payment("balance", 61728, "pending"),
              ])
          ).error,
        ).toBeNull();
        expect(await allowed()).toBe(false);
        expect(
          (
            await db
              .from("payments")
              .update({ status: "confirmed" })
              .eq("order_id", f.order.id)
              .eq("kind", "balance")
          ).error,
        ).toBeNull();
        expect(await allowed()).toBe(true);
        expect(
          (
            await db
              .from("payments")
              .update({ status: "refunded" })
              .eq("order_id", f.order.id)
              .eq("kind", "balance")
          ).error,
        ).toBeNull();
        expect(await allowed()).toBe(false);
      }
      if (policy === "before_balance") {
        await db
          .from("orders")
          .update({ status: "in_adjustment" })
          .eq("id", f.order.id);
        expect(await allowed()).toBe(false);
      }
      if (policy !== "before_balance")
        expect(
          (await sessions.client.from("files").select("id").eq("id", f.ids[0]))
            .data,
        ).toEqual([]);
      expect(
        (
          await sessions.calculator.rpc("record_file_access", {
            target_file: f.ids[0],
            access_kind: "file_view",
          })
        ).error,
      ).toBeNull();
    } finally {
      await f.cleanup();
    }
  }
  await db
    .from("settings")
    .update({ delivery_release_policy: null })
    .eq("singleton", true);
});
