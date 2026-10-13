import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { JsonNumber, parseAsaasJson } from "./json";
import { scopeSchema, type AsaasScope } from "./scope-data";

export const ASAAS_WEBHOOK_MAX_BYTES = 1024 * 1024;
const READ_TIMEOUT_MS = 5000;
const statuses = {
  unavailable: 503,
  unauthorized: 401,
  unsupported_media: 415,
  too_large: 413,
  invalid_body: 400,
  identity_mismatch: 403,
  read_timeout: 408,
} as const;
export class AsaasWebhookReceptionError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof statuses) {
    super("Notificação financeira indisponível.");
    this.name = "AsaasWebhookReceptionError";
    this.status = statuses[code];
  }
}
const fail = (code: keyof typeof statuses): never => {
  throw new AsaasWebhookReceptionError(code);
};
const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);
const tag = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Z0-9_]+$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  });
const timestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  .refine(
    (v) =>
      date.safeParse(v.slice(0, 10)).success &&
      Number(v.slice(11, 13)) < 24 &&
      Number(v.slice(14, 16)) < 60 &&
      Number(v.slice(17, 19)) < 60,
  );
const decimal = z.custom<JsonNumber>((v) => v instanceof JsonNumber);
// A recepção conserva ausências e decimais; a regra financeira decide suficiência.
const payment = z.object({
  id: identifier,
  customer: identifier.nullable().optional(),
  externalReference: z.uuid().nullable().optional(),
  value: decimal.nullable().optional(),
  originalValue: decimal.nullable().optional(),
  netValue: decimal.nullable().optional(),
  status: tag.nullable().optional(),
  billingType: tag.nullable().optional(),
  dueDate: date.nullable().optional(),
  deleted: z.boolean().nullable().optional(),
  refunds: z
    .array(
      z.object({
        dateCreated: timestamp.nullable().optional(),
        value: decimal.nullable().optional(),
        status: tag.nullable().optional(),
      }),
    )
    .max(1000)
    .nullable()
    .optional(),
  chargeback: z
    .object({ status: tag.nullable().optional() })
    .nullable()
    .optional(),
});
const envelope = z.object({
  id: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_&-]+$/),
  event: tag,
  dateCreated: timestamp,
  account: z.object({ id: identifier }),
  payment,
});
export type AsaasWebhookConfiguration = Readonly<{
  scope: AsaasScope;
  authToken: string;
}>;
export type AsaasWebhookEnvelope = Readonly<{
  scope: AsaasScope;
  eventId: string;
  eventType: string;
  paymentId: string;
  providerCreatedAt: string;
  minimalBody: string;
  minimalBodyHash: string;
  sourceBodyHash: string;
}>;
const hash = (text: string) => createHash("sha256").update(text).digest();
/** Serializa só a projeção validada, sem converter os tokens decimais em Number. */
function losslessJson(value: unknown): string {
  if (value instanceof JsonNumber) return value.source;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(losslessJson).join(",") + "]";
  return (
    "{" +
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([k, v]) => JSON.stringify(k) + ":" + losslessJson(v))
      .join(",") +
    "}"
  );
}
async function readBoundedBody(request: Request): Promise<string> {
  if (!request.body) return fail("invalid_body");
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^(0|[1-9]\d{0,11})$/.test(length)) return fail("invalid_body");
    if (BigInt(length) > BigInt(ASAAS_WEBHOOK_MAX_BYTES))
      return fail("too_large");
  }
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    return fail("invalid_body");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts: string[] = [];
  let bytes = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new AsaasWebhookReceptionError("read_timeout")),
      READ_TIMEOUT_MS,
    );
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > ASAAS_WEBHOOK_MAX_BYTES) return fail("too_large");
      parts.push(decoder.decode(chunk.value, { stream: true }));
    }
    parts.push(decoder.decode());
    if (length !== null && BigInt(length) !== BigInt(bytes))
      return fail("invalid_body");
    return parts.join("");
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof AsaasWebhookReceptionError) throw error;
    return fail("invalid_body");
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}
/** Configuração vem do servidor; nenhum dado da requisição escolhe conta/ambiente. */
export async function readAuthenticatedAsaasWebhook(
  request: Request,
  configuration: AsaasWebhookConfiguration | null,
): Promise<AsaasWebhookEnvelope> {
  const configuredScope = scopeSchema.safeParse(configuration?.scope);
  const expectedToken = configuration?.authToken;
  if (
    !configuredScope.success ||
    typeof expectedToken !== "string" ||
    expectedToken.length < 32 ||
    expectedToken.length > 255 ||
    /[\s,]/.test(expectedToken)
  )
    return fail("unavailable");
  const actualToken = request.headers.get("asaas-access-token");
  if (
    !actualToken ||
    actualToken.length > 255 ||
    /[\s,]/.test(actualToken) ||
    !timingSafeEqual(hash(actualToken), hash(expectedToken))
  )
    return fail("unauthorized");
  const media = request.headers.get("content-type");
  if (
    !media ||
    !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(media) ||
    ![null, "identity"].includes(request.headers.get("content-encoding"))
  )
    return fail("unsupported_media");
  const body = await readBoundedBody(request);
  let parsed: z.infer<typeof envelope>;
  try {
    parsed = envelope.parse(parseAsaasJson(body));
  } catch {
    return fail("invalid_body");
  }
  if (parsed.account.id !== configuredScope.data.accountId)
    return fail("identity_mismatch");
  const minimalBody = losslessJson(parsed);
  return Object.freeze({
    scope: Object.freeze(configuredScope.data),
    eventId: parsed.id,
    eventType: parsed.event,
    paymentId: parsed.payment.id,
    providerCreatedAt: parsed.dateCreated,
    minimalBody,
    minimalBodyHash: hash(minimalBody).toString("hex"),
    sourceBodyHash: hash(body).toString("hex"),
  });
}
