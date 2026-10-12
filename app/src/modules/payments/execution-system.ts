import "server-only";
import { randomUUID } from "node:crypto";
import { createSystemClient } from "@/lib/supabase/admin";
import {
  executionId,
  paymentExecutionClaimSchema,
  paymentExecutionStartSchema,
} from "./execution-data";
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
/** Descriptor privado: somente o futuro worker fixo usa conta/documento capturados. */
export async function allocateFixturePaymentExecution(requestId: string) {
  requireLocal();
  try {
    const target = executionId.parse(requestId),
      workerId = randomUUID(),
      db = createSystemClient();
    const r = await db.rpc("claim_payment_execution_step", {
        target_request: target,
        worker_id: workerId,
      }),
      claim = paymentExecutionClaimSchema.parse(r.data);
    if (
      r.error ||
      claim.requestId !== target ||
      (claim.step &&
        (claim.step.requestId !== target || claim.step.workerId !== workerId))
    )
      throw new Error(unavailable);
    return claim;
  } catch {
    throw new Error(unavailable);
  }
}
/** Consumir start não despacha: resposta perdida deve ser retomada por nova alocação/consulta. */
export async function startFixturePaymentExecution(input: unknown) {
  requireLocal();
  try {
    const target = paymentExecutionStartSchema.parse(input),
      db = createSystemClient();
    const r = await db.rpc("start_payment_execution_step", {
      target_step: target.stepId,
      worker_id: target.workerId,
    });
    if (r.error || typeof r.data !== "boolean") throw new Error(unavailable);
    return r.data;
  } catch {
    throw new Error(unavailable);
  }
}
