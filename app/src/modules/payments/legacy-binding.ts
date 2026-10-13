import "server-only";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";
import { cents, financialId } from "./financial-position-data";
import { orderCreditProjectionSchema } from "./financial-projection";
const unavailable = "Vínculo fictício do legado indisponível.";
const phase = z.enum(["deposit", "balance"]);
const at = z.iso.datetime({ offset: true });
const identity = {
  schemaVersion: z.literal(1),
  mode: z.literal("fixture"),
  identityProof: z.literal("fixture_explicit_source"),
  requestId: financialId,
  observationId: financialId,
  paymentId: financialId,
  chargeId: financialId,
  scopeId: financialId,
  intentId: financialId,
  orderId: financialId,
  phase,
};
export const fixtureLegacyOriginInput = z.strictObject({
  observationId: financialId,
  requestId: financialId,
});
export const fixtureLegacyBindingInput = z.strictObject({
  originRequestId: financialId,
  applicationRequestId: financialId,
  requestId: financialId,
});
export const fixtureLegacyOriginReceiptSchema = z
  .strictObject({
    ...identity,
    semantics: z.literal("legacy_origin_receipt"),
    clientId: financialId,
    executionOriginId: financialId,
    receiptId: financialId,
    amountCents: cents.positive(),
    snapshot: z.strictObject({
      orderId: financialId,
      method: z.literal("asaas"),
      kind: phase,
      status: z.literal("confirmed"),
      amountCents: cents.positive(),
      providerReference: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    }),
    recordedAt: at,
  })
  .superRefine((v, ctx) => {
    if (
      v.snapshot.orderId !== v.orderId ||
      v.snapshot.kind !== v.phase ||
      v.snapshot.amountCents !== v.amountCents
    )
      ctx.addIssue({ code: "custom", message: unavailable });
  });
export const fixtureLegacyBindingReceiptSchema = z
  .strictObject({
    ...identity,
    semantics: z.literal("legacy_binding_receipt"),
    originRequestId: financialId,
    applicationRequestId: financialId,
    basisObservationId: financialId,
    positionRevision: cents.positive(),
    chargeRevision: cents,
    journalFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    projection: orderCreditProjectionSchema,
    orderStatus: z.string().regex(/^[a-z_]{1,100}$/),
    boundAt: at,
  })
  .superRefine((v, ctx) => {
    if (v.projection.orderId !== v.orderId)
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
/** A linha histórica e sua origem vêm da fonte T/N/R; o caller fornece só IDs. */
export async function createFixtureLegacyOrigin(input: unknown) {
  try {
    requireLocal();
    const target = fixtureLegacyOriginInput.parse(input),
      db = createSystemClient(),
      args = {
        target_observation: target.observationId,
        request_id: target.requestId,
      };
    const read = (data: unknown) => {
      const r = fixtureLegacyOriginReceiptSchema.parse(data);
      if (
        r.observationId !== target.observationId ||
        r.requestId !== target.requestId
      )
        throw new Error(unavailable);
      return r;
    };
    const prior = await db.rpc("get_fixture_legacy_origin_receipt", args);
    if (prior.error) throw new Error(unavailable);
    if (prior.data !== null) return read(prior.data);
    requireLocal();
    const result = await db.rpc("create_fixture_legacy_origin", args);
    if (result.error) throw new Error(unavailable);
    return read(result.data);
  } catch {
    throw new Error(unavailable);
  }
}
/** Identidade não confirma crédito: projeção, fila e journal são atômicos no banco. */
export async function bindFixtureLegacyPayment(input: unknown) {
  try {
    requireLocal();
    const target = fixtureLegacyBindingInput.parse(input),
      db = createSystemClient(),
      args = {
        target_origin: target.originRequestId,
        target_application: target.applicationRequestId,
        request_id: target.requestId,
      };
    const read = (data: unknown) => {
      const r = fixtureLegacyBindingReceiptSchema.parse(data);
      if (
        r.originRequestId !== target.originRequestId ||
        r.applicationRequestId !== target.applicationRequestId ||
        r.requestId !== target.requestId
      )
        throw new Error(unavailable);
      return r;
    };
    const prior = await db.rpc("get_fixture_legacy_binding_receipt", args);
    if (prior.error) throw new Error(unavailable);
    if (prior.data !== null) return read(prior.data);
    requireLocal();
    const result = await db.rpc("bind_fixture_legacy_payment", args);
    if (result.error) throw new Error(unavailable);
    return read(result.data);
  } catch {
    throw new Error(unavailable);
  }
}
