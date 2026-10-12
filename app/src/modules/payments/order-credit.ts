import { z } from "zod";
const financialId = z.uuid().transform((value) => value.toLowerCase());
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const unavailable = "Projeção financeira indisponível.";
export const orderCreditProjectionSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    semantics: z.literal("credit_projection"),
    orderId: financialId,
    effects: z.literal("none"),
    requiredDepositCents: cents.nullable(),
    totalCents: cents.nullable(),
    manualDepositCents: cents.nullable(),
    manualTotalCents: cents.nullable(),
    providerObservedDepositCents: cents.nullable(),
    providerObservedTotalCents: cents.nullable(),
    depositCreditCents: cents.nullable(),
    totalCreditCents: cents.nullable(),
    depositUncertain: z.boolean(),
    uncertain: z.boolean(),
    unsafeAmount: z.boolean(),
    partial: z.boolean().nullable(),
    remainingDepositCents: cents.nullable(),
    remainingTotalCents: cents.nullable(),
    depositExcessCents: cents.nullable(),
    totalExcessCents: cents.nullable(),
    unlinkedLegacyCount: cents,
    missingPositionCount: cents,
    pendingChargeCount: cents,
    conflictedChargeCount: cents,
  })
  .superRefine((v, ctx) => {
    if (
      (!v.depositUncertain && v.depositCreditCents === null) ||
      (!v.uncertain && v.totalCreditCents === null) ||
      (v.depositUncertain &&
        (v.depositCreditCents !== null ||
          v.partial !== null ||
          v.remainingDepositCents !== null ||
          v.depositExcessCents !== null)) ||
      (v.uncertain &&
        (v.totalCreditCents !== null ||
          v.remainingTotalCents !== null ||
          v.totalExcessCents !== null))
    )
      ctx.addIssue({ code: "custom", message: unavailable });
  });

export type OrderCreditProjection = z.infer<typeof orderCreditProjectionSchema>;
export const collectionStates = [
  "clear",
  "reconcile",
  "excess",
  "active",
] as const;
export function collectionState(
  projection: OrderCreditProjection,
  activeReservation: boolean,
) {
  if (
    projection.unsafeAmount ||
    projection.depositUncertain ||
    projection.uncertain ||
    projection.depositCreditCents === null ||
    projection.totalCreditCents === null
  )
    return "reconcile";
  if (
    (projection.depositExcessCents ?? 0) > 0 ||
    (projection.totalExcessCents ?? 0) > 0
  )
    return "excess";
  return activeReservation ? "active" : "clear";
}
export const currentOrderCreditSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    semantics: z.literal("current_order_credit"),
    orderId: financialId,
    hasContract: z.boolean(),
    activeReservation: z.boolean(),
    collectionState: z.enum(collectionStates),
    projection: orderCreditProjectionSchema,
  })
  .superRefine((v, ctx) => {
    const p = v.projection;
    const depositInvalid =
      !p.depositUncertain &&
      (p.requiredDepositCents === null ||
        p.depositCreditCents === null ||
        p.remainingDepositCents !==
          Math.max(p.requiredDepositCents - p.depositCreditCents, 0) ||
        p.depositExcessCents !==
          Math.max(p.depositCreditCents - p.requiredDepositCents, 0));
    const totalInvalid =
      !p.uncertain &&
      (p.totalCents === null ||
        p.totalCreditCents === null ||
        p.remainingTotalCents !==
          Math.max(p.totalCents - p.totalCreditCents, 0) ||
        p.totalExcessCents !== Math.max(p.totalCreditCents - p.totalCents, 0));
    if (
      v.orderId !== v.projection.orderId ||
      depositInvalid ||
      totalInvalid ||
      v.collectionState !== collectionState(v.projection, v.activeReservation)
    )
      ctx.addIssue({ code: "custom", message: unavailable });
  });
export type CurrentOrderCredit = z.infer<typeof currentOrderCreditSchema>;
export function parseCurrentOrderCredits(
  value: unknown,
  expectedIds: readonly string[],
) {
  const ids = z.array(financialId).max(50).parse(expectedIds);
  const rows = z.array(currentOrderCreditSchema).max(50).parse(value);
  const expected = new Set(ids);
  const actual = new Set(rows.map((row) => row.orderId));
  if (
    expected.size !== ids.length ||
    actual.size !== rows.length ||
    rows.length !== ids.length ||
    rows.some((row) => !expected.has(row.orderId))
  )
    throw new Error(unavailable);
  return new Map(rows.map((row) => [row.orderId, row]));
}

export const deliveryCreditSchema = z
  .strictObject({
    deliveryId: financialId,
    orderId: financialId,
    orderCode: z.string().min(1),
    remainingCents: cents.nullable(),
    pixKey: z.string().min(1).nullable(),
    credit: currentOrderCreditSchema,
  })
  .superRefine((v, ctx) => {
    if (
      v.orderId !== v.credit.orderId ||
      v.remainingCents !== v.credit.projection.remainingTotalCents ||
      (v.pixKey !== null &&
        (v.credit.collectionState !== "clear" ||
          v.remainingCents === null ||
          v.remainingCents <= 0))
    )
      ctx.addIssue({ code: "custom", message: unavailable });
  });
export function parseDeliveryCredits(
  value: unknown,
  deliveries: readonly { id: string; order_id: string }[],
) {
  const rows = z.array(deliveryCreditSchema).max(50).parse(value);
  const expected = new Map(deliveries.map((row) => [row.id, row.order_id]));
  if (
    new Set(rows.map((row) => row.deliveryId)).size !== rows.length ||
    new Set(rows.map((row) => row.orderId)).size !== rows.length ||
    rows.some((row) => expected.get(row.deliveryId) !== row.orderId)
  )
    throw new Error(unavailable);
  return new Map(rows.map((row) => [row.deliveryId, row]));
}
export function observedCredit(
  projection: OrderCreditProjection,
  phase: "deposit" | "total",
) {
  const manual =
      phase === "deposit"
        ? projection.manualDepositCents
        : projection.manualTotalCents,
    provider =
      phase === "deposit"
        ? projection.providerObservedDepositCents
        : projection.providerObservedTotalCents;
  if (
    manual === null ||
    provider === null ||
    !Number.isSafeInteger(manual + provider)
  )
    return null;
  return manual + provider;
}
export function creditStateMessage(credit: CurrentOrderCredit) {
  if (credit.collectionState === "reconcile")
    return "Há valores deste pedido em conciliação. Aguarde a conferência antes de realizar outro pagamento.";
  if (credit.collectionState === "excess")
    return "O crédito excede o valor previsto. André precisa conferir antes de solicitar outro pagamento.";
  if (credit.collectionState === "active")
    return "Há uma cobrança em andamento neste pedido. Acompanhe a confirmação antes de realizar outro pagamento.";
  return null;
}
