import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { acceptanceFixture } from "../e2e/acceptance-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { independentCleanup } from "@/lib/testing/independent-cleanup";
import {
  processContractPdf,
  runContractPdfBatch,
} from "@/modules/quotes/contract-worker";
import { contractPdfClaimSchema } from "@/modules/quotes/contract-generation";
vi.mock("server-only", () => ({}));

let fixture: Awaited<ReturnType<typeof acceptanceFixture>>;
const quotes: string[] = [];
const sessions: Record<string, Awaited<ReturnType<typeof quoteSession>>> = {};
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
beforeAll(async () => {
  vi.stubEnv("ANDRE_QUOTE_FIXTURES", "1");
  fixture = await acceptanceFixture();
  for (const role of ["client", "clientB", "calculator", "admin"] as const)
    sessions[role] = await quoteSession(role);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await independentCleanup(
    [
      {
        name: "storage",
        run: async () => {
          if (!fixture) return;
          const paths = quotes
            .map((id) =>
              sql(
                `select 'contracts/'||quote_id::text||'/'||snapshot_sha256||'/contract-pdf-v1.pdf' from private.quote_contract_snapshots where quote_id='${id}';`,
              ),
            )
            .filter(Boolean);
          if (paths.length)
            expect(
              (await fixture.db.storage.from("processos").remove(paths)).error,
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
        JSON.stringify({ diagnostic: "contract_archive_cleanup", failed }),
      ),
  );
  vi.unstubAllEnvs();
});
async function accepted() {
  const s = await fixture.create();
  quotes.push(s.id);
  expect(
    (await fixture.db.rpc("accept_quote_system", s.args())).error,
  ).toBeNull();
  return s;
}
async function claim(id: string, requestId: string = randomUUID()) {
  const r = await fixture.db.rpc("claim_quote_contract_pdf", {
    target_quote: id,
    request_id: requestId,
  });
  expect(r.error).toBeNull();
  return contractPdfClaimSchema.parse(r.data);
}
const state = async (id: string, role = "client") =>
  sessions[role].rpc("get_quote_contract_pdf_state", { target_quote: id });
const path = (id: string) =>
  sql(
    `select object_path from private.quote_contract_pdf_metadata where quote_id='${id}';`,
  );

it("aceite gera intenção durável; arquiva uma vez, confere bytes e preserva acesso privado", async () => {
  const s = await accepted();
  expect((await state(s.id)).data).toEqual({ quoteId: s.id, state: "pending" });
  expect(await processContractPdf(s.id, fixture.db)).toBe("ready");
  expect(await processContractPdf(s.id, fixture.db)).toBe("ready");
  expect((await state(s.id)).data).toEqual({ quoteId: s.id, state: "ready" });
  const object = await fixture.db.storage
    .from("processos")
    .download(path(s.id));
  expect(object.error).toBeNull();
  const bytes = Buffer.from(await object.data!.arrayBuffer());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(
    sql(
      `select sha256 from private.quote_contract_pdf_archives where quote_id='${s.id}';`,
    ),
  ).toBe(sha(bytes));
  expect(
    sql(
      `select count(*) from private.quote_contract_pdf_jobs where quote_id='${s.id}';`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from private.quote_acceptances where quote_id='${s.id}';`,
    ),
  ).toBe("1");
  for (const role of ["client", "calculator"]) {
    const r = await sessions[role].rpc("authorize_quote_contract_download", {
      target_quote: s.id,
    });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({
      sha256: sha(bytes),
      sizeBytes: bytes.length,
    });
    expect(
      (
        await fixture.db.rpc("record_quote_contract_download_system", {
          target_quote: s.id,
          actor:
            role === "client" ? fixture.owner.owner_id : fixture.calculator.id,
          expected_sha256: sha(bytes),
        })
      ).data,
    ).toBe(true);
  }
  for (const role of ["clientB", "admin"]) {
    expect((await state(s.id, role)).error?.code).toBe("PT404");
    expect(
      (
        await sessions[role].rpc("authorize_quote_contract_download", {
          target_quote: s.id,
        })
      ).error?.code,
    ).toBe("PT404");
  }
  expect(
    (
      await sessions.client.rpc("record_quote_contract_download", {
        target_quote: s.id,
        expected_sha256: sha(bytes),
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await fixture.db.rpc("record_quote_contract_download_system", {
        target_quote: s.id,
        actor: (await sessions.clientB.auth.getUser()).data.user!.id,
        expected_sha256: sha(bytes),
      })
    ).data,
  ).toBe(false);
  expect(
    (await sessions.client.storage.from("processos").download(path(s.id)))
      .error,
  ).not.toBeNull();
  expect(
    (
      await sessions.client.rpc("claim_quote_contract_pdf", {
        target_quote: s.id,
        request_id: randomUUID(),
      })
    ).error,
  ).not.toBeNull();
});
it("claims concorrentes têm um vencedor, replay estável e fence vencido não prepara", async () => {
  const s = await accepted(),
    ids = [randomUUID(), randomUUID()];
  const results = await Promise.all(ids.map((id) => claim(s.id, id)));
  const winner = results.find((c) => c.state === "claimed")!;
  expect(results.filter((c) => c.state === "claimed")).toHaveLength(1);
  expect(results.filter((c) => c.state === "busy")).toHaveLength(1);
  if (winner.state !== "claimed") throw new Error("Reserva ausente.");
  expect(await claim(s.id, winner.claimId)).toEqual(winner);
  sql(
    `update private.quote_contract_pdf_jobs set lease_until=clock_timestamp()-interval '1 second' where quote_id='${s.id}';`,
  );
  const next = await claim(s.id);
  expect(next.state).toBe("claimed");
  if (next.state !== "claimed") throw new Error("Reserva ausente.");
  expect(next.epoch).toBe(winner.epoch + 1);
  expect(
    (
      await fixture.db.rpc("prepare_quote_contract_pdf", {
        target_quote: s.id,
        worker_claim: winner.claimId,
        expected_epoch: winner.epoch,
        pdf_sha256: "0".repeat(64),
        pdf_size: 10,
      })
    ).data,
  ).toBe(false);
  expect((await claim(s.id, winner.claimId)).state).toBe("stale");
  expect(
    (
      await fixture.db.rpc("fail_quote_contract_pdf", {
        target_quote: s.id,
        worker_claim: next.claimId,
        expected_epoch: next.epoch,
        failure_code: "render_failed",
      })
    ).data,
  ).toBe(true);
  expect(await processContractPdf(s.id, fixture.db)).toBe("ready");
});
it("falha antes do upload mantém metadados e a execução seguinte recupera", async () => {
  const s = await accepted(),
    original = fixture.db.storage.from.bind(fixture.db.storage);
  const spy = vi
    .spyOn(fixture.db.storage, "from")
    .mockImplementation((bucket) => {
      const api = original(bucket);
      api.upload = async () => {
        throw new Error("Interrupção fictícia antes do envio.");
      };
      return api;
    });
  try {
    expect(await processContractPdf(s.id, fixture.db)).toBe("failed");
  } finally {
    spy.mockRestore();
  }
  const before = sql(
    `select sha256||':'||size_bytes::text from private.quote_contract_pdf_metadata where quote_id='${s.id}';`,
  );
  expect((await state(s.id)).data).toMatchObject({ state: "failed" });
  expect(await processContractPdf(s.id, fixture.db)).toBe("ready");
  expect(
    sql(
      `select sha256||':'||size_bytes::text from private.quote_contract_pdf_archives where quote_id='${s.id}';`,
    ),
  ).toBe(before);
});
it("resposta perdida após upload é recuperada por leitura sem sobrescrever", async () => {
  const s = await accepted(),
    original = fixture.db.storage.from.bind(fixture.db.storage);
  const spy = vi
    .spyOn(fixture.db.storage, "from")
    .mockImplementation((bucket) => {
      const api = original(bucket),
        upload = api.upload.bind(api);
      api.upload = async (...args) => {
        expect((await upload(...args)).error).toBeNull();
        throw new Error("Retorno fictício perdido.");
      };
      return api;
    });
  try {
    expect(await processContractPdf(s.id, fixture.db)).toBe("ready");
  } finally {
    spy.mockRestore();
  }
  expect(
    sql(
      `select count(*) from private.quote_contract_pdf_archives where quote_id='${s.id}';`,
    ),
  ).toBe("1");
  expect(await processContractPdf(s.id, fixture.db)).toBe("ready");
});
it("objeto divergente entra em quarentena e nunca é substituído", async () => {
  const s = await accepted(),
    first = await claim(s.id);
  if (first.state !== "claimed") throw new Error("Reserva ausente.");
  const wrong = Buffer.from("%PDF-arquivo-ficticio-divergente");
  expect(
    (
      await fixture.db.storage
        .from("processos")
        .upload(first.objectPath, wrong, {
          contentType: "application/pdf",
          upsert: false,
        })
    ).error,
  ).toBeNull();
  sql(
    `update private.quote_contract_pdf_jobs set lease_until=clock_timestamp()-interval '1 second' where quote_id='${s.id}';`,
  );
  expect(await processContractPdf(s.id, fixture.db)).toBe("failed");
  expect(await processContractPdf(s.id, fixture.db)).toBe("quarantined");
  const existing = await fixture.db.storage
    .from("processos")
    .download(first.objectPath);
  expect(Buffer.from(await existing.data!.arrayBuffer())).toEqual(wrong);
  expect(
    sql(
      `select count(*) from private.quote_contract_pdf_archives where quote_id='${s.id}';`,
    ),
  ).toBe("0");
});
it("não aceita contrato sem aceite ou simulado, lote inválido e ready sem arquivo", async () => {
  for (const simulation of [false, true]) {
    const s = await fixture.create({ simulation });
    quotes.push(s.id);
    expect(
      (
        await fixture.db.rpc("claim_quote_contract_pdf", {
          target_quote: s.id,
          request_id: randomUUID(),
        })
      ).error?.code,
    ).toBe("PT404");
    expect((await state(s.id)).error?.code).toBe("PT404");
  }
  expect(
    (
      await fixture.db.rpc("select_pending_quote_contract_pdfs", {
        batch_limit: 11,
      })
    ).error,
  ).not.toBeNull();
  const s = await accepted(),
    c = await claim(s.id);
  if (c.state !== "claimed") throw new Error("Reserva ausente.");
  const args = {
    target_quote: s.id,
    worker_claim: c.claimId,
    expected_epoch: c.epoch,
  };
  expect(
    (
      await fixture.db.rpc("prepare_quote_contract_pdf", {
        ...args,
        pdf_sha256: "0".repeat(64),
        pdf_size: 10,
      })
    ).data,
  ).toBe(true);
  expect(
    (
      await fixture.db.rpc("complete_quote_contract_pdf", {
        ...args,
        observed_sha256: "0".repeat(64),
        observed_size: 10,
      })
    ).data,
  ).toBe(false);
  expect(() =>
    sql(
      `update private.quote_contract_pdf_jobs set state='ready' where quote_id='${s.id}';`,
    ),
  ).toThrow();
  expect(() =>
    sql(
      `update private.quote_contract_pdf_metadata set size_bytes=11 where quote_id='${s.id}';`,
    ),
  ).toThrow();
  expect(
    (
      await fixture.db.rpc("prepare_quote_contract_pdf", {
        ...args,
        pdf_sha256: "1".repeat(64),
        pdf_size: 10,
      })
    ).error?.code,
  ).toBe("PT409");
  expect(
    (
      await fixture.db.rpc("fail_quote_contract_pdf", {
        ...args,
        failure_code: "integrity_conflict",
      })
    ).data,
  ).toBe(true);
});
it("fila retoma intenções após o aceite sem depender da resposta HTTP", async () => {
  const s = await accepted();
  expect((await state(s.id)).data).toMatchObject({ state: "pending" });
  expect((await runContractPdfBatch(fixture.db)).ready).toBeGreaterThanOrEqual(
    1,
  );
  expect((await state(s.id)).data).toMatchObject({ state: "ready" });
});
it("arquiva empresa com textos longos e legado sem preencher identidade pelo perfil atual", async () => {
  const original = (
    await fixture.db
      .from("clients")
      .select("kind,document,legal_name")
      .eq("id", fixture.owner.id)
      .single()
  ).data!;
  try {
    expect(
      (
        await fixture.db
          .from("clients")
          .update({
            kind: "company",
            document: "11222333000181",
            legal_name: "Escritório fictício do contrato",
          })
          .eq("id", fixture.owner.id)
      ).error,
    ).toBeNull();
    const s = await fixture.create({ context: false });
    quotes.push(s.id);
    const text =
      "CONTEÚDO SINTÉTICO SEM VIGÊNCIA. " +
      "Clausula ficticia apenas para o ensaio local. ".repeat(1600);
    const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    sql(
      `insert into private.quote_contract_contexts(quote_id,proposal,terms_version,terms_text,privacy_version,privacy_text,prepared_by) values('${s.id}',${literal(JSON.stringify(s.proposal))}::jsonb,${literal(fixture.terms)},${literal(text.slice(0, 64000))},${literal(fixture.privacy)},${literal(text.slice(0, 64000))},'${fixture.calculator.id}');`,
    );
    const hash = sql(
      `select context_hash from private.quote_contract_contexts where quote_id='${s.id}';`,
    );
    expect(
      (
        await fixture.db.rpc(
          "accept_quote_system",
          s.args({ expected_context: hash }),
        )
      ).error,
    ).toBeNull();
    expect(await processContractPdf(s.id, fixture.db)).toBe("ready");
    expect(
      sql(
        `select snapshot->'contractant'->>'kind' from private.quote_contract_snapshots where quote_id='${s.id}';`,
      ),
    ).toBe("company");
    const storedHash = sql(
      `select sha256 from private.quote_contract_pdf_archives where quote_id='${s.id}';`,
    );
    expect(
      (
        await fixture.db
          .from("clients")
          .update({ legal_name: "Empresa fictícia editada depois" })
          .eq("id", fixture.owner.id)
      ).error,
    ).toBeNull();
    expect(await processContractPdf(s.id, fixture.db)).toBe("ready");
    expect(
      sql(
        `select sha256 from private.quote_contract_pdf_archives where quote_id='${s.id}';`,
      ),
    ).toBe(storedHash);
    const legacy = await accepted();
    sql(
      `delete from private.quote_contract_snapshots where quote_id='${legacy.id}'; select private.freeze_quote_contract('${legacy.id}',true);`,
    );
    expect(await processContractPdf(legacy.id, fixture.db)).toBe("ready");
    expect(
      sql(
        `select snapshot->'contractant'->>'fullName' is null from private.quote_contract_snapshots where quote_id='${legacy.id}';`,
      ),
    ).toBe("t");
  } finally {
    expect(
      (
        await fixture.db
          .from("clients")
          .update(original)
          .eq("id", fixture.owner.id)
      ).error,
    ).toBeNull();
  }
});
it("finalização em rollback não deixa associação ou auditoria e retomada usa os mesmos bytes", async () => {
  const s = await accepted(),
    c = await claim(s.id);
  if (c.state !== "claimed") throw new Error("Reserva ausente.");
  const { renderContractPdf } = await import("@/modules/quotes/contract-pdf");
  const bytes = await renderContractPdf(c.archive),
    digest = sha(bytes);
  const args = {
    target_quote: s.id,
    worker_claim: c.claimId,
    expected_epoch: c.epoch,
  };
  expect(
    (
      await fixture.db.rpc("prepare_quote_contract_pdf", {
        ...args,
        pdf_sha256: digest,
        pdf_size: bytes.length,
      })
    ).data,
  ).toBe(true);
  expect(
    (
      await fixture.db.storage.from("processos").upload(c.objectPath, bytes, {
        upsert: false,
        contentType: "application/pdf",
      })
    ).error,
  ).toBeNull();
  sql(
    `begin; select set_config('request.jwt.claims','{"role":"service_role"}',true); select public.complete_quote_contract_pdf('${s.id}','${c.claimId}',${c.epoch},'${digest}',${bytes.length}); rollback;`,
  );
  expect(
    sql(
      `select count(*) from private.quote_contract_pdf_archives where quote_id='${s.id}';`,
    ),
  ).toBe("0");
  expect(
    sql(
      `select count(*) from public.audit_log where action='contract_pdf_archived' and target_id='${s.id}';`,
    ),
  ).toBe("0");
  sql(
    `update private.quote_contract_pdf_jobs set lease_until=clock_timestamp()-interval '1 second' where quote_id='${s.id}';`,
  );
  expect(await processContractPdf(s.id, fixture.db)).toBe("ready");
  expect(
    sql(
      `select sha256 from private.quote_contract_pdf_archives where quote_id='${s.id}';`,
    ),
  ).toBe(digest);
});
