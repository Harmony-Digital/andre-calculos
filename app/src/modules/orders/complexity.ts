export type Complexity = "simple" | "medium" | "high";
export type ComplexityAnswers = {
  wageItems: readonly string[];
  timecardFormat: "none" | "digital" | "handwritten" | "image" | "judicial";
  claimants: number;
  processPages: number;
};
export const defaultComplexitySettings = {
  wageThreshold: 6,
  pageThreshold: 1000,
  claimantThreshold: 1,
};

export function classifyComplexity(
  answers: ComplexityAnswers,
  settings = defaultComplexitySettings,
): { level: Complexity; reasons: string[] } {
  if (
    !Number.isSafeInteger(answers.claimants) ||
    answers.claimants < 1 ||
    !Number.isSafeInteger(answers.processPages) ||
    answers.processPages < 0
  )
    throw new Error("Informe quantidades válidas para classificar o pedido.");
  if (
    settings.wageThreshold < 1 ||
    settings.pageThreshold < 0 ||
    settings.claimantThreshold < 1 ||
    !Object.values(settings).every(Number.isSafeInteger)
  )
    throw new Error("Os limites de complexidade devem ser inteiros válidos.");
  const reasons: string[] = [];
  if (["handwritten", "image"].includes(answers.timecardFormat))
    reasons.push("Cartões de ponto precisam de digitação.");
  if (answers.claimants > settings.claimantThreshold)
    reasons.push("O pedido envolve vários reclamantes.");
  if (new Set(answers.wageItems).size >= settings.wageThreshold)
    reasons.push("O pedido envolve muitas verbas.");
  if (answers.processPages > settings.pageThreshold)
    reasons.push("O processo tem muitas páginas.");
  if (reasons.length) return { level: "high", reasons };
  if (
    answers.wageItems.length === 1 &&
    answers.wageItems[0] === "severance" &&
    answers.timecardFormat === "none"
  )
    return {
      level: "simple",
      reasons: ["Somente verbas rescisórias, sem análise de jornada."],
    };
  return {
    level: "medium",
    reasons: ["O pedido requer análise regular das verbas e documentos."],
  };
}
