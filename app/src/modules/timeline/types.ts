export const eventLabels = {
  draft_created: "Rascunho criado",
  draft_updated: "Checklist atualizado",
  checklist_draft_saved: "Checklist salvo",
  file_uploaded: "Documento enviado",
  message_sent: "Mensagem enviada",
  note_added: "Nota registrada",
  decision_recorded: "Decisão registrada",
  index_updated: "Índice atualizado",
  quote_created: "Proposta emitida",
  quote_accepted: "Proposta aceita",
  payment_confirmed: "Pagamento confirmado",
  status_changed: "Situação atualizada",
  delivered: "Entrega confirmada",
} as const;
export type EventKind = keyof typeof eventLabels;
export function eventFilter(value?: string): EventKind | null {
  if (!value || value === "todos") return null;
  if (!Object.hasOwn(eventLabels, value)) throw new Error("Filtro inválido.");
  return value as EventKind;
}
export function eventLabel(kind: string, data?: unknown) {
  if (
    kind === "status_changed" &&
    data &&
    typeof data === "object" &&
    "operation" in data &&
    data.operation === "reject_quote"
  )
    return "Proposta recusada";
  if (
    kind === "status_changed" &&
    data &&
    typeof data === "object" &&
    "operation" in data &&
    "from" in data &&
    "to" in data &&
    typeof data.from === "string" &&
    typeof data.to === "string" &&
    Object.hasOwn(orderStateLabels, data.from) &&
    Object.hasOwn(orderStateLabels, data.to)
  )
    return `${orderStateLabels[data.from as OrderState]} → ${orderStateLabels[data.to as OrderState]}`;
  if (
    kind === "status_changed" &&
    data &&
    typeof data === "object" &&
    "to" in data &&
    data.to === "queued"
  )
    return "Pedido entrou na fila";
  if (
    kind === "status_changed" &&
    data &&
    typeof data === "object" &&
    "release_policy" in data &&
    ["before_balance", "after_balance"].includes(String(data.release_policy))
  )
    return "Regra de liberação aprovada";
  if (
    kind === "decision_recorded" &&
    data &&
    typeof data === "object" &&
    "confirmation" in data &&
    data.confirmation === true
  )
    return "Concordância registrada";
  return Object.hasOwn(eventLabels, kind)
    ? eventLabels[kind as EventKind]
    : "Atividade registrada";
}
export function noteText(data: unknown): string | null {
  if (
    typeof data !== "object" ||
    !data ||
    !("note" in data) ||
    typeof data.note !== "string"
  )
    return null;
  return data.note;
}
import {
  orderStateLabels,
  type OrderState,
} from "@/modules/orders/state-machine";
