import "server-only";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  cents,
  financialId,
  financialPositionSchema,
} from "./financial-position-data";
import { deriveFixtureFinancialDecision } from "./financial-projection";
const unavailable = "Aplicação financeira indisponível.";
export const financialApplicationReceiptSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    semantics: z.literal("financial_application_receipt"),
    mode: z.literal("fixture"),
    requestId: financialId,
    observationId: financialId,
    chargeId: financialId,
    orderId: financialId,
    intentId: financialId,
    action: z.enum(["replace", "hold", "same", "ignore_old"]),
    position: financialPositionSchema.nullable(),
    positionRevision: cents,
    chargeRevision: cents,
    journalFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    effects: z
      .array(
        z.enum(["received", "debited", "restored", "reconciled", "reconcile"]),
      )
      .max(5),
    orderStatus: z
      .string()
      .regex(/^[a-z_]{1,100}$/)
      .nullable(),
    appliedAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((v, ctx) => {
    if (
      (v.position === null) !== (v.positionRevision === 0) ||
      new Set(v.effects).size !== v.effects.length ||
      (v.action === "ignore_old" && v.effects.length)
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
/** O caller fornece somente IDs. T é durável antes desta transação. */
export async function applyFixtureFinancialObservation(input: unknown) {
  try {
    requireLocal();
    const { observationId, requestId } = z
      .strictObject({ observationId: financialId, requestId: financialId })
      .parse(input);
    const db = createSystemClient();
    const read = (data: unknown) => {
      const r = financialApplicationReceiptSchema.parse(data);
      if (r.observationId !== observationId || r.requestId !== requestId)
        throw new Error(unavailable);
      return r;
    };
    const prior = await db.rpc("get_financial_application_receipt", {
      target_observation: observationId,
      request_id: requestId,
    });
    if (prior.error) throw new Error(unavailable);
    if (prior.data !== null) return read(prior.data);
    for (let attempt = 0; attempt < 3; attempt++) {
      const d = await deriveFixtureFinancialDecision(observationId);
      requireLocal();
      const r = await db.rpc("apply_financial_observation", {
        target_observation: observationId,
        request_id: requestId,
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
        receipt.chargeId !== d.chargeId ||
        receipt.orderId !== d.orderId ||
        receipt.intentId !== d.intentId
      )
        throw new Error(unavailable);
      return receipt;
    }
    throw new Error(unavailable);
  } catch {
    throw new Error(unavailable);
  }
}
