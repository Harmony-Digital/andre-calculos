import { z } from "zod";
import {
  checklistLaborV1,
  type ChecklistLaborV1,
} from "@/modules/checklist/v1";
import { priceParameterSchema } from "@/modules/settings/forms";
import {
  addBusinessDays,
  computeDeadline,
  isBusinessDay,
  isCivilDate,
} from "@/modules/deadlines/calendar";
import { calculateQuote, type PriceTable } from "./pricing";

const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const civilDate = z.string().refine(isCivilDate);
const basis = z.enum(["fixture", "reviewed"]);
export const professionalSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  crcNumber: z.string().trim().min(1).max(30),
  crcState: z.string().regex(/^[A-Z]{2}$/),
  category: z.enum(["Contador", "Técnico em Contabilidade"]),
  email: z.email(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
});
export const calendarInputSchema = z.strictObject({
  version: z.string().min(1).max(200),
  basis,
  tribunal: z.number().int().min(1).max(24),
  suspensions: z
    .array(
      z.strictObject({
        start: civilDate,
        end: civilDate,
        reason: z.string().min(1).max(500),
      }),
    )
    .max(500),
});
export const capacityInputSchema = z.strictObject({
  version: z.string().min(1).max(200),
  basis,
  asOf: z.iso.datetime({ offset: true }),
  validUntil: z.iso.datetime({ offset: true }),
  startDate: civilDate,
  availableBusinessDays: z.number().int().min(1).max(365),
  urgencyAvailable: z.boolean(),
});
export const periodInputSchema = z.strictObject({
  version: z.string().min(1).max(200),
  basis,
  months: z.number().int().min(1).max(1200),
  startDate: civilDate,
  endDate: civilDate,
});
export const proposalSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    mode: z.enum(["fixture", "commercial"]),
    orderId: z.uuid(),
    processId: z.uuid(),
    checklistRevision: z.number().int().positive(),
    settingsRevision: z.number().int().positive(),
    priceTableId: z.uuid(),
    priceVersion: z.string().min(1),
    priceParameters: priceParameterSchema,
    complexityLimits: z.strictObject({
      wageThreshold: z.number().int().positive(),
      pageThreshold: z.number().int().min(0),
      claimantThreshold: z.number().int().positive(),
    }),
    professional: professionalSchema,
    conditions: z.string().trim().min(1).max(4000),
    period: periodInputSchema,
    calendar: calendarInputSchema,
    capacity: capacityInputSchema,
    issuedAt: z.iso.datetime({ offset: true }),
    validUntil: z.iso.datetime({ offset: true }),
    validityRule: z.literal("civil-days-sp-v1"),
    validityDays: z.number().int().min(1).max(365),
    items: z
      .array(
        z.strictObject({
          code: z.string().min(1).max(50),
          description: z.string().min(1).max(200),
          quantity: z.number().int().positive(),
          unitCents: cents,
          amountCents: cents,
        }),
      )
      .min(1)
      .max(10),
    totalCents: cents,
    depositCents: cents,
    balanceCents: cents,
    complexity: z.enum(["simple", "medium", "high"]),
    businessDays: z.number().int().min(1).max(365),
    proceduralDays: z.number().int().min(1).max(365),
    slackDays: z.number().int().min(0).max(365),
    deliveryDate: civilDate,
    internalDueDate: civilDate,
    dueDate: civilDate,
  })
  .superRefine((p, ctx) => {
    const total = p.items.reduce(
      (sum, i) => sum + BigInt(i.amountCents),
      BigInt(0),
    );
    if (
      p.items.some(
        (i) =>
          BigInt(i.quantity) * BigInt(i.unitCents) !== BigInt(i.amountCents),
      ) ||
      total !== BigInt(p.totalCents) ||
      p.depositCents !== Math.ceil(p.totalCents / 2) ||
      BigInt(p.depositCents) + BigInt(p.balanceCents) !== total
    )
      ctx.addIssue({
        code: "custom",
        message: "Os valores da proposta não fecham.",
      });
    if (
      p.deliveryDate > p.internalDueDate ||
      p.internalDueDate > p.dueDate ||
      new Date(p.validUntil) <= new Date(p.issuedAt)
    )
      ctx.addIssue({
        code: "custom",
        message: "Confira as datas da proposta.",
      });
    if (
      p.mode === "commercial" &&
      [p.period.basis, p.calendar.basis, p.capacity.basis].includes("fixture")
    )
      ctx.addIssue({
        code: "custom",
        message: "Insumos fictícios não emitem uma proposta comercial.",
      });
  });
export type Proposal = z.infer<typeof proposalSchema>;
export const quoteBlockMessages = {
  checklist: "Confira e salve todas as etapas do checklist.",
  prices: "A tabela de preços precisa estar ativa e validada.",
  professional: "Faltam nome, CRC, categoria ou contatos do responsável.",
  conditions: "As condições da proposta precisam ser confirmadas.",
  calendar: "O calendário deste TRT precisa ser conferido.",
  capacity: "A disponibilidade para este serviço ainda não foi confirmada.",
  period: "Falta confirmar a regra de meses e o término do período contratual.",
  timecards: "Informe a quantidade de cartões na unidade da tabela de preços.",
  deadline:
    "Não há prazo disponível para concluir antes do vencimento interno.",
  configuration: "As configurações da proposta precisam de revisão.",
} as const;
export type QuoteBlock = keyof typeof quoteBlockMessages;
export type EvaluationInput = {
  now: Date;
  mode: "fixture" | "commercial";
  orderId: string;
  processId: string;
  checklistRevision: number;
  answers: unknown;
  settingsRevision: number;
  professional: unknown;
  conditions: string;
  validityDays: number;
  slackDays: number;
  prices: {
    id: string;
    active: boolean;
    activatedAt: string | null;
    table: PriceTable;
  } | null;
  calendar: z.infer<typeof calendarInputSchema> | null;
  capacity: z.infer<typeof capacityInputSchema> | null;
  period: z.infer<typeof periodInputSchema> | null;
};
export type QuoteEvaluation =
  | { status: "blocked"; reasons: QuoteBlock[] }
  | { status: "fixture_ready" | "commercial_ready"; proposal: Proposal };
export function todayInSaoPaulo(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
// Validade em dias civis, no mesmo horário de São Paulo. A política só admite
// emissão a partir de 2020, após a extinção do horário de verão (UTC-03).
export function proposalValidity(now: Date, days: number) {
  if (
    !Number.isFinite(now.getTime()) ||
    todayInSaoPaulo(now) < "2020-01-01" ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365
  )
    throw new Error("Validade indisponível.");
  return new Date(now.getTime() + days * 86400000).toISOString();
}
export function evaluateProposal(input: EvaluationInput): QuoteEvaluation {
  const reasons: QuoteBlock[] = [];
  const parsed = checklistLaborV1.safeParse(input.answers);
  if (!parsed.success) reasons.push("checklist");
  const table = input.prices?.table;
  if (
    !input.prices?.active ||
    !table ||
    !priceParameterSchema.safeParse(table).success ||
    (input.mode === "commercial" &&
      (table.isExample || !input.prices.activatedAt))
  )
    reasons.push("prices");
  const professional = professionalSchema.safeParse(input.professional);
  if (!professional.success) reasons.push("professional");
  if (!input.conditions.trim() || input.conditions.length > 4000)
    reasons.push("conditions");
  const calendar = calendarInputSchema.safeParse(input.calendar),
    capacity = capacityInputSchema.safeParse(input.capacity),
    period = periodInputSchema.safeParse(input.period);
  if (
    !calendar.success ||
    (input.mode === "commercial" && calendar.data.basis !== "reviewed") ||
    (parsed.success &&
      calendar.success &&
      parsed.data.tribunal !== calendar.data.tribunal)
  )
    reasons.push("calendar");
  if (
    !capacity.success ||
    (input.mode === "commercial" && capacity.data.basis !== "reviewed") ||
    (capacity.success &&
      (new Date(capacity.data.asOf) > input.now ||
        new Date(capacity.data.validUntil) <= input.now ||
        capacity.data.startDate < todayInSaoPaulo(input.now)))
  )
    reasons.push("capacity");
  if (
    !period.success ||
    (input.mode === "commercial" && period.data.basis !== "reviewed") ||
    (period.success &&
      parsed.success &&
      (period.data.startDate !== parsed.data.admissionDate ||
        !parsed.data.dismissalDate ||
        period.data.endDate !== parsed.data.dismissalDate ||
        period.data.startDate > period.data.endDate))
  )
    reasons.push("period");
  if (
    parsed.success &&
    table &&
    ["image", "handwritten"].includes(parsed.data.timecardFormat) &&
    (table.timecardUnit === "month"
      ? parsed.data.timecardMonths
      : parsed.data.timecardPages) < 1
  )
    reasons.push("timecards");
  if (
    reasons.length ||
    !parsed.success ||
    !professional.success ||
    !calendar.success ||
    !capacity.success ||
    !period.success ||
    !table ||
    !input.prices
  )
    return { status: "blocked", reasons };
  try {
    const answers: ChecklistLaborV1 = parsed.data;
    const price = calculateQuote(
      { ...answers, contractMonths: period.data.months },
      table,
    );
    const deadline = computeDeadline({
      noticeDate: answers.noticeDate,
      actType: answers.actType,
      days: answers.deadlineDays,
      slackBusinessDays: input.slackDays,
      suspensions: calendar.data.suspensions,
    });
    const deliveryDate = addBusinessDays(
      capacity.data.startDate,
      price.businessDays,
      calendar.data,
    );
    if (
      price.businessDays > capacity.data.availableBusinessDays ||
      (answers.urgency && !capacity.data.urgencyAvailable) ||
      deliveryDate > deadline.internalDueDate ||
      !isBusinessDay(deliveryDate, calendar.data)
    )
      return { status: "blocked", reasons: ["deadline"] };
    const proposal = proposalSchema.parse({
      schemaVersion: 1,
      mode: input.mode,
      orderId: input.orderId,
      processId: input.processId,
      checklistRevision: input.checklistRevision,
      settingsRevision: input.settingsRevision,
      priceTableId: input.prices.id,
      priceVersion: table.version,
      priceParameters: priceParameterSchema.parse(table),
      complexityLimits: table.complexitySettings ?? {
        wageThreshold: 6,
        pageThreshold: 1000,
        claimantThreshold: 1,
      },
      professional: professional.data,
      conditions: input.conditions.trim(),
      period: period.data,
      calendar: calendar.data,
      capacity: capacity.data,
      issuedAt: input.now.toISOString(),
      validUntil: proposalValidity(input.now, input.validityDays),
      validityRule: "civil-days-sp-v1",
      validityDays: input.validityDays,
      items: price.items,
      totalCents: price.totalCents,
      depositCents: price.depositCents,
      balanceCents: price.balanceCents,
      complexity: price.complexity.level,
      businessDays: price.businessDays,
      proceduralDays: deadline.businessDays,
      slackDays: input.slackDays,
      deliveryDate,
      internalDueDate: deadline.internalDueDate,
      dueDate: deadline.dueDate,
    });
    return {
      status: input.mode === "fixture" ? "fixture_ready" : "commercial_ready",
      proposal,
    };
  } catch {
    return { status: "blocked", reasons: ["configuration"] };
  }
}
