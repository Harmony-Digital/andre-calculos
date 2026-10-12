import "server-only";
import type { z } from "zod";
import type { paymentExecutionClaimSchema } from "./execution-data";
import {
  fixtureCustomerGetRequest,
  fixturePaymentCreateRequest,
  fixturePaymentFindRequest,
  fixtureRequestIdentity,
  fixtureRequestFingerprint,
} from "./asaas/fixture-protocol";
type Step = NonNullable<z.infer<typeof paymentExecutionClaimSchema>["step"]>;
export function executionProtocols(step: Step) {
  const o = step.snapshot.obligation,
    b = o.binding;
  if (!b || o.remainingCents === null)
    throw new Error("Protocolo indisponível.");
  const input = {
    customerId: b.customerId,
    reference: step.intentId,
    contractedCents: o.remainingCents,
    billingType: o.billingType,
    dueDate: o.dueDate,
  };
  const entries =
    step.action === "create"
      ? [
          {
            operation: "customer_get",
            request: fixtureCustomerGetRequest(step.scope, b.customerId),
            payload: { customerId: b.customerId },
          },
          {
            operation: "payment_create",
            request: fixturePaymentCreateRequest(step.scope, input),
            payload: {
              customerId: b.customerId,
              reference: step.intentId,
              amountCents: o.remainingCents,
              billingType: o.billingType,
              dueDate: o.dueDate,
            },
          },
        ]
      : [
          {
            operation: "payment_find",
            request: fixturePaymentFindRequest(step.scope, input),
            payload: { customerId: b.customerId, reference: step.intentId },
          },
        ];
  return entries.map((entry) => ({
    operation: entry.operation,
    version: 1,
    requestId: fixtureRequestIdentity(step.id, entry.operation),
    fingerprint: fixtureRequestFingerprint(entry.request),
    payload: entry.payload,
  }));
}
