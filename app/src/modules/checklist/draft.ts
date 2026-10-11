import { z } from "zod";
import {
  checklistLaborV1,
  checklistSteps,
  type ChecklistLaborV1,
  wageItems,
} from "./v1";
import { parseLaborCnj } from "@/lib/cnj";
export const checklistDraftV1 = z.object({
  ...checklistLaborV1.shape,
  processNumber: z.union([checklistLaborV1.shape.processNumber, z.literal("")]),
  court: z.string().trim().max(160),
  admissionDate: z.union([checklistLaborV1.shape.admissionDate, z.literal("")]),
  filingDate: z.union([checklistLaborV1.shape.filingDate, z.literal("")]),
  baseDate: z.union([checklistLaborV1.shape.baseDate, z.literal("")]),
  noticeDate: z.union([checklistLaborV1.shape.noticeDate, z.literal("")]),
  wageItems: z
    .array(
      z.enum(
        wageItems as [
          (typeof wageItems)[number],
          ...(typeof wageItems)[number][],
        ],
      ),
    )
    .refine(
      (items) => new Set(items).size === items.length,
      "Não repita verbas.",
    ),
});
export function validateDraft(
  answers: unknown,
  completedStep: number,
): { data?: ChecklistLaborV1; errors?: Record<string, string[]> } {
  if (
    !Number.isInteger(completedStep) ||
    completedStep < 0 ||
    completedStep > 8
  )
    return { errors: { form: ["Etapa inválida."] } };
  const parsed = checklistDraftV1.safeParse(answers);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const data = parsed.data,
    errors: Record<string, string[]> = {};
  const issue = (key: string, message: string) => {
    (errors[key] ??= []).push(message);
  };
  for (const key of checklistSteps
    .slice(0, completedStep + 1)
    .flatMap((step) => step.fields)) {
    const field = checklistLaborV1.shape[key].safeParse(data[key]);
    if (!field.success) issue(key, field.error.issues[0].message);
  }
  if (parseLaborCnj(data.processNumber)?.tribunal !== data.tribunal)
    issue("tribunal", "O TRT deve corresponder ao número do processo.");
  if (
    completedStep >= 2 &&
    data.correctionRule === "other" &&
    !data.correctionDetails
  )
    issue("correctionDetails", "Descreva o índice fixado na decisão.");
  if (completedStep >= 3) {
    if (
      data.dismissalDate &&
      data.admissionDate &&
      data.dismissalDate < data.admissionDate
    )
      issue("dismissalDate", "A demissão deve ocorrer após a admissão.");
    if (
      data.baseDate &&
      data.admissionDate &&
      data.baseDate < data.admissionDate
    )
      issue("baseDate", "A data-base deve ocorrer após a admissão.");
  }
  if (
    completedStep >= 4 &&
    data.wageItems.includes("other") &&
    !data.otherWages
  )
    issue("otherWages", "Descreva as outras verbas.");
  if (
    completedStep >= 5 &&
    ["handwritten", "image"].includes(data.timecardFormat) &&
    data.timecardMonths + data.timecardPages === 0
  )
    issue(
      "timecardMonths",
      "Informe meses ou páginas de cartões para digitar.",
    );
  if (Object.keys(errors).length) return { errors };
  return { data };
}
