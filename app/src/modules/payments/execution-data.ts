import "server-only";
import { z } from "zod";
import { paymentObligationReceiptSchema } from "./obligations";
import {
  readAsaasScope,
  readAsaasCustomerExpectation,
} from "./asaas/contracts";
export const executionId = z.uuid().transform((value) => value.toLowerCase());
export const paymentExecutionViewSchema = z
  .strictObject({
    mode: z.literal("fixture"),
    identityProof: z.literal("fixture_declared"),
    intentId: executionId,
    runId: executionId.nullable(),
    createdBy: executionId,
    currentOwnerId: executionId,
    createdAt: z.iso.datetime({ offset: true }).nullable(),
    state: z.enum([
      "unstarted",
      "pending",
      "held",
      "stopped",
      "identified",
      "resolved",
    ]),
    reason: z
      .enum([
        "context_changed",
        "reservation_missing",
        "unavailable",
        "invalid_observation",
        "not_located",
        "multiple_candidates",
        "incomplete_list",
        "not_dispatched",
        "indeterminate",
        "financial_reconciliation",
        "identity_changed",
        "no_dispatch_proven",
      ])
      .nullable(),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    dispatchClaimed: z.boolean(),
    reservationActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (
      (v.state === "unstarted") !== (v.runId === null) ||
      (v.runId === null) !== (v.createdAt === null) ||
      (v.state === "unstarted" && (v.reason !== null || v.revision !== 0)) ||
      (v.state === "pending" && v.reason !== null) ||
      (v.state === "held" && v.reason === null) ||
      (v.state === "identified" &&
        (v.reason !== null || !v.reservationActive)) ||
      (v.state === "resolved" &&
        (v.reason !== "no_dispatch_proven" ||
          !v.dispatchClaimed ||
          v.reservationActive)) ||
      (v.state !== "resolved" && v.reason === "no_dispatch_proven") ||
      (v.state === "stopped" &&
        (v.reason !== "reservation_missing" || v.reservationActive))
    )
      ctx.addIssue({ code: "custom", message: "Execução indisponível." });
  });
// O contrato historico de S permanece acima. Somente views atuais admitem
// o journal financeiro, sem transformar recibos antigos.
export const currentPaymentExecutionViewSchema = z.union([
  paymentExecutionViewSchema,
  z.strictObject({
    ...paymentExecutionViewSchema.shape,
    runId: executionId,
    createdAt: z.iso.datetime({ offset: true }),
    state: z.literal("resolved"),
    reason: z.enum(["financial_received", "financial_refunded"]),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    dispatchClaimed: z.literal(true),
    reservationActive: z.literal(false),
  }),
]);
const stepSchema = z
  .strictObject({
    id: executionId,
    runId: executionId,
    workerId: executionId,
    requestId: executionId,
    intentId: executionId,
    action: z.enum(["create", "find"]),
    scopeId: executionId,
    clientId: executionId,
    scope: z.unknown().transform(readAsaasScope),
    snapshot: z.strictObject({
      obligation: paymentObligationReceiptSchema.shape.snapshot,
      customer: z.strictObject({
        kind: z.enum(["person", "company"]),
        document: z.string(),
      }),
    }),
  })
  .superRefine((step, ctx) => {
    const o = step.snapshot.obligation,
      b = o.binding;
    if (
      o.status !== "ready" ||
      !b ||
      b.scopeId !== step.scopeId ||
      b.clientId !== step.clientId ||
      o.clientId !== step.clientId ||
      step.scope.environment !== "sandbox" ||
      b.scope.accountId !== step.scope.accountId ||
      b.scope.environment !== step.scope.environment ||
      b.scope.walletId !== step.scope.walletId
    )
      ctx.addIssue({ code: "custom", message: "Etapa indisponível." });
    if (b)
      try {
        readAsaasCustomerExpectation({
          scope: step.scope,
          customerId: b.customerId,
          clientId: step.clientId,
          kind: step.snapshot.customer.kind,
          document: step.snapshot.customer.document,
        });
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Cliente fictício indisponível.",
        });
      }
  });
export const paymentExecutionClaimSchema = z
  .strictObject({
    requestId: executionId,
    view: currentPaymentExecutionViewSchema,
    step: stepSchema.nullable(),
  })
  .superRefine((v, ctx) => {
    if (
      v.step &&
      (v.view.runId !== v.step.runId ||
        v.view.intentId !== v.step.intentId ||
        v.view.state !== "pending" ||
        v.step.requestId !== v.requestId ||
        !v.view.reservationActive ||
        (v.step.action === "create" && v.view.dispatchClaimed))
    )
      ctx.addIssue({ code: "custom", message: "Execução indisponível." });
  });
export const paymentExecutionStartSchema = z.strictObject({
  stepId: executionId,
  workerId: executionId,
});
