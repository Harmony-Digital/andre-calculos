import { z } from "zod";
import { parseLaborCnj } from "@/lib/cnj";
import { isCivilDate } from "@/modules/deadlines/calendar";

export const calculationTypes = [
  "initial",
  "liquidation",
  "challenge",
  "update",
] as const;
export const calculationLabels = {
  initial: "Cálculo inicial",
  liquidation: "Liquidação ou execução",
  challenge: "Impugnação",
  update: "Atualização",
} as const;
export const wageLabels = {
  overtime: "Horas extras",
  interval: "Intervalo",
  night: "Adicional noturno",
  unhealthy: "Insalubridade",
  dangerous: "Periculosidade",
  severance: "Verbas rescisórias",
  fgts: "FGTS e multa de 40%",
  penalty467: "Multa do art. 467",
  penalty477: "Multa do art. 477",
  differences: "Diferenças salariais",
  moral: "Danos morais",
  effects: "Reflexos",
  other: "Outras verbas",
} as const;
export const wageItems = Object.keys(wageLabels) as (keyof typeof wageLabels)[];
const civilDate = z.string().refine(isCivilDate, "Informe uma data válida.");
const optionalDate = z.union([civilDate, z.literal("")]);
const boundedText = z.string().trim().max(4000, "Use até 4.000 caracteres.");
const count = (label: string, min = 0, max = 10000) =>
  z
    .number({ error: `Informe ${label}.` })
    .int(`Informe ${label} em número inteiro.`)
    .min(min, `Informe ${label} a partir de ${min}.`)
    .max(max, `Informe ${label} até ${max}.`);

export const checklistLaborV1 = z
  .object({
    schemaVersion: z.literal(1),
    processNumber: z
      .string()
      .refine(
        (value) => parseLaborCnj(value) !== null,
        "Informe um número CNJ trabalhista válido.",
      ),
    tribunal: count("o TRT", 1, 24),
    court: z.string().trim().min(1, "Informe a vara.").max(160),
    side: z.enum(["claimant", "respondent"], {
      error: "Informe o lado representado.",
    }),
    claimants: count("o número de reclamantes", 1, 1000),
    calculationType: z.enum(calculationTypes, {
      error: "Escolha o tipo de cálculo.",
    }),
    hasSentence: z.boolean(),
    hasAppeal: z.boolean(),
    hasInterlocutory: z.boolean(),
    correctionRule: z.enum(["adc58", "law14905", "other", "unspecified"]),
    correctionDetails: boundedText,
    strategy: boundedText,
    admissionDate: civilDate,
    dismissalDate: optionalDate,
    filingDate: civilDate,
    baseDate: civilDate,
    wageItems: z
      .array(
        z.enum(
          Object.keys(wageLabels) as [
            keyof typeof wageLabels,
            ...(keyof typeof wageLabels)[],
          ],
        ),
      )
      .min(1, "Selecione ao menos uma verba.")
      .refine(
        (items) => new Set(items).size === items.length,
        "Não repita verbas.",
      ),
    otherWages: boundedText,
    timecardFormat: z.enum([
      "none",
      "digital",
      "handwritten",
      "image",
      "judicial",
    ]),
    timecardMonths: count("os meses de cartões", 0, 1200),
    timecardPages: count("as páginas de cartões", 0, 100000),
    documents: z
      .array(
        z.enum([
          "financial",
          "payslips",
          "timecards",
          "employment",
          "sentence",
          "appeal",
          "previousCalculation",
        ]),
      )
      .refine(
        (items) => new Set(items).size === items.length,
        "Não repita documentos.",
      ),
    deductInss: z.boolean(),
    deductIr: z.boolean(),
    processPages: count("as páginas do processo", 0, 100000),
    noticeDate: civilDate,
    actType: z.enum(["challenge", "embargo", "appeal", "other"]),
    deadlineDays: count("os dias do prazo", 1, 365),
    urgency: z.boolean(),
    instructions: boundedText,
  })
  .superRefine((data, ctx) => {
    const issue = (path: keyof typeof data, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (parseLaborCnj(data.processNumber)?.tribunal !== data.tribunal)
      issue("tribunal", "O TRT deve corresponder ao número do processo.");
    if (data.dismissalDate && data.dismissalDate < data.admissionDate)
      issue("dismissalDate", "A demissão deve ocorrer após a admissão.");
    if (data.baseDate < data.admissionDate)
      issue("baseDate", "A data-base deve ocorrer após a admissão.");
    if (
      (data.timecardFormat === "handwritten" ||
        data.timecardFormat === "image") &&
      data.timecardMonths + data.timecardPages === 0
    )
      issue(
        "timecardMonths",
        "Informe meses ou páginas de cartões para digitar.",
      );
    if (data.wageItems.includes("other") && !data.otherWages)
      issue("otherWages", "Descreva as outras verbas.");
    if (data.correctionRule === "other" && !data.correctionDetails)
      issue("correctionDetails", "Descreva o índice fixado na decisão.");
  });

export type ChecklistLaborV1 = z.infer<typeof checklistLaborV1>;

export const checklistSteps: {
  title: string;
  fields: (keyof ChecklistLaborV1)[];
}[] = [
  {
    title: "Processo",
    fields: ["processNumber", "tribunal", "court", "side", "claimants"],
  },
  { title: "Tipo de cálculo", fields: ["calculationType"] },
  {
    title: "Decisões",
    fields: [
      "hasSentence",
      "hasAppeal",
      "hasInterlocutory",
      "correctionRule",
      "correctionDetails",
      "strategy",
    ],
  },
  {
    title: "Datas",
    fields: ["admissionDate", "dismissalDate", "filingDate", "baseDate"],
  },
  { title: "Verbas", fields: ["wageItems", "otherWages"] },
  {
    title: "Jornada",
    fields: ["timecardFormat", "timecardMonths", "timecardPages"],
  },
  {
    title: "Documentos e descontos",
    fields: ["documents", "deductInss", "deductIr", "processPages"],
  },
  {
    title: "Prazo",
    fields: ["noticeDate", "actType", "deadlineDays", "urgency"],
  },
  { title: "Instruções", fields: ["instructions"] },
];

export const emptyChecklist: ChecklistLaborV1 = {
  schemaVersion: 1,
  processNumber: "",
  tribunal: 10,
  court: "",
  side: "claimant",
  claimants: 1,
  calculationType: "initial",
  hasSentence: false,
  hasAppeal: false,
  hasInterlocutory: false,
  correctionRule: "unspecified",
  correctionDetails: "",
  strategy: "",
  admissionDate: "",
  dismissalDate: "",
  filingDate: "",
  baseDate: "",
  wageItems: [],
  otherWages: "",
  timecardFormat: "none",
  timecardMonths: 0,
  timecardPages: 0,
  documents: [],
  deductInss: false,
  deductIr: false,
  processPages: 0,
  noticeDate: "",
  actType: "other",
  deadlineDays: 8,
  urgency: false,
  instructions: "",
};
