export const orderStates = [
  "draft",
  "awaiting_triage",
  "in_triage",
  "quoted",
  "awaiting_payment",
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
  clientId: string;
  quoteAccepted: boolean;
  depositConfirmed: boolean;
  hasContract: boolean;
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
  queue: {
    from: ["awaiting_payment", "quoted"],
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

/** Recebe fatos persistidos e verificados; uma entrada do navegador não pode preencher Order. */
export function transition(
  order: Order,
  event: OrderEvent,
  actor: Actor,
): Order {
  const rule: Rule | undefined = rules[event];
  if (
    !actor.id.trim() ||
    (actor.role === "client" && actor.id !== order.clientId)
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
    !(order.hasContract || (order.quoteAccepted && order.depositConfirmed))
  )
    throw new Error(
      "O pedido só entra na fila após o aceite e o sinal confirmado, ou com contrato ativo.",
    );
  if (
    event === "deliver" &&
    (!order.calculatorReviewed ||
      !order.deliveryComplete ||
      (!order.balanceConfirmed && !order.hasContract))
  )
    throw new Error(
      "A entrega exige revisão do André, arquivos completos e saldo confirmado ou contrato ativo.",
    );
  if (event === "request_adjustment" && !order.calculatorReviewed)
    throw new Error(
      "A entrega anterior precisa estar revisada para iniciar um ajuste.",
    );
  const next: Order = { ...order, state: rule.to };
  if (event === "accept_quote") next.quoteAccepted = true;
  if (event === "request_information")
    next.resumeState = order.state as NonNullable<Order["resumeState"]>;
  if (event === "receive_information") {
    next.state = order.resumeState ?? "in_analysis";
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
