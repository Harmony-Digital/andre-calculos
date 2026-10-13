import "server-only";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";
import { readAsaasPaymentExpectation } from "./asaas/contracts";
import { normalizeAsaasFinancialEvent } from "./asaas/financial";
import { queryFixtureFinancialObservation } from "./financial-worker";
const id = z.uuid();
const unavailable = "Processamento de webhook indisponível.";
const base = {
  schemaVersion: z.literal(1),
  mode: z.literal("fixture"),
  identityProof: z.literal("fixture_declared"),
};
export const webhookRunSchema = z
  .strictObject({
    ...base,
    state: z.enum([
      "unmatched",
      "identity_mismatch",
      "claimed",
      "queried",
      "complete",
      "superseded",
    ]),
    runId: id,
    eventId: id,
    scopeId: id,
    paymentId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    chargeId: id.nullable(),
    queryId: id,
    applicationRequestId: id,
    workerId: id,
    epoch: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    sourceCount: z.number().int().positive(),
    leaseUntil: z.iso.datetime({ offset: true }),
    observationId: id.nullable(),
  })
  .superRefine((r, ctx) => {
    if (
      (r.state === "unmatched") !== (r.chargeId === null) ||
      (r.state === "queried" && r.observationId === null)
    )
      ctx.addIssue({ code: "custom", message: unavailable });
  });
const claimSchema = z.union([
  webhookRunSchema,
  z.strictObject({
    ...base,
    state: z.enum(["busy", "already_processed"]),
    eventId: id,
  }),
]);
const contextSchema = z.strictObject({
  run: webhookRunSchema,
  expectation: z.unknown().transform(readAsaasPaymentExpectation),
  eventBody: z.string().max(1024 * 1024),
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
export async function claimFixturePaymentWebhook(
  eventId: string,
  requestId: string,
) {
  try {
    requireLocal();
    const event = id.parse(eventId),
      request = id.parse(requestId);
    const r = await createSystemClient().rpc("claim_fixture_payment_webhook", {
      target_event: event,
      request_id: request,
    });
    if (r.error) throw new Error(unavailable);
    const receipt = claimSchema.parse(r.data);
    return receipt;
  } catch {
    throw new Error(unavailable);
  }
}
/** Consulta atual pelo protocolo T; não aplica crédito nem finaliza a fila. */
export async function queryFixturePaymentWebhook(claim: unknown) {
  try {
    requireLocal();
    const c = webhookRunSchema.parse(claim);
    if (!c.chargeId || !["claimed", "queried"].includes(c.state))
      throw new Error(unavailable);
    const db = createSystemClient(),
      loaded = await db.rpc("get_fixture_webhook_context", {
        target_run: c.runId,
        worker_id: c.workerId,
        expected_epoch: c.epoch,
      });
    if (loaded.error) throw new Error(unavailable);
    const ctx = contextSchema.parse(loaded.data);
    if (
      ctx.run.runId !== c.runId ||
      ctx.run.workerId !== c.workerId ||
      ctx.run.epoch !== c.epoch ||
      ctx.run.chargeId !== c.chargeId ||
      ctx.run.queryId !== c.queryId ||
      ctx.expectation.paymentId !== c.paymentId
    )
      throw new Error(unavailable);
    let eventDisposition: "normalized" | "query_required" = "query_required";
    try {
      normalizeAsaasFinancialEvent(
        ctx.eventBody,
        ctx.expectation.scope,
        ctx.expectation,
      );
      eventDisposition = "normalized";
    } catch {
      /* Fatos insuficientes conservam a consulta como única prova. */
    }
    const observation = await queryFixtureFinancialObservation(
      c.chargeId,
      c.queryId,
    );
    requireLocal();
    const result = await db.rpc("record_fixture_webhook_query", {
      target_run: c.runId,
      worker_id: c.workerId,
      expected_epoch: c.epoch,
      target_observation: observation.observationId,
    });
    if (result.error) throw new Error(unavailable);
    const r = webhookRunSchema.parse(result.data);
    if (
      r.runId !== c.runId ||
      r.workerId !== c.workerId ||
      r.epoch !== c.epoch ||
      r.observationId !== observation.observationId ||
      r.state !== "queried"
    )
      throw new Error(unavailable);
    return { run: r, eventDisposition };
  } catch {
    throw new Error(unavailable);
  }
}
