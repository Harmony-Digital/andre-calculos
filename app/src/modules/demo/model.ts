import { z } from "zod";
import { fictionalChecklist } from "@/modules/checklist/fixtures";
import {
  checklistLaborV1,
  type ChecklistLaborV1,
} from "@/modules/checklist/v1";
import { calculateQuote, type PriceTable } from "@/modules/quotes/pricing";
import { addBusinessDays, computeDeadline } from "@/modules/deadlines/calendar";

export const demoIdentity = {
  brand: "Marco",
  professional: "André Costa · personagem fictício",
  crc: "CRC DEMO-000000/O · fictício · Contador",
  lawyer: "Marina Duarte",
  referenceDate: "2026-10-13",
};
export const demoPriceTable: PriceTable = {
  version: "demo-2026-v1",
  isExample: true,
  base: { initial: 35000, liquidation: 45000, challenge: 55000, update: 25000 },
  perWage: 10000,
  includedWages: 1,
  perContractMonth: 800,
  includedContractMonths: 36,
  perTimecardUnit: 3500,
  timecardUnit: "month",
  perExtraClaimant: 15000,
  urgencyBasisPoints: 3000,
  businessDays: { simple: 3, medium: 5, high: 8 },
};
export const demoCalendar = {
  suspensions: [
    {
      start: "2026-10-23",
      end: "2026-10-23",
      reason: "Suspensão fictícia para a apresentação",
    },
  ],
};
export function newDemoAnswers(): ChecklistLaborV1 {
  return {
    ...structuredClone(fictionalChecklist),
    court: "Vara demonstrativa de Brasília",
    admissionDate: "2023-02-01",
    dismissalDate: "2025-04-30",
    baseDate: demoIdentity.referenceDate,
    noticeDate: demoIdentity.referenceDate,
    deadlineDays: 15,
    actType: "other",
    wageItems: ["severance", "fgts", "overtime"],
    instructions:
      "Exemplo fictício: observar as verbas deferidas na sentença, página 42.",
  };
}
export function buildDemoQuote(input: unknown) {
  const answers = checklistLaborV1.parse(input);
  if (!answers.dismissalDate)
    throw new Error(
      "Informe a demissão fictícia para definir o período deste exemplo.",
    );
  if (
    ["handwritten", "image"].includes(answers.timecardFormat) &&
    answers.timecardMonths < 1
  )
    throw new Error(
      "Informe os meses de cartões: a tabela fictícia cobra a digitação por mês.",
    );
  const end = answers.dismissalDate;
  const months =
    (Number(end.slice(0, 4)) - Number(answers.admissionDate.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) -
    Number(answers.admissionDate.slice(5, 7)) +
    1;
  if (months < 1) throw new Error("Confira o período contratual.");
  const quote = calculateQuote(
    { ...answers, contractMonths: months },
    demoPriceTable,
  );
  const deadlines = computeDeadline({
    noticeDate: answers.noticeDate,
    actType: answers.actType,
    days: answers.deadlineDays,
    slackBusinessDays: 2,
    ...demoCalendar,
  });
  const deliveryDate = addBusinessDays(
    demoIdentity.referenceDate,
    quote.businessDays,
    demoCalendar,
  );
  if (deliveryDate > deadlines.internalDueDate)
    throw new Error(
      "O prazo informado não comporta a entrega. Aumente o prazo fictício para continuar.",
    );
  return {
    ...quote,
    deliveryDate,
    internalDueDate: deadlines.internalDueDate,
    dueDate: deadlines.dueDate,
  };
}
export type DemoQuote = ReturnType<typeof buildDemoQuote>;
export const demoStages = [
  "quoted",
  "awaiting_payment",
  "queued",
  "in_analysis",
  "in_calculation",
  "in_review",
  "delivered",
] as const;
export type DemoStage = (typeof demoStages)[number];
export const stageLabels: Record<DemoStage, string> = {
  quoted: "Proposta disponível",
  awaiting_payment: "Aguardando sinal",
  queued: "Na fila",
  in_analysis: "Em análise",
  in_calculation: "Cálculo em elaboração",
  in_review: "Em revisão",
  delivered: "Entrega disponível",
};
export type DemoEvent = { label: string; detail: string; at: string };
export type DemoOrder = {
  id: string;
  title: string;
  answers: ChecklistLaborV1;
  quote: DemoQuote;
  stage: DemoStage;
  deposit: boolean;
  document: boolean;
  events: DemoEvent[];
  messages: { author: "lawyer" | "professional"; text: string }[];
};
export type DemoState = { version: 1; orders: DemoOrder[] };
export type DemoAction = "accept" | "deposit" | "document" | "advance";
function event(order: DemoOrder, label: string, detail: string): DemoEvent {
  const date = new Date("2026-10-13T13:00:00.000Z");
  date.setMinutes(date.getMinutes() + order.events.length * 15);
  return { label, detail, at: date.toISOString() };
}
export function createDemoOrder(
  answers: unknown,
  id: string,
  title: string,
): DemoOrder {
  const parsed = checklistLaborV1.parse(answers);
  return {
    id,
    title: title.trim().slice(0, 100) || "Novo processo demonstrativo",
    answers: structuredClone(parsed),
    quote: buildDemoQuote(parsed),
    stage: "quoted",
    deposit: false,
    document: false,
    events: [
      {
        label: "Solicitação enviada",
        detail: "Checklist de nove etapas concluído com dados fictícios.",
        at: "2026-10-13T13:00:00.000Z",
      },
      {
        label: "Proposta disponível",
        detail: "Serviços, valores e prazo gerados pela tabela demonstrativa.",
        at: "2026-10-13T13:15:00.000Z",
      },
    ],
    messages: [
      {
        author: "professional",
        text: "Olá, Marina. Sua proposta está disponível. Após o aceite, o sinal e os documentos, o trabalho entra na fila. Esta mensagem é um exemplo.",
      },
    ],
  };
}
/** Transições isoladas: não acionam banco, autenticação, cobrança ou notificações. */
export function transitionDemo(
  order: DemoOrder,
  action: DemoAction,
): DemoOrder {
  if (
    (action === "accept" && order.stage !== "quoted") ||
    (action === "deposit" && order.deposit) ||
    (action === "document" && order.document) ||
    (action === "advance" && order.stage === "delivered")
  )
    return order;
  const next = structuredClone(order);
  const append = (label: string, detail: string) =>
    next.events.push(event(next, label, detail));
  if (action === "accept") {
    next.stage = "awaiting_payment";
    append(
      "Aceite da proposta — simulação",
      "Marina confirmou a versão demo-2026-v1. Nenhum contrato real foi firmado.",
    );
  }
  if (action === "deposit") {
    if (order.stage !== "awaiting_payment")
      throw new Error("Simule o aceite antes de confirmar o sinal.");
    next.deposit = true;
    append(
      "Sinal de 50% confirmado — simulação",
      "Nenhum pagamento foi realizado.",
    );
  }
  if (action === "document") {
    next.document = true;
    append(
      "Documento de exemplo anexado",
      "Sentença demonstrativa, sem upload ou processo real.",
    );
  }
  if (next.stage === "awaiting_payment" && next.deposit && next.document) {
    next.stage = "queued";
    append(
      "Pedido entrou na fila — simulação",
      "Aceite, sinal e documento mínimo conferidos.",
    );
  }
  if (action === "advance") {
    if (["quoted", "awaiting_payment"].includes(order.stage))
      throw new Error(
        "O pedido precisa entrar na fila antes de iniciar o trabalho.",
      );
    next.stage = demoStages[demoStages.indexOf(order.stage) + 1];
    append(
      `${stageLabels[next.stage]} — simulação`,
      next.stage === "delivered"
        ? "Revisão e assinatura fictícias concluídas. Os entregáveis exibidos são exemplos."
        : "Etapa avançada na apresentação pelo responsável fictício.",
    );
  }
  return next;
}
export function initialDemoState(): DemoState {
  const answers = newDemoAnswers();
  let active = createDemoOrder(
    answers,
    "MAR-2026-001",
    "Alvorada Serviços × Reclamante fictício",
  );
  for (const action of ["accept", "document", "deposit", "advance"] as const)
    active = transitionDemo(active, action);
  const proposal = createDemoOrder(
    { ...answers, calculationType: "challenge" },
    "MAR-2026-002",
    "Horizonte Comércio × Reclamante fictício",
  );
  let delivered = createDemoOrder(
    { ...answers, calculationType: "update" },
    "MAR-2026-003",
    "Cedro Logística × Reclamante fictício",
  );
  for (const action of [
    "accept",
    "document",
    "deposit",
    "advance",
    "advance",
    "advance",
    "advance",
  ] as const)
    delivered = transitionDemo(delivered, action);
  return { version: 1, orders: [active, proposal, delivered] };
}
const storedOrderSchema = z.object({
  id: z.string().min(1).max(50),
  title: z.string().min(1).max(100),
  answers: checklistLaborV1,
  stage: z.enum(demoStages),
  deposit: z.boolean(),
  document: z.boolean(),
  events: z
    .array(
      z.object({
        label: z.string().max(150),
        detail: z.string().max(500),
        at: z.iso.datetime(),
      }),
    )
    .max(25),
  messages: z
    .array(
      z.object({
        author: z.enum(["lawyer", "professional"]),
        text: z.string().max(1000),
      }),
    )
    .max(50),
});
export function restoreDemoState(value: unknown): DemoState {
  const result = z
    .object({
      version: z.literal(1),
      orders: z.array(storedOrderSchema).min(1).max(12),
    })
    .parse(value);
  if (new Set(result.orders.map((o) => o.id)).size !== result.orders.length)
    throw new Error("Pedidos duplicados.");
  return {
    version: 1,
    orders: result.orders.map((order) => {
      if (
        (order.stage !== "quoted" &&
          !order.events.some(
            (e) => e.label === "Aceite da proposta — simulação",
          )) ||
        (demoStages.indexOf(order.stage) >= 2 &&
          (!order.deposit || !order.document))
      )
        throw new Error("Histórico demonstrativo inconsistente.");
      return { ...order, quote: buildDemoQuote(order.answers) };
    }),
  };
}
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(`${date}T15:00:00Z`));
