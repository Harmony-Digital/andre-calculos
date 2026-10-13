import "server-only";
import {
  createLocalNotificationStore,
  type LocalNotificationRunInput,
  type NotificationReceipt,
} from "./notification-store";

type Counts = {
  accepted: number;
  retryable: number;
  rejected: number;
  cancelled: number;
  held: number;
  empty: number;
};
export type LocalNotificationSummary = Counts & {
  mode: "simulation";
  configured: boolean;
  paused: boolean;
};

/** Só o transporte fictício integrado. Sem callback/adaptador externo ou rota. */
export async function processPending(
  input: LocalNotificationRunInput & { mode?: "simulation" },
): Promise<LocalNotificationSummary> {
  const result: LocalNotificationSummary = {
    mode: "simulation",
    configured: false,
    paused: true,
    accepted: 0,
    retryable: 0,
    rejected: 0,
    cancelled: 0,
    held: 0,
    empty: 0,
  };
  // Ausência de configuração não cria cliente, execução ou tentativa.
  if (input.mode !== "simulation") return result;
  const store = createLocalNotificationStore();
  const run = await store.beginRun(input);
  result.configured = true;
  result.paused = false;
  function count(receipt: NotificationReceipt, notificationId: string) {
    if (receipt.notificationId !== notificationId)
      throw new Error("Resultado com identidade indisponível.");
    switch (receipt.status) {
      case "sent":
        result.accepted++;
        break;
      case "pending":
        result.retryable++;
        break;
      case "failed":
        result.rejected++;
        break;
      case "cancelled":
        result.cancelled++;
        break;
      case "held":
        result.held++;
        result.paused = true;
        break;
    }
  }
  for (let index = 0; index < run.requestIds.length; index++) {
    const requestId = run.requestIds[index];
    try {
      const claim = await store.claim(
        requestId,
        run.channel,
        run.targets?.[index],
      );
      if (claim.status === "empty") {
        result.empty++;
        // Seleção global termina no primeiro vazio; alvos explícitos são isolados.
        if (!run.targets) break;
        continue;
      }
      if (claim.status === "held") {
        result.held++;
        result.paused = true;
        break;
      }
      const existing = await store.getReceipt(requestId);
      if (existing) {
        count(existing, claim.notificationId);
      } else {
        // O RPC revalida sob lock e recupera resultado fictício já persistido.
        let transport;
        try {
          transport =
            (await store.getTransportResult(requestId)) ??
            (await store.simulate(requestId));
        } catch {
          // Consulta sem novo efeito recupera a resposta perdida. Sem prova,
          // unknown bloqueia; erro da consulta interrompe para o mesmo runId.
          transport = await store.getTransportResult(requestId);
          if (!transport) {
            count(
              await store.complete(requestId, "unknown"),
              claim.notificationId,
            );
            result.paused = true;
            break;
          }
        }
        if (transport.status === "blocked") {
          const persisted = await store.getReceipt(requestId);
          if (persisted) count(persisted, claim.notificationId);
          else result.paused = true;
        } else {
          if (transport.notificationId !== claim.notificationId)
            throw new Error("Resultado com identidade indisponível.");
          // Resposta perdida da conclusão não repete o transporte: a retomada
          // lê o recibo ou o resultado fictício persistente pelo mesmo request.
          count(
            await store.complete(requestId, transport.outcome),
            claim.notificationId,
          );
        }
      }
      if (result.paused) break;
    } catch {
      // Nenhum erro bruto/destinatário/conteúdo escapa. Retomar mesmo runId.
      result.paused = true;
      break;
    }
  }
  return result;
}
