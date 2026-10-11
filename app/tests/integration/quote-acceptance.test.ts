import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { acceptanceFixture } from "../e2e/acceptance-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql } from "../e2e/notification-helper";
let fixture: Awaited<ReturnType<typeof acceptanceFixture>>;
const sessions: Record<string, SupabaseClient> = {};
type Sample = Awaited<ReturnType<typeof fixture.create>>;
const accept = (sample: Sample, patch: Record<string, unknown> = {}) =>
  fixture.db.rpc("accept_quote_system", sample.args(patch));
const projection = async (sample: Sample) =>
  (
    await fixture.db
      .from("quotes")
      .select("accepted_at,accepted_by,accepted_ip,accepted_user_agent")
      .eq("id", sample.id)
      .single()
  ).data!;
const receipts = (sample: Sample) =>
  localNotificationSql(
    `select count(*) from private.quote_acceptances where quote_id='${sample.id}'::uuid;`,
  );
beforeAll(async () => {
  fixture = await acceptanceFixture();
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
});
afterAll(async () => {
  try {
    await Promise.all(
      Object.values(sessions).map((db) => db.auth.signOut({ scope: "local" })),
    );
  } finally {
    if (fixture) await fixture.cleanup();
  }
});
it("RLS e RPC restringem proprietário/papel e protegem tabelas contratuais", async () => {
  const sample = await fixture.create(),
    anonymous = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
  for (const db of [...Object.values(sessions), anonymous])
    expect(
      (await db.rpc("accept_quote_system", sample.args())).error,
    ).not.toBeNull();
  for (const role of ["clientB", "calculator", "admin"] as const) {
    const actor = (await sessions[role].auth.getUser()).data.user!.id;
    expect((await accept(sample, { actor })).error).not.toBeNull();
  }
  for (const db of [sessions.clientB, sessions.admin, anonymous, fixture.db])
    expect(
      (await db.rpc("get_quote_contract_context", { target_quote: sample.id }))
        .error,
    ).not.toBeNull();
  for (const db of [sessions.client, sessions.calculator])
    expect(
      (await db.rpc("get_quote_contract_context", { target_quote: sample.id }))
        .data,
    ).toMatchObject({ contextHash: sample.contextHash, canAccept: true });
  for (const db of [sessions.clientB, sessions.admin, anonymous, fixture.db])
    expect(
      (
        await db.rpc("get_process_contract_quote_ids", {
          target_process: sample.process_id,
        })
      ).error,
    ).not.toBeNull();
  expect(
    (
      await sessions.client.rpc("get_process_contract_quote_ids", {
        target_process: sample.process_id,
      })
    ).data,
  ).toEqual([{ quote_id: sample.id }]);
  expect(
    localNotificationSql(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name in ('quote_contract_contexts','quote_acceptances','quote_acceptance_requests') and grantee in ('anon','authenticated','service_role');",
    ),
  ).toBe("0");
});
it("aceite concorrente grava um recibo/evento/auditoria e preserva número/termos/IP", async () => {
  const sample = await fixture.create();
  const results = await Promise.all([accept(sample), accept(sample)]);
  expect(results.map((r) => r.error)).toEqual([null, null]);
  expect(results[0].data).toEqual(results[1].data);
  expect(results[0].data).toMatchObject({
    quoteId: sample.id,
    number: sample.number,
    contextHash: sample.contextHash,
    status: "awaiting_payment",
    hasContract: false,
  });
  expect(await projection(sample)).toMatchObject({
    accepted_by: sample.actor,
    accepted_ip: "192.0.2.44",
    accepted_user_agent: "Agente sintético de contratação",
  });
  expect(receipts(sample)).toBe("1");
  expect(
    localNotificationSql(
      `select count(*) from private.quote_acceptance_requests where quote_id='${sample.id}'::uuid;`,
    ),
  ).toBe("2");
  for (const [table, filter] of [
    ["timeline_events", "order_id"],
    ["audit_log", "target_id"],
  ]) {
    const result = await fixture.db
      .from(table)
      .select("id")
      .eq(filter, table === "audit_log" ? sample.id : sample.order_id)
      .eq(table === "audit_log" ? "action" : "kind", "quote_accepted");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  }
  const queued = await fixture.db
    .from("notifications")
    .select("template,status,attempts,data")
    .contains("data", { quote_id: sample.id });
  expect(queued.data?.map((n) => n.template).sort()).toEqual([
    "quote_accepted",
    "quote_accepted_client",
    "quote_created",
  ]);
  expect(
    queued.data?.every(
      (n) =>
        n.status === "pending" &&
        n.attempts === 0 &&
        !JSON.stringify(n.data).includes("192.0.2.44"),
    ),
  ).toBe(true);
  expect(
    localNotificationSql(
      `select terms_version||':'||terms_sha256 from private.quote_acceptances where quote_id='${sample.id}'::uuid;`,
    ),
  ).toMatch(/^teste-contratacao-termos-v1:[0-9a-f]{64}$/);
});
it.each([false, true])(
  "contrato exige documento confirmado para a fila: %s",
  async (documents) => {
    const sample = await fixture.create({ contract: true, documents });
    const result = await accept(sample);
    expect(result.error).toBeNull();
    const expected = documents ? "queued" : "awaiting_documents";
    expect(result.data).toMatchObject({
      status: expected,
      hasContract: true,
      minimumDocumentPresent: documents,
    });
    expect(
      (
        await fixture.db
          .from("orders")
          .select("status")
          .eq("id", sample.order_id)
          .single()
      ).data?.status,
    ).toBe(expected);
    expect(
      (
        await fixture.db
          .from("timeline_events")
          .select("id")
          .eq("order_id", sample.order_id)
          .eq("kind", "status_changed")
          .contains("data", { to: "queued" })
      ).data,
    ).toHaveLength(documents ? 1 : 0);
  },
);
it("recusa contexto ausente/divergente, confirmação falsa, IP/rede inválidos, vencimento e legais desativados", async () => {
  const sample = await fixture.create();
  for (const patch of [
    { expected_context: "f".repeat(64) },
    { confirmed: false },
    { ip_address: "192.0.2.0/24" },
    { ip_address: "inválido" },
    { user_agent: "x".repeat(513) },
  ])
    expect((await accept(sample, patch)).error).not.toBeNull();
  expect(receipts(sample)).toBe("0");
  expect(
    (await accept(await fixture.create({ context: false }))).error,
  ).not.toBeNull();
  expect(
    (await accept(await fixture.create({ expired: true }))).error?.message,
  ).toBe("Proposta vencida");
  await fixture.db
    .from("settings")
    .update({ approved_terms_version: null })
    .eq("singleton", true);
  try {
    expect((await accept(sample)).error?.message).toBe(
      "Documentos legais indisponíveis",
    );
  } finally {
    await fixture.db
      .from("settings")
      .update({ approved_terms_version: fixture.terms })
      .eq("singleton", true);
  }
});
it("projeção e registros privados não permitem reescrever o aceite pelo serviço", async () => {
  const sample = await fixture.create();
  expect(
    (
      await fixture.db
        .from("quotes")
        .update({
          accepted_at: new Date().toISOString(),
          accepted_by: sample.actor,
          accepted_ip: "192.0.2.3",
          accepted_user_agent: "forjado",
        })
        .eq("id", sample.id)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await fixture.db
        .from("quotes")
        .update({ total_cents: 1 })
        .eq("id", sample.id)
    ).error,
  ).not.toBeNull();
  expect((await accept(sample)).error).toBeNull();
  expect(
    (
      await fixture.db
        .from("quotes")
        .update({ accepted_ip: "192.0.2.9" })
        .eq("id", sample.id)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await fixture.db
        .from("quotes")
        .update({ accepted_at: null, accepted_by: null })
        .eq("id", sample.id)
    ).error,
  ).not.toBeNull();
  expect(
    localNotificationSql(
      `select accepted_ip from private.quote_acceptances where quote_id='${sample.id}'::uuid;`,
    ),
  ).toBe("192.0.2.44");
});
it("replay mantém recibo anterior após mudar termos/status e ignora novos metadados", async () => {
  const sample = await fixture.create(),
    key = randomUUID();
  const first = await accept(sample, { request_id: key });
  expect(first.error).toBeNull();
  await fixture.db
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", sample.order_id);
  await fixture.db
    .from("settings")
    .update({ approved_terms_version: null })
    .eq("singleton", true);
  try {
    const repeated = await accept(sample, {
      request_id: key,
      ip_address: "192.0.2.99",
      user_agent: "Novo UA",
    });
    expect(repeated.error).toBeNull();
    expect(repeated.data).toEqual(first.data);
    expect((await projection(sample)).accepted_ip).toBe("192.0.2.44");
    expect(
      (
        await accept(sample, {
          request_id: key,
          expected_context: "a".repeat(64),
        })
      ).error,
    ).not.toBeNull();
  } finally {
    await fixture.db
      .from("settings")
      .update({ approved_terms_version: fixture.terms })
      .eq("singleton", true);
  }
});
it("falha do último aviso reverte recibo, projeção, estado, evento e auditoria", async () => {
  const sample = await fixture.create();
  localNotificationSql(
    `create function private.fixture_fail_accept_notice() returns trigger language plpgsql set search_path='' as $$begin if new.dedup_key='accept:${sample.id}:calculator:email' then raise exception 'Fixture de falha'; end if; return new; end;$$; create trigger fixture_fail_accept_notice before insert on public.notifications for each row execute function private.fixture_fail_accept_notice();`,
  );
  try {
    expect((await accept(sample)).error).not.toBeNull();
    expect(receipts(sample)).toBe("0");
    expect((await projection(sample)).accepted_at).toBeNull();
    expect(
      (
        await fixture.db
          .from("orders")
          .select("status")
          .eq("id", sample.order_id)
          .single()
      ).data?.status,
    ).toBe("quoted");
    expect(
      (
        await fixture.db
          .from("timeline_events")
          .select("id")
          .eq("order_id", sample.order_id)
          .eq("kind", "quote_accepted")
      ).data,
    ).toEqual([]);
    expect(
      (
        await fixture.db
          .from("audit_log")
          .select("id")
          .eq("target_id", sample.id)
          .eq("action", "quote_accepted")
      ).data,
    ).toEqual([]);
    expect(
      (
        await fixture.db
          .from("notifications")
          .select("id")
          .in("dedup_key", [
            `accept:${sample.id}:client:email`,
            `accept:${sample.id}:calculator:email`,
          ])
      ).data,
    ).toEqual([]);
  } finally {
    localNotificationSql(
      "drop trigger fixture_fail_accept_notice on public.notifications; drop function private.fixture_fail_accept_notice();",
    );
  }
  expect((await accept(sample)).error).toBeNull();
});
it("contexto incompleto não prepara contrato nem aceita campos ausentes", async () => {
  const sample = await fixture.create({ context: false });
  const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  for (const path of [
    "issuedAt",
    "dueDate",
    "validityDays",
    "slackDays",
    "period.version",
    "calendar.suspensions",
    "capacity.validUntil",
  ]) {
    const incomplete = structuredClone(sample.proposal) as unknown as Record<
      string,
      unknown
    >;
    const parts = path.split("."),
      parent =
        parts.length === 2
          ? (incomplete[parts[0]] as Record<string, unknown>)
          : incomplete;
    delete parent[parts.at(-1)!];
    expect(() =>
      localNotificationSql(
        `insert into private.quote_contract_contexts(quote_id,proposal,terms_version,terms_text,privacy_version,privacy_text,prepared_by) values('${sample.id}'::uuid,${literal(JSON.stringify(incomplete))}::jsonb,'${fixture.terms}','Termos sintéticos','${fixture.privacy}','Privacidade sintética','${fixture.calculator.id}'::uuid);`,
      ),
    ).toThrow();
    expect(
      localNotificationSql(
        `select count(*) from private.quote_contract_contexts where quote_id='${sample.id}'::uuid;`,
      ),
    ).toBe("0");
  }
});
it("formatos divergentes do parser não geram contexto; tabela do pedido deve coincidir", async () => {
  const sample = await fixture.create({ context: false });
  const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const insert = (proposal: unknown) =>
    localNotificationSql(
      `insert into private.quote_contract_contexts(quote_id,proposal,terms_version,terms_text,privacy_version,privacy_text,prepared_by) values('${sample.id}'::uuid,${literal(JSON.stringify(proposal))}::jsonb,'${fixture.terms}','Termos sintéticos','${fixture.privacy}','Privacidade sintética','${fixture.calculator.id}'::uuid);`,
    );
  for (const patch of [
    { issuedAt: null },
    { dueDate: null },
    { validityDays: "7" },
    { validityDays: 1.5 },
    { issuedAt: sample.proposal.issuedAt.replace(/Z$/, "") },
    {
      period: {
        ...sample.proposal.period,
        startDate: sample.proposal.period.startDate + "T00:00:00",
      },
    },
    {
      calendar: {
        ...sample.proposal.calendar,
        suspensions: [
          { start: "2026-10-11T00:00:00", end: "2026-10-12", reason: "Ensaio" },
        ],
      },
    },
    {
      capacity: {
        ...sample.proposal.capacity,
        asOf: sample.proposal.capacity.asOf.replace(/Z$/, ""),
      },
    },
  ]) {
    expect(() => insert({ ...sample.proposal, ...patch })).toThrow();
    expect(
      localNotificationSql(
        `select count(*) from private.quote_contract_contexts where quote_id='${sample.id}'::uuid;`,
      ),
    ).toBe("0");
  }
  expect(
    (
      await fixture.db
        .from("orders")
        .update({ price_table_id: null })
        .eq("id", sample.order_id)
    ).error,
  ).toBeNull();
  expect(() => insert(sample.proposal)).toThrow();
  await fixture.db
    .from("orders")
    .update({ price_table_id: sample.proposal.priceTableId })
    .eq("id", sample.order_id);
  insert(sample.proposal);
  expect(
    localNotificationSql(
      `select context_hash ~ '^[0-9a-f]{64}$' from private.quote_contract_contexts where quote_id='${sample.id}'::uuid;`,
    ),
  ).toBe("t");
});
it.each(["folder", "pending", "hash"])(
  "documento mínimo não usa metadados inválidos: %s",
  async (reason) => {
    const sample = await fixture.create({ contract: true, documents: true });
    const patch =
      reason === "folder"
        ? { folder: "deliverables" }
        : reason === "pending"
          ? { upload_status: "pending" }
          : { sha256: "1".repeat(64) };
    expect(
      (
        await fixture.db
          .from("files")
          .update(patch)
          .eq("process_id", sample.process_id)
      ).error,
    ).toBeNull();
    expect((await accept(sample)).data).toMatchObject({
      status: "awaiting_documents",
      minimumDocumentPresent: false,
    });
  },
);
it("mesma solicitação não aceita outra proposta e registros privados são imutáveis", async () => {
  const sample = await fixture.create(),
    key = randomUUID();
  expect((await accept(sample, { request_id: key })).error).toBeNull();
  const other = await fixture.create();
  expect((await accept(other, { request_id: key })).error?.message).toBe(
    "Solicitação já registrada com outros dados",
  );
  expect(receipts(other)).toBe("0");
  for (const [table, field, value] of [
    ["quote_contract_contexts", "terms_text", "Texto adulterado"],
    ["quote_acceptances", "accepted_user_agent", "UA adulterado"],
    ["quote_acceptance_requests", "context_hash", "a".repeat(64)],
  ])
    expect(() =>
      localNotificationSql(
        `update private.${table} set ${field}='${value}' where quote_id='${sample.id}'::uuid;`,
      ),
    ).toThrow();
});
it("validade é reconferida após espera por lock de documento", async () => {
  const sample = await fixture.create({
    contract: true,
    documents: true,
    expiresInSeconds: 8,
  });
  const name = "accept-expiry-" + randomUUID();
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
  let pending: Promise<Awaited<ReturnType<typeof accept>>> | undefined;
  try {
    child.stdin.write(
      `set application_name='${name}'; begin; select id from public.files where process_id='${sample.process_id}'::uuid for update;\n\\echo DOC_LOCKED\n`,
    );
    await expect.poll(() => output, { timeout: 3000 }).toContain("DOC_LOCKED");
    // Supabase query builders são lazy; iniciar a requisição antes de observar o lock.
    pending = Promise.resolve(accept(sample));
    const result = pending;
    await expect
      .poll(
        () =>
          localNotificationSql(
            `select count(*) from pg_stat_activity b where b.wait_event_type='Lock' and exists(select 1 from pg_stat_activity a where a.application_name='${name}' and a.pid=any(pg_blocking_pids(b.pid)));`,
          ),
        { timeout: 3000 },
      )
      .toBe("1");
    await expect
      .poll(
        () =>
          localNotificationSql(
            `select (clock_timestamp()>=valid_until)::text from public.quotes where id='${sample.id}'::uuid;`,
          ),
        { timeout: 10000 },
      )
      .toBe("true");
    child.stdin.end("commit;\n\\q\n");
    expect(await done).toBe(0);
    expect((await result).error?.message).toBe("Proposta vencida");
    expect(receipts(sample)).toBe("0");
    expect((await projection(sample)).accepted_at).toBeNull();
  } finally {
    if (child.exitCode === null && !child.stdin.destroyed)
      child.stdin.end("rollback;\n\\q\n");
    await done;
    if (pending) await pending;
  }
}, 20000);
const pendingDocument = async (sample: Sample, folder = "case") => {
  const id = randomUUID();
  expect(
    (
      await fixture.db.from("files").insert({
        id,
        process_id: sample.process_id,
        order_id: sample.order_id,
        uploaded_by: sample.actor,
        folder,
        name: "Documento inventado.pdf",
        path: `${sample.actor}/${sample.process_id}/${id}/documento-sintetico.pdf`,
        mime: "application/pdf",
        size_bytes: 100,
        expected_sha256: "0".repeat(64),
        upload_status: "pending",
      })
    ).error,
  ).toBeNull();
  return {
    id,
    args: {
      target_file: id,
      actor: sample.actor,
      observed_hash: "0".repeat(64),
      observed_size: 100,
    },
  };
};
it("primeiro documento após contrato aceito enfileira uma vez, inclusive com confirmações concorrentes", async () => {
  const sample = await fixture.create({ contract: true });
  expect((await accept(sample)).data).toMatchObject({
    status: "awaiting_documents",
  });
  const document = await pendingDocument(sample);
  const results = await Promise.all([
    fixture.db.rpc("complete_file_system", document.args),
    fixture.db.rpc("complete_file_system", document.args),
  ]);
  expect(results.map((r) => r.error)).toEqual([null, null]);
  expect(
    (
      await fixture.db
        .from("orders")
        .select("status")
        .eq("id", sample.order_id)
        .single()
    ).data?.status,
  ).toBe("queued");
  expect(
    (
      await fixture.db
        .from("timeline_events")
        .select("id")
        .eq("order_id", sample.order_id)
        .eq("kind", "status_changed")
        .contains("data", { to: "queued" })
    ).data,
  ).toHaveLength(1);
  expect(
    (
      await fixture.db
        .from("audit_log")
        .select("id")
        .eq("target_id", document.id)
        .eq("action", "upload_verified")
    ).data,
  ).toHaveLength(1);
  expect(
    (
      await fixture.db
        .from("notifications")
        .select("id")
        .eq("dedup_key", `queued:${sample.order_id}:email`)
    ).data,
  ).toHaveLength(1);
  expect(
    localNotificationSql(
      `select order_status from private.quote_acceptances where quote_id='${sample.id}'::uuid;`,
    ),
  ).toBe("awaiting_documents");
  expect(
    (
      await sessions.client.rpc("get_quote_contract_context", {
        target_quote: sample.id,
      })
    ).data,
  ).toMatchObject({
    status: "queued",
    receipt: { status: "awaiting_documents" },
  });
});
it("falha do aviso de fila reverte documento, evento e promoção após contrato", async () => {
  const sample = await fixture.create({ contract: true });
  expect((await accept(sample)).error).toBeNull();
  const document = await pendingDocument(sample);
  localNotificationSql(
    `create function private.fixture_fail_document_queue() returns trigger language plpgsql set search_path='' as $$begin if new.dedup_key='queued:${sample.order_id}:email' then raise exception 'Fixture de falha'; end if; return new; end;$$; create trigger fixture_fail_document_queue before insert on public.notifications for each row execute function private.fixture_fail_document_queue();`,
  );
  try {
    expect(
      (await fixture.db.rpc("complete_file_system", document.args)).error,
    ).not.toBeNull();
    expect(
      (
        await fixture.db
          .from("files")
          .select("upload_status,sha256")
          .eq("id", document.id)
          .single()
      ).data,
    ).toEqual({ upload_status: "pending", sha256: null });
    expect(
      (
        await fixture.db
          .from("orders")
          .select("status")
          .eq("id", sample.order_id)
          .single()
      ).data?.status,
    ).toBe("awaiting_documents");
    expect(
      (
        await fixture.db
          .from("audit_log")
          .select("id")
          .eq("target_id", document.id)
          .eq("action", "upload_verified")
      ).data,
    ).toEqual([]);
  } finally {
    localNotificationSql(
      "drop trigger fixture_fail_document_queue on public.notifications; drop function private.fixture_fail_document_queue();",
    );
  }
  expect(
    (await fixture.db.rpc("complete_file_system", document.args)).error,
  ).toBeNull();
});
it("triagem e documento sem aceite contratual não promovem pedido", async () => {
  for (const prepared of [false, true]) {
    const sample = await fixture.create({ contract: true });
    if (prepared) await accept(sample);
    else
      await fixture.db
        .from("orders")
        .update({ status: "awaiting_documents" })
        .eq("id", sample.order_id);
    const document = await pendingDocument(
      sample,
      prepared ? "triage" : "case",
    );
    expect(
      (await fixture.db.rpc("complete_file_system", document.args)).error,
    ).toBeNull();
    expect(
      (
        await fixture.db
          .from("orders")
          .select("status")
          .eq("id", sample.order_id)
          .single()
      ).data?.status,
    ).toBe("awaiting_documents");
  }
});
