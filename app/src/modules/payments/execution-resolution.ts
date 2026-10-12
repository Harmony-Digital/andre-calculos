import "server-only";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";
import { paymentExecutionViewSchema, executionId } from "./execution-data";
import { fixtureRequestIdentity } from "./asaas/fixture-protocol";
import { advanceFixturePaymentExecution } from "./execution-worker";
const unavailable = "Resolução fictícia indisponível.";
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const paymentResolutionInput = z.strictObject({
  executionRequestId: executionId,
  requestId: executionId,
});
export const paymentResolutionReceiptSchema = z
  .strictObject({
    semantics: z.literal("resolution_receipt"),
    requestId: executionId,
    executionRequestId: executionId,
    reason: z.literal("no_dispatch_proven"),
    recordedAt: z.iso.datetime({ offset: true }),
    expectedRevision: revision,
    appliedRevision: revision,
    view: paymentExecutionViewSchema,
  })
  .superRefine((v, ctx) => {
    if (
      v.appliedRevision !== v.expectedRevision + 1 ||
      v.view.revision !== v.appliedRevision ||
      v.view.state !== "resolved"
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
/** Somente IDs: a prova e a liberação são conferidas atomicamente no banco. */
export async function resolveFixturePaymentExecution(input: unknown) {
  requireLocal();
  try {
    const parsed = paymentResolutionInput.parse(input),
      db = createSystemClient();
    const result = await db.rpc("resolve_payment_execution_no_dispatch", {
      target_request: parsed.executionRequestId,
      request_id: parsed.requestId,
    });
    if (result.error) throw new Error(unavailable);
    if (result.data === null) return null;
    const receipt = paymentResolutionReceiptSchema.parse(result.data);
    if (
      receipt.requestId !== parsed.requestId ||
      receipt.executionRequestId !== parsed.executionRequestId
    )
      throw new Error(unavailable);
    return receipt;
  } catch {
    throw new Error(unavailable);
  }
}
/** Leitura interna do journal, independente do UUID usado na resolução. */
export async function getFixturePaymentExecutionResolution(requestId: string) {
  requireLocal();
  try {
    const target = executionId.parse(requestId),
      db = createSystemClient();
    const r = await db.rpc("get_payment_execution_resolution", {
      target_request: target,
    });
    if (r.error) throw new Error(unavailable);
    if (r.data === null) return null;
    const receipt = paymentResolutionReceiptSchema.parse(r.data);
    if (receipt.executionRequestId !== target) throw new Error(unavailable);
    return receipt;
  } catch {
    throw new Error(unavailable);
  }
}
/** Retoma um passo; uma prova explícita pode resolver antes/depois do transporte. */
export async function resumeFixturePaymentExecution(requestId: string) {
  requireLocal();
  const executionRequestId = executionId.safeParse(requestId);
  if (!executionRequestId.success) throw new Error(unavailable);
  try {
    const prior = await getFixturePaymentExecutionResolution(
      executionRequestId.data,
    );
    if (prior) return prior.view;
    const input = {
      executionRequestId: executionRequestId.data,
      requestId: fixtureRequestIdentity(
        executionRequestId.data,
        "payment_no_dispatch_resolution",
      ),
    };
    const proven = await resolveFixturePaymentExecution(input);
    if (proven) return proven.view;
    const view = await advanceFixturePaymentExecution(executionRequestId.data);
    if (view.reason !== "not_dispatched") return view;
    const receipt = await resolveFixturePaymentExecution(input);
    return receipt?.view ?? view;
  } catch {
    // Uma resolução concorrente com outro UUID continua sendo terminal.
    const prior = await getFixturePaymentExecutionResolution(
      executionRequestId.data,
    );
    if (prior) return prior.view;
    throw new Error(unavailable);
  }
}
