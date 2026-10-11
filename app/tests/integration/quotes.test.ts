import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  quoteFixture,
  quoteSession,
  createQuoteDraft,
  removeQuoteFixture,
} from "../e2e/quote-helper";
import { evaluateProposal, type Proposal } from "@/modules/quotes/proposal";
import { quoteFixtureInputs } from "@/modules/quotes/local-fixtures";
import { localNotificationSql } from "../e2e/notification-helper";
import type { PriceTable } from "@/modules/quotes/pricing";
let fixture: Awaited<ReturnType<typeof quoteFixture>>,
  draft: Awaited<ReturnType<typeof createQuoteDraft>>,
  snapshot: Proposal;
const sessions: Record<string, SupabaseClient> = {},
  ids: string[] = [];
let quoteId: string, requestId: string, actor: string;
function args(patch: Record<string, unknown> = {}) {
  return {
    actor,
    target_order: draft.order_id,
    expected_checklist_revision: draft.revision,
    request_id: randomUUID(),
    expected_settings_revision: fixture.settings.revision,
    expected_price_table: fixture.price.id,
    proposal: snapshot,
    ...patch,
  };
}
function snapshotFor(d: typeof draft) {
  const now = new Date(),
    cfg = fixture.settings;
  const result = evaluateProposal({
    now,
    mode: "fixture",
    orderId: d.order_id,
    processId: d.process_id,
    checklistRevision: d.revision,
    answers: d.answers,
    settingsRevision: cfg.revision,
    validityDays: cfg.quote_valid_days,
    slackDays: cfg.slack_days,
    professional: {
      name: cfg.technical_name,
      crcNumber: cfg.crc_number,
      crcState: cfg.crc_state,
      category: cfg.crc_category,
      email: cfg.contact_email,
      phone: cfg.contact_phone,
    },
    conditions: (cfg.default_texts as { conditions: string }).conditions,
    prices: {
      id: fixture.price.id,
      active: true,
      activatedAt: fixture.price.activated_at,
      table: {
        ...(fixture.price.parameters as object),
        version: String(fixture.price.version),
        isExample: false,
      } as PriceTable,
    },
    ...quoteFixtureInputs(now, d.answers),
  });
  if (result.status !== "fixture_ready")
    throw new Error("Proposta fictícia não calculada.");
  return result.proposal;
}
beforeAll(async () => {
  fixture = await quoteFixture();
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
  actor = (await sessions.client.auth.getUser()).data.user!.id;
  draft = await createQuoteDraft();
  ids.push(draft.order_id);
  snapshot = snapshotFor(draft);
});
afterAll(async () => {
  try {
    for (const id of ids) await removeQuoteFixture(id);
  } finally {
    if (fixture) await fixture.cleanup();
    await Promise.all(
      Object.values(sessions).map((s) => s.auth.signOut({ scope: "local" })),
    );
  }
});
it("cliente/calculista/admin/anon não chamam a RPC de sistema nem forjam preço", async () => {
  const anonymous = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  for (const session of [...Object.values(sessions), anonymous])
    expect(
      (await session.rpc("create_checklist_quote_system", args())).error,
    ).not.toBeNull();
  expect(
    (
      await sessions.client.from("quotes").insert({
        order_id: draft.order_id,
        number: "ORC-2026-FAKE",
        items: [],
        total_cents: 0,
        valid_until: new Date().toISOString(),
      })
    ).error,
  ).not.toBeNull();
});
it("payload comercial, valores adulterados e revision stale não consomem numeração", async () => {
  const before = localNotificationSql(
    "select coalesce(sum(last_number),0) from private.quote_counters;",
  );
  for (const patch of [
    { proposal: { ...snapshot, mode: "commercial" } },
    { proposal: { ...snapshot, totalCents: 1 } },
    { expected_checklist_revision: draft.revision + 1 },
    { expected_settings_revision: fixture.settings.revision + 1 },
    {
      proposal: {
        ...snapshot,
        professional: { ...snapshot.professional, crcNumber: "forjado" },
      },
    },
  ])
    expect(
      (await fixture.db.rpc("create_checklist_quote_system", args(patch)))
        .error,
    ).not.toBeNull();
  expect(
    localNotificationSql(
      "select coalesce(sum(last_number),0) from private.quote_counters;",
    ),
  ).toBe(before);
  expect(
    (
      await fixture.db
        .from("quotes")
        .select("id")
        .eq("order_id", draft.order_id)
    ).data,
  ).toHaveLength(0);
});
it("concorrência com dois UUIDs cria uma proposta/evento/auditoria; número não trunca após 9999", async () => {
  const year = snapshot.issuedAt.slice(0, 4),
    prior = localNotificationSql(
      `select coalesce((select last_number from private.quote_counters where year=${year}),0);`,
    );
  localNotificationSql(
    `insert into private.quote_counters(year,last_number) values(${year},9999) on conflict(year) do update set last_number=greatest(quote_counters.last_number,9999);`,
  );
  requestId = randomUUID();
  const results = await Promise.all([
    fixture.db.rpc(
      "create_checklist_quote_system",
      args({ request_id: requestId }),
    ),
    fixture.db.rpc("create_checklist_quote_system", args()),
  ]);
  for (const r of results) {
    expect(r.error).toBeNull();
    expect(r.data).toBe(results[0].data);
  }
  quoteId = results[0].data;
  expect(quoteId).toBeTruthy();
  const row = await fixture.db
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .single();
  expect(row.data?.number).toBe(
    `ORC-${year}-${Math.max(9999, Number(prior)) + 1}`,
  );
  expect(row.data?.proposal_snapshot).toEqual(snapshot);
  expect(
    (
      await fixture.db
        .from("notifications")
        .select("id")
        .contains("data", { quote_id: quoteId })
    ).data,
  ).toEqual([]);
  expect(
    (
      await fixture.db
        .from("quotes")
        .select("id")
        .eq("order_id", draft.order_id)
    ).data,
  ).toHaveLength(1);
  expect(
    (
      await fixture.db
        .from("timeline_events")
        .select("id")
        .eq("order_id", draft.order_id)
        .eq("kind", "quote_created")
    ).data,
  ).toHaveLength(1);
  expect(
    (
      await fixture.db
        .from("audit_log")
        .select("id")
        .eq("target_id", quoteId)
        .eq("action", "quote_created")
    ).data,
  ).toHaveLength(1);
});
it("replay reautoriza e devolve original mesmo após settings/preço mudarem", async () => {
  expect(quoteId).toBeTruthy();
  await fixture.db
    .from("settings")
    .update({
      revision: fixture.settings.revision + 1,
      technical_name: "Nome fictício posterior",
    })
    .eq("singleton", true);
  await fixture.db
    .from("price_tables")
    .update({ active: false })
    .eq("id", fixture.price.id);
  const replay = await fixture.db.rpc(
    "create_checklist_quote_system",
    args({
      request_id: requestId,
      proposal: null,
      expected_settings_revision: null,
      expected_price_table: null,
    }),
  );
  expect(replay.error).toBeNull();
  expect(replay.data).toBe(quoteId);
  const receipts = localNotificationSql(
    `select count(*) from private.quote_requests where order_id='${draft.order_id}'::uuid;`,
  );
  const probe = await fixture.db.rpc(
    "create_checklist_quote_system",
    args({
      request_id: randomUUID(),
      proposal: null,
      expected_settings_revision: null,
      expected_price_table: null,
    }),
  );
  expect(probe.error).toBeNull();
  expect(probe.data).toBe(quoteId);
  expect(
    localNotificationSql(
      `select count(*) from private.quote_requests where order_id='${draft.order_id}'::uuid;`,
    ),
  ).toBe(receipts);
  const other = (await sessions.clientB.auth.getUser()).data.user!.id;
  expect(
    (
      await fixture.db.rpc(
        "create_checklist_quote_system",
        args({ actor: other, request_id: requestId }),
      )
    ).error,
  ).not.toBeNull();
  expect(
    (
      await fixture.db.rpc(
        "create_checklist_quote_system",
        args({
          request_id: requestId,
          expected_checklist_revision: draft.revision + 1,
        }),
      )
    ).error,
  ).not.toBeNull();
  await fixture.db
    .from("settings")
    .update(fixture.settings)
    .eq("singleton", true);
  await fixture.db
    .from("price_tables")
    .update({ active: true })
    .eq("id", fixture.price.id);
});
it("snapshot não muda; ensaio não pode ser aceito; PDF respeita RLS e audita só autorizados", async () => {
  expect(
    (
      await fixture.db
        .from("quotes")
        .update({ total_cents: 1 })
        .eq("id", quoteId)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await fixture.db
        .from("quotes")
        .update({ accepted_at: new Date().toISOString(), accepted_by: actor })
        .eq("id", quoteId)
    ).error,
  ).not.toBeNull();
  for (const role of ["clientB", "admin"]) {
    expect(
      (
        await sessions[role].rpc("get_quote_pdf_export", {
          target_quote: quoteId,
        })
      ).error,
    ).not.toBeNull();
  }
  for (const role of ["client", "calculator"]) {
    const exported = await sessions[role].rpc("get_quote_pdf_export", {
      target_quote: quoteId,
    });
    expect(exported.error).toBeNull();
    expect(exported.data.proposal).toEqual(snapshot);
  }
  expect(
    (await sessions.clientB.from("quotes").select("id").eq("id", quoteId)).data,
  ).toEqual([]);
  expect(
    (
      await fixture.db
        .from("audit_log")
        .select("id")
        .eq("target_id", quoteId)
        .eq("action", "quote_pdf_requested")
    ).data,
  ).toHaveLength(2);
});
it("falha de auditoria reverte quote, status, recibo e contador", async () => {
  const d = await createQuoteDraft();
  ids.push(d.order_id);
  const p = snapshotFor(d);
  const before = localNotificationSql(
    "select coalesce(sum(last_number),0) from private.quote_counters;",
  );
  localNotificationSql(
    `create function private.fixture_fail_quote_audit() returns trigger language plpgsql set search_path='' as $$begin if new.action='quote_created' and new.target_id is not null and exists(select 1 from public.quotes where id=new.target_id and order_id='${d.order_id}'::uuid) then raise exception 'Fixture de falha'; end if; return new; end;$$; create trigger fixture_fail_quote_audit before insert on public.audit_log for each row execute function private.fixture_fail_quote_audit();`,
  );
  try {
    const result = await fixture.db.rpc(
      "create_checklist_quote_system",
      args({
        target_order: d.order_id,
        expected_checklist_revision: d.revision,
        proposal: p,
      }),
    );
    expect(result.error).not.toBeNull();
    expect(
      (
        await fixture.db
          .from("orders")
          .select("status")
          .eq("id", d.order_id)
          .single()
      ).data?.status,
    ).toBe("draft");
    expect(
      (await fixture.db.from("quotes").select("id").eq("order_id", d.order_id))
        .data,
    ).toHaveLength(0);
    expect(
      localNotificationSql(
        "select coalesce(sum(last_number),0) from private.quote_counters;",
      ),
    ).toBe(before);
    expect(
      localNotificationSql(
        `select count(*) from private.quote_requests where order_id='${d.order_id}'::uuid;`,
      ),
    ).toBe("0");
  } finally {
    localNotificationSql(
      "drop trigger fixture_fail_quote_audit on public.audit_log; drop function private.fixture_fail_quote_audit();",
    );
  }
});
