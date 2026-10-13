import {
  currentOrderCreditSchema,
  collectionState,
  type OrderCreditProjection,
} from "./order-credit";
/** Crédito sintético para testes puros, sem pagamentos ou dados de processo. */
export function creditFixture(
  patch: Partial<OrderCreditProjection> = {},
  activeReservation = false,
  hasContract = false,
) {
  const projection = {
    schemaVersion: 1 as const,
    semantics: "credit_projection" as const,
    effects: "none" as const,
    orderId: "00000000-0000-4000-8000-000000000101",
    requiredDepositCents: 12501,
    totalCents: 25002,
    manualDepositCents: 0,
    manualTotalCents: 0,
    providerObservedDepositCents: 0,
    providerObservedTotalCents: 0,
    depositCreditCents: 0,
    totalCreditCents: 0,
    depositUncertain: false,
    uncertain: false,
    unsafeAmount: false,
    partial: false,
    remainingDepositCents: 12501,
    remainingTotalCents: 25002,
    depositExcessCents: 0,
    totalExcessCents: 0,
    unlinkedLegacyCount: 0,
    missingPositionCount: 0,
    pendingChargeCount: 0,
    conflictedChargeCount: 0,
    ...patch,
  };
  return currentOrderCreditSchema.parse({
    schemaVersion: 1,
    semantics: "current_order_credit",
    orderId: projection.orderId,
    hasContract,
    activeReservation,
    collectionState: collectionState(projection, activeReservation),
    projection: {
      ...projection,
      partial:
        projection.depositUncertain ||
        projection.requiredDepositCents === null ||
        projection.depositCreditCents === null
          ? null
          : projection.depositCreditCents < projection.requiredDepositCents,
    },
  });
}
