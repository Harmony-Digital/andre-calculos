import "server-only";
import { z } from "zod";
import { readAsaasScope, readAsaasCustomerInput } from "./asaas/contracts";
export const id = z.uuid().transform((value) => value.toLowerCase());
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export const customerBootstrapViewSchema = z.strictObject({
  mode: z.literal("fixture"),
  identityProof: z.literal("fixture_declared"),
  requestId: id,
  clientId: id,
  currentOwnerId: id,
  createdBy: id,
  createdAt: z.iso.datetime({ offset: true }),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  state: z.enum(["pending", "ready_to_create", "held", "bound"]),
  reason: z
    .enum([
      "context_changed",
      "binding_changed",
      "unavailable",
      "not_located",
      "multiple_candidates",
      "incomplete_list",
      "not_dispatched",
      "indeterminate",
    ])
    .nullable(),
});
export const customerBootstrapInputSchema = z.strictObject({
  clientId: id,
  requestId: id,
});
const stepSchema = z
  .strictObject({
    id,
    workerId: id,
    requestId: id,
    action: z.enum(["find", "get", "create"]),
    scopeId: id,
    clientId: id,
    scope: z.unknown().transform(readAsaasScope),
    kind: z.enum(["person", "company"]),
    document: z.string(),
    name: z.string(),
    customerId: identifier.nullable(),
  })
  .superRefine((step, ctx) => {
    try {
      readAsaasCustomerInput({
        clientId: step.clientId,
        kind: step.kind,
        document: step.document,
        name: step.name,
      });
    } catch {
      ctx.addIssue({ code: "custom", message: "Cliente fictício inválido." });
    }
    if (
      step.scope.environment !== "sandbox" ||
      (step.action === "get") !== (step.customerId !== null)
    )
      ctx.addIssue({ code: "custom", message: "Etapa fictícia inválida." });
  });
export const claimSchema = z.strictObject({
  view: customerBootstrapViewSchema,
  step: stepSchema.nullable(),
});
