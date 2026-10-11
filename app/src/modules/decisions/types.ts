export const decisionParameters = {
  correction_index: "Índice de correção",
  interest: "Juros",
  start_date: "Marco inicial",
  period: "Período",
  wage: "Verba",
  deduction: "Dedução",
  other: "Outro",
} as const;
export const decisionSources = {
  judgment: "Sentença",
  appeal: "Acórdão",
  decision: "Decisão",
  lawyer: "Advogado",
  calculator: "André",
} as const;
export const isPremise = (page: number | null, confirmation: string | null) =>
  page === null && confirmation === null;
export function parameterLabel(value: string) {
  return Object.hasOwn(decisionParameters, value)
    ? decisionParameters[value as keyof typeof decisionParameters]
    : "Outro";
}
export function sourceLabel(value: string) {
  return Object.hasOwn(decisionSources, value)
    ? decisionSources[value as keyof typeof decisionSources]
    : "Origem não informada";
}
export const decisionDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
