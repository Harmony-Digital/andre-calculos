import "server-only";
import { createHash } from "node:crypto";
import { createSystemClient } from "@/lib/supabase/admin";
import {
  allocateFixturePaymentExecution,
  startFixturePaymentExecution,
} from "./execution-system";
import { paymentExecutionViewSchema } from "./execution-data";
import {
  createDurableAsaasFixturePort,
  getDurableFixtureTransportReceipt,
} from "./asaas/fixture-port";
import { createAsaasFixtureAdapter } from "./asaas/adapter";
import {
  readAsaasPayment,
  readAsaasPaymentCandidates,
} from "./asaas/contracts";
import { normalizeValidatedAsaasPaymentObservation } from "./asaas/financial";
import { executionProtocols } from "./execution-protocol";
import type { Json } from "@/lib/supabase/database.types";
const unavailable = "Execução fictícia indisponível.";
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
/** Um passo de transporte. Todo reinício após start utiliza somente consulta. */
export async function advanceFixturePaymentExecution(requestId: string) {
  requireLocal();
  try {
    const claim = await allocateFixturePaymentExecution(requestId),
      step = claim.step;
    if (!step) return claim.view;
    if (
      !(await startFixturePaymentExecution({
        stepId: step.id,
        workerId: step.workerId,
      }))
    )
      throw new Error(unavailable);
    const o = step.snapshot.obligation,
      b = o.binding!;
    const search = {
      scope: step.scope,
      customerId: b.customerId,
      reference: step.intentId,
      contractedCents: o.remainingCents!,
      dueDate: o.dueDate,
      ...(o.billingType === "UNDEFINED" ? {} : { billingType: o.billingType }),
    };
    try {
      const port = await createDurableAsaasFixturePort({
        scopeId: step.scopeId,
        clientId: step.clientId,
        slotId: step.id,
      });
      const adapter = createAsaasFixtureAdapter(step.scope, port);
      if (step.action === "create")
        await adapter.createPayment({
          customer: {
            scope: step.scope,
            customerId: b.customerId,
            clientId: step.clientId,
            ...step.snapshot.customer,
          },
          reference: step.intentId,
          contractedCents: o.remainingCents!,
          billingType: o.billingType,
          dueDate: o.dueDate,
        });
      else await adapter.findPayment(search);
    } catch {
      /* Ausência de recibo não prova ausência de envio. */
    }
    requireLocal();
    let facts: ReturnType<
        typeof normalizeValidatedAsaasPaymentObservation
      > | null = null,
      hash: string | null = null;
    try {
      const protocol = executionProtocols(step).find(
        (p) =>
          p.operation ===
          (step.action === "create" ? "payment_create" : "payment_find"),
      )!;
      const receipt = await getDurableFixtureTransportReceipt({
        scopeId: step.scopeId,
        clientId: step.clientId,
        slotId: step.id,
        operation: protocol.operation,
      });
      if (
        receipt &&
        receipt.requestId === protocol.requestId &&
        receipt.fingerprint === protocol.fingerprint &&
        receipt.outcome.kind === "response" &&
        receipt.outcome.status === 200
      ) {
        let observed;
        if (step.action === "create")
          observed = readAsaasPayment(receipt.outcome.bodyText, step.scope, {
            ...search,
            phase: "creation",
            billingType: o.billingType,
          });
        else {
          const page = readAsaasPaymentCandidates(
            receipt.outcome.bodyText,
            step.scope,
            search,
          );
          if (!page.hasMore && page.totalCount === 1 && page.items.length === 1)
            observed = page.items[0];
        }
        if (observed) {
          facts = normalizeValidatedAsaasPaymentObservation(
            observed,
            o.billingType,
          );
          hash = createHash("sha256")
            .update(receipt.outcome.bodyText)
            .digest("hex");
        }
      }
    } catch {
      facts = null;
      hash = null;
    }
    requireLocal();
    const db = createSystemClient(),
      r = await db.rpc("finish_payment_execution_step", {
        target_step: step.id,
        worker_id: step.workerId,
        body_hash: hash,
        normalizer_version: 1,
        facts: facts as unknown as Json,
      });
    const view = paymentExecutionViewSchema.parse(r.data);
    if (r.error || view.intentId !== step.intentId || view.runId !== step.runId)
      throw new Error(unavailable);
    return view;
  } catch {
    throw new Error(unavailable);
  }
}
