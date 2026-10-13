import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { financialJourneyDriver } from "./financial-journey-driver";
import { loginAs } from "./auth-helper";
import { localSystem } from "./local-helper";
import { pdfFixture } from "./pdf-helper";
test.setTimeout(180000);
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
    path: info.outputPath(`${name}.png`),
    fullPage: true,
  });
}
test("sinal, fila e saldo mostram crédito corrente após estorno e conciliação", async ({
  page,
  browser,
}, info) => {
  const driver = await financialJourneyDriver();
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    viewport: info.project.use.viewport,
    isMobile: info.project.use.isMobile,
    hasTouch: info.project.use.hasTouch,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  try {
    const calculator = await context.newPage(),
      m = driver.metadata;
    page.setDefaultTimeout(10000);
    calculator.setDefaultTimeout(10000);
    expect(
      (
        await localSystem()
          .from("settings")
          .update({ pix_key: "pix-ficticio-leitura-atual" })
          .eq("singleton", true)
      ).error,
    ).toBeNull();
    await driver.command("observe", "received");
    await driver.command("origin");
    await driver.command("apply");
    await driver.command("bind");
    await driver.command("resolve");
    await loginAs(page);
    await loginAs(calculator, "calculator");
    const summary = `/app/processos/${m.processId}?aba=resumo`;
    await page.goto(summary);
    const signal = page.locator(".deposit-card");
    await expect(signal).toContainText("Crédito atual do sinal");
    await expect(signal).toContainText("125,01");
    await expect(signal).not.toContainText("registrado em");
    await capture(page, info, "01-sinal-confirmado-cliente");
    await page.goto(`/app/processos/${m.processId}?aba=documentos`);
    await page.getByLabel("Pasta de destino").selectOption("case");
    await page.getByLabel("Escolher arquivo do processo").setInputFiles({
      name: "Processo fictício das leituras.pdf",
      mimeType: "application/pdf",
      buffer: await readFile(pdfFixture),
    });
    await expect
      .poll(async () => (await driver.command("view")).status, {
        timeout: 60000,
      })
      .toBe("queued");
    const row = calculator.locator(
      `${info.project.use.viewport!.width < 900 ? ".queue-mobile > li" : ".queue-table tbody > tr"}[data-order-id="${m.orderId}"]`,
    );
    await calculator.goto("/painel/fila");
    await expect(row).toContainText("Sinal confirmado");
    await expect(row).toContainText("250,01");
    await capture(calculator, info, "02-fila-confirmada");
    await driver.command("observe", "refund_partial");
    await driver.command("apply");
    expect((await driver.command("view")).status).toBe("queued");
    await page.goto(summary);
    await expect(signal).toContainText("115,00");
    await expect(signal).toContainText("10,01");
    await capture(page, info, "03-sinal-estornado");
    await calculator.reload();
    await expect(row).toContainText("Sinal parcial");
    await capture(calculator, info, "04-fila-parcial");
    await driver.command("observe", "unknown");
    await driver.command("apply");
    await page.reload();
    await expect(signal).toContainText("Em conciliação");
    await expect(signal).toContainText("Subtotal observado: R$ 115,00");
    await expect(signal).not.toContainText("Transfira");
    await expect(signal).not.toContainText("pix-ficticio-leitura-atual");
    await capture(page, info, "05-sinal-conciliacao");
    await calculator.reload();
    await expect(row).toContainText("Valores em conciliação");
    await expect(row).toContainText("Subtotal observado: R$ 115,00");
    await capture(calculator, info, "06-fila-conciliacao");
    await driver.command("observe", "current");
    await driver.command("apply");
    // Apenas a pré-condição técnica da entrega é sintética. Leituras financeiras,
    // upload e aprovação individual abaixo usam os respectivos caminhos reais locais.
    const deliveryId = await driver.command("prepareDelivery");
    await calculator.goto(`/painel/processos/${m.processId}?aba=resumo`);
    const delivery = calculator.locator(`[data-delivery-id="${deliveryId}"]`);
    await delivery
      .getByText("Definir regra desta entrega", { exact: true })
      .click();
    const approval = delivery.getByRole("form", {
      name: "Regra desta entrega",
      exact: true,
    });
    await approval
      .getByLabel("Quando liberar os arquivos?", { exact: true })
      .selectOption("after_balance");
    await approval
      .getByLabel(
        "Confirmei a regra com o responsável técnico e aprovo sua aplicação.",
      )
      .check();
    await approval
      .getByRole("button", { name: "Aprovar regra desta entrega", exact: true })
      .click();
    await expect(approval).toHaveCount(0);
    await page.goto(summary);
    const balance = page.locator(
      `[data-delivery-id="${deliveryId}"] .delivery-payment`,
    );
    await expect(balance).toContainText("Saldo pendente: R$ 135,01");
    await expect(balance).toContainText("pix-ficticio-leitura-atual");
    await capture(page, info, "07-saldo-atual");
    await driver.command("observe", "unknown");
    await driver.command("apply");
    await page.reload();
    await expect(balance).toContainText("Saldo em conciliação");
    await expect(balance).toContainText("Subtotal observado: R$ 115,00");
    await expect(balance).not.toContainText("pix-ficticio-leitura-atual");
    await expect(balance).not.toContainText("Peça os dados de pagamento");
    await capture(page, info, "08-saldo-conciliacao");
  } finally {
    try {
      await context.close();
    } finally {
      await driver.close();
    }
  }
});
for (const [scenario, amount, extra] of [
  ["partial", "100,00", "25,01"],
  ["excess", "130,00", "4,99"],
] as const) {
  test(`${scenario} mostra crédito e protege instruções concorrentes`, async ({
    page,
    browser,
  }, info) => {
    const driver = await financialJourneyDriver(),
      context = await browser.newContext({
        baseURL: "http://127.0.0.1:3000",
        viewport: info.project.use.viewport,
      });
    try {
      const calculator = await context.newPage(),
        m = driver.metadata;
      page.setDefaultTimeout(10000);
      calculator.setDefaultTimeout(10000);
      await driver.command("observe", scenario);
      await driver.command("origin");
      await driver.command("apply");
      await driver.command("bind");
      await loginAs(page);
      await loginAs(calculator, "calculator");
      await page.goto(`/app/processos/${m.processId}?aba=resumo`);
      const card = page.locator(".deposit-card");
      await expect(card).toContainText(amount);
      await expect(card).toContainText(extra);
      await expect(card).toContainText(
        scenario === "partial" ? "cobrança em andamento" : "crédito excede",
      );
      await expect(card).not.toContainText("Transfira");
      await expect(card).not.toContainText("Peça os dados para pagamento");
      await capture(page, info, `${scenario}-cliente`);
      await calculator.goto(`/painel/processos/${m.processId}?aba=resumo`);
      await expect(
        calculator.getByRole("form", { name: /Confirmar sinal/ }),
      ).toHaveCount(0);
      await expect(calculator.locator(".deposit-card")).toContainText(amount);
      await capture(calculator, info, `${scenario}-calculista`);
    } finally {
      try {
        await context.close();
      } finally {
        await driver.close();
      }
    }
  });
}
