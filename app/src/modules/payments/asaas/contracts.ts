import "server-only";
import { z } from "zod";
import { normalizeDocument, validCnpj, validCpf } from "@/lib/documents";
import { brazilMobile } from "@/lib/brazil";
import { AsaasContractError } from "./errors";
import { JsonNumber, parseAsaasJson } from "./json";
import { providerCents } from "./money";

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
const accountId = identifier.brand<"AsaasAccountId">();
const walletId = identifier.brand<"AsaasWalletId">();
const customerId = identifier.brand<"AsaasCustomerId">();
const paymentId = identifier.brand<"AsaasPaymentId">();
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const monetary = z.unknown().transform((value) => providerCents(value));
const signedMonetary = z
  .unknown()
  .transform((value) => providerCents(value, { signed: true }));

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T00:00:00Z");
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  });
// Mantido como texto do provedor; não inventar UTC ou conversão de fuso.
const providerTimestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  .refine(
    (value) =>
      calendarDate.safeParse(value.slice(0, 10)).success &&
      Number(value.slice(11, 13)) < 24 &&
      Number(value.slice(14, 16)) < 60 &&
      Number(value.slice(17, 19)) < 60,
  );
const canonicalDocument = z
  .string()
  .refine(
    (value) =>
      value === normalizeDocument(value) &&
      (validCpf(value) || validCnpj(value)),
  );

/** IDs diferentes: uma carteira não comprova o ID da conta emissora. */
const scopeSchema = z.strictObject({
  provider: z.literal("asaas"),
  environment: z.enum(["sandbox", "production"]),
  accountId,
  walletId: walletId.optional(),
});
export type AsaasScope = Readonly<z.infer<typeof scopeSchema>>;
export type AsaasAccountId = z.infer<typeof accountId>;
export type AsaasWalletId = z.infer<typeof walletId>;

const customerInputSchema = z
  .strictObject({
    clientId: z.uuid(),
    kind: z.enum(["person", "company"]),
    name: z.string().refine((value) => {
      if (value.length > 400 || value !== value.trim()) return false;
      const points = [...value].length;
      return points >= 3 && points <= 200;
    }),
    document: canonicalDocument,
    email: z.email().max(254).optional(),
    phone: z
      .string()
      .refine((value) => brazilMobile(value) === value)
      .optional(),
  })
  .refine((value) =>
    value.kind === "person"
      ? validCpf(value.document)
      : validCnpj(value.document),
  );
export type AsaasCustomerInput = Readonly<z.infer<typeof customerInputSchema>>;

const customerExpectationSchema = z
  .strictObject({
    scope: scopeSchema,
    customerId: customerId.optional(),
    clientId: z.uuid(),
    kind: z.enum(["person", "company"]),
    document: canonicalDocument,
  })
  .refine((value) =>
    value.kind === "person"
      ? validCpf(value.document)
      : validCnpj(value.document),
  );
const customerWireSchema = z.object({
  id: customerId,
  cpfCnpj: z.string().transform(normalizeDocument).pipe(canonicalDocument),
  externalReference: z.uuid(),
  notificationDisabled: z.boolean().optional(),
});

const paymentExpectationSchema = z
  .strictObject({
    scope: scopeSchema,
    phase: z.enum(["creation", "observation"]),
    paymentId: paymentId.optional(),
    customerId,
    reference: z.uuid(),
    contractedCents: cents.positive(),
    dueDate: calendarDate.optional(),
    billingType: tag.optional(),
  })
  .refine(
    (value) => value.phase === "creation" || value.paymentId !== undefined,
  );
export type AsaasPaymentExpectation = Readonly<
  z.infer<typeof paymentExpectationSchema>
>;

const refundSchema = z.object({
  dateCreated: providerTimestamp,
  value: monetary.refine((value) => value > 0),
  status: tag,
});
const paymentWireSchema = z.object({
  id: paymentId,
  customer: customerId,
  externalReference: z.uuid(),
  value: monetary.refine((value) => value > 0),
  originalValue: monetary
    .refine((value) => value > 0)
    .nullable()
    .optional(),
  netValue: signedMonetary.nullable().optional(),
  status: tag,
  billingType: tag,
  dueDate: calendarDate,
  deleted: z.boolean(),
  invoiceUrl: z.string().max(2048).nullable().optional(),
  refunds: z.array(refundSchema).max(1000).nullable().optional(),
  chargeback: z.object({ status: tag }).nullable().optional(),
});
const eventSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_&-]+$/),
  event: tag,
  dateCreated: providerTimestamp,
  account: z.object({ id: accountId }),
  payment: z.unknown(),
});

function read<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AsaasContractError("invalid_data");
  return result.data;
}
export function readAsaasScope(value: unknown): AsaasScope {
  return Object.freeze(read(scopeSchema, value));
}
export function readAsaasCustomerInput(value: unknown): AsaasCustomerInput {
  return Object.freeze(read(customerInputSchema, value));
}
function equalScope(source: unknown, expected: AsaasScope) {
  const actual = readAsaasScope(source);
  if (
    actual.accountId !== expected.accountId ||
    actual.environment !== expected.environment ||
    actual.walletId !== expected.walletId
  )
    throw new AsaasContractError("identity_mismatch");
}

export function readAsaasCustomerExpectation(value: unknown) {
  const expected = read(customerExpectationSchema, value);
  return Object.freeze({ ...expected, scope: readAsaasScope(expected.scope) });
}
export function readAsaasPaymentExpectation(value: unknown) {
  const expected = read(paymentExpectationSchema, value);
  return Object.freeze({ ...expected, scope: readAsaasScope(expected.scope) });
}
function customerObservation(
  value: unknown,
  expected: z.infer<typeof customerExpectationSchema>,
) {
  const customer = read(customerWireSchema, value);
  if (
    (expected.customerId !== undefined &&
      customer.id !== expected.customerId) ||
    customer.externalReference !== expected.clientId ||
    customer.cpfCnpj !== expected.document
  )
    throw new AsaasContractError("identity_mismatch");
  return Object.freeze({
    scope: readAsaasScope(expected.scope),
    customerId: customer.id,
    clientId: customer.externalReference,
    kind: expected.kind,
    document: customer.cpfCnpj,
    notificationDisabled: customer.notificationDisabled ?? null,
  });
}
export type AsaasCustomerObservation = ReturnType<typeof customerObservation>;
export function readAsaasCustomer(
  text: string,
  sourceScope: unknown,
  expectedInput: unknown,
) {
  const expected = readAsaasCustomerExpectation(expectedInput);
  equalScope(sourceScope, expected.scope);
  return customerObservation(parseAsaasJson(text), expected);
}

function invoiceUrl(value: string | null | undefined, scope: AsaasScope) {
  if (value == null) return null;
  try {
    const url = new URL(value);
    const origin =
      scope.environment === "sandbox"
        ? "https://sandbox.asaas.com"
        : "https://www.asaas.com";
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/i\/[A-Za-z0-9_-]+$/.test(url.pathname)
    )
      throw new Error();
    return url.href;
  } catch {
    throw new AsaasContractError("invalid_data");
  }
}

function fieldPresence(
  value: unknown,
): "missing" | "null" | "empty" | "present" {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value) && value.length === 0) return "empty";
  return "present";
}

function paymentObservation(
  value: unknown,
  expected: z.infer<typeof paymentExpectationSchema>,
) {
  const payment = read(paymentWireSchema, value);
  if (
    (expected.paymentId !== undefined && payment.id !== expected.paymentId) ||
    payment.customer !== expected.customerId ||
    payment.externalReference !== expected.reference ||
    (expected.dueDate !== undefined && payment.dueDate !== expected.dueDate) ||
    (expected.billingType !== undefined &&
      payment.billingType !== expected.billingType) ||
    (payment.originalValue ?? payment.value) !== expected.contractedCents ||
    (expected.phase === "creation" &&
      payment.value !== expected.contractedCents)
  )
    throw new AsaasContractError("obligation_mismatch");
  return Object.freeze({
    scope: readAsaasScope(expected.scope),
    phase: expected.phase,
    paymentId: payment.id,
    customerId: payment.customer,
    reference: payment.externalReference,
    contractedCents: expected.contractedCents,
    valueCents: payment.value,
    providerOriginalCents: payment.originalValue ?? null,
    netCents: payment.netValue ?? null,
    presence: Object.freeze({
      originalValue: fieldPresence(payment.originalValue),
      netValue: fieldPresence(payment.netValue),
      refunds: fieldPresence(payment.refunds),
      chargeback: fieldPresence(payment.chargeback),
    }),
    status: payment.status,
    billingType: payment.billingType,
    dueDate: payment.dueDate,
    deleted: payment.deleted,
    invoiceUrl: invoiceUrl(payment.invoiceUrl, expected.scope),
    refunds:
      payment.refunds == null
        ? null
        : Object.freeze(
            payment.refunds.map((refund) =>
              Object.freeze({
                valueCents: refund.value,
                status: refund.status,
                providerCreatedAt: refund.dateCreated,
              }),
            ),
          ),
    chargeback:
      payment.chargeback == null
        ? null
        : Object.freeze({ status: payment.chargeback.status }),
  });
}
export type AsaasPaymentObservation = ReturnType<typeof paymentObservation>;

export function readAsaasPayment(
  text: string,
  sourceScope: unknown,
  expectedInput: unknown,
) {
  const expected = read(paymentExpectationSchema, expectedInput);
  equalScope(sourceScope, expected.scope);
  return paymentObservation(parseAsaasJson(text), expected);
}
export function readAsaasEvent(
  text: string,
  sourceScope: unknown,
  expectedInput: unknown,
) {
  const expected = read(paymentExpectationSchema, expectedInput);
  equalScope(sourceScope, expected.scope);
  if (expected.phase !== "observation")
    throw new AsaasContractError("invalid_data");
  const event = read(eventSchema, parseAsaasJson(text));
  if (event.account.id !== expected.scope.accountId)
    throw new AsaasContractError("identity_mismatch");
  return Object.freeze({
    eventId: event.id,
    eventType: event.event,
    declaredAccountId: event.account.id,
    providerCreatedAt: event.dateCreated,
    payment: paymentObservation(event.payment, expected),
  });
}

// Busca de unicidade usa apenas a primeira página com limit=2. Nunca seleciona
// o primeiro registro de um conjunto incompleto nem arredonda totalCount.
const listInteger = z.unknown().transform((value) => {
  if (
    !(value instanceof JsonNumber) ||
    !/^(0|[1-9]\d{0,15})$/.test(value.source)
  )
    throw new AsaasContractError("invalid_data");
  const integer = BigInt(value.source);
  if (integer > BigInt(Number.MAX_SAFE_INTEGER))
    throw new AsaasContractError("invalid_data");
  return Number(integer);
});
const listSchema = z
  .object({
    object: z.literal("list"),
    offset: listInteger.refine((value) => value === 0),
    limit: listInteger.refine((value) => value === 2),
    totalCount: listInteger,
    hasMore: z.boolean(),
    data: z.array(z.unknown()).max(2),
  })
  .refine((value) =>
    value.hasMore
      ? value.data.length === 2 && value.totalCount > 2
      : value.totalCount === value.data.length,
  );
const paymentSearchSchema = z.strictObject({
  scope: scopeSchema,
  customerId,
  reference: z.uuid(),
  contractedCents: cents.positive(),
  dueDate: calendarDate.optional(),
  billingType: tag.optional(),
});
export function readAsaasPaymentSearch(value: unknown) {
  const expected = read(paymentSearchSchema, value);
  return Object.freeze({ ...expected, scope: readAsaasScope(expected.scope) });
}
export function readAsaasCustomerCandidates(
  text: string,
  sourceScope: unknown,
  expectedInput: unknown,
) {
  const expected = readAsaasCustomerExpectation(expectedInput);
  equalScope(sourceScope, expected.scope);
  const list = read(listSchema, parseAsaasJson(text));
  const items = list.data.map((value) => customerObservation(value, expected));
  if (new Set(items.map((value) => value.customerId)).size !== items.length)
    throw new AsaasContractError("invalid_data");
  return Object.freeze({
    hasMore: list.hasMore,
    totalCount: list.totalCount,
    items: Object.freeze(items),
  });
}
export function readAsaasPaymentCandidates(
  text: string,
  sourceScope: unknown,
  expectedInput: unknown,
) {
  const expected = readAsaasPaymentSearch(expectedInput);
  equalScope(sourceScope, expected.scope);
  const list = read(listSchema, parseAsaasJson(text));
  const items = list.data.map((value) => {
    const payment = read(paymentWireSchema, value);
    return paymentObservation(value, {
      ...expected,
      phase: "observation",
      paymentId: payment.id,
    });
  });
  if (new Set(items.map((value) => value.paymentId)).size !== items.length)
    throw new AsaasContractError("invalid_data");
  return Object.freeze({
    hasMore: list.hasMore,
    totalCount: list.totalCount,
    items: Object.freeze(items),
  });
}
