export const processTabs = {
  resumo: "Resumo",
  documentos: "Documentos",
  mensagens: "Mensagens",
  decisoes: "Decisões",
  indice: "Índice",
  historico: "Linha do tempo",
} as const;
export type ProcessTab = keyof typeof processTabs;
export function processTab(value: unknown): ProcessTab {
  return typeof value === "string" && Object.hasOwn(processTabs, value)
    ? (value as ProcessTab)
    : "documentos";
}
