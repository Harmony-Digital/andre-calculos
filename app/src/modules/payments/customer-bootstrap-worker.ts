import "server-only";
import { randomUUID } from "node:crypto";
import { createSystemClient } from "@/lib/supabase/admin";
import { createAsaasFixtureAdapter } from "./asaas/adapter";
import { createDurableAsaasFixturePort } from "./asaas/fixture-port";
import {
  id,
  claimSchema,
  customerBootstrapViewSchema,
} from "./customer-bootstrap-data";
const unavailable = "Vínculo do cliente indisponível.";
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
/** Um passo por execução, com claim/start consumíveis. Não aceita resultado nem transporte livre. */
export async function advanceFixturePaymentCustomer(requestId: string) {
  requireLocal();
  try {
    const target = id.parse(requestId),
      workerId = randomUUID(),
      db = createSystemClient();
    const r = await db.rpc("claim_payment_customer_step", {
      target_request: target,
      worker_id: workerId,
    });
    const claim = claimSchema.parse(r.data);
    if (r.error || claim.view.requestId !== target)
      throw new Error(unavailable);
    const step = claim.step;
    if (!step) return claim.view;
    if (
      step.requestId !== target ||
      step.workerId !== workerId ||
      step.clientId !== claim.view.clientId
    )
      throw new Error(unavailable);
    const start = await db.rpc("start_payment_customer_step", {
      target_step: step.id,
      worker_id: workerId,
    });
    if (start.error || start.data !== true) throw new Error(unavailable);
    requireLocal();
    try {
      const port = await createDurableAsaasFixturePort({
        scopeId: step.scopeId,
        clientId: step.clientId,
        slotId: step.id,
      });
      if (
        port.scope.accountId !== step.scope.accountId ||
        port.scope.environment !== step.scope.environment ||
        port.scope.walletId !== step.scope.walletId
      )
        throw new Error(unavailable);
      const adapter = createAsaasFixtureAdapter(step.scope, port);
      const expected = {
        scope: step.scope,
        clientId: step.clientId,
        kind: step.kind,
        document: step.document,
      };
      if (step.action === "create")
        await adapter.createCustomer({
          clientId: step.clientId,
          kind: step.kind,
          document: step.document,
          name: step.name,
        });
      else if (step.action === "get")
        await adapter.getCustomer({ ...expected, customerId: step.customerId });
      else await adapter.findCustomer(expected);
    } catch {
      /* Sem recibo, a finalização mantém pendência; não infere ausência de despacho. */
    }
    requireLocal();
    const finished = await db.rpc("finish_payment_customer_step", {
      target_step: step.id,
      worker_id: workerId,
    });
    const view = customerBootstrapViewSchema.parse(finished.data);
    if (
      finished.error ||
      view.requestId !== target ||
      view.clientId !== step.clientId
    )
      throw new Error(unavailable);
    return view;
  } catch {
    throw new Error(unavailable);
  }
}
