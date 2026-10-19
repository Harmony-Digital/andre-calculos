import "server-only";
import { hostedValidationEnabled } from "@/modules/validation/environment";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";
import { contractPdfClaimSchema } from "./contract-generation";
import { renderContractPdf } from "./contract-pdf";

export function localContractWorkerEnabled() {
  return (
    (process.env.ANDRE_LOCAL_TESTS === "1" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:54321" &&
      !process.env.VERCEL &&
      !process.env.VERCEL_ENV &&
      process.env.NODE_ENV !== "production") ||
    hostedValidationEnabled(process.env)
  );
}
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
/** Usa apenas destino e archive da reserva; nunca recebe bytes ou caminho do navegador. */
export async function processContractPdf(
  quoteId: string,
  db?: ReturnType<typeof createSystemClient>,
) {
  if (!localContractWorkerEnabled())
    throw new Error("Geração contratual ainda não habilitada.");
  db ??= createSystemClient();
  const target = z.uuid().parse(quoteId),
    requestId = randomUUID();
  const result = await db.rpc("claim_quote_contract_pdf", {
    target_quote: target,
    request_id: requestId,
  });
  if (result.error) throw new Error("Contrato indisponível.");
  const claim = contractPdfClaimSchema.parse(result.data);
  if (claim.quoteId !== target)
    throw new Error("Reserva contratual divergente.");
  if (claim.state !== "claimed") return claim.state;
  let failure: "render_failed" | "transport_failed" | "integrity_conflict" =
    "render_failed";
  const args = {
    target_quote: target,
    worker_claim: claim.claimId,
    expected_epoch: claim.epoch,
  };
  try {
    const bytes = await renderContractPdf(claim.archive),
      digest = sha(bytes);
    if (
      claim.prepared &&
      (claim.prepared.sha256 !== digest ||
        claim.prepared.sizeBytes !== bytes.length)
    ) {
      failure = "integrity_conflict";
      throw new Error("PDF divergente.");
    }
    const prepared = await db.rpc("prepare_quote_contract_pdf", {
      ...args,
      pdf_sha256: digest,
      pdf_size: bytes.length,
    });
    if (prepared.error) {
      failure =
        prepared.error.code === "PT409"
          ? "integrity_conflict"
          : "render_failed";
      throw new Error("Preparação não concluída.");
    }
    if (prepared.data !== true) return "stale";
    failure = "transport_failed";
    // Mesmo se o upload perder a resposta, o objeto é relido. Nunca sobrescrever.
    try {
      await db.storage.from("processos").upload(claim.objectPath, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    } catch {
      /* A leitura seguinte determina o resultado. */
    }
    const stored = await db.storage
      .from("processos")
      .download(claim.objectPath);
    if (stored.error || !stored.data)
      throw new Error("Arquivo não confirmado.");
    const observed = Buffer.from(await stored.data.arrayBuffer());
    if (observed.length !== bytes.length || sha(observed) !== digest) {
      failure = "integrity_conflict";
      throw new Error("Arquivo divergente.");
    }
    const completed = await db.rpc("complete_quote_contract_pdf", {
      ...args,
      observed_sha256: digest,
      observed_size: observed.length,
    });
    if (completed.error) throw new Error("Arquivamento não confirmado.");
    return completed.data === true ? "ready" : "stale";
  } catch {
    try {
      await db.rpc("fail_quote_contract_pdf", {
        ...args,
        failure_code: failure,
      });
    } catch {
      /* A intenção durável permanece para retomada após o vencimento. */
    }
    return "failed";
  }
}
export async function runContractPdfBatch(
  db?: ReturnType<typeof createSystemClient>,
) {
  if (!localContractWorkerEnabled())
    throw new Error("Geração contratual ainda não habilitada.");
  db ??= createSystemClient();
  const selected = await db.rpc("select_pending_quote_contract_pdfs", {
    batch_limit: 5,
  });
  if (selected.error) throw new Error("Fila contratual indisponível.");
  const ids = z.array(z.uuid()).max(5).parse(selected.data);
  const states = [];
  for (const id of new Set(ids)) states.push(await processContractPdf(id, db));
  return {
    processed: states.length,
    ready: states.filter((s) => s === "ready").length,
    failed: states.filter((s) => s === "failed" || s === "quarantined").length,
  };
}
