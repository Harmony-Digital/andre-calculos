import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
import {
  webhookFinancialJourneyFixture,
  type WebhookJourneyPhase,
} from "../e2e/webhook-financial-journey-helper";

const matrix = [
  ["PIX", "deposit"],
  ["BOLETO", "deposit"],
  ["CREDIT_CARD", "deposit"],
  ["PIX", "balance"],
  ["BOLETO", "balance"],
  ["CREDIT_CARD", "balance"],
] as const;
let f: Awaited<ReturnType<typeof webhookFinancialJourneyFixture>> | undefined;
const fixture = () => f!;
const setup = async (method: string, phase: WebhookJourneyPhase) =>
  (f = await webhookFinancialJourneyFixture(method, phase));
afterEach(async () => {
  try {
    await f?.cleanup();
  } finally {
    f = undefined;
  }
}, 60000);
const invariant = () =>
  expect(fixture().view()).toMatchObject({
    publicPayments: 0,
    legacyOrigins: 0,
    legacyBindings: 0,
    posts: 1,
  });
function credit(expected: number) {
  const j = fixture(),
    v = j.view();
  expect(v.position).toMatchObject({
    certainty: "known",
    creditCents: expected,
    feeCents: 100,
  });
  expect(v.projection).toMatchObject({
    depositCreditCents: j.phase === "deposit" ? expected : 12501,
    totalCreditCents: expected + (j.phase === "balance" ? 12501 : 0),
    uncertain: false,
    manualDepositCents: 0,
  });
  invariant();
}
function uncertain(observedCredit: number) {
  const j = fixture(),
    v = j.view();
  expect(v.position).toMatchObject({
    certainty: "reconcile",
    creditCents: observedCredit,
    lastKnownCreditCents: j.phase === "deposit" ? 12501 : 12500,
    resolutionCandidate: null,
  });
  expect(v.projection).toMatchObject({
    uncertain: true,
    totalCreditCents: null,
    remainingTotalCents: null,
  });
  expect(v.projection.depositCreditCents).toBe(
    j.phase === "deposit" ? null : 12501,
  );
  invariant();
}
it.each(matrix)(
  "%s/%s recebe somente pelo worker, conserva taxa/sinal e recupera receipt",
  async (method, phase) => {
    const j = await setup(method, phase),
      before = j.view();
    j.mutation("received");
    expect(j.view().gets).toBe(before.gets);
    const eventId = "evt_complete_" + randomUUID();
    const result = await j.move("current", { eventId });
    expect(result.report).toEqual({
      selected: 1,
      complete: 1,
      quarantined: 0,
      busy: 0,
      failed: 0,
    });
    expect(result.receipt?.application.position).toMatchObject({
      certainty: "known",
      creditCents: phase === "deposit" ? 12501 : 12500,
      feeCents: 100,
    });
    expect(result.receipt?.resolution?.reason).toBe("financial_received");
    expect(j.view()).toMatchObject({
      chargePhase: phase,
      billingType: method,
      gets: before.gets + 1,
      applications: 1,
      reservations: 0,
      status: phase === "deposit" ? "awaiting_documents" : "delivered",
      projection: {
        depositCreditCents: 12501,
        totalCreditCents: phase === "deposit" ? 12501 : 25001,
        uncertain: false,
        manualDepositCents: 0,
      },
    });
    if (phase === "balance")
      expect(j.view().signalPosition).toMatchObject({
        certainty: "known",
        creditCents: 12501,
      });
    expect(
      j
        .view()
        .notifications.filter(
          (n: { application: string }) =>
            n.application === result.receipt!.applicationRequestId,
        ),
    ).toHaveLength(2);
    invariant();
    const state = j.view();
    const stored = j.stored(result.receipt!.runId);
    expect((await j.receive({ eventId })).kind).toBe("replay");
    expect((await j.process()).selected).toBe(0);
    expect(await j.replay(result.receipt!.runId)).toEqual(result.receipt);
    expect(j.stored(result.receipt!.runId)).toBe(stored);
    expect(j.view()).toEqual(state);
  },
  60000,
);
it.each(matrix)(
  "%s/%s parcial conserva reserva; integral/excesso não deduzem taxa nem alteram receipts antigos",
  async (method, phase) => {
    const j = await setup(method, phase);
    const first = await j.move("partial");
    expect(first.report.complete).toBe(1);
    credit(10000);
    expect(first.receipt?.resolution).toBeNull();
    expect(j.view().reservations).toBe(1);
    expect(
      j.view().projection[
        phase === "deposit" ? "remainingDepositCents" : "remainingTotalCents"
      ],
    ).toBe(phase === "deposit" ? 2501 : 2500);
    const stored = j.stored(first.receipt!.runId);
    const full = await j.move("received", {
      dateCreated: "2020-01-01 00:00:00",
      event: "PAYMENT_CREATED",
    });
    expect(full.report.complete).toBe(1);
    credit(phase === "deposit" ? 12501 : 12500);
    expect(full.receipt?.resolution?.reason).toBe("financial_received");
    expect(j.view().reservations).toBe(0);
    const excess = await j.move("excess");
    expect(excess.report.complete).toBe(1);
    credit(13000);
    expect(
      j.view().projection[
        phase === "deposit" ? "depositExcessCents" : "totalExcessCents"
      ],
    ).toBe(phase === "deposit" ? 499 : 500);
    expect(j.stored(first.receipt!.runId)).toBe(stored);
    const current = j.view();
    expect(await j.replay(first.receipt!.runId)).toEqual(first.receipt);
    expect(j.view()).toEqual(current);
  },
  60000,
);
it.each(matrix)(
  "%s/%s estorno parcial/integral debita uma vez e conserva o sinal de outro meio",
  async (method, phase) => {
    const j = await setup(method, phase);
    const first = await j.move("received");
    const stored = j.stored(first.receipt!.runId);
    const partial = await j.move("refund_partial");
    expect(partial.report.complete).toBe(1);
    expect(partial.receipt?.application.effects).toEqual(["debited"]);
    credit(phase === "deposit" ? 11500 : 11499);
    const full = await j.move("refund_full");
    expect(full.report.complete).toBe(1);
    expect(full.receipt?.application.effects).toEqual(["debited"]);
    credit(0);
    expect(j.view().reservations).toBe(0);
    const before = j.view();
    expect((await j.process()).selected).toBe(0);
    expect(await j.replay(full.receipt!.runId)).toEqual(full.receipt);
    expect(j.view()).toEqual(before);
    expect(j.stored(first.receipt!.runId)).toBe(stored);
  },
  60000,
);
it.each(matrix)(
  "%s/%s estorno pendente preserva subtotal e bloqueia certeza sem zero fictício",
  async (method, phase) => {
    const j = await setup(method, phase);
    await j.move("received");
    const r = await j.move("refund_pending");
    expect(r.report.complete).toBe(1);
    uncertain(phase === "deposit" ? 12501 : 12500);
    expect(r.receipt?.resolution).toBeNull();
    expect(j.view().position.pendingRefundCents).toBe(1001);
    expect(j.view().projection.providerObservedDepositCents).toBe(12501);
  },
  60000,
);
it.each(["deposit", "balance"] as const)(
  "cartão/%s disputa,débito e duas restaurações recompõem crédito sem novo recebimento",
  async (phase) => {
    const j = await setup("CREDIT_CARD", phase);
    const first = await j.move("received");
    const stored = j.stored(first.receipt!.runId);
    const receivedCount = j
      .view()
      .events.filter((e: { effect: string }) => e.effect === "received").length;
    const dispute = await j.move("chargeback_dispute");
    expect(dispute.report.complete).toBe(1);
    uncertain(phase === "deposit" ? 10500 : 10499);
    expect(dispute.receipt?.application.effects).toEqual([
      "debited",
      "reconcile",
    ]);
    const debit = await j.move("chargeback_debit");
    expect(debit.report.complete).toBe(1);
    credit(phase === "deposit" ? 10500 : 10499);
    expect(debit.receipt?.application.effects).toEqual(["reconciled"]);
    const restored = await j.move("chargeback_restore");
    expect(restored.report.complete).toBe(1);
    credit(phase === "deposit" ? 11501 : 11500);
    expect(restored.receipt?.application.effects).toEqual(["restored"]);
    const full = await j.move("chargeback_restore_full");
    expect(full.report.complete).toBe(1);
    credit(phase === "deposit" ? 12501 : 12500);
    expect(full.receipt?.application.effects).toEqual(["restored"]);
    expect(
      j
        .view()
        .events.filter((e: { effect: string }) => e.effect === "received"),
    ).toHaveLength(receivedCount);
    expect(j.stored(first.receipt!.runId)).toBe(stored);
    const equivalent = await j.move("chargeback_restore_full");
    expect(equivalent.report.complete).toBe(1);
    expect(equivalent.receipt?.application.effects).toEqual([]);
    expect(
      j
        .view()
        .events.filter((e: { effect: string }) => e.effect === "received"),
    ).toHaveLength(receivedCount);
  },
  60000,
);
it.each(matrix)(
  "%s/%s UNKNOWN recupera pela consulta atual; evento antigo e conflito não duplicam dinheiro",
  async (method, phase) => {
    const j = await setup(method, phase),
      eventId = "evt_original_" + randomUUID();
    const first = await j.move("received", { eventId });
    const stored = j.stored(first.receipt!.runId);
    const count = j
      .view()
      .events.filter((e: { effect: string }) => e.effect === "received").length;
    const unknown = await j.move("unknown");
    expect(unknown.report.complete).toBe(1);
    expect(unknown.receipt?.resolution).toBeNull();
    uncertain(phase === "deposit" ? 12501 : 12500);
    const fresh = await j.move("current", {
      dateCreated: "2020-01-01 00:00:00",
    });
    expect(fresh.report.complete).toBe(1);
    credit(phase === "deposit" ? 12501 : 12500);
    expect(fresh.receipt?.application.effects).toEqual(["reconciled"]);
    const before = j.view();
    expect(
      (await j.receive({ eventId, patch: { status: "PENDING" } })).kind,
    ).toBe("conflict");
    expect(j.view().projection.uncertain).toBe(true);
    expect((await j.process()).complete).toBe(1);
    credit(phase === "deposit" ? 12501 : 12500);
    expect(j.receipt()?.application.effects).toEqual([]);
    expect(j.view().gets).toBe(before.gets + 1);
    expect(j.view().notifications).toEqual(before.notifications);
    expect(
      j
        .view()
        .events.filter((e: { effect: string }) => e.effect === "received"),
    ).toHaveLength(count);
    expect(j.stored(first.receipt!.runId)).toBe(stored);
  },
  60000,
);
