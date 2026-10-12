import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { Json } from "@/lib/supabase/database.types";

import { executionTransportFixture } from "../e2e/execution-transport-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { localSystem } from "../e2e/local-helper";
import { quoteSession } from "../e2e/quote-helper";
import { advanceFixturePaymentExecution } from "@/modules/payments/execution-worker";
import {
  captureFixtureFinancialObservation,
  queryFixtureFinancialObservation,
  allocateFixtureFinancialQuery,
} from "@/modules/payments/financial-worker";
import {
  deriveFixtureFinancialDecision,
  orderCreditProjectionSchema,
} from "@/modules/payments/financial-projection";
import { applyFixtureFinancialObservation } from "@/modules/payments/financial-application";
let fixture: Awaited<ReturnType<typeof executionTransportFixture>>,
  charge: string,
  payment: string;
let priorNotice: {
  recipient: string | null;
  email: string | null;
  phone: string | null;
  prefs: { channel: string; enabled: boolean; revision: number }[];
};
const reads = new Set<string>();
const literal = (value: unknown) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const change = (patch: string) =>
  sql(
    `update private.payment_fixture_payments set ${patch} where scope_id='${fixture.scopeId}' and id='${payment}';`,
  );
async function project(order = fixture.sample.order_id) {
  const db = await quoteSession();
  try {
    const r = await db.rpc("get_order_financial_projection", {
      target_order: order,
    });
    expect(r.error).toBeNull();
    reads.add(order);
    return orderCreditProjectionSchema.parse(r.data);
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
}
const apply = (observationId: string, requestId = randomUUID()) =>
  applyFixtureFinancialObservation({ observationId, requestId });
const observe = async () =>
  (await queryFixtureFinancialObservation(charge, randomUUID())).observationId;
beforeEach(async () => {
  reads.clear();
  fixture = await executionTransportFixture();
  priorNotice = JSON.parse(
    sql(
      `select json_build_object('recipient',(select profile_id from private.calculator_notification_recipient where singleton),'email',contact_email,'phone',contact_phone,'prefs',coalesce((select json_agg(json_build_object('channel',channel,'enabled',enabled,'revision',revision)) from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated'),'[]'::json)) from public.settings where singleton;`,
    ),
  );
  sql(
    `update private.calculator_notification_recipient set profile_id='${fixture.calculator.id}' where singleton;update public.settings set contact_email='contador@exemplo.com',contact_phone=null where singleton;delete from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated';`,
  );
  await advanceFixturePaymentExecution(fixture.requestId);
  const origin = sql(
    `select o.id from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id='${fixture.intentId}' limit 1;`,
  );
  charge = (await captureFixtureFinancialObservation(origin)).chargeId;
  payment = sql(
    `select provider_payment_id from private.payment_financial_charges where id='${charge}';`,
  );
  change("status='RECEIVED',net_cents=value_cents-100,refunds='[]'");
});
afterEach(async () => {
  try {
    if (reads.size)
      sql(
        `delete from public.audit_log where action='payment_projection_read' and target_id in(${[...reads].map((v) => "'" + v + "'").join(",")});`,
      );
  } finally {
    if (fixture) {
      try {
        const val = (v: string | null) =>
          v === null ? "null" : "'" + v.replaceAll("'", "''") + "'";
        sql(
          `update private.calculator_notification_recipient set profile_id=${val(priorNotice.recipient)} where singleton;update public.settings set contact_email=${val(priorNotice.email)},contact_phone=${val(priorNotice.phone)} where singleton;delete from public.notification_preferences where profile_id='${fixture.calculator.id}' and event='payment_updated';`,
        );
        for (const pref of priorNotice.prefs)
          sql(
            `insert into public.notification_preferences(profile_id,event,channel,enabled,revision) values('${fixture.calculator.id}','payment_updated','${pref.channel}',${pref.enabled},${pref.revision});`,
          );
      } finally {
        await fixture.cleanup();
      }
    }
  }
});

it("aplica recebimento e efeitos na mesma transação sem liberar reserva", async () => {
  const observationId = await observe(),
    r = await apply(observationId);
  expect(r.effects).toEqual(["received"]);
  expect(r.position).toMatchObject({ certainty: "known", creditCents: 12501 });
  expect(r.orderStatus).toBe("awaiting_documents");
  expect((await project()).depositCreditCents).toBe(12501);
  expect(
    sql(
      `select count(*) from private.payment_intent_reservations where intent_id='${fixture.intentId}';`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from public.notifications where data->>'application_id'='${r.requestId}';`,
    ),
  ).toBe("2");
  expect(
    sql(
      `select count(*) from public.timeline_events where data->>'application_id'='${r.requestId}' and actor_id is null;`,
    ),
  ).toBe("1");
  expect(
    sql(
      `select count(*) from public.audit_log where action='payment_financial_applied' and target_id='${r.requestId}' and actor_id is null;`,
    ),
  ).toBe("1");
});

function state() {
  return JSON.parse(
    sql(`select json_build_object(
 'revision',coalesce((select revision from private.payment_financial_positions where charge_id='${charge}'),0),
 'receipts',(select count(*) from private.payment_financial_applications where charge_id='${charge}'),
 'events',(select count(*) from public.timeline_events where data->>'charge_id'='${charge}'),
 'notices',(select count(*) from public.notifications where data->>'charge_id'='${charge}'),
 'status',(select status from public.orders where id='${fixture.sample.order_id}'),
 'observations',(select count(*) from private.payment_financial_observations where charge_id='${charge}'));`),
  );
}
async function raw(
  d: Awaited<ReturnType<typeof deriveFixtureFinancialDecision>>,
  patch: Record<string, unknown> = {},
) {
  return localSystem().rpc("apply_financial_observation", {
    target_observation: d.observationId,
    request_id: randomUUID(),
    expected_position_revision: d.expectedRevision,
    expected_charge_revision: d.expectedChargeRevision,
    expected_journal_fingerprint: d.expectedJournalFingerprint,
    decision_action: d.action,
    position_value: d.position as unknown as Json,
    ...patch,
  });
}
const cb = (status: string, reversals: object[] = []) => ({
  status,
  fixtureProof: {
    schemaVersion: 1,
    semantics: "fixture_chargeback_cumulative",
    paymentId: payment,
    reference: fixture.intentId,
    caseId: "case_fixture",
    debit: {
      id: "debit_fixture",
      value: 20.01,
      effectedAt: "2026-10-12T10:00:00-03:00",
    },
    reversals,
  },
});
const refund = (status: string, value = 10.01) => ({
  value,
  status,
  dateCreated: "2026-10-12 10:00:00",
});

it("recibo imutável sobrevive a resposta perdida, estado e contatos posteriores", async () => {
  const o = await observe(),
    requestId = randomUUID(),
    first = await apply(o, requestId);
  change(`refunds=${literal([refund("DONE")])}`);
  const next = await observe();
  await apply(next);
  const before = state();
  sql(
    "update public.settings set contact_email=null where singleton;update private.payment_fixture_environment set enabled=false where singleton;",
  );
  expect(await apply(o, requestId)).toEqual(first);
  expect(state()).toEqual(before);
  await expect(apply(next, requestId)).rejects.toThrow(
    "Aplicação financeira indisponível.",
  );
});
it("duas solicitações concorrentes aplicam um único efeito econômico", async () => {
  const o = await observe(),
    r = await Promise.all([apply(o), apply(o)]);
  expect(r.flatMap((x) => x.effects)).toEqual(["received"]);
  expect(r.map((x) => x.positionRevision)).toEqual([1, 1]);
  expect(state()).toMatchObject({
    revision: 1,
    receipts: 2,
    events: 1,
    notices: 2,
  });
});
it("mesma solicitação concorrente com IDs divergentes só vincula uma observação", async () => {
  const a = await observe(),
    b = await observe(),
    id = randomUUID();
  const r = await Promise.allSettled([apply(a, id), apply(b, id)]);
  expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
  expect(state().receipts).toBe(1);
});
it.each(["position", "charge", "journal"])(
  "fence %s recusa cálculo obsoleto sem efeitos parciais",
  async (kind) => {
    const o = await observe(),
      d = await deriveFixtureFinancialDecision(o);
    if (kind === "position") await apply(o);
    if (kind === "charge")
      await allocateFixtureFinancialQuery(charge, randomUUID());
    if (kind === "journal")
      sql(
        `insert into private.payment_financial_conflicts(observation_id,attempt_hash) values('${o}','${"a".repeat(64)}');`,
      );
    const before = state(),
      r = await raw(d);
    expect(r.error?.code).toBe("PT412");
    expect(state()).toEqual(before);
  },
);
it("same sem cobertura nova não altera revisão, avisos ou fila", async () => {
  const o = await observe(),
    first = await apply(o),
    before = state(),
    r = await apply(o);
  expect(r).toMatchObject({
    action: "same",
    positionRevision: first.positionRevision,
    effects: [],
  });
  expect(state()).toEqual({ ...before, receipts: before.receipts + 1 });
});
it.each(["open", "not_found"])(
  "same antigo após %s preserva incerteza sem renovar cobertura",
  async (kind) => {
    const o = await observe();
    await apply(o);
    if (kind === "open")
      await allocateFixtureFinancialQuery(charge, randomUUID());
    else {
      sql(
        `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found');`,
      );
      await observe();
    }
    const before = state(),
      r = await apply(o);
    expect(r.effects).toEqual([]);
    expect(r.positionRevision).toBe(before.revision);
    expect((await project()).depositCreditCents).toBeNull();
    expect(state()).toEqual({ ...before, receipts: before.receipts + 1 });
  },
);
it("hold conserva subtotal; consulta equivalente concilia uma vez", async () => {
  await apply(await observe());
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found');`,
  );
  const unknown = await observe(),
    held = await apply(unknown);
  expect(held.effects).toEqual(["reconcile"]);
  expect(held.position).toMatchObject({
    certainty: "reconcile",
    creditCents: 12501,
    lastKnownCreditCents: 12501,
    resolutionCandidate: null,
  });
  expect(await project()).toMatchObject({
    depositCreditCents: null,
    providerObservedDepositCents: 12501,
  });
  const fresh = await observe(),
    r = await apply(fresh);
  expect(r.effects).toEqual(["reconciled"]);
  const again = await apply(fresh);
  expect(again.effects).toEqual([]);
  expect(again.positionRevision).toBe(r.positionRevision);
});
it("débito comprovado durante disputa não desaparece nem se repete ao concluir", async () => {
  await apply(await observe());
  change(`chargeback=${literal(cb("IN_DISPUTE"))}`);
  const debit = await apply(await observe());
  expect(debit.effects).toEqual(["debited", "reconcile"]);
  expect(debit.position).toMatchObject({
    certainty: "reconcile",
    chargebackOutstandingCents: 2001,
    creditCents: 10500,
  });
  change(`chargeback=${literal(cb("DONE"))}`);
  const done = await apply(await observe());
  expect(done.effects).toEqual(["reconciled"]);
  change(
    `chargeback=${literal(cb("DONE", [{ id: "reversal_a", value: 10.01, reversesDebitId: "debit_fixture", effectedAt: "2026-10-12T11:00:00-03:00" }]))}`,
  );
  const restored = await apply(await observe());
  expect(restored.effects).toEqual(["restored"]);
  expect(restored.position?.creditCents).toBe(11501);
});
it("DONE com PENDING anuncia o débito e protege o crédito até conciliação", async () => {
  await apply(await observe());
  change(`refunds=${literal([refund("DONE"), refund("PENDING", 5)])}`);
  const r = await apply(await observe());
  expect(r.effects).toEqual(["debited", "reconcile"]);
  expect(r.position).toMatchObject({
    certainty: "reconcile",
    completedRefundCents: 1001,
    pendingRefundCents: 500,
    creditCents: 11500,
  });
  change(`refunds=${literal([refund("DONE"), refund("CANCELLED", 5)])}`);
  const done = await apply(await observe());
  expect(done.effects).toEqual(["reconciled"]);
  expect(done.position?.creditCents).toBe(11500);
});
it("fonte antiga não retrocede posição após devolução", async () => {
  const old = await observe();
  await apply(old);
  change(`refunds=${literal([refund("DONE")])}`);
  const current = await apply(await observe()),
    before = state(),
    r = await apply(old);
  expect(r).toMatchObject({
    action: "ignore_old",
    effects: [],
    positionRevision: current.positionRevision,
  });
  expect(r.position).toEqual(current.position);
  expect(state()).toEqual({ ...before, receipts: before.receipts + 1 });
});
it("conflito durável conserva valor observado e gera um aviso de conciliação", async () => {
  const o = await observe();
  await apply(o);
  sql(
    `insert into private.payment_financial_conflicts(observation_id,attempt_hash) values('${o}','${"b".repeat(64)}');`,
  );
  const r = await apply(o);
  expect(r.effects).toEqual(["reconcile"]);
  expect(await project()).toMatchObject({
    depositCreditCents: null,
    providerObservedDepositCents: 12501,
    conflictedChargeCount: 1,
  });
  const again = await apply(o);
  expect(again.effects).toEqual([]);
  expect(again.positionRevision).toBe(r.positionRevision);
});
it.each(["client_contact", "calculator_contact", "calculator_role"])(
  "%s inválido reverte aplicação e preserva T",
  async (kind) => {
    const o = await observe(),
      before = state();
    const owner = fixture.owner.owner_id;
    const priorEmail = sql(`select email from auth.users where id='${owner}';`);
    if (kind === "client_contact")
      sql(`update auth.users set email=null where id='${owner}';`);
    if (kind === "calculator_contact")
      sql("update public.settings set contact_email=null where singleton;");
    if (kind === "calculator_role")
      sql(
        `update public.profiles set role='admin' where id='${fixture.calculator.id}';`,
      );
    try {
      await expect(apply(o)).rejects.toThrow();
      expect(state()).toEqual(before);
    } finally {
      if (kind === "client_contact")
        sql(
          `update auth.users set email='${priorEmail.replaceAll("'", "''")}' where id='${owner}';`,
        );
      if (kind === "calculator_role")
        sql(
          `update public.profiles set role='calculator' where id='${fixture.calculator.id}';`,
        );
    }
  },
);
it("preferência desativada conserva efeito e aviso somente do cliente", async () => {
  sql(
    `insert into public.notification_preferences(profile_id,event,channel,enabled,revision) values('${fixture.calculator.id}','payment_updated','email',false,1);update public.settings set contact_email=null where singleton;`,
  );
  const r = await apply(await observe());
  expect(r.effects).toEqual(["received"]);
  expect(state()).toMatchObject({ events: 1, notices: 1 });
});
it("falha após evento reverte toda aplicação; retomada usa T durável", async () => {
  const o = await observe(),
    id = randomUUID(),
    before = state();
  sql(`create function private.fixture_fail_financial_notice() returns trigger language plpgsql set search_path='' as $$begin
 if new.data->>'application_id'='${id}' then raise exception 'falha sintética';end if;return new;end;$$;
 create trigger fixture_fail_financial_notice before insert on public.notifications for each row execute function private.fixture_fail_financial_notice();`);
  try {
    await expect(apply(o, id)).rejects.toThrow();
    expect(state()).toEqual(before);
  } finally {
    sql(
      "drop trigger fixture_fail_financial_notice on public.notifications;drop function private.fixture_fail_financial_notice();",
    );
  }
  expect((await apply(o, id)).effects).toEqual(["received"]);
});
it.each(["client", "clientB", "calculator", "admin"] as const)(
  "%s não executa nem lê recibo privado",
  async (role) => {
    const o = await observe(),
      d = await deriveFixtureFinancialDecision(o),
      db = await quoteSession(role),
      before = state();
    try {
      expect(
        (
          await db.rpc("get_financial_application_receipt", {
            target_observation: o,
            request_id: randomUUID(),
          })
        ).error,
      ).not.toBeNull();
      expect(
        (
          await db.rpc("apply_financial_observation", {
            target_observation: o,
            request_id: randomUUID(),
            expected_position_revision: d.expectedRevision,
            expected_charge_revision: d.expectedChargeRevision,
            expected_journal_fingerprint: d.expectedJournalFingerprint,
            decision_action: d.action,
            position_value: d.position as unknown as Json,
          })
        ).error,
      ).not.toBeNull();
      expect(state()).toEqual(before);
    } finally {
      await db.auth.signOut({ scope: "local" });
    }
  },
);
it("recibo imutável não pode ser atualizado e metadados continuam privados/RLS", async () => {
  const r = await apply(await observe());
  expect(() =>
    sql(
      `update private.payment_financial_applications set result='{}' where request_id='${r.requestId}';`,
    ),
  ).toThrow();
  expect(
    sql(
      "select relrowsecurity from pg_class where oid='private.payment_financial_applications'::regclass;",
    ),
  ).toBe("t");
  expect(
    sql(
      "select has_table_privilege('authenticated','private.payment_financial_applications','SELECT') or has_table_privilege('anon','private.payment_financial_applications','SELECT') or has_table_privilege('service_role','private.payment_financial_applications','SELECT');",
    ),
  ).toBe("f");
});
it("caller não injeta posição e worker recusa ambiente remoto", async () => {
  const o = await observe(),
    before = state();
  await expect(
    applyFixtureFinancialObservation({
      observationId: o,
      requestId: randomUUID(),
      position: { creditCents: 999 },
    }),
  ).rejects.toThrow();
  vi.stubEnv("VERCEL", "1");
  try {
    await expect(apply(o)).rejects.toThrow();
  } finally {
    vi.unstubAllEnvs();
  }
  expect(state()).toEqual(before);
});
it("outro processo recupera o recibo exato sem reaplicar efeitos", async () => {
  const o = await observe(),
    id = randomUUID(),
    r = await apply(o, id),
    before = state();
  const code = `const {createClient}=require('@supabase/supabase-js');const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});db.rpc('get_financial_application_receipt',{target_observation:process.env.FINANCIAL_OBSERVATION,request_id:process.env.FINANCIAL_REQUEST}).then(x=>{if(x.error)process.exit(1);process.stdout.write(JSON.stringify(x.data));});`;
  const result = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", code], {
      cwd: process.cwd(),
      env: { ...process.env, FINANCIAL_OBSERVATION: o, FINANCIAL_REQUEST: id },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (v) => (output += v));
    child.on("error", reject);
    child.on("close", (n) =>
      n === 0
        ? resolve(output)
        : reject(new Error("Retomada fictícia falhou.")),
    );
  });
  expect(JSON.parse(result)).toEqual(r);
  expect(state()).toEqual(before);
});

async function document(uploaded = true) {
  const id = randomUUID();
  expect(
    (
      await fixture.db.from("files").insert({
        id,
        process_id: fixture.sample.process_id,
        order_id: fixture.sample.order_id,
        folder: "case",
        uploaded_by: fixture.owner.owner_id,
        name: "Processo inventado.pdf",
        mime: "application/pdf",
        path: `${fixture.owner.owner_id}/${fixture.sample.process_id}/${id}/ficticio.pdf`,
        size_bytes: 100,
        sha256: uploaded ? "0".repeat(64) : null,
        expected_sha256: "0".repeat(64),
        upload_status: uploaded ? "uploaded" : "pending",
      })
    ).error,
  ).toBeNull();
  return id;
}
it.each([false, true])(
  "fila exige documento confirmado (%s) e crédito suficiente",
  async (uploaded) => {
    await document(uploaded);
    change("original_cents=value_cents,value_cents=10000,net_cents=9900");
    const partial = await apply(await observe());
    expect(partial.position?.creditCents).toBe(10000);
    expect(partial.orderStatus).toBe("awaiting_payment");
    change("value_cents=12501,net_cents=12401");
    const full = await apply(await observe());
    expect(full.orderStatus).toBe(uploaded ? "queued" : "awaiting_documents");
    expect(
      sql(
        `select count(*) from public.audit_log where action='order_queued' and target_id='${fixture.sample.order_id}';`,
      ),
    ).toBe(uploaded ? "1" : "0");
  },
);
it("estorno em trabalho ativo conserva estado e reserva", async () => {
  await document();
  expect((await apply(await observe())).orderStatus).toBe("queued");
  sql(
    `update public.orders set status='in_calculation' where id='${fixture.sample.order_id}';`,
  );
  change(`refunds=${literal([refund("DONE")])}`);
  expect((await apply(await observe())).orderStatus).toBe("in_calculation");
  expect(
    sql(
      `select count(*) from private.payment_intent_reservations where intent_id='${fixture.intentId}';`,
    ),
  ).toBe("1");
});
it("falha no recibo depois da fila reverte posição, estado, eventos e avisos", async () => {
  await document();
  const o = await observe(),
    id = randomUUID(),
    before = state();
  sql(`create function private.fixture_fail_financial_receipt() returns trigger language plpgsql set search_path='' as $$begin if new.request_id='${id}' then raise exception 'falha sintética';end if;return new;end;$$;
 create trigger fixture_fail_financial_receipt before insert on private.payment_financial_applications for each row execute function private.fixture_fail_financial_receipt();`);
  try {
    await expect(apply(o, id)).rejects.toThrow();
    expect(state()).toEqual(before);
    expect(
      sql(
        `select count(*) from public.audit_log where action='order_queued' and target_id='${fixture.sample.order_id}';`,
      ),
    ).toBe("0");
  } finally {
    sql(
      "drop trigger fixture_fail_financial_receipt on private.payment_financial_applications;drop function private.fixture_fail_financial_receipt();",
    );
  }
  expect((await apply(o, id)).orderStatus).toBe("queued");
});
it("RPC não forja restauração durante conciliação após desaparecimento de prova", async () => {
  await apply(await observe());
  change(`chargeback=${literal(cb("DONE"))}`);
  const prior = await apply(await observe());
  change("chargeback=null");
  const o = await observe(),
    d = await deriveFixtureFinancialDecision(o);
  const facts = JSON.parse(
    sql(
      `select facts from private.payment_financial_observations where id='${o}';`,
    ),
  );
  const forged = {
    ...prior.position,
    certainty: "reconcile",
    observationId: o,
    sourceOrder: JSON.parse(
      sql(
        `select source_order from private.payment_financial_observations where id='${o}';`,
      ),
    ),
    snapshot: facts,
    proof: { kind: "unknown" },
    chargebackOutstandingCents: 0,
    creditCents: 12501,
    remainingCents: 0,
    excessCents: 0,
    resolutionCandidate: null,
  };
  const before = state(),
    r = await raw(d, { decision_action: "replace", position_value: forged });
  expect(r.error?.message).toMatch(/Disputa anterior desapareceu/);
  expect(state()).toEqual(before);
});
it("RPC não encobre queda sem devolução comprovada com bruto histórico", async () => {
  await apply(await observe());
  change(
    `status='CHARGEBACK_DISPUTE',original_cents=value_cents,value_cents=10000,net_cents=9900,chargeback=${literal(cb("DONE"))}`,
  );
  const o = await observe(),
    d = await deriveFixtureFinancialDecision(o),
    facts = JSON.parse(
      sql(
        `select facts from private.payment_financial_observations where id='${o}';`,
      ),
    ),
    proof = JSON.parse(
      sql(
        `select proof from private.payment_financial_observations where id='${o}';`,
      ),
    );
  const forged = {
    ...d.position,
    certainty: "known",
    observationId: o,
    sourceOrder: JSON.parse(
      sql(
        `select source_order from private.payment_financial_observations where id='${o}';`,
      ),
    ),
    snapshot: facts,
    proof,
    receivedGrossCents: 12501,
    completedRefundCents: 0,
    pendingRefundCents: 0,
    chargebackOutstandingCents: 2001,
    creditCents: 10500,
    lastKnownCreditCents: 10500,
    remainingCents: 2001,
    excessCents: 0,
    feeCents: 100,
    reasons: [],
    resolutionCandidate: null,
  };
  const before = state(),
    r = await raw(d, { decision_action: "replace", position_value: forged });
  expect(r.error?.message).toMatch(/Valor recebido regrediu sem prova/);
  expect(state()).toEqual(before);
});

it("RPC não apaga subtotal observado com replace sem cálculo após UNKNOWN", async () => {
  await apply(await observe());
  sql(
    `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior) values('${fixture.scopeId}','${fixture.owner.id}','payment_get','not_found');`,
  );
  const o = await observe(),
    d = await deriveFixtureFinancialDecision(o),
    forged = {
      ...d.position,
      observationId: o,
      sourceOrder: null,
      snapshot: null,
      proof: { kind: "unknown" },
      receivedGrossCents: null,
      completedRefundCents: null,
      pendingRefundCents: null,
      chargebackOutstandingCents: null,
      creditCents: null,
      remainingCents: null,
      excessCents: null,
    };
  const before = state(),
    r = await raw(d, { decision_action: "replace", position_value: forged });
  expect(r.error?.message).toMatch(/Posicao nao calculada/);
  expect(state()).toEqual(before);
  expect((await project()).providerObservedDepositCents).toBe(12501);
});

it("RPC não recertifica obrigação PENDING como recebimento histórico", async () => {
  await apply(await observe());
  change("status='PENDING'");
  const o = await observe(),
    d = await deriveFixtureFinancialDecision(o);
  expect(d.action).toBe("hold");
  const facts = JSON.parse(
      sql(
        `select facts from private.payment_financial_observations where id='${o}';`,
      ),
    ),
    forged = {
      ...d.position,
      certainty: "known",
      observationId: o,
      sourceOrder: JSON.parse(
        sql(
          `select source_order from private.payment_financial_observations where id='${o}';`,
        ),
      ),
      snapshot: facts,
      reasons: [],
      resolutionCandidate: "received",
    };
  const before = state(),
    r = await raw(d, { decision_action: "replace", position_value: forged });
  expect(r.error?.message).toMatch(/Estado nao confirma composicao financeira/);
  expect(state()).toEqual(before);
});

it("RPC não ignora motivo de estorno desconhecido no snapshot T", async () => {
  await apply(await observe());
  change(`refunds=${literal([refund("UNEXPECTED", 5)])}`);
  const o = await observe(),
    d = await deriveFixtureFinancialDecision(o);
  expect(d.action).toBe("hold");
  const facts = JSON.parse(
      sql(
        `select facts from private.payment_financial_observations where id='${o}';`,
      ),
    ),
    forged = {
      ...d.position,
      certainty: "known",
      observationId: o,
      sourceOrder: JSON.parse(
        sql(
          `select source_order from private.payment_financial_observations where id='${o}';`,
        ),
      ),
      snapshot: facts,
      reasons: [],
      resolutionCandidate: "received",
    };
  const before = state(),
    r = await raw(d, { decision_action: "replace", position_value: forged });
  expect(r.error?.message).toMatch(/Snapshot exige conciliacao financeira/);
  expect(state()).toEqual(before);
});
