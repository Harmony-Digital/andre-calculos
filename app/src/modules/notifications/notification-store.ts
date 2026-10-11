import "server-only";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";

const id = z.uuid();
const channel = z.enum(["email", "whatsapp"]);
const outcome = z.enum(["accepted", "retryable", "rejected", "unknown"]);
const mode = z.literal("simulation");
const common = { requestId: id, mode };
const reserved = z.object({
  ...common,
  status: z.literal("reserved"),
  notificationId: id,
  attempt: z.number().int().min(1).max(5),
  expiresAt: z.iso.datetime({ offset: true }),
  message: z.object({
    id,
    channel,
    recipient: z.string().min(1),
    template: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
    schemaVersion: z.literal(1),
    idempotencyKey: z.string(),
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
});
const reservation = z.discriminatedUnion("status", [
  reserved,
  z.object({ ...common, status: z.literal("empty") }),
  z.object({ ...common, status: z.literal("held"), notificationId: id }),
]);
const receipt = z.object({
  ...common,
  status: z.enum(["sent", "pending", "failed", "cancelled", "held"]),
  notificationId: id,
  attempt: z.number().int().min(1).max(5),
  code: z
    .enum([
      "retryable_failure",
      "attempts_exhausted",
      "permanent_failure",
      "dispatch_outcome_unknown",
      "notification_cancelled",
    ])
    .nullable(),
  nextAt: z.iso.datetime({ offset: true }).nullable().optional(),
});
export type NotificationReservation = z.infer<typeof reservation>;
export type NotificationReceipt = z.infer<typeof receipt>;
export type NotificationOutcome = z.infer<typeof outcome>;
const reservationError =
  "Reserva não confirmada. Repita a mesma requisição para conferir.";
const completionError =
  "Resultado não confirmado. Repita a mesma requisição para conferir.";
async function protectedResult<T>(
  operation: () => PromiseLike<T>,
  message: string,
) {
  try {
    return await operation();
  } catch {
    throw new Error(message);
  }
}

/** Sem endpoint ou transporte. Credenciais/clientes de outros destinos não entram. */
export function createLocalNotificationStore() {
  if (
    process.env.ANDRE_LOCAL_TESTS !== "1" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321" ||
    process.env.VERCEL_ENV
  )
    throw new Error("Processamento fictício permitido somente no banco local.");
  const db = createSystemClient();
  return {
    async claim(
      requestId: string,
      inputChannel: "email" | "whatsapp",
      targetNotification?: string,
    ): Promise<NotificationReservation> {
      if (
        !id.safeParse(requestId).success ||
        !channel.safeParse(inputChannel).success ||
        (targetNotification !== undefined &&
          !id.safeParse(targetNotification).success)
      )
        throw new Error("Requisição de processamento inválida.");
      const result = await protectedResult(
        () =>
          db.rpc("claim_notification_local_system", {
            request_id: requestId,
            channel: inputChannel,
            target_notification: targetNotification,
          }),
        reservationError,
      );
      const parsed = reservation.safeParse(result.data);
      if (
        result.error ||
        !parsed.success ||
        parsed.data.requestId !== requestId
      )
        throw new Error(reservationError);
      const claim = parsed.data;
      if (
        claim.status !== "empty" &&
        targetNotification !== undefined &&
        claim.notificationId !== targetNotification
      )
        throw new Error("Reserva com identidade indisponível.");
      if (
        claim.status === "reserved" &&
        (claim.message.id !== claim.notificationId ||
          claim.message.channel !== inputChannel ||
          claim.message.idempotencyKey !==
            `notification:${claim.notificationId}`)
      )
        throw new Error("Reserva com identidade indisponível.");
      return claim;
    },
    async validate(requestId: string): Promise<boolean> {
      if (!id.safeParse(requestId).success)
        throw new Error("Requisição de processamento inválida.");
      const result = await protectedResult(
        () =>
          db.rpc("validate_notification_local_claim", {
            request_id: requestId,
          }),
        "Reserva não confirmada para processamento.",
      );
      if (result.error || typeof result.data !== "boolean")
        throw new Error("Reserva não confirmada para processamento.");
      return result.data;
    },
    async complete(
      requestId: string,
      inputOutcome: NotificationOutcome,
    ): Promise<NotificationReceipt> {
      if (
        !id.safeParse(requestId).success ||
        !outcome.safeParse(inputOutcome).success
      )
        throw new Error("Resultado de processamento inválido.");
      const result = await protectedResult(
        () =>
          db.rpc("complete_notification_local_system", {
            request_id: requestId,
            outcome: inputOutcome,
          }),
        completionError,
      );
      const parsed = receipt.safeParse(result.data);
      if (
        result.error ||
        !parsed.success ||
        parsed.data.requestId !== requestId
      )
        throw new Error(completionError);
      return parsed.data;
    },
  };
}
