import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { balanceJourneyFixture } from "../e2e/balance-journey-helper";
import { financialJourneyFixture } from "../e2e/financial-journey-helper";
import { quoteSession } from "../e2e/quote-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { paymentObligationSchema } from "@/modules/payments/obligation-data";
import { paymentIntentReceiptSchema } from "@/modules/payments/intents";
import { applyFixtureFinancialObservation } from "@/modules/payments/financial-application";
import { resolveFixtureFinancialApplication } from "@/modules/payments/financial-resolution";
let f: Awaited<ReturnType<typeof balanceJourneyFixture>> | undefined;
let pendingSignal:
  Awaited<ReturnType<typeof financialJourneyFixture>> | undefined;
afterEach(async () => {
  await f?.cleanup();
  f = undefined;
  await pendingSignal?.cleanup();
  pendingSignal = undefined;
}, 60000);
const setup = async (method = "PIX") =>
  (f = await balanceJourneyFixture(method));
async function obligation(
  role: "client" | "clientB" | "calculator" | "admin" = "client",
) {
  const session = await quoteSession(role);
  try {
    return await session.rpc("get_payment_obligation", {
      target_order: f!.signal.sample.order_id,
      target_phase: "balance",
    });
  } finally {
    await session.auth.signOut({ scope: "local" });
  }
}
it.each(["PIX", "BOLETO", "CREDIT_CARD"])(
  "%s emite saldo remanescente, recebe sem descontar taxa e mantém sinal",
  async (method) => {
    const b = await setup(method);
    const { context } = await b.reserve();
    expect(context.snapshot).toMatchObject({
      phase: "balance",
      requiredCents: 25001,
      creditedCents: 12501,
      remainingCents: 12500,
      billingType: method,
    });
    expect((await b.advance()).state).toBe("identified");
    await b.capture();
    await b.observe("pending");
    await b.apply();
    expect(b.view()).toMatchObject({
      status: "delivered",
      posts: 1,
      payments: 1,
      reservations: 1,
      claims: 1,
      policy: null,
      projection: { depositCreditCents: 12501, totalCreditCents: null },
    });
    const received = await b.receive();
    expect(received.origin.phase).toBe("balance");
    expect(received.binding.phase).toBe("balance");
    expect(received.resolution?.reason).toBe("financial_received");
    expect(b.view()).toMatchObject({
      status: "delivered",
      posts: 1,
      payments: 1,
      reservations: 0,
      claims: 1,
      policy: null,
      projection: { depositCreditCents: 12501, totalCreditCents: 25001 },
      position: { feeCents: 100 },
    });
    const current = await obligation();
    expect(current.error).toBeNull();
    expect(paymentObligationSchema.parse(current.data)).toMatchObject({
      phase: "balance",
      status: "settled",
      remainingCents: 0,
    });
    const replay = await applyFixtureFinancialObservation({
      observationId: received.application.observationId,
      requestId: received.application.requestId,
    });
    expect(replay).toEqual(received.application);
    expect(
      await resolveFixtureFinancialApplication({
        applicationRequestId: received.application.requestId,
        requestId: received.resolution!.requestId,
      }),
    ).toEqual(received.resolution);
    expect(b.view().projection.totalCreditCents).toBe(25001);
  },
  60000,
);
it("saldo exige entrega técnica do mesmo pedido mesmo com sinal recebido", async () => {
  const b = await setup();
  sql(
    `delete from public.deliveries where order_id='${b.signal.sample.order_id}';`,
  );
  const current = await obligation();
  expect(current.error).toBeNull();
  expect(paymentObligationSchema.parse(current.data)).toMatchObject({
    status: "blocked",
    reason: "phase_unavailable",
    remainingCents: null,
  });
  await expect(b.reserve()).rejects.toThrow(
    "Contexto da fixture indisponível.",
  );
  expect(b.view()).toMatchObject({ posts: 0, payments: 0, reservations: 0 });
});
it.each(["clientB", "admin"] as const)(
  "%s não consulta obrigação de saldo do proprietário",
  async (role) => {
    await setup();
    expect((await obligation(role)).error).not.toBeNull();
  },
);
it("perda depois de criar saldo recupera pela busca sem repetir POST", async () => {
  const b = await setup();
  await b.reserve();
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior,calls_left) values('${b.signal.scopeId}','${b.signal.owner.id}','payment_create','lost_after_create',1);`,
  );
  expect((await b.advance()).state).toBe("held");
  expect(b.view()).toMatchObject({ posts: 1, payments: 1, reservations: 1 });
  expect((await b.advance()).state).toBe("identified");
  expect((await b.advance()).state).toBe("identified");
  await b.capture();
  const result = await b.receive();
  expect(result.resolution?.reason).toBe("financial_received");
  expect(b.view()).toMatchObject({ posts: 1, payments: 1, reservations: 0 });
});
it("reservas concorrentes de saldo admitem uma intenção e recusam a outra", async () => {
  const b = await setup();
  const results = await Promise.allSettled([b.reserve(), b.reserve()]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    1,
  );
  const own = results.find((result) => result.status === "fulfilled")!;
  if (own.status !== "fulfilled") throw new Error("Reserva ausente.");
  const session = await quoteSession();
  try {
    const replay = await session.rpc("reserve_payment_intent", {
      target_context: own.value.context.id,
      request_id: own.value.requestId,
    });
    expect(replay.error).toBeNull();
    expect(paymentIntentReceiptSchema.parse(replay.data)).toEqual(
      own.value.receipt,
    );
    await Promise.allSettled([b.advance(), b.advance()]);
    await b.advance();
    expect(b.view()).toMatchObject({ posts: 1, payments: 1, reservations: 1 });
  } finally {
    await session.auth.signOut({ scope: "local" });
  }
});
it("refund líquido do sinal altera saldo sem deduzir taxa", async () => {
  const b = await setup();
  await b.signal.observe("refund_partial");
  await b.signal.apply();
  expect(b.view().projection).toMatchObject({
    depositCreditCents: 11500,
    totalCreditCents: 11500,
  });
  const { context } = await b.reserve();
  expect(context.snapshot).toMatchObject({
    creditedCents: 11500,
    remainingCents: 13501,
  });
  expect((await b.advance()).state).toBe("identified");
  await b.capture();
  await b.receive();
  expect(b.view().projection).toMatchObject({
    depositCreditCents: 11500,
    totalCreditCents: 25001,
  });
});
it("incerteza do sinal impede preparar e enviar saldo", async () => {
  const b = await setup();
  await b.signal.observe("unknown");
  await b.signal.apply();
  expect(
    paymentObligationSchema.parse((await obligation()).data),
  ).toMatchObject({
    status: "blocked",
    reason: "financial_reconciliation",
    remainingCents: null,
  });
  await expect(b.reserve()).rejects.toThrow(
    "Contexto da fixture indisponível.",
  );
  expect(b.view()).toMatchObject({ posts: 0, payments: 0, reservations: 0 });
});
it("sinal parcial ainda reservado impede emitir saldo de outra fase", async () => {
  pendingSignal = await financialJourneyFixture();
  const signal = pendingSignal;
  await signal.observe("partial");
  await signal.createOrigin();
  await signal.apply();
  await signal.bind();
  await signal.deliver(signal.sample);
  const session = await quoteSession();
  try {
    const context = await signal.prepare(signal.sample, session, "balance");
    expect(context.snapshot.remainingCents).toBe(15001);
    expect(
      (
        await session.rpc("reserve_payment_intent", {
          target_context: context.id,
          request_id: randomUUID(),
        })
      ).error?.code,
    ).toBe("PT409");
    expect(
      sql(
        `select intent_id from private.payment_intent_reservations where order_id='${signal.sample.order_id}';`,
      ),
    ).toBe(signal.intentId);
    expect(
      sql(
        `select count(*) from private.payment_fixture_payments where client_id='${signal.owner.id}';`,
      ),
    ).toBe("1");
  } finally {
    await session.auth.signOut({ scope: "local" });
  }
});
it("crédito do sinal alterado depois de reservar impede emissão do valor antigo", async () => {
  const b = await setup();
  await b.reserve();
  await b.signal.observe("refund_partial");
  await b.signal.apply();
  expect((await b.advance()).state).toBe("held");
  expect(b.view()).toMatchObject({ posts: 0, payments: 0, reservations: 1 });
});
it("saldo sem meio escolhido não confirma dinheiro nem libera a reserva", async () => {
  const b = await setup("UNDEFINED");
  await b.reserve();
  await b.advance();
  await b.capture();
  await b.observe("received");
  const application = await b.apply();
  expect(b.view()).toMatchObject({
    projection: { depositCreditCents: 12501, totalCreditCents: null },
    reservations: 1,
    posts: 1,
  });
  expect(
    await resolveFixtureFinancialApplication({
      applicationRequestId: application.requestId,
      requestId: randomUUID(),
    }),
  ).toBeNull();
});
it("excesso no sinal bloqueia nova cobrança em vez de reduzir silenciosamente o saldo", async () => {
  const b = await setup();
  await b.signal.observe("excess");
  await b.signal.apply();
  expect(
    paymentObligationSchema.parse((await obligation()).data),
  ).toMatchObject({
    status: "blocked",
    reason: "credit_excess",
    remainingCents: null,
  });
  await expect(b.reserve()).rejects.toThrow(
    "Contexto da fixture indisponível.",
  );
  expect(b.view()).toMatchObject({ posts: 0, payments: 0, reservations: 0 });
});
it("saldo parcial mantém proteção e refund integral não desfaz crédito do sinal", async () => {
  const b = await setup();
  await b.reserve();
  await b.advance();
  await b.capture();
  const partial = await b.receive("partial");
  expect(partial.resolution).toBeNull();
  expect(b.view()).toMatchObject({
    reservations: 1,
    projection: { totalCreditCents: 24001, depositCreditCents: 12501 },
  });
  await b.observe("refund");
  const refunded = await b.apply();
  expect(b.view().position).toMatchObject({
    certainty: "known",
    receivedGrossCents: 11500,
    completedRefundCents: 11500,
    creditCents: 0,
    resolutionCandidate: "refunded",
  });
  expect(
    await resolveFixtureFinancialApplication({
      applicationRequestId: refunded.requestId,
      requestId: randomUUID(),
    }),
  ).toMatchObject({ reason: "financial_refunded" });
  expect(b.view()).toMatchObject({
    reservations: 0,
    projection: { totalCreditCents: 12501, depositCreditCents: 12501 },
  });
});
it("erro de auditoria reverte reserva e recibo de saldo; mesma tentativa recupera depois", async () => {
  const b = await setup(),
    session = await quoteSession();
  const name = "balance_audit_" + randomUUID().replaceAll("-", "");
  try {
    const context = await b.signal.prepare(b.signal.sample, session, "balance"),
      request = randomUUID();
    sql(
      `create function private.${name}() returns trigger language plpgsql set search_path='' as $$ begin if new.action='payment_intent_reserved' and exists(select 1 from private.payment_intents where id=new.target_id and context_id='${context.id}') then raise exception 'Falha ficticia do saldo'; end if; return new; end $$;create trigger ${name} before insert on public.audit_log for each row execute function private.${name}();`,
    );
    const args = { target_context: context.id, request_id: request };
    expect(
      (await session.rpc("reserve_payment_intent", args)).error,
    ).not.toBeNull();
    expect(
      sql(
        `select count(*) from private.payment_intents where context_id='${context.id}';`,
      ),
    ).toBe("0");
    expect(
      sql(
        `select count(*) from private.payment_intent_requests where id='${request}';`,
      ),
    ).toBe("0");
    expect(b.view().reservations).toBe(0);
    sql(
      `drop trigger ${name} on public.audit_log;drop function private.${name}();`,
    );
    const retried = await session.rpc("reserve_payment_intent", args);
    expect(retried.error).toBeNull();
    expect(
      paymentIntentReceiptSchema.parse(retried.data).snapshot.intent.id,
    ).toBeTruthy();
    expect(
      sql(
        `select count(*) from private.payment_intents where context_id='${context.id}';`,
      ),
    ).toBe("1");
    expect(b.view()).toMatchObject({ reservations: 1, posts: 0, payments: 0 });
  } finally {
    sql(
      `drop trigger if exists ${name} on public.audit_log;drop function if exists private.${name}();`,
    );
    await session.auth.signOut({ scope: "local" });
  }
});
