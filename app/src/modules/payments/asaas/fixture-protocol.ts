import "server-only";
import { createHash } from "node:crypto";
import { centsToken } from "./money";
import type { AsaasScope } from "./contracts";
import type { AsaasFixtureRequest } from "./adapter";
export function fixtureRequest(
  scope: AsaasScope,
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string>,
  bodyText?: string,
): AsaasFixtureRequest {
  const origin =
    scope.environment === "sandbox"
      ? "https://api-sandbox.asaas.com"
      : "https://api.asaas.com";
  const url = new URL("/v3/" + path, origin);
  if (params) url.search = new URLSearchParams(params).toString();
  return Object.freeze({
    mode: "fixture",
    scope,
    method,
    url: url.href,
    ...(bodyText === undefined ? {} : { bodyText }),
  });
}
export function fixtureRequestIdentity(slotId: string, operation: string) {
  const raw = createHash("sha256")
    .update(slotId + ":" + operation)
    .digest("hex");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-5${raw.slice(13, 16)}-8${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
}
export function fixtureRequestFingerprint(request: AsaasFixtureRequest) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: request.scope,
        method: request.method,
        url: request.url,
        bodyText: request.bodyText ?? null,
      }),
    )
    .digest("hex");
}
export function fixtureCustomerGetRequest(
  scope: AsaasScope,
  customerId: string,
) {
  return fixtureRequest(scope, "GET", "customers/" + customerId);
}
export function fixturePaymentBody(input: {
  customerId: string;
  billingType: string;
  contractedCents: number;
  dueDate: string;
  reference: string;
}) {
  return (
    '{"customer":' +
    JSON.stringify(input.customerId) +
    ',"billingType":' +
    JSON.stringify(input.billingType) +
    ',"value":' +
    centsToken(input.contractedCents) +
    ',"dueDate":' +
    JSON.stringify(input.dueDate) +
    ',"externalReference":' +
    JSON.stringify(input.reference) +
    "}"
  );
}
export function fixturePaymentCreateRequest(
  scope: AsaasScope,
  input: Parameters<typeof fixturePaymentBody>[0],
) {
  return fixtureRequest(
    scope,
    "POST",
    "payments",
    undefined,
    fixturePaymentBody(input),
  );
}
export function fixturePaymentFindRequest(
  scope: AsaasScope,
  input: { customerId: string; reference: string },
) {
  return fixtureRequest(scope, "GET", "payments", {
    customer: input.customerId,
    externalReference: input.reference,
    limit: "2",
    offset: "0",
  });
}

export function fixturePaymentGetRequest(scope: AsaasScope, paymentId: string) {
  return fixtureRequest(scope, "GET", "payments/" + paymentId);
}
