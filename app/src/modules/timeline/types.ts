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
