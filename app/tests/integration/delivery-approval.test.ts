import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { localSystem, leaseLocalSettings } from "../e2e/local-helper";
import {
  createDeliveryFixture,
  deliveryProfessional,
} from "../e2e/delivery-helper";
const db = localSystem(),
  sessions: Record<string, SupabaseClient> = {},
  keys = new Set<string>();
let prior: Record<string, unknown>, release: () => Promise<void>;
const anon = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
const key = () => {
  const id = randomUUID();
  keys.add(id);
  return id;
};
beforeAll(async () => {
  release = await leaseLocalSettings();
  prior = (
    await db
      .from("settings")
      .select(
        "technical_name,crc_number,crc_state,crc_category,delivery_release_policy,revision,pix_key",
      )
      .eq("singleton", true)
      .single()
  ).data!;
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
      throw new Error("Login fictício de liberação não concluído.");
    sessions[role] = s;
  }
});
beforeEach(async () => {
  expect(
    (
      await db
        .from("settings")
        .update({
          ...deliveryProfessional,
          delivery_release_policy: null,
          revision: Number(prior.revision),
          pix_key: "chave-pix-ficticia",
        })
        .eq("singleton", true)
    ).error,
  ).toBeNull();
});
afterAll(async () => {
  try {
    if (keys.size) {
      expect(
        (
          await db
            .from("audit_log")
            .delete()
            .in("target_id", [...keys])
        ).error,
      ).toBeNull();
      expect(
        (
          await db
            .from("delivery_policy_approvals")
            .delete()
            .in("id", [...keys])
        ).error,
      ).toBeNull();
    }
    expect(
      (await db.from("settings").update(prior).eq("singleton", true)).error,
    ).toBeNull();
    await Promise.all(
      Object.values(sessions).map((s) => s.auth.signOut({ scope: "local" })),
    );
  } finally {
    await release();
  }
});
it("aprovação futura exige calculista/escolha e preserva recibo/revisão sob replay e concorrência", async () => {
  const args = {
    request_id: key(),
    policy: "after_balance",
    expected_revision: Number(prior.revision),
    approved: true,
  };
  for (const session of [
    sessions.client,
    sessions.clientB,
    sessions.admin,
    anon(),
    db,
  ])
    expect(
      (await session.rpc("approve_future_delivery_policy", args)).error,
    ).not.toBeNull();
  for (const patch of [
    { approved: false },
    { policy: "" },
    { expected_revision: 0 },
  ])
    expect(
      (
        await sessions.calculator.rpc("approve_future_delivery_policy", {
          ...args,
          ...patch,
        })
      ).error,
    ).not.toBeNull();
  const results = await Promise.all([
    sessions.calculator.rpc("approve_future_delivery_policy", args),
    sessions.calculator.rpc("approve_future_delivery_policy", args),
  ]);
  for (const r of results) {
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({
      id: args.request_id,
      revision: args.expected_revision + 1,
      policy: args.policy,
    });
  }
  expect(
    (
      await db
        .from("delivery_policy_approvals")
        .select("id")
        .eq("id", args.request_id)
    ).data,
  ).toHaveLength(1);
  expect(
    (
      await db
        .from("audit_log")
        .select("id")
        .eq("target_id", args.request_id)
        .eq("action", "delivery_policy_approved")
    ).data,
  ).toHaveLength(1);
  expect(
    (await sessions.client.from("delivery_policy_approvals").select("id")).data,
  ).toEqual([]);
  expect(
    (
      await db
        .from("delivery_policy_approvals")
        .update({ policy: "before_balance" })
        .eq("id", args.request_id)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await sessions.calculator.rpc("approve_future_delivery_policy", {
        ...args,
        policy: "before_balance",
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await sessions.calculator.rpc("approve_future_delivery_policy", {
        ...args,
        request_id: key(),
      })
    ).error?.code,
  ).toBe("PT409");
  const newer = {
    ...args,
    request_id: key(),
    expected_revision: args.expected_revision + 1,
    policy: "before_balance",
  };
  expect(
    (await sessions.calculator.rpc("approve_future_delivery_policy", newer))
      .error,
  ).toBeNull();
  expect(
    (await sessions.calculator.rpc("approve_future_delivery_policy", args))
      .data,
  ).toEqual(results[0].data);
  expect(
    (
      await db
        .from("settings")
        .select("delivery_release_policy,revision")
        .eq("singleton", true)
        .single()
    ).data,
  ).toEqual({
    delivery_release_policy: "before_balance",
    revision: args.expected_revision + 2,
  });
});
it("entrega antiga recebe uma aprovação explícita imutável, com evento/auditoria únicos", async () => {
  const f = await createDeliveryFixture();
  try {
    const input = f.input();
    expect(
      (await sessions.calculator.rpc("confirm_order_delivery", input)).error,
    ).toBeNull();
    const snapshot = (
      await db
        .from("deliveries")
        .select("professional,payload")
        .eq("id", input.request_id)
        .single()
    ).data;
    const args = {
      target_delivery: input.request_id,
      request_id: key(),
      policy: "after_balance",
      approved: true,
    };
    for (const session of [
      sessions.client,
      sessions.clientB,
      sessions.admin,
      anon(),
      db,
    ])
      expect(
        (await session.rpc("approve_existing_delivery_release", args)).error,
      ).not.toBeNull();
    expect(
      (
        await sessions.calculator.rpc("approve_existing_delivery_release", {
          ...args,
          approved: false,
        })
      ).error,
    ).not.toBeNull();
    const other = { ...args, request_id: key() },
      attempts = [args, other];
    const results = await Promise.all(
      attempts.map((a) =>
        sessions.calculator.rpc("approve_existing_delivery_release", a),
      ),
    );
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.filter((r) => r.error?.code === "PT409")).toHaveLength(1);
    const winning = attempts[results.findIndex((r) => r.error === null)];
    expect(
      (
        await sessions.calculator.rpc(
          "approve_existing_delivery_release",
          winning,
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await sessions.calculator.rpc("approve_existing_delivery_release", {
          ...winning,
          policy: "before_balance",
        })
      ).error?.code,
    ).toBe("PT409");
    expect(
      (
        await db
          .from("delivery_releases")
          .select("delivery_id")
          .eq("delivery_id", input.request_id)
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await db
          .from("timeline_events")
          .select("id")
          .eq("process_id", f.process.id)
          .eq("kind", "status_changed")
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await db
          .from("audit_log")
          .select("id")
          .eq("target_id", input.request_id)
          .eq("action", "delivery_release_approved")
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await db
          .from("deliveries")
          .select("professional,payload")
          .eq("id", input.request_id)
          .single()
      ).data,
    ).toEqual(snapshot);
    expect(
      (
        await sessions.client
          .from("files")
          .select("id")
          .eq("process_id", f.process.id)
      ).data,
    ).toEqual([]);
    expect(
      (
        await db
          .from("orders")
          .update({ status: "in_review" })
          .eq("id", f.order.id)
      ).error,
    ).toBeNull();
    expect(
      (
        await sessions.calculator.rpc(
          "approve_existing_delivery_release",
          winning,
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await sessions.calculator.rpc("approve_existing_delivery_release", {
          ...winning,
          request_id: key(),
        })
      ).error?.code,
    ).toBe("PT409");
  } finally {
    await f.cleanup();
  }
});
it("configuração não libera entrega antiga; Pix/saldo são restritos ao processo e pagamentos confirmados", async () => {
  const f = await createDeliveryFixture();
  let newer: Awaited<ReturnType<typeof createDeliveryFixture>> | undefined;
  try {
    const old = f.input();
    expect(
      (await sessions.calculator.rpc("confirm_order_delivery", old)).error,
    ).toBeNull();
    expect(
      (
        await sessions.calculator.rpc("approve_future_delivery_policy", {
          request_id: key(),
          expected_revision: Number(prior.revision),
          policy: "after_balance",
          approved: true,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await db
          .from("delivery_releases")
          .select("delivery_id")
          .eq("delivery_id", old.request_id)
      ).data,
    ).toEqual([]);
    newer = await createDeliveryFixture();
    const fresh = newer.input();
    expect(
      (await sessions.calculator.rpc("confirm_order_delivery", fresh)).error,
    ).toBeNull();
    expect(
      (
        await db
          .from("delivery_releases")
          .select("policy")
          .eq("delivery_id", fresh.request_id)
          .single()
      ).data?.policy,
    ).toBe("after_balance");
    expect(
      (
        await sessions.calculator.rpc("approve_existing_delivery_release", {
          target_delivery: old.request_id,
          request_id: key(),
          policy: "after_balance",
          approved: true,
        })
      ).error,
    ).toBeNull();
    const target = {
      target_process: f.process.id,
      target_deliveries: [old.request_id, fresh.request_id],
    };
    for (const session of [sessions.clientB, sessions.admin, anon(), db])
      expect(
        (await session.rpc("get_delivery_payment_instructions", target)).error,
      ).not.toBeNull();
    const first = await sessions.client.rpc(
      "get_delivery_payment_instructions",
      target,
    );
    expect(first.error).toBeNull();
    // A fixture técnica não tem contexto comercial aceito. O saldo permanece
    // desconhecido; as fontes elegíveis são verificadas em current-credit-readers.
    expect(first.data).toEqual([
      {
        delivery_id: old.request_id,
        pix_key: null,
        remaining_cents: null,
        order_code: f.order.code,
      },
    ]);
    const original = (
        await db
          .from("deliveries")
          .select("*")
          .eq("id", old.request_id)
          .single()
      ).data!,
      duplicateId = randomUUID();
    expect(
      (
        await db.from("deliveries").insert({
          ...original,
          id: duplicateId,
          created_at: new Date(
            Date.parse(original.created_at) + 1000,
          ).toISOString(),
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await db.from("delivery_releases").insert({
          delivery_id: duplicateId,
          policy: "after_balance",
          approved_by: original.confirmed_by,
        })
      ).error,
    ).toBeNull();
    target.target_deliveries.push(duplicateId, old.request_id);
    expect(
      (await sessions.client.rpc("get_delivery_payment_instructions", target))
        .data,
    ).toEqual([{ ...first.data![0], delivery_id: duplicateId }]);
    expect(
      (
        await sessions.client.rpc("get_delivery_payment_instructions", {
          ...target,
          target_deliveries: Array.from({ length: 51 }, () => old.request_id),
        })
      ).error,
    ).not.toBeNull();
    const payments = [
      { kind: "deposit", amount_cents: 61728, status: "confirmed" },
      { kind: "triage", amount_cents: 123456, status: "confirmed" },
      { kind: "balance", amount_cents: 61728, status: "pending" },
    ];
    expect(
      (
        await db.from("payments").insert(
          payments.map((p) => ({
            ...p,
            order_id: f.order.id,
            method: "pix_manual",
          })),
        )
      ).error,
    ).toBeNull();
    expect(
      (await sessions.client.rpc("get_delivery_payment_instructions", target))
        .data?.[0].remaining_cents,
    ).toBeNull();
    expect(
      (
        await sessions.client
          .from("files")
          .select("id")
          .eq("process_id", f.process.id)
      ).data,
    ).toEqual([]);
    expect(
      (
        await db
          .from("payments")
          .update({ status: "confirmed" })
          .eq("order_id", f.order.id)
          .eq("kind", "balance")
      ).error,
    ).toBeNull();
    expect(
      (await sessions.client.rpc("get_delivery_payment_instructions", target))
        .data,
    ).toEqual([{ ...first.data![0], delivery_id: duplicateId }]);
    expect(
      (
        await sessions.client
          .from("files")
          .select("id")
          .eq("process_id", f.process.id)
      ).data,
    ).toEqual([]);
    // Confirmação manual antiga não cria o aceite/valores reconhecidos ausentes.
    expect(
      (
        await sessions.client.rpc("record_file_access", {
          target_file: f.ids[0],
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await db
          .from("payments")
          .update({ status: "refunded" })
          .eq("order_id", f.order.id)
          .eq("kind", "balance")
      ).error,
    ).toBeNull();
    expect(
      (await sessions.client.rpc("get_delivery_payment_instructions", target))
        .data?.[0].remaining_cents,
    ).toBeNull();
    expect(
      (
        await sessions.client
          .from("files")
          .select("id")
          .eq("process_id", f.process.id)
      ).data,
    ).toEqual([]);
    expect(
      (
        await db
          .from("settings")
          .update({ pix_key: null })
          .eq("singleton", true)
      ).error,
    ).toBeNull();
    expect(
      (await sessions.client.rpc("get_delivery_payment_instructions", target))
        .data?.[0].pix_key,
    ).toBeNull();
  } finally {
    if (newer) await newer.cleanup();
    await f.cleanup();
  }
});
