import { z } from "zod";

export const emailTemplates = [
  "welcome",
  "new_signup",
  "quote_created",
  "quote_created_client",
  "quote_accepted",
  "quote_accepted_client",
  "payment_confirmed",
  "order_queued",
  "new_message",
  "deadline_reminder",
  "deadline_two_days",
  "deadline_one_day",
  "deadline_overdue",
  "delivery_ready",
  "deletion_request",
  "account_deletion_requested",
] as const;
export type EmailTemplate = (typeof emailTemplates)[number];

// Origem pública conferida do projeto. Outro domínio exige confirmação de D3.
export const emailPortalOrigin = "https://project-rucji.vercel.app";
const noticeSchema = z.object({
  template: z.enum(emailTemplates),
  data: z.unknown().optional(),
});
export type EmailContent = {
  subject: string;
  label: string;
  heading: string;
  message: string;
  references: { label: string; value: string }[];
  href: string;
};

const messages: Record<EmailTemplate, [string, string, string]> = {
  welcome: [
    "Sua conta no portal",
    "Bem-vindo ao portal",
    "Acompanhe seus pedidos e consulte as próximas etapas pelo portal.",
  ],
  new_signup: [
    "Novo cadastro",
    "Novo cadastro no portal",
    "Há um novo cadastro para consultar no painel.",
  ],
  quote_created: [
    "Orçamento disponível",
    "Uma proposta está disponível",
    "Consulte a proposta e os detalhes do pedido no painel.",
  ],
  quote_created_client: [
    "Orçamento disponível",
    "Sua proposta está disponível",
    "Consulte os serviços, os valores e as condições da proposta no portal.",
  ],
  quote_accepted: [
    "Aceite registrado",
    "O aceite foi registrado",
    "Consulte a situação do pedido e os próximos passos no painel.",
  ],
  quote_accepted_client: [
    "Aceite registrado",
    "Seu aceite foi registrado",
    "Consulte as instruções e os próximos passos do pedido no portal.",
  ],
  payment_confirmed: [
    "Pagamento registrado",
    "Um pagamento foi confirmado",
    "Consulte a situação atual do pedido e suas próximas etapas no portal.",
  ],
  order_queued: [
    "Pedido na fila",
    "O pedido entrou na fila",
    "Acompanhe o trabalho e confira o prazo no painel.",
  ],
  new_message: [
    "Nova mensagem",
    "Há uma nova mensagem",
    "Entre no portal para consultar a conversa.",
  ],
  deadline_reminder: [
    "Prazo do pedido",
    "Acompanhe o prazo do pedido",
    "Confira a data e a situação atual do trabalho na fila do painel.",
  ],
  deadline_two_days: [
    "Prazo do pedido",
    "Acompanhe o prazo do pedido",
    "Confira a data e a situação atual do trabalho na fila do painel.",
  ],
  deadline_one_day: [
    "Prazo do pedido",
    "Acompanhe o prazo do pedido",
    "Confira a data e a situação atual do trabalho na fila do painel.",
  ],
  deadline_overdue: [
    "Prazo do pedido",
    "Acompanhe o prazo do pedido",
    "Confira a data e a situação atual do trabalho na fila do painel.",
  ],
  delivery_ready: [
    "Entrega registrada",
    "Uma entrega foi registrada",
    "Consulte a entrega e as condições de acesso na sua pasta do processo.",
  ],
  deletion_request: [
    "Solicitação registrada",
    "Sua solicitação foi recebida",
    "Acompanhe a situação do pedido de exclusão pelo portal.",
  ],
  account_deletion_requested: [
    "Solicitação de exclusão",
    "Há uma solicitação de exclusão",
    "Consulte a solicitação e as próximas etapas no painel.",
  ],
};

function civilDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const instant = new Date(`${value}T12:00:00Z`);
  if (
    !Number.isFinite(instant.getTime()) ||
    instant.toISOString().slice(0, 10) !== value
  )
    return null;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
function field(data: Record<string, unknown>, key: string, pattern: RegExp) {
  const value = data[key];
  return typeof value === "string" && pattern.test(value) ? value : null;
}

/** Projeção mínima. Payloads da fila nunca são espalhados no modelo. */
export function emailContent(input: unknown): EmailContent {
  const parsed = noticeSchema.safeParse(input);
  if (!parsed.success) throw new Error("Modelo de e-mail não reconhecido.");
  const { template } = parsed.data;
  const data =
    parsed.data.data &&
    typeof parsed.data.data === "object" &&
    !Array.isArray(parsed.data.data)
      ? (parsed.data.data as Record<string, unknown>)
      : {};
  const [label, heading, message] = messages[template];
  const references: EmailContent["references"] = [];
  // Identificadores nunca vêm do path, do destinatário ou de um papel do payload.
  const quoteId = z.uuid().safeParse(data.quote_id);
  const processId = z.uuid().safeParse(data.process_id);
  let path = "/entrar";
  const calculator = [
    "new_signup",
    "quote_created",
    "quote_accepted",
    "order_queued",
    "account_deletion_requested",
  ].includes(template);
  if (calculator) path = "/painel";
  if (["new_signup", "account_deletion_requested"].includes(template))
    path = "/painel/clientes";
  if (template.startsWith("deadline_")) path = "/painel/fila";
  if (["welcome", "deletion_request", "payment_confirmed"].includes(template))
    path = "/app";
  if (
    ["quote_created", "quote_created_client", "quote_accepted_client"].includes(
      template,
    )
  ) {
    path = template === "quote_created" ? "/painel" : "/app";
    if (quoteId.success) path += `/orcamentos/${quoteId.data}`;
  }
  if (
    [
      "quote_accepted",
      "order_queued",
      "payment_confirmed",
      "delivery_ready",
    ].includes(template) &&
    processId.success
  )
    path = `${calculator ? "/painel" : "/app"}/processos/${processId.data}`;
  // new_message não carrega papel confiável: login encaminha cada pessoa.
  if (template === "new_message") path = "/entrar";
  const jobTemplates = ![
    "welcome",
    "new_signup",
    "new_message",
    "deletion_request",
    "account_deletion_requested",
  ].includes(template);
  if (jobTemplates) {
    const code = field(data, "code", /^P-\d{4,10}$/);
    if (code) references.push({ label: "Pedido", value: code });
  }
  if (template.startsWith("quote_")) {
    const number = field(data, "number", /^ORC-\d{4}-\d{4,10}$/);
    if (number) references.push({ label: "Proposta", value: number });
  }
  if (template === "order_queued") {
    const delivery = civilDate(data.delivery_date);
    const internal = civilDate(data.internal_due_date);
    if (delivery || internal)
      references.push({
        label: delivery ? "Entrega prevista" : "Prazo interno",
        value: delivery ?? internal!,
      });
  }
  if (template.startsWith("deadline_")) {
    const date = civilDate(data.internal_due_date);
    if (date) references.push({ label: "Prazo interno", value: date });
  }
  return {
    subject: label,
    label,
    heading,
    message,
    references,
    href: `${emailPortalOrigin}${path}`,
  };
}
