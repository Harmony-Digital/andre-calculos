import "server-only";
import { z } from "zod";
import { isCivilDate } from "@/modules/deadlines/calendar";
import { readAsaasScope, readAsaasInvoiceUrl } from "./asaas/contracts";

const id = z.uuid().transform((v) => v.toLowerCase());
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const unavailable = "Não foi possível conferir a fatura.";
export const invoicePhaseSchema = z.enum(["deposit", "balance"]);
export const invoiceStates = [
  "active",
  "paid",
  "blocked",
  "uncertain",
] as const;
export const invoiceReasons = [
  "pending",
  "credit_confirmed",
  "provider_not_ready",
  "client_contract",
  "no_deposit",
  "no_balance",
  "phase_unavailable",
  "no_invoice",
  "protected_execution",
  "context_changed",
  "unsupported_payment",
  "invalid_invoice",
  "reconciliation",
] as const;
const reasonsByState: Record<
  (typeof invoiceStates)[number],
  readonly (typeof invoiceReasons)[number][]
> = {
  active: ["pending"],
  paid: ["credit_confirmed"],
  blocked: [
    "provider_not_ready",
    "client_contract",
    "no_deposit",
    "no_balance",
    "phase_unavailable",
    "no_invoice",
    "protected_execution",
    "context_changed",
    "unsupported_payment",
    "invalid_invoice",
  ],
  uncertain: ["reconciliation", "context_changed", "invalid_invoice"],
};
const schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    semantics: z.literal("invoice_presentation"),
    effects: z.literal("none"),
    mode: z.literal("fixture"),
    phase: invoicePhaseSchema,
    orderId: id,
    processId: id,
    state: z.enum(invoiceStates),
    reason: z.enum(invoiceReasons),
    remainingCents: cents.nullable(),
    invoiceAmountCents: cents.nullable(),
    dueDate: z.string().refine(isCivilDate).nullable(),
    billingType: z
      .enum(["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"])
      .nullable(),
    invoiceUrl: z.string().min(1).max(2048).nullable(),
  })
  .superRefine((v, ctx) => {
    if (
      !reasonsByState[v.state].includes(v.reason) ||
      (v.phase === "balance" &&
        ["client_contract", "no_deposit"].includes(v.reason)) ||
      (v.phase === "deposit" &&
        ["no_balance", "phase_unavailable"].includes(v.reason)) ||
      (v.dueDate === null) !== (v.billingType === null) ||
      (v.state !== "active" && v.invoiceUrl !== null) ||
      (v.state !== "active" && v.invoiceAmountCents !== null) ||
      (v.state === "active" &&
        ((v.remainingCents !== null && v.remainingCents <= 0) ||
          v.invoiceAmountCents === null ||
          v.invoiceAmountCents <= 0 ||
          v.invoiceUrl === null ||
          v.dueDate === null ||
          v.billingType === null)) ||
      (v.state === "paid" && v.remainingCents !== 0) ||
      (v.state === "uncertain" && v.remainingCents !== null) ||
      (v.state === "blocked" &&
        ["client_contract", "no_deposit", "no_balance"].includes(v.reason) &&
        v.remainingCents !== 0)
    )
      ctx.addIssue({ code: "custom", message: unavailable });
  });
export type InvoicePresentation = z.infer<typeof schema>;

/** Valida a apresentação; autorização e origem da resposta pertencem ao servidor. */
export function parseInvoicePresentation(
  value: unknown,
  expected: {
    orderId: string;
    processId: string;
    scope: unknown;
    phase?: InvoicePresentation["phase"];
  },
) {
  const identifiers = z
    .strictObject({ orderId: id, processId: id, phase: invoicePhaseSchema })
    .parse({
      orderId: expected.orderId,
      processId: expected.processId,
      phase: expected.phase ?? "deposit",
    });
  const scope = expected.scope === null ? null : readAsaasScope(expected.scope);
  if (scope !== null && scope.environment !== "sandbox")
    throw new Error(unavailable);
  const parsed = schema.parse(value);
  if (
    (parsed.state === "active" && scope === null) ||
    parsed.orderId !== identifiers.orderId ||
    parsed.phase !== identifiers.phase ||
    parsed.processId !== identifiers.processId
  )
    throw new Error(unavailable);
  return {
    ...parsed,
    invoiceUrl:
      scope === null ? null : readAsaasInvoiceUrl(parsed.invoiceUrl, scope),
  };
}
export const invoiceStateLabels: Record<InvoicePresentation["state"], string> =
  {
    active: "Cobrança do sinal disponível.",
    paid: "Sinal confirmado.",
    blocked: "A cobrança do sinal está bloqueada.",
    uncertain: "A cobrança do sinal precisa de conferência.",
  };
export const invoiceReasonLabels: Record<
  InvoicePresentation["reason"],
  string
> = {
  pending:
    "Consulte a fatura conferida. A disponibilidade do link não comprova pagamento ou crédito recebido.",
  credit_confirmed: "O sinal já está coberto pelo crédito confirmado.",
  provider_not_ready: "O pagamento automático ainda não está disponível.",
  client_contract: "O sinal está dispensado pelo contrato vigente.",
  no_deposit: "Esta proposta não exige sinal.",
  no_balance: "Esta proposta não exige pagamento de saldo.",
  phase_unavailable:
    "A entrega técnica deste pedido ainda precisa ser conferida.",
  no_invoice: "A fatura ainda não está disponível.",
  protected_execution:
    "A cobrança está sendo verificada. Aguarde antes de efetuar outro pagamento.",
  context_changed:
    "Os dados da cobrança mudaram. Solicite uma nova conferência.",
  unsupported_payment: "Esta forma de pagamento precisa ser conferida.",
  invalid_invoice:
    "Não foi possível conferir a fatura. Fale com o responsável.",
  reconciliation: "Aguarde a conferência antes de fazer outro pagamento.",
};
