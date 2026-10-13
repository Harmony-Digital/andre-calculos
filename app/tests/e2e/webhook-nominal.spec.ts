import {
  test,
  expect,
  type Page,
  type TestInfo,
  type BrowserContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { webhookUiDriver } from "./webhook-ui-driver";
import { localSystem } from "./local-helper";
import { loginAs } from "./auth-helper";
import { pdfFixture } from "./pdf-helper";
import { independentCleanup } from "../../src/lib/testing/independent-cleanup";

test.setTimeout(240000);
async function capture(page: Page, info: TestInfo, name: string) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(info.project.use.viewport!.width);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath(name + ".png"),
    fullPage: true,
  });
}
async function upload(
  page: Page,
  folder: string,
  name: string,
  mime: string,
  bytes: Buffer,
) {
  await page.getByLabel("Pasta de destino").selectOption(folder);
  await expect(page.getByLabel("Escolher arquivo do processo")).toBeEnabled({
    timeout: 60000,
  });
  await page
    .getByLabel("Escolher arquivo do processo")
    .setInputFiles({ name, mimeType: mime, buffer: bytes });
  await expect(page.locator(".upload-box").getByRole("status")).toHaveText(
    "Arquivo enviado e integridade confirmada.",
    { timeout: 60000 },
  );
  await expect(page.getByLabel("Escolher arquivo do processo")).toBeEnabled({
    timeout: 60000,
  });
}
const names = [
  "Cálculo fictício do webhook.pdf",
  "Projeto fictício do webhook.pjc",
  "Parecer fictício do webhook.pdf",
];
const methods = {
  PIX: "Pix",
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão de crédito",
} as const;

for (const method of ["PIX", "BOLETO", "CREDIT_CARD"] as const) {
  test(`${method}: advogado e calculista percorrem sinal, entrega, saldo e bytes pelo webhook`, async ({
    page,
    browser,
  }, info) => {
    const driver = await webhookUiDriver(method),
      m = driver.metadata,
      db = localSystem();
    let calculatorContext: BrowserContext | undefined,
      strangerContext: BrowserContext | undefined;
    let failed = false;
    try {
      const pdf = await readFile(pdfFixture);
      const clientBase = `/app/processos/${m.processId}`,
        panelBase = `/painel/processos/${m.processId}`;
      const options = {
        baseURL: "http://127.0.0.1:3000",
        viewport: info.project.use.viewport,
        isMobile: info.project.use.isMobile,
        hasTouch: info.project.use.hasTouch,
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
      };
      calculatorContext = await browser.newContext(options);
      const calculator = await calculatorContext.newPage();
      await loginAs(page);
      await loginAs(calculator, "calculator");
      await driver.command("move", "current");
      await page.goto(`${clientBase}/fatura?pedido=${m.orderId}`);
      await expect(
        page.getByRole("heading", {
          name: "Cobrança do sinal disponível.",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator(".invoice-summary")).toContainText("R$ 125,01");
      await expect(page.locator(".invoice-summary")).toContainText(
        methods[method],
      );
      expect(await page.content()).not.toContain("sandbox.asaas.com/i/");
      await capture(page, info, "01-sinal-cliente");
      await calculator.goto(`${panelBase}/fatura?pedido=${m.orderId}`);
      await expect(calculator.locator(".invoice-summary")).toContainText(
        "R$ 125,01",
      );
      await capture(calculator, info, "01-sinal-calculista");
      const received = await driver.command("move", "received");
      expect(received.report.complete).toBe(1);
      expect((await driver.command("view")).status).toBe("awaiting_documents");
      for (const [viewer, base] of [
        [page, clientBase],
        [calculator, panelBase],
      ] as const) {
        await viewer.goto(`${base}?aba=historico`);
        await expect(viewer.locator(".process-timeline")).toContainText(
          "Pagamento confirmado",
        );
      }
      await capture(page, info, "02-recebido-cliente");
      await page.goto(`${clientBase}?aba=documentos`);
      await upload(
        page,
        "case",
        "Processo fictício do webhook.pdf",
        "application/pdf",
        pdf,
      );
      await expect
        .poll(async () => (await driver.command("view")).status, {
          timeout: 60000,
        })
        .toBe("queued");
      const original = (
        await db
          .from("files")
          .select("id,sha256,uploaded_by")
          .eq("process_id", m.processId)
          .eq("folder", "case")
          .single()
      ).data!;
      expect(original.sha256).toBe(
        createHash("sha256").update(pdf).digest("hex"),
      );
      expect(
        (
          await db
            .from("notifications")
            .select("id")
            .eq("dedup_key", `queued:${m.orderId}:email`)
        ).data,
      ).toHaveLength(1);
      await calculator.goto("/painel/fila");
      await expect(
        calculator.locator(
          `${info.project.use.viewport!.width < 900 ? ".queue-mobile > li" : ".queue-table tbody > tr"}[data-order-id="${m.orderId}"]`,
        ),
      ).toBeVisible();
      await capture(calculator, info, "03-fila-calculista");
      for (const [event, state] of [
        ["start_analysis", "in_analysis"],
        ["start_calculation", "in_calculation"],
        ["submit_review", "in_review"],
      ] as const) {
        await calculator.goto(`${panelBase}?aba=resumo`);
        const form = calculator.getByRole("form", { name: /Etapas do pedido/ });
        await form.getByLabel("Próxima etapa").selectOption(event);
        await form
          .getByRole("button", { name: "Registrar etapa", exact: true })
          .click();
        await expect(form.getByRole("status")).toContainText(
          "Etapa registrada",
        );
        await expect
          .poll(async () => (await driver.command("view")).status)
          .toBe(state);
      }
      await calculator.goto(`${panelBase}?aba=documentos`);
      for (const [i, name] of names.entries()) {
        await upload(
          calculator,
          "deliverables",
          name,
          i === 1 ? "application/octet-stream" : "application/pdf",
          i === 1
            ? Buffer.from("PJC fictício do webhook, sem cálculo real.")
            : pdf,
        );
        await expect(
          calculator.getByRole("region", {
            name: "Pasta Entregas",
            exact: true,
          }),
        ).toContainText(name);
      }
      const files = (
        await db
          .from("files")
          .select("id,name,sha256,size_bytes")
          .eq("process_id", m.processId)
          .eq("folder", "deliverables")
      ).data!;
      expect(files).toHaveLength(3);
      const bytesFor = (name: string) =>
        name === names[1]
          ? Buffer.from("PJC fictício do webhook, sem cálculo real.")
          : pdf;
      for (const file of files) {
        const bytes = bytesFor(file.name);
        expect(file.sha256).toBe(
          createHash("sha256").update(bytes).digest("hex"),
        );
        expect(file.size_bytes).toBe(bytes.length);
      }
      const fileId = files.find((file) => file.name === names[0])!.id;
      expect(
        (
          await page.request.get(`/api/files/${fileId}/download`, {
            maxRedirects: 0,
          })
        ).status(),
      ).toBe(404);
      await calculator.goto(`${panelBase}?aba=resumo`);
      await calculator
        .getByText(`Confirmar entrega do pedido ${m.code}`, { exact: true })
        .click();
      const form = calculator.getByRole("form", {
        name: `Confirmar entrega ${m.code}`,
        exact: true,
      });
      const deliveryId = await form
        .locator('input[name="requestId"]')
        .inputValue();
      for (const [i, label] of [
        "PDF do cálculo",
        "Arquivo PJC",
        "Parecer assinado em PDF",
      ].entries())
        await form
          .getByLabel(label, { exact: true })
          .selectOption(files.find((file) => file.name === names[i])!.id);
      await form.getByLabel("Versão do PJe-Calc").fill("2.13.1");
      await form.getByLabel("Mês da tabela de índices").fill("10/2026");
      for (const label of [
        "Confirmei que o cálculo está liquidado.",
        "Confirmei que o CPF ou CNPJ está cadastrado no PJC.",
        "Revisei o cálculo e conferi a assinatura do parecer, o nome e o CRC nos arquivos.",
      ])
        await form.getByLabel(label, { exact: true }).check();
      await form
        .getByRole("button", { name: "Confirmar entrega", exact: true })
        .click();
      const record = calculator.locator(`[data-delivery-id="${deliveryId}"]`);
      await expect(record).toBeVisible();
      expect((await driver.command("view")).status).toBe("delivered");
      await page.goto(`${clientBase}?aba=resumo`);
      const clientRecord = page.locator(`[data-delivery-id="${deliveryId}"]`);
      await expect(clientRecord).toContainText(
        "aguarda a definição da regra de pagamento",
      );
      await expect(clientRecord.locator('a[href^="/api/files/"]')).toHaveCount(
        0,
      );
      expect(
        (
          await page.request.get(`/api/files/${fileId}/download`, {
            maxRedirects: 0,
          })
        ).status(),
      ).toBe(404);
      await record
        .getByText("Definir regra desta entrega", { exact: true })
        .click();
      const rule = record.getByRole("form", {
        name: "Regra desta entrega",
        exact: true,
      });
      await rule
        .getByLabel("Quando liberar os arquivos?", { exact: true })
        .selectOption("after_balance");
      await rule
        .getByLabel(
          "Confirmei a regra com o responsável técnico e aprovo sua aplicação.",
        )
        .check();
      await rule
        .getByRole("button", {
          name: "Aprovar regra desta entrega",
          exact: true,
        })
        .click();
      await expect(rule).toHaveCount(0);
      await page.reload();
      await expect(clientRecord).toContainText(
        "aguarda a confirmação do saldo",
      );
      expect(
        (
          await page.request.get(`/api/files/${fileId}/download`, {
            maxRedirects: 0,
          })
        ).status(),
      ).toBe(404);
      const target = await driver.command("prepareBalance");
      expect(target.contracted).toBe(12500);
      expect(await driver.command("prepareBalance")).toEqual(target);
      expect((await driver.command("view")).totalPosts).toBe(2);
      await driver.command("move", "current");
      await page.goto(`${clientBase}/fatura?pedido=${m.orderId}&fase=balance`);
      await expect(
        page.getByRole("heading", {
          name: "Cobrança do saldo disponível.",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator(".invoice-summary")).toContainText("R$ 125,00");
      await expect(page.locator(".invoice-summary")).toContainText(
        methods[method],
      );
      await capture(page, info, "04-saldo-cliente");
      await calculator.goto(
        `${panelBase}/fatura?pedido=${m.orderId}&fase=balance`,
      );
      await expect(calculator.locator(".invoice-summary")).toContainText(
        "R$ 125,00",
      );
      await capture(calculator, info, "04-saldo-calculista");
      const balance = await driver.command("move", "received");
      expect(balance.report.complete).toBe(1);
      const before = await driver.command("view");
      expect(before.projection).toMatchObject({
        depositCreditCents: 12501,
        totalCreditCents: 25001,
        remainingTotalCents: 0,
        manualDepositCents: 0,
      });
      expect(before).toMatchObject({
        publicPayments: 0,
        legacyOrigins: 0,
        legacyBindings: 0,
        totalPosts: 2,
      });
      await driver.command("replay");
      expect(await driver.command("view")).toEqual(before);
      await page.goto(`${clientBase}?aba=resumo`);
      await expect(clientRecord).toContainText(
        "Arquivos liberados para download.",
      );
      await expect(clientRecord.locator('a[href^="/api/files/"]')).toHaveCount(
        3,
      );
      for (const file of files) {
        const response = await page.request.get(
          `/api/files/${file.id}/download`,
          {
            maxRedirects: 0,
          },
        );
        expect(response.status()).toBe(307);
        expect(response.headers()["cache-control"]).toContain("no-store");
        const location = response.headers().location,
          url = new URL(location);
        expect(url.origin).toBe("http://127.0.0.1:54321");
        const claims = JSON.parse(
          Buffer.from(
            url.searchParams.get("token")!.split(".")[1],
            "base64url",
          ).toString(),
        ) as { exp: number };
        const remaining = claims.exp - Math.floor(Date.now() / 1000);
        expect(remaining).toBeGreaterThan(110);
        expect(remaining).toBeLessThanOrEqual(120);
        const download = await page.request.get(location).catch(() => {
          throw new Error(
            "Download do arquivo fictício autorizado não concluído.",
          );
        });
        expect(download.ok()).toBe(true);
        expect((await download.body()).equals(bytesFor(file.name))).toBe(true);
        expect(
          (
            await db
              .from("audit_log")
              .select("id")
              .eq("target_id", file.id)
              .eq("action", "file_download")
              .eq("actor_id", original.uploaded_by)
          ).data,
        ).toHaveLength(1);
        expect(
          (await page.content()).includes(url.searchParams.get("token")!),
        ).toBe(false);
      }
      console.info(
        JSON.stringify({
          diagnostic: "webhook_nominal_bytes",
          method,
          width: info.project.use.viewport!.width,
          files: files.map((file) => ({
            name: file.name,
            sha256: file.sha256,
            bytes: file.size_bytes,
          })),
          signedLifetimeSeconds: 120,
          auditedDownloads: files.length,
        }),
      );
      await capture(page, info, "05-liberada-cliente");
      await calculator.goto(`${panelBase}?aba=resumo`);
      await expect(
        calculator.locator(`[data-delivery-id="${deliveryId}"]`),
      ).toContainText("Arquivos liberados para download.");
      await capture(calculator, info, "05-liberada-calculista");
      strangerContext = await browser.newContext(options);
      const stranger = await strangerContext.newPage();
      await loginAs(stranger, "clientB");
      expect((await stranger.goto(clientBase))?.status()).toBe(404);
      for (const endpoint of ["download", "content"]) {
        const denied = await stranger.request.get(
          `/api/files/${fileId}/${endpoint}`,
          { maxRedirects: 0 },
        );
        expect(denied.status()).toBe(404);
        expect((await denied.body()).equals(pdf)).toBe(false);
      }
      expect(
        (
          await db
            .from("notifications")
            .select("id")
            .eq("dedup_key", `queued:${m.orderId}:email`)
        ).data,
      ).toHaveLength(1);
      for (const [viewer, base, label] of [
        [page, clientBase, "cliente"],
        [calculator, panelBase, "calculista"],
      ] as const) {
        await viewer.goto(`${base}?aba=historico`);
        await expect(viewer.locator(".process-timeline")).toContainText(
          "Pagamento confirmado",
        );
        await expect(viewer.locator(".process-timeline")).toContainText(
          "Entrega confirmada",
        );
        await capture(viewer, info, `06-historico-${label}`);
      }
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
          {
            name: "stranger-context",
            run: async () => {
              await strangerContext?.close();
            },
          },
          { name: "driver-fixture-storage", run: driver.close },
        ],
        failed,
        (resources) =>
          console.info(
            JSON.stringify({
              diagnostic: "webhook_nominal_cleanup",
              failed: resources,
            }),
          ),
      );
    }
  });
}
