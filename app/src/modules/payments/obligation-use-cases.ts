import "server-only";
import { z } from "zod";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import {
  paymentPhaseSchema,
  paymentObligationSchema,
  obligationPreparationSchema,
  paymentObligationReceiptSchema,
} from "./obligations";

async function authorizeObligation() {
  try {
    return await authorize(["client", "calculator"]);
  } catch {
    throw new Error("Acesso não autorizado.");
  }
}

/** A leitura é auditada pelo RPC. Não autoriza emissão nem transfere valores. */
export async function getPaymentObligation(orderId: string, phase: unknown) {
  const session = await authorizeObligation();
  const id = z.uuid().safeParse(orderId),
    purpose = paymentPhaseSchema.safeParse(phase);
  if (!id.success || !purpose.success) throw new Error("Pedido indisponível.");
  try {
    const db = await createSessionClient();
    const result = await db.rpc("get_payment_obligation", {
      target_order: id.data,
      target_phase: purpose.data,
    });
    if (result.error) throw new Error("Obrigação indisponível.");
    const parsed = paymentObligationSchema.safeParse(result.data);
    if (
      !parsed.success ||
      parsed.data.orderId !== id.data ||
      parsed.data.phase !== purpose.data ||
      (session.profile.role === "client" &&
        parsed.data.ownerId !== session.profile.id)
    )
      throw new Error("Obrigação indisponível.");
    return parsed.data;
  } catch {
    throw new Error("Obrigação indisponível.");
  }
}

/** Somente prepara contexto fictício; intenção/POST dependem das partes h/i. */
export async function preparePaymentObligation(input: unknown) {
  const session = await authorizeObligation();
  const parsed = obligationPreparationSchema.safeParse(input);
  if (!parsed.success) return { error: "Confira os dados da obrigação." };
  try {
    const db = await createSessionClient();
    const result = await db.rpc("prepare_payment_obligation", {
      target_order: parsed.data.orderId,
      target_phase: parsed.data.phase,
      expected_context: parsed.data.contextHash,
      expected_remaining_cents: parsed.data.remainingCents,
      billing_type: parsed.data.billingType,
      due_date: parsed.data.dueDate,
      request_id: parsed.data.requestId,
    });
    if (result.error)
      return {
        error:
          result.error.code === "PT409"
            ? "A obrigação mudou ou esta tentativa já foi registrada. Recarregue para conferir."
            : "Não foi possível preparar. Tente novamente com esta mesma solicitação.",
      };
    const receipt = paymentObligationReceiptSchema.safeParse(result.data);
    if (!receipt.success)
      return {
        error:
          "Não foi possível conferir o contexto. Tente novamente com esta mesma solicitação.",
      };
    if (
      receipt.data.id !== parsed.data.requestId ||
      receipt.data.createdBy !== session.profile.id ||
      (session.profile.role === "client" &&
        receipt.data.snapshot.ownerId !== session.profile.id) ||
      receipt.data.snapshot.orderId !== parsed.data.orderId ||
      receipt.data.snapshot.phase !== parsed.data.phase ||
      receipt.data.snapshot.contextHash !== parsed.data.contextHash ||
      receipt.data.snapshot.remainingCents !== parsed.data.remainingCents ||
      receipt.data.snapshot.billingType !== parsed.data.billingType ||
      receipt.data.snapshot.dueDate !== parsed.data.dueDate
    )
      return {
        error:
          "Não foi possível conferir o contexto. Tente novamente com esta mesma solicitação.",
      };
    return { receipt: receipt.data };
  } catch {
    return {
      error:
        "Não foi possível preparar. Tente novamente com esta mesma solicitação.",
    };
  }
}
