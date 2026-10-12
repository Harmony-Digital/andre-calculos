import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";
import { isCivilDate } from "@/modules/deadlines/calendar";
import { readAsaasScope } from "./contracts";
import { parseAsaasJson, JsonNumber } from "./json";
import { providerCents } from "./money";
import type { AsaasFixturePort } from "./adapter";
const id = z.uuid().transform((value) => value.toLowerCase());
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const inputSchema = z.strictObject({ scopeId: id, clientId: id, slotId: id });
const scopeSchema = z.unknown().transform(readAsaasScope);
const metaSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal("fixture"),
  identityProof: z.literal("fixture_declared"),
  scopeId: id,
  clientId: id,
  scope: scopeSchema,
});
const outcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("not_dispatched"), scope: scopeSchema }),
  z.strictObject({ kind: z.literal("indeterminate"), scope: scopeSchema }),
  z.strictObject({
    kind: z.literal("response"),
    scope: scopeSchema,
    status: z.number().int().min(100).max(599),
    bodyText: z.string().max(1024 * 1024),
  }),
]);
const receiptSchema = metaSchema.extend({
  requestId: id,
  slotId: id,
  operation: z.enum([
    "customer_create",
    "customer_get",
    "customer_find",
    "payment_create",
    "payment_get",
    "payment_find",
  ]),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  recordedAt: z.iso.datetime({ offset: true }),
  outcome: outcomeSchema,
});
type Operation = z.infer<typeof receiptSchema>["operation"];
type Payload = Record<string, string | number | boolean>;
const unavailable = "Transporte fictício indisponível.";
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
function equalScope(
  actual: unknown,
  expected: ReturnType<typeof readAsaasScope>,
) {
  const read = readAsaasScope(actual);
  if (
    read.accountId !== expected.accountId ||
    read.environment !== expected.environment ||
    read.walletId !== expected.walletId
  )
    throw new Error(unavailable);
}
const requestSchema = z.strictObject({
  mode: z.literal("fixture"),
  scope: scopeSchema,
  method: z.enum(["GET", "POST"]),
  url: z.string().max(2048),
  bodyText: z
    .string()
    .max(1024 * 1024)
    .optional(),
});
const customerBody = z.strictObject({
  name: z
    .string()
    .max(400)
    .refine(
      (value) =>
        value === value.trim() &&
        [...value].length >= 3 &&
        [...value].length <= 200,
    ),
  cpfCnpj: z.string(),
  externalReference: id,
  notificationDisabled: z.literal(true),
  email: z.email().max(254).optional(),
  mobilePhone: z
    .string()
    .regex(/^\d{10,11}$/)
    .optional(),
});
const paymentBody = z.strictObject({
  customer: identifier,
  billingType: z.enum(["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"]),
  value: z.instanceof(JsonNumber),
  dueDate: z.string().refine(isCivilDate),
  externalReference: id,
});
function decodeRequest(
  value: unknown,
  clientId: string,
  scope: ReturnType<typeof readAsaasScope>,
) {
  const request = requestSchema.parse(value);
  equalScope(request.scope, scope);
  const url = new URL(request.url);
  if (
    url.origin !== "https://api-sandbox.asaas.com" ||
    request.url !== url.href ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error(unavailable);
  const query = url.searchParams;
  const exactQuery = (keys: string[]) => {
    if (
      [...query.keys()].length !== keys.length ||
      keys.some((key) => query.getAll(key).length !== 1)
    )
      throw new Error(unavailable);
  };
  let operation: Operation;
  let payload: Payload;
  if (request.method === "POST") {
    exactQuery([]);
    if (request.bodyText === undefined) throw new Error(unavailable);
    const body = parseAsaasJson(request.bodyText);
    if (url.pathname === "/v3/customers") {
      const parsed = customerBody.parse(body);
      if (parsed.externalReference !== clientId) throw new Error(unavailable);
      operation = "customer_create";
      payload = {
        name: parsed.name,
        document: parsed.cpfCnpj,
        reference: parsed.externalReference,
        notificationDisabled: true,
        ...(parsed.email === undefined ? {} : { email: parsed.email }),
        ...(parsed.mobilePhone === undefined
          ? {}
          : { mobilePhone: parsed.mobilePhone }),
      };
    } else if (url.pathname === "/v3/payments") {
      const parsed = paymentBody.parse(body);
      operation = "payment_create";
      payload = {
        customerId: parsed.customer,
        amountCents: providerCents(parsed.value),
        billingType: parsed.billingType,
        dueDate: parsed.dueDate,
        reference: parsed.externalReference,
      };
    } else throw new Error(unavailable);
  } else {
    if (request.bodyText !== undefined) throw new Error(unavailable);
    if (url.pathname === "/v3/customers") {
      exactQuery(["externalReference", "cpfCnpj", "limit", "offset"]);
      if (
        query.get("externalReference") !== clientId ||
        query.get("limit") !== "2" ||
        query.get("offset") !== "0"
      )
        throw new Error(unavailable);
      operation = "customer_find";
      payload = { reference: clientId, document: query.get("cpfCnpj")! };
    } else if (url.pathname === "/v3/payments") {
      exactQuery(["customer", "externalReference", "limit", "offset"]);
      if (query.get("limit") !== "2" || query.get("offset") !== "0")
        throw new Error(unavailable);
      operation = "payment_find";
      payload = {
        customerId: identifier.parse(query.get("customer")),
        reference: id.parse(query.get("externalReference")),
      };
    } else {
      exactQuery([]);
      const match = url.pathname.match(
        /^\/v3\/(customers|payments)\/([A-Za-z0-9_-]{1,100})$/,
      );
      if (!match) throw new Error(unavailable);
      operation = match[1] === "customers" ? "customer_get" : "payment_get";
      payload =
        match[1] === "customers"
          ? { customerId: match[2] }
          : { paymentId: match[2] };
    }
  }
  return { operation, payload, request };
}
/** Chave interna estável. Não declara idempotência da API real do Asaas. */
function requestIdentity(slotId: string, operation: Operation) {
  const raw = createHash("sha256")
    .update(slotId + ":" + operation)
    .digest("hex");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-5${raw.slice(13, 16)}-8${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
}
/** Porta fixa interna: nenhuma URL é acessada; não recebe callback do usuário. */
export async function createDurableAsaasFixturePort(input: unknown) {
  requireLocal();
  try {
    const target = inputSchema.parse(input);
    const db = createSystemClient();
    const result = await db.rpc("get_payment_fixture_scope", {
      target_scope: target.scopeId,
      target_client: target.clientId,
    });
    const meta = metaSchema.parse(result.data);
    if (
      result.error ||
      meta.scopeId !== target.scopeId ||
      meta.clientId !== target.clientId ||
      meta.scope.environment !== "sandbox"
    )
      throw new Error(unavailable);
    const scope = Object.freeze({ ...meta.scope });
    const port: AsaasFixturePort = Object.freeze({
      mode: "fixture",
      scope,
      capabilities: Object.freeze({ alphanumericCnpj: "supported" }),
      async send(value: unknown) {
        requireLocal();
        try {
          const decoded = decodeRequest(value, target.clientId, scope);
          const fingerprint = createHash("sha256")
            .update(
              JSON.stringify({
                scope,
                method: decoded.request.method,
                url: decoded.request.url,
                bodyText: decoded.request.bodyText ?? null,
              }),
            )
            .digest("hex");
          const result = await db.rpc("send_payment_fixture_request", {
            target_scope: target.scopeId,
            target_client: target.clientId,
            slot_id: target.slotId,
            request_id: requestIdentity(target.slotId, decoded.operation),
            operation: decoded.operation,
            fingerprint,
            payload: decoded.payload,
          });
          if (result.error) throw new Error(unavailable);
          const outcome = outcomeSchema.parse(result.data);
          equalScope(outcome.scope, scope);
          return outcome;
        } catch {
          throw new Error(unavailable);
        }
      },
    });
    return port;
  } catch {
    throw new Error(unavailable);
  }
}
export async function getDurableFixtureTransportReceipt(input: unknown) {
  requireLocal();
  try {
    const target = inputSchema
      .extend({ operation: receiptSchema.shape.operation })
      .parse(input);
    const db = createSystemClient();
    const result = await db.rpc("get_payment_fixture_receipt", {
      target_scope: target.scopeId,
      target_client: target.clientId,
      slot_id: target.slotId,
      request_id: requestIdentity(target.slotId, target.operation),
    });
    if (result.error) throw new Error(unavailable);
    if (result.data === null) return null;
    const receipt = receiptSchema.parse(result.data);
    if (
      receipt.scopeId !== target.scopeId ||
      receipt.clientId !== target.clientId ||
      receipt.scope.environment !== "sandbox" ||
      receipt.slotId !== target.slotId ||
      receipt.operation !== target.operation ||
      receipt.requestId !== requestIdentity(target.slotId, target.operation)
    )
      throw new Error(unavailable);
    equalScope(receipt.outcome.scope, receipt.scope);
    return receipt;
  } catch {
    throw new Error(unavailable);
  }
}
