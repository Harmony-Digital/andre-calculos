import "server-only";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import {
  id,
  customerBootstrapInputSchema,
  customerBootstrapViewSchema,
} from "./customer-bootstrap-data";
export {
  customerBootstrapInputSchema,
  customerBootstrapViewSchema,
} from "./customer-bootstrap-data";
export { advanceFixturePaymentCustomer } from "./customer-bootstrap-worker";
const unavailable = "Vínculo do cliente indisponível.";
const uncertain =
  "Resultado não conferido. Repita esta mesma solicitação para verificar.";
async function session() {
  try {
    return await authorize(["client", "calculator"]);
  } catch {
    throw new Error("Acesso não autorizado.");
  }
}
export async function requestPaymentCustomer(input: unknown) {
  const actor = await session(),
    parsed = customerBootstrapInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Confira a solicitação do cliente." };
  try {
    const db = await createSessionClient(),
      r = await db.rpc("request_payment_customer", {
        target_client: parsed.data.clientId,
        request_id: parsed.data.requestId,
      });
    const view = customerBootstrapViewSchema.parse(r.data);
    if (
      r.error ||
      view.requestId !== parsed.data.requestId ||
      view.clientId !== parsed.data.clientId ||
      view.createdBy !== actor.profile.id ||
      (actor.profile.role === "client" &&
        view.currentOwnerId !== actor.profile.id)
    )
      throw new Error(uncertain);
    return { view };
  } catch {
    return { error: uncertain };
  }
}
export async function getPaymentCustomerRequest(requestId: string) {
  const actor = await session();
  try {
    const target = id.parse(requestId),
      db = await createSessionClient(),
      r = await db.rpc("get_payment_customer_request", {
        target_request: target,
      });
    const view = customerBootstrapViewSchema.parse(r.data);
    if (
      r.error ||
      view.requestId !== target ||
      (actor.profile.role === "client" &&
        view.currentOwnerId !== actor.profile.id)
    )
      throw new Error(unavailable);
    return view;
  } catch {
    throw new Error(unavailable);
  }
}
