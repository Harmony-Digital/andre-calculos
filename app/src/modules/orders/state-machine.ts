export const orderStates = [
  "draft",
  "awaiting_triage",
  "in_triage",
  "quoted",
  "awaiting_payment",
  "awaiting_documents",
  "queued",
  "in_analysis",
  "awaiting_client",
  "in_calculation",
  "in_review",
  "delivered",
  "completed",
  "in_adjustment",
  "cancelled",
  "refunded",
] as const;
export type OrderState = (typeof orderStates)[number];
export const orderStateLabels: Record<OrderState, string> = {
  draft: "Rascunho",
  awaiting_triage: "Aguardando triagem",
  in_triage: "Em triagem",
  quoted: "Orçamento enviado",
  awaiting_payment: "Aguardando sinal",
  awaiting_documents: "Aguardando documentos",
  queued: "Na fila",
  in_analysis: "Em análise",
  awaiting_client: "Aguardando cliente",
  in_calculation: "Em cálculo",
  in_review: "Em revisão",
  delivered: "Entregue",
  completed: "Concluído",
  in_adjustment: "Em ajuste",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};
export type Role = "client" | "calculator" | "admin" | "system";
export type Actor = { id: string; role: Role };
export type Order = {
  state: OrderState;
  clientOwnerId: string;
  quoteAccepted: boolean;
  quoteRejected?: boolean;
  paymentPresent?: boolean;
  depositConfirmed: boolean;
  hasContract: boolean;
  minimumDocumentPresent: boolean;
  calculatorReviewed: boolean;
  deliveryComplete: boolean;
  balanceConfirmed: boolean;
  resumeState?: "in_analysis" | "in_calculation" | "in_review";
};
type Rule = {
  from: readonly OrderState[];
  to: OrderState;
  roles: readonly Role[];
};
const rules = {
  request_triage: {
    from: ["draft"],
    to: "awaiting_triage",
    roles: ["client", "calculator"],
  },
  start_triage: {
    from: ["awaiting_triage"],
    to: "in_triage",
    roles: ["calculator"],
  },
  create_quote: {
    from: ["draft", "in_triage"],
    to: "quoted",
    roles: ["calculator", "system"],
  },
  accept_quote: { from: ["quoted"], to: "awaiting_payment", roles: ["client"] },
  reject_quote: { from: ["quoted"], to: "cancelled", roles: ["client"] },
  queue: {
    from: ["awaiting_payment", "awaiting_documents", "quoted"],
    to: "queued",
    roles: ["calculator", "admin", "system"],
  },
  start_analysis: {
    from: ["queued"],
    to: "in_analysis",
    roles: ["calculator"],
  },
  request_information: {
    from: ["in_analysis", "in_calculation", "in_review"],
    to: "awaiting_client",
    roles: ["calculator"],
  },
  receive_information: {
    from: ["awaiting_client"],
    to: "in_analysis",
    roles: ["calculator"],
  },
  start_calculation: {
    from: ["in_analysis"],
    to: "in_calculation",
    roles: ["calculator"],
  },
  submit_review: {
    from: ["in_calculation", "in_adjustment"],
    to: "in_review",
    roles: ["calculator"],
  },
  return_calculation: {
    from: ["in_review"],
    to: "in_calculation",
    roles: ["calculator"],
  },
  deliver: { from: ["in_review"], to: "delivered", roles: ["calculator"] },
  complete: {
    from: ["delivered"],
    to: "completed",
    roles: ["client", "calculator"],
  },
  request_adjustment: {
    from: ["delivered", "completed"],
    to: "in_adjustment",
    roles: ["client", "calculator"],
  },
  cancel: {
    from: [
      "draft",
      "awaiting_triage",
      "in_triage",
      "quoted",
      "awaiting_payment",
      "awaiting_documents",
      "queued",
      "in_analysis",
      "awaiting_client",
      "in_calculation",
      "in_review",
      "in_adjustment",
    ],
    to: "cancelled",
    roles: ["client", "calculator", "admin"],
  },
  confirm_refund: {
    from: ["cancelled"],
    to: "refunded",
    roles: ["calculator", "admin", "system"],
  },
} as const satisfies Record<string, Rule>;
export type OrderEvent = keyof typeof rules;

/** Fatos financeiros/arquivos vêm do servidor; revisão é atestada pelo calculista autorizado. */
export function transition(
  order: Order,
  event: OrderEvent,
  actor: Actor,
): Order {
  const rule: Rule | undefined = rules[event];
  if (
    !actor.id.trim() ||
    (actor.role === "client" && actor.id !== order.clientOwnerId)
  )
    throw new Error("Você não tem acesso a este pedido.");
  if (!rule || !rule.roles.includes(actor.role))
    throw new Error("Seu papel não permite esta mudança de status.");
  if (!rule.from.includes(order.state))
    throw new Error(
      `Esta ação não está disponível em ${orderStateLabels[order.state] ?? "estado inválido"}.`,
    );
  if (
    event === "queue" &&
    !(
      order.quoteAccepted &&
      (order.hasContract || order.depositConfirmed) &&
      order.minimumDocumentPresent
    )
  )
    throw new Error(
      "O pedido só entra na fila após o aceite, documento confirmado e sinal confirmado ou contrato ativo.",
    );
  if (
    event === "deliver" &&
    (!order.calculatorReviewed || !order.deliveryComplete)
  )
    throw new Error(
      "A entrega exige revisão do André e arquivos completos. A liberação do download segue a regra aprovada de saldo.",
    );
  if (event === "request_adjustment" && !order.calculatorReviewed)
    throw new Error(
      "A entrega anterior precisa estar revisada para iniciar um ajuste.",
    );
  const next: Order = { ...order, state: rule.to };
  if (event === "accept_quote" && order.quoteRejected)
    throw new Error("A proposta já foi recusada.");
  if (
    event === "reject_quote" &&
    (order.quoteRejected ||
      order.quoteAccepted ||
      order.depositConfirmed ||
      order.paymentPresent)
  )
    throw new Error("A proposta já tem decisão ou pagamento registrado.");
  if (event === "reject_quote") {
    next.quoteRejected = true;
    delete next.resumeState;
  }
  if (event === "accept_quote") {
    next.quoteAccepted = true;
    if (order.hasContract)
      next.state = order.minimumDocumentPresent
        ? "queued"
        : "awaiting_documents";
  }
  if (event === "request_information")
    next.resumeState = order.state as NonNullable<Order["resumeState"]>;
  if (event === "receive_information") {
    if (
      !order.resumeState ||
      !["in_analysis", "in_calculation", "in_review"].includes(
        order.resumeState,
      )
    )
      throw new Error(
        "A etapa anterior não está registrada. Confira o pedido antes de retomar.",
      );
    next.state = order.resumeState;
    delete next.resumeState;
  }
  if (
    ["start_calculation", "return_calculation", "request_adjustment"].includes(
      event,
    )
  ) {
    next.calculatorReviewed = false;
    next.deliveryComplete = false;
  }
  return next;
}

export const allowedOrderEvents = Object.keys(rules) as OrderEvent[];
