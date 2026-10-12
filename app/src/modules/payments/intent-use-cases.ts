import "server-only";
import { z } from "zod";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import {
  reservePaymentIntentInput,
  withdrawPaymentIntentInput,
  currentPaymentIntentSchema,
  paymentIntentReceiptSchema,
} from "./intents";
async function paymentSession() {
  try {
    return await authorize(["client", "calculator"]);
  } catch {
    throw new Error("Acesso não autorizado.");
  }
}
const id = z.uuid().transform((value) => value.toLowerCase());
const uncertain =
  "Resultado não conferido. Repita esta mesma solicitação para verificar.";
const conflict =
  "A reserva ou os dados mudaram. Recarregue para conferir antes de tentar novamente.";
export async function reservePaymentIntent(input: unknown) {
  const session = await paymentSession(),
    parsed = reservePaymentIntentInput.safeParse(input);
  if (!parsed.success) return { error: "Confira a solicitação da reserva." };
  try {
    const db = await createSessionClient();
    const result = await db.rpc("reserve_payment_intent", {
      target_context: parsed.data.contextId,
      request_id: parsed.data.requestId,
    });
    if (result.error)
      return { error: result.error.code === "PT409" ? conflict : uncertain };
    const receipt = paymentIntentReceiptSchema.safeParse(result.data);
    if (
      !receipt.success ||
      receipt.data.action !== "reserve" ||
      receipt.data.requestId !== parsed.data.requestId ||
      receipt.data.actorId !== session.profile.id ||
      receipt.data.snapshot.intent.contextId !== parsed.data.contextId ||
      (session.profile.role === "client" &&
        receipt.data.snapshot.currentOwnerId !== session.profile.id)
    )
      return { error: uncertain };
    return { receipt: receipt.data };
  } catch {
    return { error: uncertain };
  }
}
export async function withdrawPaymentIntent(input: unknown) {
  const session = await paymentSession(),
    parsed = withdrawPaymentIntentInput.safeParse(input);
  if (!parsed.success) return { error: "Confira a retirada local da reserva." };
  try {
    const db = await createSessionClient();
    const result = await db.rpc("withdraw_payment_intent", {
      target_intent: parsed.data.intentId,
      expected_revision: parsed.data.expectedRevision,
      request_id: parsed.data.requestId,
    });
    if (result.error)
      return { error: result.error.code === "PT409" ? conflict : uncertain };
    const receipt = paymentIntentReceiptSchema.safeParse(result.data);
    if (
      !receipt.success ||
      receipt.data.action !== "withdraw" ||
      receipt.data.requestId !== parsed.data.requestId ||
      receipt.data.actorId !== session.profile.id ||
      receipt.data.snapshot.intent.id !== parsed.data.intentId ||
      receipt.data.expectedRevision !== parsed.data.expectedRevision ||
      (session.profile.role === "client" &&
        receipt.data.snapshot.currentOwnerId !== session.profile.id)
    )
      return { error: uncertain };
    return { receipt: receipt.data };
  } catch {
    return { error: uncertain };
  }
}
/** Estado atual separado de recibo histórico; leitura auditada, sem despacho. */
export async function getPaymentIntent(intentId: string) {
  const session = await paymentSession(),
    parsed = id.safeParse(intentId);
  if (!parsed.success) throw new Error("Intenção indisponível.");
  try {
    const db = await createSessionClient(),
      result = await db.rpc("get_payment_intent", {
        target_intent: parsed.data,
      });
    if (result.error) throw new Error("Intenção indisponível.");
    const view = currentPaymentIntentSchema.safeParse(result.data);
    if (
      !view.success ||
      view.data.intent.id !== parsed.data ||
      (session.profile.role === "client" &&
        view.data.currentOwnerId !== session.profile.id)
    )
      throw new Error("Intenção indisponível.");
    return view.data;
  } catch {
    throw new Error("Intenção indisponível.");
  }
}
export async function getOrderPaymentReservation(orderId: string) {
  const session = await paymentSession(),
    parsed = id.safeParse(orderId);
  if (!parsed.success) throw new Error("Reserva indisponível.");
  try {
    const db = await createSessionClient(),
      result = await db.rpc("get_order_payment_reservation", {
        target_order: parsed.data,
      });
    if (result.error) throw new Error("Reserva indisponível.");
    if (result.data === null) return null;
    const view = currentPaymentIntentSchema.safeParse(result.data);
    if (
      !view.success ||
      view.data.intent.obligation.orderId !== parsed.data ||
      !view.data.reservationActive ||
      (session.profile.role === "client" &&
        view.data.currentOwnerId !== session.profile.id)
    )
      throw new Error("Reserva indisponível.");
    return view.data;
  } catch {
    throw new Error("Reserva indisponível.");
  }
}
