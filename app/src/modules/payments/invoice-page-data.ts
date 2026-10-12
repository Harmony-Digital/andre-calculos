import "server-only";
import { z } from "zod";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { getPaymentInvoice } from "./invoice-query";
import { fixtureInvoiceEnabled } from "./invoice-mode";
const identifiers = z.strictObject({
  orderId: z.uuid().transform((v) => v.toLowerCase()),
  processId: z.uuid().transform((v) => v.toLowerCase()),
});
/** A identidade visível precede a consulta; RLS e a reconferência de AQ protegem o dono. */
export async function getInvoicePage(orderId: string, processId: string) {
  if (!fixtureInvoiceEnabled()) throw new Error("Fatura indisponível.");
  await authorize(["client", "calculator"]);
  const ids = identifiers.parse({ orderId, processId }),
    db = await createSessionClient();
  const r = await db
    .from("orders")
    .select("id,process_id,code")
    .eq("id", ids.orderId)
    .eq("process_id", ids.processId)
    .maybeSingle();
  if (
    r.error ||
    !r.data ||
    r.data.id !== ids.orderId ||
    r.data.process_id !== ids.processId ||
    !r.data.code
  )
    throw new Error("Fatura indisponível.");
  const invoice = await getPaymentInvoice(ids.orderId, ids.processId);
  return { invoice, orderCode: r.data.code };
}
