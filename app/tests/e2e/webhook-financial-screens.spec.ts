import { test, expect, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { webhookUiDriver } from "./webhook-ui-driver";
import { loginAs } from "./auth-helper";
import { localSystem } from "./local-helper";
import { pdfFixture } from "./pdf-helper";
import { independentCleanup } from "../../src/lib/testing/independent-cleanup";
import {
  captureWebhookScreen,
  deliverWebhookScreen,
  uploadWebhookScreen,
  verifyWebhookDownload,
} from "./webhook-screen-helper";
import type { FinancialScenario } from "./financial-scenario-helper";

test.setTimeout(240000);
const scenarios = [
  { name: "partial", scenario: "partial", deposit: 10000, balance: 10000 },
  { name: "excess", scenario: "excess", deposit: 13000, balance: 13000 },
  {
    name: "refund_partial",
    scenario: "refund_partial",
    deposit: 11500,
    balance: 11499,
  },
  { name: "refund_full", scenario: "refund_full", deposit: 0, balance: 0 },
  {
    name: "refund_pending",
    scenario: "refund_pending",
    deposit: null,
    balance: null,
    observedDeposit: 12501,
    observedBalance: 12500,
  },
  {
    name: "chargeback_dispute",
    scenario: "chargeback_dispute",
    deposit: null,
    balance: null,
    observedDeposit: 10500,
    observedBalance: 10499,
  },
  {
    name: "chargeback_debit",
    scenario: "chargeback_debit",
    deposit: 10500,
    balance: 10499,
  },
  {
    name: "chargeback_restore",
    scenario: "chargeback_restore",
    deposit: 11501,
    balance: 11500,
  },
  {
    name: "chargeback_restore_full",
    scenario: "chargeback_restore_full",
    deposit: 12501,
    balance: 12500,
  },
  {
    name: "unknown",
    scenario: "unknown",
    deposit: null,
    balance: null,
    observedDeposit: 12501,
    observedBalance: 12500,
  },
  {
    name: "value_decline",
    scenario: "partial",
    deposit: null,
    balance: null,
    observedDeposit: 12501,
    observedBalance: 12500,
  },
] satisfies {
  name: string;
  scenario: FinancialScenario;
  deposit: number | null;
  balance: number | null;
  observedDeposit?: number;
  observedBalance?: number;
}[];
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
const accessText = {
  ready: "Arquivos liberados para download.",
  financial_pending:
    "Entrega confirmada. Os valores aceitos e o crédito precisam ser conferidos antes de liberar os arquivos.",
  balance_pending:
    "Entrega confirmada. O download aguarda a confirmação do saldo.",
} as const;

for (const phase of ["deposit", "balance"] as const) {
  for (const policy of (phase === "deposit"
    ? ["after_balance"]
    : ["before_balance", "after_balance"]) as (
    "before_balance" | "after_balance"
  )[]) {
    for (const row of scenarios) {
      test(`${phase}/${policy}/${row.name}: telas e bytes correspondem ao crédito do webhook`, async ({
        page,
        browser,
      }, info) => {
        const method = row.name.startsWith("chargeback")
          ? "CREDIT_CARD"
          : "PIX";
        const driver = await webhookUiDriver(method),
          m = driver.metadata,
          db = localSystem();
        let calculatorContext: BrowserContext | undefined,
          failed = false;
        try {
          calculatorContext = await browser.newContext({
            baseURL: "http://127.0.0.1:3000",
            viewport: info.project.use.viewport,
            isMobile: info.project.use.isMobile,
            hasTouch: info.project.use.hasTouch,
            locale: "pt-BR",
            timezoneId: "America/Sao_Paulo",
          });
          const calculator = await calculatorContext.newPage();
          await loginAs(page);
          await loginAs(calculator, "calculator");
          const clientBase = `/app/processos/${m.processId}`,
            panelBase = `/painel/processos/${m.processId}`;
          const partialDeposit = phase === "deposit" && row.name === "partial";
          expect(
            (
              await driver.command(
                "move",
                partialDeposit ? "partial" : "received",
              )
            ).report.complete,
          ).toBe(1);
          let delivery:
            Awaited<ReturnType<typeof deliverWebhookScreen>> | undefined;
          let frozen = await snapshots();
          if (partialDeposit) {
            await page.goto(`${clientBase}?aba=documentos`);
            await uploadWebhookScreen(
              page,
              "case",
              "Processo fictício do sinal parcial.pdf",
              "application/pdf",
              await readFile(pdfFixture),
            );
            expect((await driver.command("view")).status).toBe(
              "awaiting_payment",
            );
          } else {
            delivery = await deliverWebhookScreen(
              page,
              calculator,
              driver,
              policy,
            );
            frozen = await snapshots();
            const target = await driver.command("prepareBalance");
            expect(target.contracted).toBe(12500);
            // Cada charge tem sua própria reserva. O parcial é o primeiro crédito do saldo.
            if (phase === "deposit" || row.name !== "partial")
              await driver.command("move", "received");
            const transition = await driver.command(
              phase === "deposit" ? "signalMove" : "move",
              row.scenario,
            );
            expect(transition.report.complete).toBe(1);
          }
          const expected = row[phase];
          const observed =
            expected ??
            (phase === "deposit" ? row.observedDeposit! : row.observedBalance!);
          const deposit = phase === "deposit" ? expected : 12501;
          const total =
            expected === null
              ? null
              : phase === "deposit"
                ? expected + (partialDeposit ? 0 : 12500)
                : 12501 + expected;
          const observedTotal =
            phase === "deposit"
              ? observed + (partialDeposit ? 0 : 12500)
              : 12501 + observed;
          const remainingDeposit =
            deposit === null ? null : Math.max(12501 - deposit, 0);
          const remaining = total === null ? null : Math.max(25001 - total, 0);
          const state = await driver.command("view");
          if (row.name === "value_decline") {
            const position =
              phase === "deposit" ? state.signalPosition : state.position;
            console.info(
              JSON.stringify({
                diagnostic: "webhook_value_decline_original",
                phase,
                policy,
                certainty: position.certainty,
                creditCents: position.creditCents,
                lastKnownCreditCents: position.lastKnownCreditCents,
                observedDepositCents:
                  state.projection.providerObservedDepositCents,
                observedTotalCents: state.projection.providerObservedTotalCents,
                pendingChargeCount: state.projection.pendingChargeCount,
                conflictedChargeCount: state.projection.conflictedChargeCount,
              }),
            );
          }
          expect(state.projection).toMatchObject({
            depositCreditCents: deposit,
            totalCreditCents: total,
            providerObservedDepositCents:
              phase === "deposit" ? observed : 12501,
            providerObservedTotalCents: observedTotal,
            remainingDepositCents: remainingDeposit,
            remainingTotalCents: remaining,
            uncertain: expected === null,
            manualDepositCents: 0,
            manualTotalCents: 0,
          });
          expect(
            phase === "deposit" ? state.signalPosition : state.position,
          ).toMatchObject({
            certainty: expected === null ? "reconcile" : "known",
            creditCents: observed,
            feeCents: 100,
          });
          expect(state).toMatchObject({
            totalPosts: partialDeposit ? 1 : 2,
            publicPayments: 0,
            legacyOrigins: 0,
            legacyBindings: 0,
          });
          const access =
            policy === "before_balance"
              ? "ready"
              : expected === null
                ? "financial_pending"
                : total !== null && total >= 25001
                  ? "ready"
                  : "balance_pending";
          async function snapshots() {
            const d = await db
              .from("deliveries")
              .select("*")
              .eq("order_id", m.orderId)
              .order("id");
            const r = await db
              .from("delivery_releases")
              .select("*")
              .eq(
                "delivery_id",
                delivery?.deliveryId ?? "00000000-0000-4000-8000-000000000000",
              );
            const f = await db
              .from("delivery_files")
              .select("file_id,kind,snapshot")
              .eq(
                "delivery_id",
                delivery?.deliveryId ?? "00000000-0000-4000-8000-000000000000",
              )
              .order("file_id");
            expect(d.error).toBeNull();
            expect(r.error).toBeNull();
            expect(f.error).toBeNull();
            return { deliveries: d.data, releases: r.data, files: f.data };
          }
          expect(await snapshots()).toEqual(frozen);
          async function summaries(label: string) {
            for (const [viewer, base, role] of [
              [page, clientBase, "cliente"],
              [calculator, panelBase, "calculista"],
            ] as const) {
              await viewer.goto(`${base}?aba=resumo`);
              const card = viewer.locator(".deposit-card");
              await expect(
                card
                  .locator("dl > div")
                  .filter({
                    has: viewer.getByText("Crédito atual do sinal", {
                      exact: true,
                    }),
                  })
                  .locator("dd"),
              ).toHaveText(
                deposit === null ? "Em conciliação" : money(deposit),
              );
              await expect(
                card
                  .locator("dl > div")
                  .filter({
                    has: viewer.getByText("Falta para o sinal", {
                      exact: true,
                    }),
                  })
                  .locator("dd"),
              ).toHaveText(
                remainingDeposit === null
                  ? "A conferir"
                  : money(remainingDeposit),
              );
              if (deposit === null)
                await expect(card).toContainText(
                  `Subtotal observado: ${money(observed)}`,
                );
              if (phase === "deposit" && expected !== null && expected > 12501)
                await expect(card).toContainText(
                  `Excesso no sinal: ${money(499)}`,
                );
              if (delivery) {
                const record = viewer.locator(
                  `[data-delivery-id="${delivery.deliveryId}"]`,
                );
                await expect(record).toContainText(accessText[access]);
                await expect(
                  record.locator('a[href^="/api/files/"]'),
                ).toHaveCount(
                  role === "calculista" || access === "ready" ? 3 : 0,
                );
                if (role === "cliente" && policy === "before_balance") {
                  // A dívida continua na fatura; esta regra libera sem cobrança no registro da entrega.
                  await expect(record.locator(".delivery-payment")).toHaveCount(
                    0,
                  );
                }
                if (role === "cliente" && policy === "after_balance") {
                  if (total === null) {
                    await expect(record).toContainText("Saldo em conciliação");
                    await expect(record).toContainText(
                      `Subtotal observado: ${money(observedTotal)}`,
                    );
                  } else if (total > 25001)
                    await expect(record).toContainText(
                      `Excesso no pedido: ${money(total - 25001)}`,
                    );
                  else if (remaining! > 0)
                    await expect(record).toContainText(
                      `Saldo pendente: ${money(remaining!)}`,
                    );
                }
              } else {
                await expect(viewer.locator(".delivery-records")).toHaveCount(
                  0,
                );
                await expect(
                  viewer.getByRole("form", { name: /Confirmar entrega/ }),
                ).toHaveCount(0);
              }
              await captureWebhookScreen(
                viewer,
                info,
                `${label}-resumo-${role}`,
              );
            }
          }
          await summaries("01");
          const invoiceRemaining =
            phase === "deposit" ? remainingDeposit : remaining;
          // Um crédito menor exige novo contexto; o link antigo não vira cobrança complementar.
          const invoiceState =
            expected === null
              ? "uncertain"
              : invoiceRemaining === 0 &&
                  !(phase === "balance" && total! > 25001)
                ? "paid"
                : "blocked";
          for (const [viewer, base, role] of [
            [page, clientBase, "cliente"],
            [calculator, panelBase, "calculista"],
          ] as const) {
            await viewer.goto(
              `${base}/fatura?pedido=${m.orderId}${phase === "balance" ? "&fase=balance" : ""}`,
            );
            await expect(
              viewer.locator(`.invoice-state-${invoiceState}`),
            ).toBeVisible();
            await expect(viewer.locator(".invoice-financial dd")).toHaveText(
              invoiceRemaining === null
                ? "A conferir"
                : money(invoiceRemaining),
            );
            await expect(
              viewer.getByRole("link", {
                name: "Abrir fatura conferida",
                exact: true,
              }),
            ).toHaveCount(0);
            expect(
              (await viewer.content()).includes("sandbox.asaas.com/i/"),
            ).toBe(false);
            await captureWebhookScreen(viewer, info, `02-fatura-${role}`);
          }
          if (delivery) {
            const audits = async (actor: string) => {
              const r = await db
                .from("audit_log")
                .select("id")
                .eq("target_id", delivery!.fileId)
                .eq("action", "file_download")
                .eq("actor_id", actor);
              expect(r.error).toBeNull();
              return r.data!.length;
            };
            const owner = await db
              .from("clients")
              .select("owner_id")
              .eq("id", m.clientId)
              .single();
            expect(owner.error).toBeNull();
            const clientActor = owner.data!.owner_id;
            const clientBefore = await audits(clientActor),
              calcBefore = await audits(m.calculatorId);
            await verifyWebhookDownload(
              page,
              delivery.fileId,
              delivery.pdf,
              access === "ready",
            );
            await verifyWebhookDownload(
              calculator,
              delivery.fileId,
              delivery.pdf,
              true,
            );
            expect(await audits(clientActor)).toBe(
              clientBefore + (access === "ready" ? 1 : 0),
            );
            expect(await audits(m.calculatorId)).toBe(calcBefore + 1);
            expect(await snapshots()).toEqual(frozen);
          }
          const timelines = [];
          for (const [viewer, base, role] of [
            [page, clientBase, "cliente"],
            [calculator, panelBase, "calculista"],
          ] as const) {
            await viewer.goto(`${base}?aba=historico`);
            await expect(viewer.locator(".process-timeline")).toContainText(
              "Pagamento",
            );
            timelines.push({
              viewer,
              role,
              text: await viewer.locator(".process-timeline").innerText(),
            });
          }
          const stable = await driver.command("view");
          await driver.command(phase === "deposit" ? "signalReplay" : "replay");
          expect(await driver.command("view")).toEqual(stable);
          for (const timeline of timelines) {
            await timeline.viewer.reload();
            await expect(
              timeline.viewer.locator(".process-timeline"),
            ).toHaveText(timeline.text, { useInnerText: true });
            if (row.name === "unknown")
              await captureWebhookScreen(
                timeline.viewer,
                info,
                `03-replay-historico-${timeline.role}`,
              );
          }
          if (row.name === "unknown" || row.name === "refund_pending") {
            const receivedCount = stable.events.filter(
              (e: { effect: string }) => e.effect === "received",
            ).length;
            await driver.command(
              phase === "deposit" ? "signalMove" : "move",
              row.name === "unknown" ? "current" : "received",
            );
            const recovered = await driver.command("view");
            expect(recovered.projection).toMatchObject({
              depositCreditCents: 12501,
              totalCreditCents: 25001,
              uncertain: false,
            });
            expect(
              recovered.events.filter(
                (e: { effect: string }) => e.effect === "received",
              ),
            ).toHaveLength(receivedCount);
            if (delivery) {
              for (const [viewer, base, role] of [
                [page, clientBase, "cliente"],
                [calculator, panelBase, "calculista"],
              ] as const) {
                await viewer.goto(`${base}?aba=resumo`);
                await expect(
                  viewer.locator(`[data-delivery-id="${delivery.deliveryId}"]`),
                ).toContainText(accessText.ready);
                await captureWebhookScreen(
                  viewer,
                  info,
                  `03-recuperado-${role}`,
                );
              }
              await verifyWebhookDownload(
                page,
                delivery.fileId,
                delivery.pdf,
                true,
              );
              expect(await snapshots()).toEqual(frozen);
            }
          }
          const queued = await db
            .from("notifications")
            .select("id")
            .eq("dedup_key", `queued:${m.orderId}:email`);
          expect(queued.error).toBeNull();
          expect(queued.data).toHaveLength(partialDeposit ? 0 : 1);
          if (partialDeposit) {
            await calculator.goto("/painel/fila");
            await expect(
              calculator.locator(`[data-order-id="${m.orderId}"]`),
            ).toHaveCount(0);
            await captureWebhookScreen(calculator, info, "03-sem-fila-parcial");
          }
          console.info(
            JSON.stringify({
              diagnostic: "webhook_financial_screen",
              phase,
              policy,
              scenario: row.name,
              width: info.project.use.viewport!.width,
              depositCents: deposit,
              totalCents: total,
              observedTotalCents: observedTotal,
              clientBytes: delivery ? access === "ready" : false,
              snapshotPreserved: true,
            }),
          );
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          await independentCleanup(
            [
              {
                name: "calculator-context",
                run: async () => {
                  await calculatorContext?.close();
                },
              },
              { name: "driver-fixture-storage", run: driver.close },
            ],
            failed,
            (resources) =>
              console.info(
                JSON.stringify({
                  diagnostic: "webhook_financial_screen_cleanup",
                  failed: resources,
                }),
              ),
          );
        }
      });
    }
  }
}
