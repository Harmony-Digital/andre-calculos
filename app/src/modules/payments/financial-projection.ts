import "server-only";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";
import { readAsaasPaymentExpectation } from "./asaas/contracts";
import {
  cents,
  financialId,
  financialPositionSchema,
  financialObservationSchema,
} from "./financial-position-data";
import { deriveFinancialPosition } from "./financial-position";
const unavailable = "Projeção financeira indisponível.";
export const orderCreditProjectionSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    semantics: z.literal("credit_projection"),
    orderId: financialId,
    effects: z.literal("none"),
    requiredDepositCents: cents.nullable(),
    totalCents: cents.nullable(),
    manualDepositCents: cents.nullable(),
    manualTotalCents: cents.nullable(),
    providerObservedDepositCents: cents.nullable(),
    providerObservedTotalCents: cents.nullable(),
    depositCreditCents: cents.nullable(),
    totalCreditCents: cents.nullable(),
    depositUncertain: z.boolean(),
    uncertain: z.boolean(),
    unsafeAmount: z.boolean(),
    partial: z.boolean().nullable(),
    remainingDepositCents: cents.nullable(),
    remainingTotalCents: cents.nullable(),
    depositExcessCents: cents.nullable(),
    totalExcessCents: cents.nullable(),
    unlinkedLegacyCount: cents,
    missingPositionCount: cents,
    pendingChargeCount: cents,
    conflictedChargeCount: cents,
  })
  .superRefine((v, ctx) => {
    if (
      (!v.depositUncertain && v.depositCreditCents === null) ||
      (!v.uncertain && v.totalCreditCents === null) ||
      (v.depositUncertain &&
        (v.depositCreditCents !== null ||
          v.partial !== null ||
          v.remainingDepositCents !== null ||
          v.depositExcessCents !== null)) ||
      (v.uncertain &&
        (v.totalCreditCents !== null ||
          v.remainingTotalCents !== null ||
          v.totalExcessCents !== null))
    )
      ctx.addIssue({ code: "custom", message: unavailable });
  });
export const financialProjectionSourceSchema = z
  .strictObject({
    chargeId: financialId,
    orderId: financialId,
    intentId: financialId,
    phase: z.enum(["deposit", "balance"]),
    expectation: z.unknown().transform(readAsaasPaymentExpectation),
    revision: cents,
    chargeRevision: cents,
    journalFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    sourceConflictCount: cents,
    observation: financialObservationSchema,
    previous: financialPositionSchema.nullable(),
    history: z.array(financialObservationSchema),
    captureIsCurrent: z.boolean(),
    capturePrecedesPrevious: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const e = v.expectation;
    if (
      e.phase !== "observation" ||
      e.scope.environment !== "sandbox" ||
      (v.previous === null) !== (v.revision === 0)
    )
      ctx.addIssue({ code: "custom", message: unavailable });
    for (const o of [
      v.observation,
      ...v.history,
      ...(v.previous?.snapshot ? [{ facts: v.previous.snapshot }] : []),
    ]) {
      const f = o.facts;
      if (!f) continue;
      if (
        JSON.stringify(f.scope) !== JSON.stringify(e.scope) ||
        f.paymentId !== e.paymentId ||
        f.customerId !== e.customerId ||
        f.reference !== e.reference ||
        f.amounts.contractedCents !== e.contractedCents ||
        f.expectedBillingType !== e.billingType ||
        f.dueDate !== e.dueDate
      )
        ctx.addIssue({ code: "custom", message: unavailable });
    }
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
/** Leitura fixa por ID; não é o escritor/aplicador transacional de X. */
export async function deriveFixtureFinancialDecision(observationId: string) {
  try {
    requireLocal();
    const target = financialId.parse(observationId),
      r = await createSystemClient().rpc("get_financial_projection_source", {
        target_observation: target,
      });
    const source = financialProjectionSourceSchema.parse(r.data);
    if (r.error || source.observation.id !== target)
      throw new Error(unavailable);
    const decision = deriveFinancialPosition({
      observation: source.observation,
      previous: source.previous,
      history: source.history,
      captureIsCurrent: source.captureIsCurrent,
      capturePrecedesPrevious: source.capturePrecedesPrevious,
      sourceConflictCount: source.sourceConflictCount,
    });
    return {
      chargeId: source.chargeId,
      orderId: source.orderId,
      intentId: source.intentId,
      phase: source.phase,
      expectedRevision: source.revision,
      expectedChargeRevision: source.chargeRevision,
      expectedJournalFingerprint: source.journalFingerprint,
      canConfirmKnownCoverage:
        source.captureIsCurrent &&
        source.sourceConflictCount === 0 &&
        decision.position.certainty === "known" &&
        (decision.action === "same" || decision.action === "replace"),
      ...decision,
    };
  } catch {
    throw new Error(unavailable);
  }
}
/** RPC autoriza o dono atual/calculista e audita a leitura. */
export async function getOrderCreditProjection(orderId: string) {
  try {
    const target = financialId.parse(orderId),
      db = await createSessionClient(),
      r = await db.rpc("get_order_financial_projection", {
        target_order: target,
      });
    const result = orderCreditProjectionSchema.parse(r.data);
    if (r.error || result.orderId !== target) throw new Error(unavailable);
    return result;
  } catch {
    throw new Error(unavailable);
  }
}
