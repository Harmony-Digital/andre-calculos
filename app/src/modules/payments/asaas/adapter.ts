import "server-only";
import { z } from "zod";
import {
  readAsaasScope,
  readAsaasCustomerInput,
  readAsaasCustomerExpectation,
  readAsaasPaymentExpectation,
  readAsaasPaymentSearch,
  readAsaasCustomer,
  readAsaasPayment,
  readAsaasCustomerCandidates,
  readAsaasPaymentCandidates,
  type AsaasScope,
  type AsaasCustomerObservation,
  type AsaasPaymentObservation,
} from "./contracts";
import { AsaasContractError } from "./errors";
import {
  fixtureRequest,
  fixtureCustomerGetRequest,
  fixturePaymentCreateRequest,
  fixturePaymentFindRequest,
} from "./fixture-protocol";

export type AsaasFixtureRequest = Readonly<{
  mode: "fixture";
  scope: AsaasScope;
  method: "GET" | "POST";
  url: string;
  bodyText?: string;
}>;
export type AsaasFixturePort = Readonly<{
  mode: "fixture";
  scope: AsaasScope;
  capabilities: Readonly<{
    alphanumericCnpj: "supported" | "unsupported" | "unverified";
  }>;
  send: (request: AsaasFixtureRequest) => Promise<unknown>;
}>;
const scopeSchema = z.unknown().transform(readAsaasScope);
const portSchema = z.strictObject({
  mode: z.literal("fixture"),
  scope: scopeSchema,
  capabilities: z.strictObject({
    alphanumericCnpj: z.enum(["supported", "unsupported", "unverified"]),
  }),
  send: z.custom<AsaasFixturePort["send"]>(
    (value) => typeof value === "function",
  ),
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
const paymentInputSchema = z.strictObject({
  customer: z.unknown().transform(readAsaasCustomerExpectation),
  reference: z.uuid(),
  contractedCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  dueDate: z.string(),
  billingType: z.enum(["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"]),
});

type FixtureProof = Readonly<{
  mode: "fixture";
  identityProof: "fixture_declared";
}>;
type Reason =
  | "unavailable"
  | "not_located"
  | "multiple_candidates"
  | "incomplete_list"
  | "invoice_unavailable";
export type AsaasFixtureRead<T> = FixtureProof &
  (
    | Readonly<{ kind: "observed"; value: T }>
    | Readonly<{ kind: "reconcile"; reason: Reason }>
  );
export type AsaasFixtureCreation<T> = FixtureProof &
  (
    | Readonly<{ kind: "created"; value: T }>
    | Readonly<{ kind: "not_dispatched" }>
    | Readonly<{ kind: "indeterminate" }>
  );
function result<T extends object>(value: T): Readonly<T> & FixtureProof {
  return Object.freeze({
    ...value,
    mode: "fixture" as const,
    identityProof: "fixture_declared" as const,
  });
}
function read<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AsaasContractError("invalid_data");
  return parsed.data;
}
function matchScope(source: unknown, expected: AsaasScope) {
  const actual = readAsaasScope(source);
  if (
    actual.accountId !== expected.accountId ||
    actual.environment !== expected.environment ||
    actual.walletId !== expected.walletId
  )
    throw new AsaasContractError("identity_mismatch");
}

/** Porta exclusivamente fictícia. Não autentica conta nem executa HTTP. */
export function createAsaasFixtureAdapter(
  expectedScope: unknown,
  portInput: unknown,
) {
  const scope = readAsaasScope(expectedScope);
  const parsed = read(portSchema, portInput);
  matchScope(parsed.scope, scope);
  const capabilities = Object.freeze({ ...parsed.capabilities });
  const send = parsed.send;
  function documentSupported(document: string) {
    if (/[A-Z]/.test(document) && capabilities.alphanumericCnpj !== "supported")
      throw new AsaasContractError("invalid_data");
  }
  function request(
    method: "GET" | "POST",
    path: string,
    params?: Record<string, string>,
    bodyText?: string,
  ): AsaasFixtureRequest {
    return fixtureRequest(scope, method, path, params, bodyText);
  }

  async function dispatch(input: AsaasFixtureRequest) {
    try {
      const outcome = read(outcomeSchema, await send(input));
      matchScope(outcome.scope, scope);
      return outcome;
    } catch {
      // Não ler mensagem/cause/code da exceção para inferir despacho ou logar PII.
      return { kind: "indeterminate" as const, scope };
    }
  }
  async function observe<T>(
    input: AsaasFixtureRequest,
    decode: (text: string) => T,
  ): Promise<AsaasFixtureRead<T>> {
    const outcome = await dispatch(input);
    if (outcome.kind !== "response" || outcome.status !== 200)
      return result({ kind: "reconcile", reason: "unavailable" });
    try {
      return result({ kind: "observed", value: decode(outcome.bodyText) });
    } catch {
      return result({ kind: "reconcile", reason: "unavailable" });
    }
  }
  async function create<T>(
    input: AsaasFixtureRequest,
    decode: (text: string) => T,
  ): Promise<AsaasFixtureCreation<T>> {
    // Exatamente um POST por invocação; não confundir com idempotência persistida.
    const outcome = await dispatch(input);
    if (outcome.kind === "not_dispatched")
      return result({ kind: "not_dispatched" });
    if (outcome.kind !== "response" || outcome.status !== 200)
      return result({ kind: "indeterminate" });
    try {
      return result({ kind: "created", value: decode(outcome.bodyText) });
    } catch {
      return result({ kind: "indeterminate" });
    }
  }
  function customerExpectation(value: unknown, requireId: boolean) {
    const expected = readAsaasCustomerExpectation(value);
    matchScope(expected.scope, scope);
    documentSupported(expected.document);
    if (requireId && expected.customerId === undefined)
      throw new AsaasContractError("invalid_data");
    if (!requireId && expected.customerId !== undefined)
      throw new AsaasContractError("invalid_data");
    return expected;
  }
  async function getCustomer(
    value: unknown,
  ): Promise<AsaasFixtureRead<AsaasCustomerObservation>> {
    const expected = customerExpectation(value, true);
    return observe(
      fixtureCustomerGetRequest(scope, expected.customerId!),
      (text) => readAsaasCustomer(text, scope, expected),
    );
  }
  function paymentExpectation(value: unknown) {
    const expected = readAsaasPaymentExpectation(value);
    matchScope(expected.scope, scope);
    if (expected.phase !== "observation")
      throw new AsaasContractError("invalid_data");
    return expected;
  }
  async function getPayment(
    value: unknown,
  ): Promise<AsaasFixtureRead<AsaasPaymentObservation>> {
    const expected = paymentExpectation(value);
    return observe(request("GET", "payments/" + expected.paymentId), (text) =>
      readAsaasPayment(text, scope, expected),
    );
  }
  function unique<T>(
    page: AsaasFixtureRead<
      Readonly<{ hasMore: boolean; totalCount: number; items: readonly T[] }>
    >,
  ): AsaasFixtureRead<T> {
    if (page.kind === "reconcile") return page;
    if (page.value.hasMore)
      return result({ kind: "reconcile", reason: "incomplete_list" });
    if (page.value.items.length === 0)
      return result({ kind: "reconcile", reason: "not_located" });
    if (page.value.items.length !== 1)
      return result({ kind: "reconcile", reason: "multiple_candidates" });
    return result({ kind: "observed", value: page.value.items[0] });
  }
  return Object.freeze({
    mode: "fixture" as const,
    identityProof: "fixture_declared" as const,
    scope,
    capabilities,
    getCustomer,
    getPayment,
    async createCustomer(
      value: unknown,
    ): Promise<AsaasFixtureCreation<AsaasCustomerObservation>> {
      const input = readAsaasCustomerInput(value);
      documentSupported(input.document);
      const expected = {
        scope,
        clientId: input.clientId,
        kind: input.kind,
        document: input.document,
      };
      const bodyText = JSON.stringify({
        name: input.name,
        cpfCnpj: input.document,
        externalReference: input.clientId,
        notificationDisabled: true,
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.phone === undefined
          ? {}
          : { mobilePhone: input.phone.slice(3) }),
      });
      return create(
        request("POST", "customers", undefined, bodyText),
        (text) => {
          const observed = readAsaasCustomer(text, scope, expected);
          if (observed.notificationDisabled !== true)
            throw new AsaasContractError("invalid_data");
          return observed;
        },
      );
    },
    async findCustomer(value: unknown) {
      const expected = customerExpectation(value, false);
      const page = await observe(
        request("GET", "customers", {
          externalReference: expected.clientId,
          cpfCnpj: expected.document,
          limit: "2",
          offset: "0",
        }),
        (text) => readAsaasCustomerCandidates(text, scope, expected),
      );
      return unique(page);
    },
    async createPayment(
      value: unknown,
    ): Promise<AsaasFixtureCreation<AsaasPaymentObservation>> {
      const input = read(paymentInputSchema, value);
      const customer = customerExpectation(input.customer, true);
      const expected = readAsaasPaymentExpectation({
        scope,
        phase: "creation",
        customerId: customer.customerId,
        reference: input.reference,
        contractedCents: input.contractedCents,
        dueDate: input.dueDate,
        billingType: input.billingType,
      });
      const observedCustomer = await getCustomer(customer);
      if (
        observedCustomer.kind !== "observed" ||
        observedCustomer.value.notificationDisabled !== true
      )
        return result({ kind: "not_dispatched" });
      return create(
        fixturePaymentCreateRequest(scope, {
          customerId: expected.customerId,
          reference: input.reference,
          contractedCents: input.contractedCents,
          dueDate: input.dueDate,
          billingType: input.billingType,
        }),
        (text) => {
          const observed = readAsaasPayment(text, scope, expected);
          if (observed.deleted) throw new AsaasContractError("invalid_data");
          return observed;
        },
      );
    },
    async findPayment(value: unknown) {
      const expected = readAsaasPaymentSearch(value);
      matchScope(expected.scope, scope);
      const page = await observe(
        fixturePaymentFindRequest(scope, expected),
        (text) => readAsaasPaymentCandidates(text, scope, expected),
      );
      return unique(page);
    },
    async getInvoice(value: unknown): Promise<AsaasFixtureRead<string>> {
      const expected = paymentExpectation(value);
      if (
        expected.dueDate === undefined ||
        expected.billingType === undefined ||
        !["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"].includes(
          expected.billingType,
        )
      )
        throw new AsaasContractError("invalid_data");
      const payment = await getPayment(expected);
      if (payment.kind === "reconcile") return payment;
      // Disponibilidade da fatura não confirma pagamento. A autorização do
      // advogado pertence ao caso de uso servidor, ainda não ligado à porta.
      if (
        payment.value.deleted ||
        payment.value.valueCents !== payment.value.contractedCents ||
        payment.value.status !== "PENDING" ||
        payment.value.invoiceUrl === null ||
        (payment.value.refunds !== null && payment.value.refunds.length > 0) ||
        payment.value.chargeback !== null
      )
        return result({ kind: "reconcile", reason: "invoice_unavailable" });
      return result({ kind: "observed", value: payment.value.invoiceUrl });
    },
  });
}
