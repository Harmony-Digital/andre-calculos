import "server-only";
import { z } from "zod";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { createSystemClient } from "@/lib/supabase/admin";
import {
  createAsaasFixtureAdapter,
  type AsaasFixturePort,
} from "./asaas/adapter";
import { readAsaasPaymentExpectation, readAsaasScope } from "./asaas/contracts";
import {
  fixturePaymentGetRequest,
  fixtureRequestFingerprint,
} from "./asaas/fixture-protocol";
import { parseInvoicePresentation } from "./invoice-presentation";

const unavailable =
  "Não foi possível conferir a fatura. Solicite uma nova conferência.";
const id = z.uuid().transform((v) => v.toLowerCase());
const scope = z.unknown().transform(readAsaasScope);
const preparationSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    queryId: id.nullable(),
    ownerId: id,
    scope: scope.nullable(),
    presentation: z.unknown(),
    expectation: z
      .unknown()
      .transform((v) => (v === null ? null : readAsaasPaymentExpectation(v))),
  })
  .superRefine((v, ctx) => {
    if (
      (v.queryId === null) !== (v.expectation === null) ||
      (v.queryId !== null &&
        (v.presentation !== null ||
          v.scope === null ||
          v.expectation?.phase !== "observation" ||
          v.expectation?.billingType === undefined ||
          v.expectation?.dueDate === undefined))
    )
      ctx.addIssue({ code: "custom", message: unavailable });
  });
const completionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  queryId: id,
  ownerId: id,
  scope,
  presentation: z.unknown(),
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

/** GET pontual por ID interno, sem callback/endpoint externo e sem recibo antigo. */
export async function readFixtureInvoice(
  queryId: string,
  expectation: unknown,
) {
  requireLocal();
  try {
    const target = id.parse(queryId),
      expected = readAsaasPaymentExpectation(expectation);
    if (
      expected.phase !== "observation" ||
      expected.scope.environment !== "sandbox"
    )
      throw new Error(unavailable);
    const db = createSystemClient(),
      fixed = fixturePaymentGetRequest(expected.scope, expected.paymentId!);
    let sent = false;
    const port: AsaasFixturePort = Object.freeze({
      mode: "fixture",
      scope: expected.scope,
      capabilities: Object.freeze({ alphanumericCnpj: "supported" }),
      async send(request) {
        requireLocal();
        if (
          sent ||
          Object.keys(request).some(
            (key) =>
              !["mode", "scope", "method", "url", "bodyText"].includes(key),
          ) ||
          request.mode !== "fixture" ||
          request.method !== "GET" ||
          request.bodyText !== undefined ||
          fixtureRequestFingerprint(request) !==
            fixtureRequestFingerprint(fixed)
        )
          throw new Error(unavailable);
        sent = true;
        const result = await db.rpc("read_payment_invoice_fixture", {
          target_query: target,
        });
        if (result.error) throw new Error(unavailable);
        return result.data;
      },
    });
    const result = await createAsaasFixtureAdapter(
      expected.scope,
      port,
    ).getInvoice(expected);
    if (!sent) throw new Error(unavailable);
    const saved = await db.rpc("record_payment_invoice_result", {
      target_query: target,
      available: result.kind === "observed",
    });
    if (saved.error) throw new Error(unavailable);
    return result;
  } catch {
    throw new Error(unavailable);
  }
}

/** Autorização em duas transações; só o retorno atual auditado recebe URL em memória. */
export async function getPaymentInvoice(orderId: string, processId: string) {
  try {
    requireLocal();
    const session = await authorize(["client", "calculator"]),
      target = id.parse(orderId),
      process = id.parse(processId),
      db = await createSessionClient();
    const response = await db.rpc("prepare_payment_invoice", {
      target_order: target,
    });
    if (response.error) throw new Error(unavailable);
    const prepared = preparationSchema.parse(response.data);
    if (
      session.profile.role === "client" &&
      prepared.ownerId !== session.profile.id
    )
      throw new Error(unavailable);
    if (prepared.queryId === null)
      return parseInvoicePresentation(prepared.presentation, {
        orderId: target,
        processId: process,
        scope: prepared.scope,
      });
    const invoice = await readFixtureInvoice(
      prepared.queryId,
      prepared.expectation,
    );
    const finished = await db.rpc("finish_payment_invoice", {
      target_query: prepared.queryId,
    });
    if (finished.error) throw new Error(unavailable);
    const current = completionSchema.parse(finished.data);
    if (
      current.queryId !== prepared.queryId ||
      current.ownerId !== prepared.ownerId ||
      JSON.stringify(current.scope) !== JSON.stringify(prepared.scope)
    )
      throw new Error(unavailable);
    const presentation = z
      .object({ state: z.string(), invoiceUrl: z.null() })
      .passthrough()
      .parse(current.presentation);
    if (presentation.state === "active" && invoice.kind !== "observed")
      throw new Error(unavailable);
    return parseInvoicePresentation(
      {
        ...presentation,
        invoiceUrl:
          presentation.state === "active" && invoice.kind === "observed"
            ? invoice.value
            : null,
      },
      { orderId: target, processId: process, scope: current.scope },
    );
  } catch {
    throw new Error(unavailable);
  }
}
