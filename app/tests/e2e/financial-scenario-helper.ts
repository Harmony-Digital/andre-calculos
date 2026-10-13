import assert from "node:assert/strict";
import { localNotificationSql as sql } from "./notification-helper";
export const financialScenarios = [
  "current",
  "received",
  "partial",
  "excess",
  "refund_partial",
  "refund_full",
  "refund_pending",
  "chargeback_dispute",
  "chargeback_debit",
  "chargeback_restore",
  "chargeback_restore_full",
  "unknown",
] as const;
export type FinancialScenario = (typeof financialScenarios)[number];
const literal = (v: unknown) =>
  "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
/** Muda somente fatos do provedor local. Nenhuma consulta T ou aplicação Y. */
export function setFinancialFixtureScenario(
  input: {
    scopeId: string;
    clientId: string;
    paymentId: string;
    intentId: string;
    contracted: number;
  },
  scenario: FinancialScenario = "current",
) {
  const { scopeId, clientId, paymentId, intentId, contracted } = input;
  const patch = (value: string) =>
    sql(
      `update private.payment_fixture_payments set ${value} where scope_id='${scopeId}' and id='${paymentId}';`,
    );
  const cb = (
    status: string,
    restoration: "none" | "partial" | "full" = "none",
  ) => ({
    status,
    fixtureProof: {
      schemaVersion: 1,
      semantics: "fixture_chargeback_cumulative",
      paymentId,
      reference: intentId,
      caseId: "case_fixture",
      debit: {
        id: "debit_fixture",
        value: 20.01,
        effectedAt: "2026-10-12T10:00:00-03:00",
      },
      reversals:
        restoration !== "none"
          ? [
              {
                id: "reversal_fixture",
                value: 10.01,
                reversesDebitId: "debit_fixture",
                effectedAt: "2026-10-12T11:00:00-03:00",
              },
              ...(restoration === "full"
                ? [
                    {
                      id: "second_reversal_fixture",
                      value: 10,
                      reversesDebitId: "debit_fixture",
                      effectedAt: "2026-10-12T12:00:00-03:00",
                    },
                  ]
                : []),
            ]
          : [],
    },
  });
  assert(financialScenarios.includes(scenario), "Cenário fictício inválido.");
  if (scenario === "unknown")
    sql(
      `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior,calls_left) values('${scopeId}','${clientId}','payment_get','not_found',1) on conflict(scope_id,client_id,operation) do update set behavior='not_found',calls_left=1;`,
    );
  if (["received", "partial", "excess"].includes(scenario)) {
    const gross =
      scenario === "partial"
        ? 10000
        : scenario === "excess"
          ? 13000
          : contracted;
    patch(
      `status='RECEIVED',original_cents=${contracted},value_cents=${gross},net_cents=${gross}-100,refunds='[]',chargeback=null`,
    );
  }
  if (scenario.startsWith("refund_")) {
    const gross = Number(
      sql(
        `select value_cents from private.payment_fixture_payments where scope_id='${scopeId}' and id='${paymentId}';`,
      ),
    );
    const value = scenario === "refund_full" ? gross / 100 : 10.01;
    const refunds = [
      {
        value,
        status: scenario === "refund_pending" ? "PENDING" : "DONE",
        dateCreated: "2026-10-12 10:00:00",
      },
    ];
    if (scenario === "refund_full") {
      const previous: typeof refunds = JSON.parse(
        sql(
          `select refunds from private.payment_fixture_payments where scope_id='${scopeId}' and id='${paymentId}';`,
        ),
      );
      const completed = previous.filter((r) => r.status === "DONE");
      if (completed.length) {
        const refunded = completed.reduce(
          (sum, r) => sum + Math.round(r.value * 100),
          0,
        );
        refunds.splice(0, refunds.length, ...completed);
        if (refunded < gross)
          refunds.push({
            value: (gross - refunded) / 100,
            status: "DONE",
            dateCreated: "2026-10-12 11:00:00",
          });
      }
    }
    patch(
      `status='${scenario === "refund_full" ? "REFUNDED" : scenario === "refund_pending" ? "REFUND_REQUESTED" : "RECEIVED"}',refunds=${literal(refunds)},chargeback=null`,
    );
  }
  if (scenario.startsWith("chargeback_"))
    patch(
      `status='CHARGEBACK_DISPUTE',chargeback=${literal(cb(scenario === "chargeback_dispute" ? "IN_DISPUTE" : "DONE", scenario === "chargeback_restore_full" ? "full" : scenario === "chargeback_restore" ? "partial" : "none"))}`,
    );
}
