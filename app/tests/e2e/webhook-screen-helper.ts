import { expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pdfFixture } from "./pdf-helper";
import { localSystem } from "./local-helper";
import type { webhookUiDriver } from "./webhook-ui-driver";

export type WebhookScreenDriver = Awaited<ReturnType<typeof webhookUiDriver>>;
export async function captureWebhookScreen(
  page: Page,
  info: TestInfo,
  name: string,
) {
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
export async function uploadWebhookScreen(
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

/** Pré-condições técnicas e D6 são confirmadas pelas telas, sem pagamento semeado. */
export async function deliverWebhookScreen(
  client: Page,
  calculator: Page,
  driver: WebhookScreenDriver,
  policy: "before_balance" | "after_balance",
) {
  const m = driver.metadata,
    db = localSystem(),
    pdf = await readFile(pdfFixture);
  const clientBase = `/app/processos/${m.processId}`,
    panelBase = `/painel/processos/${m.processId}`;
  await client.goto(`${clientBase}?aba=documentos`);
  await uploadWebhookScreen(
    client,
    "case",
    "Processo fictício de estados.pdf",
    "application/pdf",
    pdf,
  );
  await expect
    .poll(async () => (await driver.command("view")).status, { timeout: 60000 })
    .toBe("queued");
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
    await expect(form.getByRole("status")).toContainText("Etapa registrada");
    await expect
      .poll(async () => (await driver.command("view")).status)
      .toBe(state);
  }
  const assets = [
    {
      name: "Cálculo fictício de estados.pdf",
      mime: "application/pdf",
      bytes: pdf,
    },
    {
      name: "Projeto fictício de estados.pjc",
      mime: "application/octet-stream",
      bytes: Buffer.from("PJC fictício de estados, sem cálculo real."),
    },
    {
      name: "Parecer fictício de estados.pdf",
      mime: "application/pdf",
      bytes: pdf,
    },
  ];
  await calculator.goto(`${panelBase}?aba=documentos`);
  for (const asset of assets) {
    await uploadWebhookScreen(
      calculator,
      "deliverables",
      asset.name,
      asset.mime,
      asset.bytes,
    );
    await expect(
      calculator.getByRole("region", { name: "Pasta Entregas", exact: true }),
    ).toContainText(asset.name);
  }
  const result = await db
    .from("files")
    .select("id,name,sha256,size_bytes")
    .eq("process_id", m.processId)
    .eq("folder", "deliverables");
  expect(result.error).toBeNull();
  const files = result.data!;
  expect(files).toHaveLength(3);
  for (const asset of assets) {
    const f = files.find((f) => f.name === asset.name)!;
    expect(f.sha256).toBe(
      createHash("sha256").update(asset.bytes).digest("hex"),
    );
    expect(f.size_bytes).toBe(asset.bytes.length);
    expect(
      (
        await client.request.get(`/api/files/${f.id}/download`, {
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(404);
  }
  await calculator.goto(`${panelBase}?aba=resumo`);
  await calculator
    .getByText(`Confirmar entrega do pedido ${m.code}`, { exact: true })
    .click();
  const form = calculator.getByRole("form", {
    name: `Confirmar entrega ${m.code}`,
    exact: true,
  });
  const deliveryId = await form.locator('input[name="requestId"]').inputValue();
  for (const [i, label] of [
    "PDF do cálculo",
    "Arquivo PJC",
    "Parecer assinado em PDF",
  ].entries())
    await form
      .getByLabel(label, { exact: true })
      .selectOption(files.find((f) => f.name === assets[i].name)!.id);
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
  await client.goto(`${clientBase}?aba=resumo`);
  await expect(
    client.locator(`[data-delivery-id="${deliveryId}"]`),
  ).toContainText("aguarda a definição da regra de pagamento");
  for (const f of files)
    expect(
      (
        await client.request.get(`/api/files/${f.id}/download`, {
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
    .selectOption(policy);
  await rule
    .getByLabel(
      "Confirmei a regra com o responsável técnico e aprovo sua aplicação.",
    )
    .check();
  await rule
    .getByRole("button", { name: "Aprovar regra desta entrega", exact: true })
    .click();
  await expect(rule).toHaveCount(0);
  return {
    deliveryId,
    files,
    pdf,
    fileId: files.find((f) => f.name === assets[0].name)!.id,
    clientBase,
    panelBase,
  };
}

export async function verifyWebhookDownload(
  page: Page,
  fileId: string,
  pdf: Buffer,
  allowed: boolean,
) {
  const response = await page.request.get(`/api/files/${fileId}/download`, {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(allowed ? 307 : 404);
  if (!allowed) {
    expect((await response.body()).equals(pdf)).toBe(false);
    return;
  }
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
    throw new Error("Download fictício autorizado não concluído.");
  });
  expect(download.ok()).toBe(true);
  expect((await download.body()).equals(pdf)).toBe(true);
  expect((await page.content()).includes(url.searchParams.get("token")!)).toBe(
    false,
  );
}
