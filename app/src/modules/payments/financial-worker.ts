import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  readAsaasPayment,
  readAsaasPaymentCandidates,
  readAsaasPaymentExpectation,
} from "./asaas/contracts";
import {
  normalizeValidatedAsaasPaymentObservation,
  normalizeAsaasPaymentSnapshot,
} from "./asaas/financial";
import { readFixtureFinancialProof } from "./asaas/fixture-financial-proof";
import {
  createDurableAsaasFixturePort,
  getDurableFixtureTransportReceipt,
} from "./asaas/fixture-port";
import {
  fixturePaymentGetRequest,
  fixtureRequestIdentity,
  fixtureRequestFingerprint,
} from "./asaas/fixture-protocol";
const id = z.uuid().transform((v) => v.toLowerCase());
const unavailable = "Observação financeira fictícia indisponível.";
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
export const financialResultSchema = z
  .object({
    kind: z.enum(["recorded", "replay", "conflict"]),
    chargeId: id,
    observationId: id,
    conflictId: id.nullable(),
    current: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.kind === "conflict") !== (v.conflictId !== null))
      ctx.addIssue({ code: "custom", message: unavailable });
  });
export const financialQuerySchema = z
  .strictObject({
    queryId: id,
    chargeId: id,
    workerId: id,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    scopeId: id,
    clientId: id,
    expectation: z.unknown().transform(readAsaasPaymentExpectation),
    started: z.boolean(),
    finished: z.boolean(),
    protocol: z.unknown().nullable(),
  })
  .superRefine((q, ctx) => {
    if (
      q.expectation.phase !== "observation" ||
      q.expectation.scope.environment !== "sandbox"
    )
      ctx.addIssue({ code: "custom", message: unavailable });
  });
export function financialQueryProtocol(
  q: z.infer<typeof financialQuerySchema>,
) {
  return {
    operation: "payment_get",
    version: 1,
    requestId: fixtureRequestIdentity(q.queryId, "payment_get"),
    fingerprint: fixtureRequestFingerprint(
      fixturePaymentGetRequest(q.expectation.scope, q.expectation.paymentId!),
    ),
    payload: { paymentId: q.expectation.paymentId! },
  };
}
function normalized(
  text: string,
  expectation: ReturnType<typeof readAsaasPaymentExpectation>,
) {
  const facts = normalizeAsaasPaymentSnapshot(
    text,
    expectation.scope,
    expectation,
  );
  return {
    facts,
    ...readFixtureFinancialProof(text, facts),
    bodyHash: createHash("sha256").update(text).digest("hex"),
  };
}
/** IDs internos apenas. A origem R e seu recibo N são relidos pelo servidor. */
export async function captureFixtureFinancialObservation(
  executionObservationId: string,
) {
  requireLocal();
  try {
    const originId = id.parse(executionObservationId),
      db = createSystemClient();
    const response = await db.rpc("get_financial_origin", {
      target_observation: originId,
    });
    const origin = z
      .strictObject({
        originId: id,
        intentId: id,
        scopeId: id,
        clientId: id,
        expectation: z.unknown().transform(readAsaasPaymentExpectation),
        operation: z.enum(["payment_create", "payment_find"]),
        bodyText: z.string(),
      })
      .parse(response.data);
    if (response.error || origin.originId !== originId)
      throw new Error(unavailable);
    const expected = origin.expectation;
    let payment;
    if (origin.operation === "payment_find") {
      const {
        phase: _phase,
        paymentId: _paymentId,
        billingType,
        ...search
      } = expected;
      void _phase;
      void _paymentId;
      const candidates = readAsaasPaymentCandidates(
        origin.bodyText,
        expected.scope,
        { ...search, ...(billingType === "UNDEFINED" ? {} : { billingType }) },
      );
      if (
        candidates.hasMore ||
        candidates.totalCount !== 1 ||
        candidates.items.length !== 1 ||
        candidates.items[0].paymentId !== expected.paymentId
      )
        throw new Error(unavailable);
      payment = candidates.items[0];
    } else {
      const { billingType: _method, ...binding } = expected;
      void _method;
      payment = readAsaasPayment(origin.bodyText, expected.scope, binding);
    }
    const facts = normalizeValidatedAsaasPaymentObservation(
        payment,
        expected.billingType,
      ),
      proof = readFixtureFinancialProof(origin.bodyText, facts);
    requireLocal();
    const result = await db.rpc("capture_financial_origin", {
      target_observation: originId,
      body_hash: createHash("sha256").update(origin.bodyText).digest("hex"),
      facts: facts as unknown as Json,
      proof: proof.chargeback as unknown as Json,
      source_order: proof.sourceOrder,
    });
    if (result.error) throw new Error(unavailable);
    return financialResultSchema.parse(result.data);
  } catch {
    throw new Error(unavailable);
  }
}
async function internalallocateFixtureFinancialQuery(
  chargeId: string,
  requestId: string,
) {
  requireLocal();
  const input = z
    .strictObject({ chargeId: id, requestId: id })
    .parse({ chargeId, requestId });
  const result = await createSystemClient().rpc("allocate_financial_query", {
    target_charge: input.chargeId,
    request_id: input.requestId,
  });
  if (result.error) throw new Error(unavailable);
  const query = financialQuerySchema.parse(result.data);
  if (query.chargeId !== input.chargeId || query.queryId !== input.requestId)
    throw new Error(unavailable);
  return query;
}
async function internalstartFixtureFinancialQuery(
  q: z.infer<typeof financialQuerySchema>,
) {
  requireLocal();
  const query = financialQuerySchema.parse(q),
    result = await createSystemClient().rpc("start_financial_query", {
      target_query: query.queryId,
      worker_id: query.workerId,
      protocol: financialQueryProtocol(query),
    });
  if (result.error || typeof result.data !== "boolean")
    throw new Error(unavailable);
  return result.data;
}
/** Transporte fora da transação do journal. Recupera o receipt durável do slot. */
async function internalfinishFixtureFinancialQuery(
  q: z.infer<typeof financialQuerySchema>,
) {
  requireLocal();
  const query = financialQuerySchema.parse(q),
    protocol = financialQueryProtocol(query);
  let observation: ReturnType<typeof normalized> | null = null;
  try {
    const receipt = await getDurableFixtureTransportReceipt({
      scopeId: query.scopeId,
      clientId: query.clientId,
      slotId: query.queryId,
      operation: "payment_get",
    });
    if (
      receipt &&
      receipt.requestId === protocol.requestId &&
      receipt.fingerprint === protocol.fingerprint &&
      receipt.outcome.kind === "response" &&
      receipt.outcome.status === 200
    )
      observation = normalized(receipt.outcome.bodyText, query.expectation);
  } catch {
    /* Receipt ausente ou inválido permanece incerto. */
  }
  requireLocal();
  const result = await createSystemClient().rpc("finish_financial_query", {
    target_query: query.queryId,
    worker_id: query.workerId,
    body_hash: observation?.bodyHash ?? null,
    facts: (observation?.facts as unknown as Json) ?? null,
    proof: (observation?.chargeback ?? { kind: "unknown" }) as unknown as Json,
    source_order: observation?.sourceOrder ?? null,
  });
  if (result.error) throw new Error(unavailable);
  return financialResultSchema.parse(result.data);
}
async function internalqueryFixtureFinancialObservation(
  chargeId: string,
  requestId: string,
) {
  const query = await allocateFixtureFinancialQuery(chargeId, requestId);
  if (query.finished) {
    const result = await createSystemClient().rpc(
      "get_financial_query_observation",
      { target_query: query.queryId, worker_id: query.workerId },
    );
    if (result.error) throw new Error(unavailable);
    return financialResultSchema.parse(result.data);
  }
  if (!(await startFixtureFinancialQuery(query))) throw new Error(unavailable);
  try {
    const port = await createDurableAsaasFixturePort({
      scopeId: query.scopeId,
      clientId: query.clientId,
      slotId: query.queryId,
    });
    await port.send(
      fixturePaymentGetRequest(
        query.expectation.scope,
        query.expectation.paymentId!,
      ),
    );
  } catch {
    /* A finalização registra a incerteza; nunca emite outro POST. */
  }
  return finishFixtureFinancialQuery(query);
}

async function protectFinancialOperation<T>(run: () => Promise<T>): Promise<T> {
  try {
    requireLocal();
    return await run();
  } catch {
    throw new Error(unavailable);
  }
}

export async function allocateFixtureFinancialQuery(
  ...args: Parameters<typeof internalallocateFixtureFinancialQuery>
) {
  return protectFinancialOperation(() =>
    internalallocateFixtureFinancialQuery(...args),
  );
}

export async function startFixtureFinancialQuery(
  ...args: Parameters<typeof internalstartFixtureFinancialQuery>
) {
  return protectFinancialOperation(() =>
    internalstartFixtureFinancialQuery(...args),
  );
}

export async function finishFixtureFinancialQuery(
  ...args: Parameters<typeof internalfinishFixtureFinancialQuery>
) {
  return protectFinancialOperation(() =>
    internalfinishFixtureFinancialQuery(...args),
  );
}

export async function queryFixtureFinancialObservation(
  ...args: Parameters<typeof internalqueryFixtureFinancialObservation>
) {
  return protectFinancialOperation(() =>
    internalqueryFixtureFinancialObservation(...args),
  );
}
