import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { acceptanceFixture } from "../e2e/acceptance-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { independentCleanup } from "@/lib/testing/independent-cleanup";
import { contractArchiveSchema } from "@/modules/quotes/contract-snapshot";

let fixture: Awaited<ReturnType<typeof acceptanceFixture>>;
const sessions: Record<string, SupabaseClient> = {};
let originalProfile: Record<string, unknown>;
let originalClient: Record<string, unknown>;
type Sample = Awaited<ReturnType<typeof fixture.create>>;
const accept = (s: Sample, requestId = randomUUID()) =>
  fixture.db.rpc("accept_quote_system", s.args({ request_id: requestId }));
const archive = async (s: Sample, role = "client") => {
  const r = await sessions[role].rpc("get_quote_contract_snapshot", {
    target_quote: s.id,
  });
  expect(r.error).toBeNull();
  return contractArchiveSchema.parse(r.data);
};
const counts = (s: Sample) =>
  JSON.parse(
    sql(`select jsonb_build_object(
   'acceptances',(select count(*) from private.quote_acceptances where quote_id='${s.id}'),
   'requests',(select count(*) from private.quote_acceptance_requests where quote_id='${s.id}'),
   'snapshots',(select count(*) from private.quote_contract_snapshots where quote_id='${s.id}'),
   'intents',(select count(*) from private.quote_contract_generation_intents where quote_id='${s.id}'),
   'events',(select count(*) from public.timeline_events where order_id='${s.order_id}' and kind='quote_accepted'),
   'audits',(select count(*) from public.audit_log where target_id='${s.id}' and action='quote_accepted'));`),
  );
beforeAll(async () => {
  fixture = await acceptanceFixture();
  originalProfile = (
    await fixture.db
      .from("profiles")
      .select("full_name,phone,oab_number,oab_state")
      .eq("id", fixture.owner.owner_id)
      .single()
  ).data!;
  originalClient = (
    await fixture.db
      .from("clients")
      .select("kind,document,legal_name")
      .eq("id", fixture.owner.id)
      .single()
  ).data!;
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
});
afterAll(async () => {
  await independentCleanup(
    [
      {
        name: "profile",
        run: async () => {
          if (fixture && originalProfile)
            expect(
              (
                await fixture.db
                  .from("profiles")
                  .update(originalProfile)
                  .eq("id", fixture.owner.owner_id)
              ).error,
            ).toBeNull();
        },
      },
      {
        name: "client",
        run: async () => {
          if (fixture && originalClient)
            expect(
              (
                await fixture.db
                  .from("clients")
                  .update(originalClient)
                  .eq("id", fixture.owner.id)
              ).error,
            ).toBeNull();
        },
      },
      {
        name: "sessions",
        run: async () => {
          for (const db of Object.values(sessions))
            expect(
              (await db.auth.signOut({ scope: "local" })).error,
            ).toBeNull();
        },
      },
      {
        name: "fixture",
        run: async () => {
          if (fixture) await fixture.cleanup();
        },
      },
    ],
    false,
    (failed) =>
      console.warn(
        JSON.stringify({ diagnostic: "contract_snapshot_cleanup", failed }),
      ),
  );
});

it("congela pessoa, proposta, textos e prova do aceite; intenção aponta ao mesmo SHA", async () => {
  const s = await fixture.create();
  expect((await accept(s)).error).toBeNull();
  const a = await archive(s);
  expect(a.snapshot).toMatchObject({
    quoteId: s.id,
    number: s.number,
    proposal: s.proposal,
    contractant: {
      source: "acceptance",
      actorId: s.actor,
      kind: originalClient.kind,
      fullName: originalProfile.full_name,
      legalName: originalClient.legal_name,
      email: "clientea@exemplo.com",
    },
    terms: { version: fixture.terms },
    privacy: { version: fixture.privacy },
    acceptance: { actorId: s.actor, contextHash: s.contextHash },
  });
  expect(
    sql(
      `select (s.snapshot_sha256=encode(sha256(convert_to(s.snapshot::text,'UTF8')),'hex') and i.snapshot_sha256=s.snapshot_sha256)::text from private.quote_contract_snapshots s join private.quote_contract_generation_intents i using(quote_id) where s.quote_id='${s.id}';`,
    ),
  ).toBe("true");
  expect(await archive(s, "calculator")).toEqual(a);
});
it("captura empresa e representante fictícios sem confundir nome pessoal com razão social", async () => {
  expect(
    (
      await fixture.db
        .from("profiles")
        .update({ full_name: "Representante fictícia do escritório" })
        .eq("id", fixture.owner.owner_id)
    ).error,
  ).toBeNull();
  expect(
    (
      await fixture.db
        .from("clients")
        .update({
          kind: "company",
          document: "11222333000181",
          legal_name: "Escritório de demonstração",
        })
        .eq("id", fixture.owner.id)
    ).error,
  ).toBeNull();
  const s = await fixture.create();
  expect((await accept(s)).error).toBeNull();
  expect((await archive(s)).snapshot.contractant).toMatchObject({
    kind: "company",
    document: "11222333000181",
    legalName: "Escritório de demonstração",
    fullName: "Representante fictícia do escritório",
  });
});
it("replay e aceites concorrentes mantêm um snapshot e uma intenção", async () => {
  const s = await fixture.create(),
    key = randomUUID();
  const r = await Promise.all([accept(s, key), accept(s, key)]);
  expect(r.map((x) => x.error)).toEqual([null, null]);
  expect(r[0].data).toEqual(r[1].data);
  const before = await archive(s);
  expect((await accept(s)).error).toBeNull();
  expect(await archive(s)).toEqual(before);
  expect(counts(s)).toEqual({
    acceptances: 1,
    requests: 2,
    snapshots: 1,
    intents: 1,
    events: 1,
    audits: 1,
  });
});
it("editar perfil, documento e configurações depois do aceite não modifica o contrato", async () => {
  const s = await fixture.create(),
    key = randomUUID();
  expect((await accept(s, key)).error).toBeNull();
  const before = await archive(s);
  expect(
    (
      await fixture.db
        .from("profiles")
        .update({
          full_name: "Outro nome fictício",
          phone: "11999990000",
          oab_number: "98765",
          oab_state: "SP",
        })
        .eq("id", s.actor)
    ).error,
  ).toBeNull();
  expect(
    (
      await fixture.db
        .from("clients")
        .update({
          kind: "person",
          document: "52998224725",
          legal_name: "Identidade fictícia editada",
        })
        .eq("id", fixture.owner.id)
    ).error,
  ).toBeNull();
  expect(
    (
      await fixture.db
        .from("settings")
        .update({
          approved_terms_version: null,
          technical_name: "Outro contador fictício",
        })
        .eq("singleton", true)
    ).error,
  ).toBeNull();
  try {
    expect((await accept(s, key)).error).toBeNull();
    expect(await archive(s)).toEqual(before);
  } finally {
    expect(
      (
        await fixture.db
          .from("settings")
          .update({
            approved_terms_version: fixture.terms,
            technical_name: fixture.settings.technical_name,
          })
          .eq("singleton", true)
      ).error,
    ).toBeNull();
  }
});
it("aceite histórico conserva recibo/contexto e informa identidade ausente sem ler o cadastro de hoje", async () => {
  const s = await fixture.create();
  expect((await accept(s)).error).toBeNull();
  const before = await archive(s);
  // Exclusivamente amostra local: reproduz a entrada da migração para um recibo anterior.
  sql(
    `delete from private.quote_contract_snapshots where quote_id='${s.id}'; select private.freeze_quote_contract('${s.id}',true);`,
  );
  const legacy = await archive(s);
  expect(legacy.snapshot.contractant).toEqual({
    source: "legacy",
    actorId: s.actor,
    kind: null,
    fullName: null,
    legalName: null,
    document: null,
    email: null,
    phone: null,
    oabNumber: null,
    oabState: null,
  });
  for (const field of ["proposal", "terms", "privacy", "acceptance"] as const)
    expect(legacy.snapshot[field]).toEqual(before.snapshot[field]);
  expect(counts(s).intents).toBe(1);
  sql(`select private.freeze_quote_contract('${s.id}',false);`);
  expect(await archive(s)).toEqual(legacy);
});
it("tabelas/intenção são imutáveis; SHA e associação inválidos são recusados", async () => {
  const s = await fixture.create();
  expect((await accept(s)).error).toBeNull();
  const before = await archive(s);
  for (const table of [
    "quote_contract_snapshots",
    "quote_contract_generation_intents",
  ])
    expect(() =>
      sql(
        `update private.${table} set snapshot_sha256=repeat('f',64) where quote_id='${s.id}';`,
      ),
    ).toThrow();
  // A remoção e a inserção são uma só instrução: a falha de constraint reverte
  // também a remoção, sem deixar a intenção ou o snapshot ausentes.
  expect(() =>
    sql(`with removed as (delete from private.quote_contract_snapshots where quote_id='${s.id}' returning *)
      insert into private.quote_contract_snapshots(quote_id,snapshot,snapshot_sha256,captured_at)
      select quote_id,snapshot,repeat('f',64),captured_at from removed;`),
  ).toThrow();
  expect(() =>
    sql(`with removed as (delete from private.quote_contract_generation_intents where quote_id='${s.id}' returning quote_id)
      insert into private.quote_contract_generation_intents(quote_id,snapshot_sha256)
      select quote_id,repeat('f',64) from removed;`),
  ).toThrow();
  expect(counts(s).intents).toBe(1);
  expect(await archive(s)).toEqual(before);
});
it.each(["quote_contract_snapshots", "quote_contract_generation_intents"])(
  "falha em %s reverte o aceite inteiro e permite a mesma tentativa",
  async (table) => {
    const s = await fixture.create(),
      key = randomUUID();
    sql(
      `create function private.contract_snapshot_test_fault() returns trigger language plpgsql set search_path='' as $$begin if new.quote_id='${s.id}' then raise exception 'Falha sintética do contrato'; end if; return new; end;$$; revoke all on function private.contract_snapshot_test_fault() from public,anon,authenticated,service_role; create trigger contract_snapshot_test_fault before insert on private.${table} for each row execute function private.contract_snapshot_test_fault();`,
    );
    try {
      expect((await accept(s, key)).error).not.toBeNull();
      expect(counts(s)).toEqual({
        acceptances: 0,
        requests: 0,
        snapshots: 0,
        intents: 0,
        events: 0,
        audits: 0,
      });
      expect(
        (
          await fixture.db
            .from("orders")
            .select("status")
            .eq("id", s.order_id)
            .single()
        ).data?.status,
      ).toBe("quoted");
      expect(
        (
          await fixture.db
            .from("quotes")
            .select("accepted_at")
            .eq("id", s.id)
            .single()
        ).data?.accepted_at,
      ).toBeNull();
    } finally {
      sql(
        `drop trigger contract_snapshot_test_fault on private.${table}; drop function private.contract_snapshot_test_fault();`,
      );
    }
    expect((await accept(s, key)).error).toBeNull();
    expect(counts(s).intents).toBe(1);
  },
);
it("isola outro cliente/admin/anônimo/serviço e nega contrato de proposta não aceita", async () => {
  const s = await fixture.create();
  expect(
    (
      await sessions.client.rpc("get_quote_contract_snapshot", {
        target_quote: s.id,
      })
    ).error?.code,
  ).toBe("PT404");
  expect((await accept(s)).error).toBeNull();
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  for (const db of [sessions.clientB, sessions.admin, anon, fixture.db])
    expect(
      (await db.rpc("get_quote_contract_snapshot", { target_quote: s.id }))
        .error,
    ).not.toBeNull();
  expect(
    sql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name in('quote_contract_snapshots','quote_contract_generation_intents') and grantee in('PUBLIC','anon','authenticated','service_role');",
    ),
  ).toBe("0");
  expect(
    sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in('quote_contract_snapshots','quote_contract_generation_intents') and c.relrowsecurity;",
    ),
  ).toBe("2");
  for (const name of [
    "freeze_quote_contract(uuid,boolean)",
    "capture_accepted_quote_contract()",
  ])
    expect(
      sql(
        `select has_function_privilege('authenticated','private.${name}','execute')::text;`,
      ),
    ).toBe("false");
});
it("propostas simuladas e recusadas não criam snapshot/intenção nem oferecem contrato", async () => {
  const simulated = await fixture.create({ simulation: true });
  expect((await accept(simulated)).error).not.toBeNull();
  expect(counts(simulated).intents).toBe(0);
  const refused = await fixture.create();
  const revision = (
    await fixture.db
      .from("orders")
      .select("status_revision")
      .eq("id", refused.order_id)
      .single()
  ).data!.status_revision;
  expect(
    (
      await fixture.db.rpc("reject_quote_system", {
        ...refused.args(),
        expected_revision: revision,
        reason: "Recusa fictícia",
      })
    ).error,
  ).toBeNull();
  for (const s of [simulated, refused]) {
    expect(
      (
        await sessions.client.rpc("get_quote_contract_snapshot", {
          target_quote: s.id,
        })
      ).error?.code,
    ).toBe("PT404");
    expect(counts(s).snapshots).toBe(0);
    expect(counts(s).intents).toBe(0);
  }
});
