import "server-only";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { financialApplicationReceiptSchema } from "./financial-application";
import { financialResolutionReceiptSchema } from "./financial-resolution";
import { deriveFixtureFinancialDecision } from "./financial-projection";
import { webhookRunSchema } from "./webhook-worker";
const id = z.uuid();
const unavailable = "Finalização de webhook indisponível.";
export const webhookFinalizationReceiptSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    semantics: z.literal("webhook_finalization_receipt"),
    mode: z.literal("fixture"),
    identityProof: z.literal("fixture_declared"),
    runId: id,
    eventId: id,
    scopeId: id,
    paymentId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    chargeId: id,
    queryId: id,
    observationId: id,
    applicationRequestId: id,
    workerId: id,
    epoch: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    sourceCount: z.number().int().positive(),
    completedAt: z.iso.datetime({ offset: true }),
    application: financialApplicationReceiptSchema,
    resolution: financialResolutionReceiptSchema.nullable(),
  })
  .superRefine((r, ctx) => {
    if (
      r.application.requestId !== r.applicationRequestId ||
      r.application.observationId !== r.observationId ||
      r.application.chargeId !== r.chargeId ||
      (r.resolution &&
        (r.resolution.applicationRequestId !== r.applicationRequestId ||
          r.resolution.chargeId !== r.chargeId ||
          r.resolution.observationId !== r.observationId))
    )
      ctx.addIssue({ code: "custom", message: unavailable });
  });
function requireLocal() {
  if (
    process.env.ANDRE_LOCAL_TESTS !== "1" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321" ||
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV === "production"
  )
    throw new Error(unavailable);
}
/** Somente IDs/claim do servidor; a decisão usa T/Y e é reconferida sob locks. */
export async function finalizeFixturePaymentWebhook(claim: unknown) {
  try {
    requireLocal();
    const c = webhookRunSchema.parse(claim);
    if (
      !c.chargeId ||
      !c.observationId ||
      !["queried", "complete"].includes(c.state)
    )
      throw new Error(unavailable);
    const db = createSystemClient();
    const read = (value: unknown) => {
      const r = webhookFinalizationReceiptSchema.parse(value);
      if (
        r.runId !== c.runId ||
        r.eventId !== c.eventId ||
        r.scopeId !== c.scopeId ||
        r.paymentId !== c.paymentId ||
        r.chargeId !== c.chargeId ||
        r.queryId !== c.queryId ||
        r.observationId !== c.observationId ||
        r.applicationRequestId !== c.applicationRequestId ||
        r.workerId !== c.workerId ||
        r.epoch !== c.epoch ||
        r.sourceFingerprint !== c.sourceFingerprint ||
        r.sourceCount !== c.sourceCount
      )
        throw new Error(unavailable);
      return r;
    };
    const prior = await db.rpc("get_fixture_webhook_finalization_receipt", {
      target_run: c.runId,
      worker_id: c.workerId,
      expected_epoch: c.epoch,
    });
    if (prior.error) throw new Error(unavailable);
    if (prior.data !== null) return read(prior.data);
    for (let attempt = 0; attempt < 3; attempt++) {
      const context = await db.rpc("get_fixture_webhook_context", {
        target_run: c.runId,
        worker_id: c.workerId,
        expected_epoch: c.epoch,
      });
      if (context.error) throw new Error(unavailable);
      const current = z
        .object({ run: webhookRunSchema })
        .parse(context.data).run;
      if (
        current.state !== "queried" ||
        current.observationId !== c.observationId ||
        current.chargeId !== c.chargeId ||
        current.sourceFingerprint !== c.sourceFingerprint
      )
        throw new Error(unavailable);
      const d = await deriveFixtureFinancialDecision(c.observationId);
      if (d.chargeId !== c.chargeId) throw new Error(unavailable);
      requireLocal();
      const r = await db.rpc("finalize_fixture_payment_webhook", {
        target_run: c.runId,
        worker_id: c.workerId,
        expected_epoch: c.epoch,
        expected_source_fingerprint: c.sourceFingerprint,
        expected_position_revision: d.expectedRevision,
        expected_charge_revision: d.expectedChargeRevision,
        expected_journal_fingerprint: d.expectedJournalFingerprint,
        decision_action: d.action,
        position_value: d.position as unknown as Json,
      });
      if (r.error?.code === "PT412") continue;
      if (r.error) throw new Error(unavailable);
      const receipt = read(r.data);
      if (
        receipt.application.orderId !== d.orderId ||
        receipt.application.intentId !== d.intentId
      )
        throw new Error(unavailable);
      return receipt;
    }
    throw new Error(unavailable);
  } catch {
    throw new Error(unavailable);
  }
}
