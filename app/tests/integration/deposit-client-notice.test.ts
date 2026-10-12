import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acceptanceFixture } from "../e2e/acceptance-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import {
  emailContent,
  emailPortalOrigin,
} from "@/modules/notifications/email-content";
import { depositReceiptSchema } from "@/modules/payments/deposit";

let fixture: Awaited<ReturnType<typeof acceptanceFixture>>;
const sessions: Record<string, SupabaseClient> = {};
const reservations: string[] = [];
type Sample = Awaited<ReturnType<typeof fixture.create>>;
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const args = (sample: Sample, patch: Record<string, unknown> = {}) => ({
  target_quote: sample.id,
  expected_context: sample.contextHash,
  expected_remaining_cents: sample.proposal.depositCents,
  request_id: randomUUID(),
  confirmed: true,
  ...patch,
});
async function accept(sample: Sample) {
  expect(
    (await fixture.db.rpc("accept_quote_system", sample.args())).error,
  ).toBeNull();
}
async function notices(sample: Sample) {
  const result = await fixture.db
    .from("notifications")
    .select("id,channel,recipient,template,data,dedup_key,status,attempts")
    .eq("template", "payment_confirmed")
    .contains("data", { order_id: sample.order_id });
  expect(result.error).toBeNull();
  return result.data!;
}
async function paymentCount(sample: Sample) {
  const result = await fixture.db
    .from("payments")
    .select("id")
    .eq("order_id", sample.order_id);
  expect(result.error).toBeNull();
  return result.data!.length;
}
async function status(sample: Sample) {
  const result = await fixture.db
    .from("orders")
    .select("status")
    .eq("id", sample.order_id)
    .single();
  expect(result.error).toBeNull();
  return result.data!.status;
}
beforeAll(async () => {
  fixture = await acceptanceFixture();
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
});
afterAll(async () => {
  try {
    if (reservations.length) {
      const ids = reservations.map(literal).join(",");
      sql(`delete from private.notification_dispatch_receipts where request_id::text in (${ids});
        delete from private.notification_dispatch_requests where request_id::text in (${ids});`);
    }
    await Promise.all(
      Object.values(sessions).map((db) => db.auth.signOut({ scope: "local" })),
    );
  } finally {
    if (fixture) await fixture.cleanup();
  }
});

it.each([false, true])(
  "aviso é do proprietário, com sinal antes/depois do documento (%s)",
  async (documents) => {
    const sample = await fixture.create({ documents });
    await accept(sample);
    const result = await sessions.calculator.rpc(
      "confirm_manual_deposit",
      args(sample),
    );
    expect(result.error).toBeNull();
    const receipt = depositReceiptSchema.parse(result.data);
    const owner = await fixture.db.auth.admin.getUserById(sample.actor);
    expect(owner.error).toBeNull();
    const rows = await notices(sample);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channel: "email",
      recipient: owner.data.user!.email,
      template: "payment_confirmed",
      status: "pending",
      attempts: 0,
      dedup_key: `payment:${receipt.paymentId}:client:email`,
    });
    const job = await fixture.db
      .from("orders")
      .select("code")
      .eq("id", sample.order_id)
      .single();
    expect(rows[0].data).toEqual({
      order_id: sample.order_id,
      process_id: sample.process_id,
      code: job.data!.code,
    });
    expect(await status(sample)).toBe(
      documents ? "queued" : "awaiting_documents",
    );
    const content = emailContent(rows[0]);
    expect(content.href).toBe(
      `${emailPortalOrigin}/app/processos/${sample.process_id}`,
    );
    expect(JSON.stringify(content)).not.toContain(owner.data.user!.email!);
  },
);

it("intenções concorrentes e replay recuperam um único pagamento e aviso", async () => {
  const sample = await fixture.create();
  await accept(sample);
  const request = args(sample);
  const results = await Promise.all([
    sessions.calculator.rpc("confirm_manual_deposit", request),
    sessions.calculator.rpc("confirm_manual_deposit", args(sample)),
    sessions.calculator.rpc("confirm_manual_deposit", args(sample)),
  ]);
  expect(results.map((result) => result.error)).toEqual([null, null, null]);
  expect(results[1].data).toEqual(results[0].data);
  expect(results[2].data).toEqual(results[0].data);
  expect(await paymentCount(sample)).toBe(1);
  expect(await notices(sample)).toHaveLength(1);
  await fixture.db
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", sample.order_id);
  const replay = await sessions.calculator.rpc(
    "confirm_manual_deposit",
    request,
  );
  expect(replay.error).toBeNull();
  expect(replay.data).toEqual(results[0].data);
  expect(await notices(sample)).toHaveLength(1);
  expect(await status(sample)).toBe("cancelled");
});

it("primeiro documento posterior libera fila sem repetir o aviso do sinal", async () => {
  const sample = await fixture.create();
  await accept(sample);
  expect(
    (await sessions.calculator.rpc("confirm_manual_deposit", args(sample)))
      .error,
  ).toBeNull();
  const id = randomUUID();
  expect(
    (
      await fixture.db.from("files").insert({
        id,
        process_id: sample.process_id,
        order_id: sample.order_id,
        folder: "case",
        uploaded_by: sample.actor,
        name: "Documento fictício.pdf",
        mime: "application/pdf",
        path: `${sample.actor}/${sample.process_id}/${id}/sinal.pdf`,
        size_bytes: 100,
        expected_sha256: "0".repeat(64),
        upload_status: "pending",
      })
    ).error,
  ).toBeNull();
  const completed = {
    target_file: id,
    actor: sample.actor,
    observed_hash: "0".repeat(64),
    observed_size: 100,
  };
  expect(
    (await fixture.db.rpc("complete_file_system", completed)).error,
  ).toBeNull();
  expect(
    (await fixture.db.rpc("complete_file_system", completed)).error,
  ).toBeNull();
  expect(await status(sample)).toBe("queued");
  expect(await notices(sample)).toHaveLength(1);
  const queued = await fixture.db
    .from("notifications")
    .select("id")
    .eq("dedup_key", `queued:${sample.order_id}:email`);
  expect(queued.error).toBeNull();
  expect(queued.data).toHaveLength(1);
});

it("parcela restante gera aviso; conciliação de sinal já pago não anuncia crédito novo", async () => {
  const sample = await fixture.create();
  await accept(sample);
  expect(
    (
      await fixture.db.from("payments").insert({
        order_id: sample.order_id,
        kind: "deposit",
        method: "pix_manual",
        amount_cents: 5000,
        status: "confirmed",
      })
    ).error,
  ).toBeNull();
  const confirmed = await sessions.calculator.rpc(
    "confirm_manual_deposit",
    args(sample, { expected_remaining_cents: 7501 }),
  );
  expect(confirmed.error).toBeNull();
  expect(confirmed.data).toMatchObject({
    amountCents: 7501,
    creditedBeforeCents: 5000,
  });
  expect(await notices(sample)).toHaveLength(1);
  const paid = await fixture.create({ documents: true });
  await accept(paid);
  expect(
    (
      await fixture.db.from("payments").insert({
        order_id: paid.order_id,
        kind: "deposit",
        method: "pix_manual",
        amount_cents: paid.proposal.depositCents,
        status: "confirmed",
      })
    ).error,
  ).toBeNull();
  const reconciled = await sessions.calculator.rpc(
    "confirm_manual_deposit",
    args(paid, { expected_remaining_cents: 0 }),
  );
  expect(reconciled.error).toBeNull();
  expect(reconciled.data).toMatchObject({
    paymentId: null,
    amountCents: 0,
    status: "queued",
  });
  expect(await notices(paid)).toEqual([]);
  expect(await paymentCount(paid)).toBe(1);
});

it("estorno e novo crédito têm avisos distintos; replay antigo conserva o histórico", async () => {
  const sample = await fixture.create();
  await accept(sample);
  const request = args(sample);
  const first = await sessions.calculator.rpc(
    "confirm_manual_deposit",
    request,
  );
  expect(first.error).toBeNull();
  const receipt = depositReceiptSchema.parse(first.data);
  expect(
    (
      await fixture.db
        .from("payments")
        .update({ status: "refunded" })
        .eq("id", receipt.paymentId!)
    ).error,
  ).toBeNull();
  const replay = await sessions.calculator.rpc(
    "confirm_manual_deposit",
    request,
  );
  expect(replay.error).toBeNull();
  expect(replay.data).toEqual(first.data);
  expect(await notices(sample)).toHaveLength(1);
  const second = await sessions.calculator.rpc(
    "confirm_manual_deposit",
    args(sample),
  );
  expect(second.error).toBeNull();
  expect(second.data.paymentId).not.toBe(receipt.paymentId);
  expect((await notices(sample)).map((row) => row.dedup_key).sort()).toEqual(
    [
      `payment:${receipt.paymentId}:client:email`,
      `payment:${second.data.paymentId}:client:email`,
    ].sort(),
  );
});

it.each([false, true])(
  "falha do aviso reverte pagamento, fila, recibos e auditoria (%s)",
  async (documents) => {
    const sample = await fixture.create({ documents });
    await accept(sample);
    const request = args(sample);
    sql(`create function private.fixture_fail_client_payment_notice() returns trigger language plpgsql set search_path='' as $$begin
    if new.template='payment_confirmed' and new.data->>'order_id'='${sample.order_id}' then raise exception 'falha sintética'; end if;
    return new; end;$$;
    create trigger fixture_fail_client_payment_notice before insert on public.notifications
    for each row execute function private.fixture_fail_client_payment_notice();`);
    try {
      expect(
        (await sessions.calculator.rpc("confirm_manual_deposit", request))
          .error,
      ).not.toBeNull();
      expect(await paymentCount(sample)).toBe(0);
      expect(await status(sample)).toBe("awaiting_payment");
      expect(await notices(sample)).toEqual([]);
      expect(
        sql(
          `select count(*) from private.manual_deposit_receipts where order_id='${sample.order_id}';`,
        ),
      ).toBe("0");
      expect(
        sql(
          `select count(*) from private.manual_deposit_requests where request_id='${request.request_id}';`,
        ),
      ).toBe("0");
      expect(
        sql(
          `select count(*) from public.timeline_events where order_id='${sample.order_id}' and kind in ('payment_confirmed','status_changed');`,
        ),
      ).toBe("0");
      expect(
        sql(
          `select count(*) from public.audit_log where target_id='${sample.order_id}' and action='order_queued';`,
        ),
      ).toBe("0");
      expect(
        sql(
          `select count(*) from public.audit_log where action='manual_deposit_confirmed' and actor_id='${fixture.calculator.id}' and created_at>=(select accepted_at from public.quotes where id='${sample.id}');`,
        ),
      ).toBe("0");
      expect(
        sql(
          `select count(*) from public.notifications where dedup_key='queued:${sample.order_id}:email';`,
        ),
      ).toBe("0");
    } finally {
      sql(
        "drop trigger fixture_fail_client_payment_notice on public.notifications; drop function private.fixture_fail_client_payment_notice();",
      );
    }
    expect(
      (await sessions.calculator.rpc("confirm_manual_deposit", request)).error,
    ).toBeNull();
    expect(await notices(sample)).toHaveLength(1);
  },
);

it.each(["email", "role"])(
  "contato inválido não usa fallback e reverte a confirmação (%s)",
  async (field) => {
    const sample = await fixture.create();
    await accept(sample);
    const historical = await fixture.create();
    await accept(historical);
    const originalRequest = args(historical);
    const original = await sessions.calculator.rpc(
      "confirm_manual_deposit",
      originalRequest,
    );
    expect(original.error).toBeNull();
    const paid = await fixture.create({ documents: true });
    await accept(paid);
    expect(
      (
        await fixture.db.from("payments").insert({
          order_id: paid.order_id,
          kind: "deposit",
          method: "pix_manual",
          amount_cents: paid.proposal.depositCents,
          status: "confirmed",
        })
      ).error,
    ).toBeNull();
    const owner = await fixture.db.auth.admin.getUserById(sample.actor);
    expect(owner.error).toBeNull();
    const email = owner.data.user!.email!;
    if (field === "email")
      sql(`update auth.users set email=null where id='${sample.actor}';`);
    else
      sql(
        `update public.profiles set role='admin' where id='${sample.actor}';`,
      );
    try {
      const result = await sessions.calculator.rpc(
        "confirm_manual_deposit",
        args(sample),
      );
      expect(result.error?.message).toBe("Contato do cliente indisponível");
      expect(await paymentCount(sample)).toBe(0);
      expect(await notices(sample)).toEqual([]);
      expect(await status(sample)).toBe("awaiting_payment");
      const replay = await sessions.calculator.rpc(
        "confirm_manual_deposit",
        originalRequest,
      );
      expect(replay.error).toBeNull();
      expect(replay.data).toEqual(original.data);
      expect(await notices(historical)).toHaveLength(1);
      expect(await paymentCount(historical)).toBe(1);
      const reconciled = await sessions.calculator.rpc(
        "confirm_manual_deposit",
        args(paid, { expected_remaining_cents: 0 }),
      );
      expect(reconciled.error).toBeNull();
      expect(reconciled.data).toMatchObject({
        paymentId: null,
        amountCents: 0,
        status: "queued",
      });
      expect(await notices(paid)).toEqual([]);
      expect(await paymentCount(paid)).toBe(1);
    } finally {
      if (field === "email")
        sql(
          `update auth.users set email=${literal(email)} where id='${sample.actor}';`,
        );
      else
        sql(
          `update public.profiles set role='client' where id='${sample.actor}';`,
        );
    }
  },
);

it("papel indevido, simulação e sinal zero não produzem aviso", async () => {
  const sample = await fixture.create();
  await accept(sample);
  for (const role of ["client", "clientB", "admin"])
    expect(
      (await sessions[role].rpc("confirm_manual_deposit", args(sample))).error,
    ).not.toBeNull();
  expect(await notices(sample)).toEqual([]);
  // Uma proposta aceita não pode ser convertida em simulação por UPDATE.
  expect(
    (
      await fixture.db
        .from("quotes")
        .update({ is_simulation: true })
        .eq("id", sample.id)
    ).error?.message,
  ).toBe("Proposta contratual imutável");
  const simulated = await fixture.create({ simulation: true });
  expect(
    (await sessions.calculator.rpc("confirm_manual_deposit", args(simulated)))
      .error,
  ).not.toBeNull();
  expect(await notices(simulated)).toEqual([]);
  expect(await paymentCount(simulated)).toBe(0);
  const zero = await fixture.create({ zero: true });
  await accept(zero);
  expect(
    (
      await sessions.calculator.rpc(
        "confirm_manual_deposit",
        args(zero, { expected_remaining_cents: 0 }),
      )
    ).error,
  ).not.toBeNull();
  expect(await notices(zero)).toEqual([]);
  const contract = await fixture.create({ contract: true });
  await accept(contract);
  expect(
    (await sessions.calculator.rpc("confirm_manual_deposit", args(contract)))
      .error?.message,
  ).toBe("Contrato dispensa sinal");
  expect(await notices(contract)).toEqual([]);
});

it("reserva da fila congela o aviso do cliente e conserva a chave no replay", async () => {
  const sample = await fixture.create();
  await accept(sample);
  expect(
    (await sessions.calculator.rpc("confirm_manual_deposit", args(sample)))
      .error,
  ).toBeNull();
  const row = (await notices(sample))[0];
  const request = randomUUID();
  reservations.push(request);
  const claimArgs = {
    request_id: request,
    channel: "email",
    target_notification: row.id,
  };
  const first = await fixture.db.rpc(
    "claim_notification_local_system",
    claimArgs,
  );
  expect(first.error).toBeNull();
  expect(first.data.status).toBe("reserved");
  expect(first.data.message).toMatchObject({
    recipient: row.recipient,
    template: row.template,
    data: row.data,
  });
  const replay = await fixture.db.rpc(
    "claim_notification_local_system",
    claimArgs,
  );
  expect(replay.error).toBeNull();
  expect(replay.data).toEqual(first.data);
  expect(emailContent(first.data.message).href).toBe(
    `${emailPortalOrigin}/app/processos/${sample.process_id}`,
  );
});

it.each([false, true])(
  "edição do perfil e confirmação concorrentes concluem sem inversão dos locks (perfil mínimo %s)",
  async (minimal) => {
    const sample = await fixture.create();
    await accept(sample);
    const profile = await fixture.db
      .from("profiles")
      .select("full_name,phone,oab_number,oab_state,city")
      .eq("id", sample.actor)
      .single();
    const customer = await fixture.db
      .from("clients")
      .select("legal_name")
      .eq("owner_id", sample.actor)
      .single();
    expect(profile.error).toBeNull();
    expect(customer.error).toBeNull();
    const audits = await fixture.db
      .from("audit_log")
      .select("id")
      .eq("action", "profile_updated")
      .eq("target_id", sample.actor);
    expect(audits.error).toBeNull();
    const priorAudits = new Set(audits.data!.map((row) => row.id));
    const name = "deposit-profile-lock-" + randomUUID();
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_andre-calculos",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { env: process.env, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", () => {});
    const done = new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", resolve);
    });
    let pending:
      Promise<Awaited<ReturnType<SupabaseClient["rpc"]>>> | undefined;
    try {
      if (minimal) {
        expect(
          (
            await fixture.db
              .from("profiles")
              .update({ phone: null })
              .eq("id", sample.actor)
          ).error,
        ).toBeNull();
      }
      // Reproduz o primeiro lock adquirido pela edição do perfil, antes do cliente.
      child.stdin.write(`set application_name='${name}';
      set statement_timeout='8s'; set idle_in_transaction_session_timeout='8s'; begin;
      update public.profiles set full_name=full_name where id='${sample.actor}';
      \\echo PROFILE_HELD
    `);
      await expect
        .poll(() => output, { timeout: 3000 })
        .toContain("PROFILE_HELD");
      pending = Promise.resolve(
        sessions.calculator.rpc("confirm_manual_deposit", args(sample)),
      );
      await expect
        .poll(
          () =>
            sql(`select count(*) from pg_stat_activity b where b.wait_event_type='Lock'
      and exists(select 1 from pg_stat_activity a where a.application_name='${name}'
      and a.pid=any(pg_blocking_pids(b.pid)));`),
          { timeout: 3000 },
        )
        .toBe("1");
      const p = profile.data!;
      const values = [
        p.full_name,
        (minimal ? null : p.phone) ?? "+5561999999999",
        p.oab_number ?? "",
        p.oab_state ?? "",
        p.city ?? "",
        customer.data!.legal_name,
      ];
      const claims = literal(
        JSON.stringify({ sub: sample.actor, role: "authenticated" }),
      );
      child.stdin.end(`set local role authenticated;
      select set_config('request.jwt.claims',${claims},true);
      select public.update_own_profile(${values.map(literal).join(",")});
      commit;
      \\q
    `);
      expect(await done).toBe(0);
      expect((await pending).error).toBeNull();
      expect(await paymentCount(sample)).toBe(1);
      expect(await notices(sample)).toHaveLength(1);
    } finally {
      if (child.exitCode === null && !child.stdin.destroyed)
        child.stdin.end("rollback;\n\\q\n");
      await done;
      if (pending) await pending;
      expect(
        (
          await fixture.db
            .from("profiles")
            .update(profile.data!)
            .eq("id", sample.actor)
        ).error,
      ).toBeNull();
      expect(
        (
          await fixture.db
            .from("clients")
            .update(customer.data!)
            .eq("owner_id", sample.actor)
        ).error,
      ).toBeNull();
      const result = await fixture.db
        .from("audit_log")
        .select("id")
        .eq("action", "profile_updated")
        .eq("target_id", sample.actor);
      expect(result.error).toBeNull();
      const fresh = result
        .data!.map((row) => row.id)
        .filter((id) => !priorAudits.has(id));
      if (fresh.length)
        expect(
          (await fixture.db.from("audit_log").delete().in("id", fresh)).error,
        ).toBeNull();
    }
  },
  12000,
);
