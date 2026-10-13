import {
  test,
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import { webhookUiDriver } from "./webhook-ui-driver";
import { localSystem } from "./local-helper";
import { loginAs } from "./auth-helper";
import { pdfFixture } from "./pdf-helper";
import { independentCleanup } from "../../src/lib/testing/independent-cleanup";
import {
  captureWebhookScreen,
  uploadWebhookScreen,
  deliverWebhookScreen,
  verifyWebhookDownload,
} from "./webhook-screen-helper";

test.setTimeout(240000);
const scenarios = [
  "simulation",
  "no_context",
  "prerequisites",
  "unchecked_review",
  "delivery_loss_before",
  "delivery_loss_after",
  "policy_loss_before",
  "policy_loss_after",
] as const;
for (const scenario of scenarios) {
  test(`${scenario}: webhook preserva pré-condições e tentativa nas telas`, async ({
    page,
    browser,
  }, info) => {
    const driver = await webhookUiDriver(),
      m = driver.metadata,
      db = localSystem();
    let calculatorContext: BrowserContext | undefined,
      strangerContext: BrowserContext | undefined,
      calculator: Page | undefined,
      failed = false;
    const options = {
      baseURL: "http://127.0.0.1:3000",
      viewport: info.project.use.viewport,
      isMobile: info.project.use.isMobile,
      hasTouch: info.project.use.hasTouch,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    };
    const clientBase = `/app/processos/${m.processId}`,
      panelBase = `/painel/processos/${m.processId}`;
    try {
      calculatorContext = await browser.newContext(options);
      calculator = await calculatorContext.newPage();
      await loginAs(page);
      await loginAs(calculator, "calculator");
      const calc = calculator;
      const deliveryRows = async () => {
        const r = await db
          .from("deliveries")
          .select("*")
          .eq("order_id", m.orderId)
          .order("id");
        expect(r.error).toBeNull();
        return r.data!;
      };
      const releases = async (id: string) => {
        const r = await db
          .from("delivery_releases")
          .select("*")
          .eq("delivery_id", id);
        expect(r.error).toBeNull();
        return r.data!;
      };
      const downloadAudits = async (fileId: string) => {
        const r = await db
          .from("audit_log")
          .select("id")
          .eq("target_id", fileId)
          .eq("action", "file_download");
        expect(r.error).toBeNull();
        return r.data!.length;
      };
      const foreign = async (
        fileId?: string,
        quoteId?: string,
        subject: { processId: string; orderId: string } = m,
      ) => {
        const before = fileId ? await downloadAudits(fileId) : 0;
        strangerContext ??= await browser.newContext(options);
        const stranger = await strangerContext.newPage();
        await loginAs(stranger, "clientB");
        const base = `/app/processos/${subject.processId}`;
        expect((await stranger.goto(base))?.status()).toBe(404);
        expect(
          (
            await stranger.goto(`${base}/fatura?pedido=${subject.orderId}`)
          )?.status(),
        ).toBe(404);
        if (quoteId)
          expect(
            (await stranger.goto(`/app/orcamentos/${quoteId}`))?.status(),
          ).toBe(404);
        if (fileId)
          for (const action of ["download", "content"])
            expect(
              (
                await stranger.request.get(`/api/files/${fileId}/${action}`, {
                  maxRedirects: 0,
                })
              ).status(),
            ).toBe(404);
        if (fileId) expect(await downloadAudits(fileId)).toBe(before);
      };
      if (scenario === "simulation" || scenario === "no_context") {
        const quote = await driver.command(
          scenario === "simulation" ? "prepareSimulation" : "prepareNoContext",
        );
        const before = await db
          .from("quotes")
          .select(
            "accepted_at,proposal_snapshot,items,total_cents,is_simulation",
          )
          .eq("id", quote.quoteId)
          .single();
        expect(before.error).toBeNull();
        const result = await driver.command(
          scenario === "simulation"
            ? "mismatchSimulation"
            : "mismatchNoContext",
        );
        expect(result.report).toMatchObject({
          complete: 0,
          quarantined: 1,
          failed: 0,
        });
        const after = await db
          .from("quotes")
          .select(
            "accepted_at,proposal_snapshot,items,total_cents,is_simulation",
          )
          .eq("id", quote.quoteId)
          .single();
        expect(after.error).toBeNull();
        expect(after.data).toEqual(before.data);
        expect(after.data!.accepted_at).toBeNull();
        const order = await db
          .from("orders")
          .select("status")
          .eq("id", quote.orderId)
          .single();
        expect(order.data!.status).toBe("quoted");
        expect(
          (
            await db
              .from("deliveries")
              .select("id")
              .eq("order_id", quote.orderId)
          ).data,
        ).toHaveLength(0);
        for (const [viewer, prefix, role] of [
          [page, "/app", "cliente"],
          [calc, "/painel", "calculista"],
        ] as const) {
          const response = await viewer.goto(
            `${prefix}/orcamentos/${quote.quoteId}`,
          );
          if (scenario === "simulation") {
            expect(response?.status()).toBe(200);
            await expect(
              viewer.getByRole("heading", {
                name: "Proposta de serviço",
                exact: true,
              }),
            ).toBeVisible();
            await expect(
              viewer.getByText(/Ensaio fictício - sem valor comercial/),
            ).toBeVisible();
            await expect(
              viewer.getByRole("button", { name: "Aceitar", exact: true }),
            ).toBeDisabled();
            await expect(
              viewer.getByRole("form", {
                name: "Aceite da proposta",
                exact: true,
              }),
            ).toHaveCount(0);
          } else expect(response?.status()).toBe(404);
          await captureWebhookScreen(viewer, info, `01-proposta-${role}`);
          await viewer.goto(
            `${prefix}/processos/${quote.processId}?aba=resumo`,
          );
          await expect(viewer.getByText(/Orçamento enviado/)).toBeVisible();
          await expect(
            viewer.getByRole("form", { name: /Confirmar entrega/ }),
          ).toHaveCount(0);
          await captureWebhookScreen(viewer, info, `02-processo-${role}`);
        }
        await foreign(undefined, quote.quoteId, quote);
      } else {
        expect((await driver.command("move", "received")).report.complete).toBe(
          1,
        );
        if (scenario === "prerequisites") {
          expect((await driver.command("view")).status).toBe(
            "awaiting_documents",
          );
          await calc.goto("/painel/fila");
          await expect(
            calc.locator(`[data-order-id="${m.orderId}"]`),
          ).toHaveCount(0);
          await captureWebhookScreen(calc, info, "01-sem-documento-sem-fila");
          await page.goto(`${clientBase}?aba=documentos`);
          await uploadWebhookScreen(
            page,
            "case",
            "Processo fictício de pré-condições.pdf",
            "application/pdf",
            await readFile(pdfFixture),
          );
          expect((await driver.command("view")).status).toBe("queued");
          await calc.goto(`${panelBase}?aba=documentos`);
          const pdf = await readFile(pdfFixture);
          await uploadWebhookScreen(
            calc,
            "deliverables",
            "Cálculo ainda não revisado.pdf",
            "application/pdf",
            pdf,
          );
          const uploaded = await db
            .from("files")
            .select("id")
            .eq("process_id", m.processId)
            .eq("folder", "deliverables")
            .single();
          expect(uploaded.error).toBeNull();
          await driver.command("move", "received");
          for (const [viewer, base, role] of [
            [page, clientBase, "cliente"],
            [calc, panelBase, "calculista"],
          ] as const) {
            await viewer.goto(`${base}?aba=resumo`);
            await expect(
              viewer.getByRole("form", { name: /Confirmar entrega/ }),
            ).toHaveCount(0);
            await captureWebhookScreen(viewer, info, `02-sem-revisao-${role}`);
          }
          expect((await driver.command("view")).status).toBe("queued");
          expect(await deliveryRows()).toHaveLength(0);
          await verifyWebhookDownload(page, uploaded.data!.id, pdf, false);
          await foreign(uploaded.data!.id);
          console.info(
            JSON.stringify({
              diagnostic: "webhook_preconditions",
              scenario,
              width: info.project.use.viewport!.width,
              noDocumentNoQueue: true,
              noReviewNoDelivery: true,
            }),
          );
          return;
        }
        const loss = async (
          form: Locator,
          key: string,
          kind: "delivery" | "policy",
          afterCommit: boolean,
        ) => {
          const button = form.getByRole("button", {
            name:
              kind === "delivery"
                ? "Confirmar entrega"
                : "Aprovar regra desta entrega",
            exact: true,
          });
          const pattern = `**/painel/processos/${m.processId}**`;
          let intercepted = false;
          const selected = await form
            .locator("select")
            .evaluateAll((nodes) =>
              nodes.map((node) => (node as HTMLSelectElement).value),
            );
          const checked = await form
            .locator('input[type="checkbox"]')
            .evaluateAll((nodes) =>
              nodes.map((node) => (node as HTMLInputElement).checked),
            );
          const before =
            kind === "delivery"
              ? await deliveryRows()
              : await releases(
                  await form.locator('input[name="deliveryId"]').inputValue(),
                );
          expect(before).toHaveLength(0);
          await calc.route(pattern, async (route) => {
            if (
              !intercepted &&
              route.request().method() === "POST" &&
              route.request().postData()?.includes(key)
            ) {
              intercepted = true;
              if (afterCommit) await route.fetch();
              await route.abort("failed");
            } else await route.continue();
          });
          await button.click();
          await expect(form.getByRole("status")).toContainText(
            kind === "delivery"
              ? "Não foi possível confirmar"
              : "Não foi possível aprovar",
          );
          expect(intercepted).toBe(true);
          expect(
            (await form.locator('input[name="requestId"]').inputValue()) ===
              key,
          ).toBe(true);
          expect(
            await form
              .locator("select")
              .evaluateAll((nodes) =>
                nodes.map((node) => (node as HTMLSelectElement).value),
              ),
          ).toEqual(selected);
          expect(
            await form
              .locator('input[type="checkbox"]')
              .evaluateAll((nodes) =>
                nodes.map((node) => (node as HTMLInputElement).checked),
              ),
          ).toEqual(checked);
          const committed =
            kind === "delivery"
              ? await deliveryRows()
              : await releases(
                  await form.locator('input[name="deliveryId"]').inputValue(),
                );
          expect(committed).toHaveLength(afterCommit ? 1 : 0);
          await captureWebhookScreen(calc, info, `01-perda-${kind}`);
          await calc.unroute(pattern);
          await button.click();
          if (kind === "delivery")
            await expect(
              calc.locator(`[data-delivery-id="${key}"]`),
            ).toBeVisible();
          else await expect(form).toHaveCount(0);
          const final =
            kind === "delivery"
              ? await deliveryRows()
              : await releases(
                  committed[0]?.delivery_id ??
                    (await db
                      .from("deliveries")
                      .select("id")
                      .eq("order_id", m.orderId)
                      .single()
                      .then((r) => r.data!.id)),
                );
          expect(final).toHaveLength(1);
          if (afterCommit) expect(final).toEqual(committed);
        };
        const hooks = scenario.startsWith("delivery_loss")
          ? {
              submitDelivery: (form: Locator, key: string) =>
                loss(form, key, "delivery", scenario.endsWith("after")),
            }
          : scenario.startsWith("policy_loss")
            ? {
                submitPolicy: (form: Locator, key: string) =>
                  loss(form, key, "policy", scenario.endsWith("after")),
              }
            : scenario === "unchecked_review"
              ? {
                  submitDelivery: async (form: Locator, key: string) => {
                    const checkbox = form.getByLabel(
                      "Revisei o cálculo e conferi a assinatura do parecer, o nome e o CRC nos arquivos.",
                      { exact: true },
                    );
                    await checkbox.uncheck();
                    await form
                      .getByRole("button", {
                        name: "Confirmar entrega",
                        exact: true,
                      })
                      .click();
                    await expect(form.getByRole("status")).toHaveText(
                      "Confira os campos indicados.",
                    );
                    await expect(form).toContainText(
                      "Confirme a revisão e a assinatura do parecer.",
                    );
                    expect(await deliveryRows()).toHaveLength(0);
                    expect((await driver.command("view")).status).toBe(
                      "in_review",
                    );
                    expect(
                      (await form
                        .locator('input[name="requestId"]')
                        .inputValue()) === key,
                    ).toBe(true);
                    await captureWebhookScreen(
                      calc,
                      info,
                      "01-revisao-nao-confirmada",
                    );
                    await checkbox.check();
                    await form
                      .getByRole("button", {
                        name: "Confirmar entrega",
                        exact: true,
                      })
                      .click();
                  },
                }
              : {};
        const delivery = await deliverWebhookScreen(
          page,
          calc,
          driver,
          scenario === "unchecked_review" ? null : "after_balance",
          hooks,
        );
        const frozenDelivery = await deliveryRows(),
          frozenRelease = await releases(delivery.deliveryId);
        if (scenario === "unchecked_review") {
          expect((await driver.command("prepareBalance")).contracted).toBe(
            12500,
          );
          expect(
            (await driver.command("move", "received")).report.complete,
          ).toBe(1);
          expect(
            (await driver.command("view")).projection.totalCreditCents,
          ).toBe(25001);
          for (const [viewer, base, role] of [
            [page, clientBase, "cliente"],
            [calc, panelBase, "calculista"],
          ] as const) {
            await viewer.goto(`${base}?aba=resumo`);
            await expect(
              viewer.locator(`[data-delivery-id="${delivery.deliveryId}"]`),
            ).toContainText("aguarda a definição da regra de pagamento");
            await captureWebhookScreen(viewer, info, `02-sem-D6-${role}`);
          }
          expect(await releases(delivery.deliveryId)).toHaveLength(0);
          await verifyWebhookDownload(
            page,
            delivery.fileId,
            delivery.pdf,
            false,
          );
        } else {
          expect((await driver.command("prepareBalance")).contracted).toBe(
            12500,
          );
          expect(
            (await driver.command("move", "received")).report.complete,
          ).toBe(1);
          await page.goto(`${clientBase}?aba=resumo`);
          await expect(
            page.locator(`[data-delivery-id="${delivery.deliveryId}"]`),
          ).toContainText("Arquivos liberados para download.");
          await verifyWebhookDownload(
            page,
            delivery.fileId,
            delivery.pdf,
            true,
          );
          await captureWebhookScreen(page, info, "02-recuperada-cliente");
          expect(await deliveryRows()).toHaveLength(1);
          expect(await releases(delivery.deliveryId)).toHaveLength(1);
        }
        expect(await deliveryRows()).toEqual(frozenDelivery);
        expect(await releases(delivery.deliveryId)).toEqual(frozenRelease);
        expect(await downloadAudits(delivery.fileId)).toBe(
          scenario === "unchecked_review" ? 0 : 1,
        );
        await foreign(delivery.fileId);
        const before = await driver.command("view");
        await driver.command("replay");
        expect(await driver.command("view")).toEqual(before);
      }
      console.info(
        JSON.stringify({
          diagnostic: "webhook_preconditions",
          scenario,
          width: info.project.use.viewport!.width,
          snapshotPreserved: true,
          foreignAccessDenied: true,
        }),
      );
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      await independentCleanup(
        [
          {
            name: "calculator-routes",
            run: async () => {
              await calculator?.unrouteAll({ behavior: "wait" });
            },
          },
          {
            name: "stranger-context",
            run: async () => {
              await strangerContext?.close();
            },
          },
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
              diagnostic: "webhook_preconditions_cleanup",
              failed: resources,
            }),
          ),
      );
    }
  });
}
