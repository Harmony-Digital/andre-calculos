import "server-only";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";
import {
  currentPaymentExecutionViewSchema,
  executionId,
} from "./execution-data";
const unavailable = "Resolução financeira fictícia indisponível.";
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const financialResolutionInput = z.strictObject({
  applicationRequestId: executionId,
  requestId: executionId,
});
export const financialResolutionReceiptSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    semantics: z.literal("financial_resolution_receipt"),
    mode: z.literal("fixture"),
    requestId: executionId,
    applicationRequestId: executionId,
    executionRequestId: executionId,
    chargeId: executionId,
    orderId: executionId,
    intentId: executionId,
    runId: executionId,
    observationId: executionId,
    basisObservationId: executionId,
    reason: z.enum(["financial_received", "financial_refunded"]),
    recordedAt: z.iso.datetime({ offset: true }),
    positionRevision: revision.positive(),
    chargeRevision: revision,
    journalFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    expectedRunRevision: revision.max(Number.MAX_SAFE_INTEGER - 1),
    appliedRunRevision: revision.positive(),
    view: currentPaymentExecutionViewSchema,
  })
  .superRefine((v, ctx) => {
    if (
      v.appliedRunRevision !== v.expectedRunRevision + 1 ||
      v.view.revision !== v.appliedRunRevision ||
      v.view.intentId !== v.intentId ||
      v.view.runId !== v.runId ||
      v.view.state !== "resolved" ||
      v.view.reason !== v.reason ||
      !v.view.dispatchClaimed ||
      v.view.reservationActive
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
/** Caller fornece apenas IDs. Prova/candidato/fences/DELETE sao atomicos no banco. */
export async function resolveFixtureFinancialApplication(input: unknown) {
  requireLocal();
  try {
    const target = financialResolutionInput.parse(input),
      db = createSystemClient();
    const read = (value: unknown) => {
      const receipt = financialResolutionReceiptSchema.parse(value);
      if (
        receipt.applicationRequestId !== target.applicationRequestId ||
        receipt.requestId !== target.requestId
      )
        throw new Error(unavailable);
      return receipt;
    };
    const prior = await db.rpc("get_financial_resolution_receipt", {
      target_application: target.applicationRequestId,
      request_id: target.requestId,
    });
    if (prior.error) throw new Error(unavailable);
    if (prior.data !== null) return read(prior.data);
    requireLocal();
    const result = await db.rpc("resolve_financial_execution", {
      target_application: target.applicationRequestId,
      request_id: target.requestId,
    });
    if (result.error) throw new Error(unavailable);
    if (result.data === null) return null;
    return read(result.data);
  } catch {
    throw new Error(unavailable);
  }
}
/** Recibo historico por execucao; nao revalida credito nem remove reserva atual. */
export async function getFixtureFinancialExecutionResolution(
  requestId: string,
) {
  requireLocal();
  try {
    const target = executionId.parse(requestId),
      result = await createSystemClient().rpc(
        "get_financial_execution_resolution",
        {
          target_request: target,
        },
      );
    if (result.error) throw new Error(unavailable);
    if (result.data === null) return null;
    const receipt = financialResolutionReceiptSchema.parse(result.data);
    if (receipt.executionRequestId !== target) throw new Error(unavailable);
    return receipt;
  } catch {
    throw new Error(unavailable);
  }
}
