import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { loginAs } from "./auth-helper";
import { localSystem } from "./local-helper";
import {
  pdfFixture,
  encryptedPdfFixture,
  largePdfFixture,
  removePdfFixture,
} from "./pdf-helper";
const processId = "00000000-0000-4000-8000-000000000101";
test("abas, PDF privado, auditoria e isolamento por processo", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90000);
  const name = `pdf-visualizacao-ficticia-${randomUUID()}.pdf`,
    content = await readFile(pdfFixture);
  const unexpectedRequests: string[] = [],
    dialogs: string[] = [],
    consoleText: string[] = [];
  let workerRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname.endsWith(".invalid"))
      unexpectedRequests.push(url.hostname);
    if (url.pathname.endsWith("pdf.worker.min.mjs")) workerRequests++;
  });
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  page.on("console", (message) => consoleText.push(message.text()));
  try {
    await loginAs(page);
    await page.goto(`/app/processos/${processId}`);
    const tabs = page.getByRole("navigation", {
      name: "Abas da pasta do processo",
    });
    for (const [label, heading] of [
      ["Resumo", "Resumo do processo"],
      ["Mensagens", "Mensagens"],
      ["Decisões", "Decisões técnicas"],
      ["Índice", "Índice de páginas"],
      ["Linha do tempo", "Linha do tempo"],
    ]) {
      await tabs.getByRole("link", { name: label, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expect(
        tabs.getByRole("link", { name: label, exact: true }),
      ).toHaveAttribute("aria-current", "page");
    }
    await tabs.getByRole("link", { name: "Documentos", exact: true }).click();
    for (const folder of [
      "Processo",
      "Documentos do cliente",
      "Entregas",
      "Triagem",
    ])
      await expect(
        page.getByRole("region", { name: `Pasta ${folder}`, exact: true }),
      ).toBeVisible();
    expect(workerRequests).toBe(0);
    await page.getByLabel("Pasta de destino").selectOption("client");
    await page
      .getByLabel("Escolher arquivo do processo")
      .setInputFiles({ name, mimeType: "application/pdf", buffer: content });
    await expect(page.getByRole("status")).toContainText(
      "Arquivo enviado e integridade confirmada.",
      { timeout: 60000 },
    );
    const row = page.getByRole("listitem").filter({ hasText: name });
    await expect(
      page
        .getByRole("region", {
          name: "Pasta Documentos do cliente",
          exact: true,
        })
        .getByText(name, { exact: true }),
    ).toBeVisible();
    const stored = await localSystem()
      .from("files")
      .select("id,folder")
      .eq("name", name)
      .single();
    expect(stored.data?.folder).toBe("client");
    const endpoint = `/api/files/${stored.data!.id}/content`;
    const head = await context.request.head(endpoint);
    expect(head.status()).toBe(200);
    expect(head.headers()["content-length"]).toBe(String(content.length));
    expect(await head.body()).toHaveLength(0);
    const partial = await context.request.get(endpoint, {
      headers: { Range: "bytes=0-31" },
    });
    expect(partial.status()).toBe(206);
    expect(partial.headers()["content-range"]).toBe(
      `bytes 0-31/${content.length}`,
    );
    expect(partial.headers()["cache-control"]).toBe("private, no-store");
    expect(partial.headers().location).toBeUndefined();
    expect(await partial.body()).toEqual(content.subarray(0, 32));
    const suffix = await context.request.get(endpoint, {
      headers: { Range: "bytes=-10" },
    });
    expect(suffix.status()).toBe(206);
    expect(await suffix.body()).toEqual(content.subarray(-10));
    expect(
      (
        await context.request.get(endpoint, {
          headers: { Range: "bytes=0-1,3-4" },
        })
      ).status(),
    ).toBe(416);
    await row.getByRole("button", { name: "Visualizar PDF" }).click();
    const viewer = row.getByRole("region", {
      name: `Visualização de ${name}`,
      exact: true,
    });
    await expect(
      viewer.getByText("Página 1 de 2", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(viewer.locator("canvas")).toBeVisible();
    await expect(viewer.locator(".react-pdf__Page__textContent")).toContainText(
      "decisão, cálculo e página",
    );
    expect(workerRequests).toBeGreaterThan(0);
    await expect(viewer.locator(".react-pdf__Page__annotations")).toHaveCount(
      0,
    );
    await viewer.getByRole("button", { name: "Próxima página" }).click();
    await expect(
      viewer.getByText("Página 2 de 2", { exact: true }),
    ).toBeVisible();
    await viewer.getByLabel("Zoom do PDF").selectOption("1.5");
    const canvasRegion = viewer.getByRole("region", {
      name: "Página do PDF",
      exact: true,
    });
    await expect
      .poll(() =>
        canvasRegion
          .locator("canvas")
          .evaluate((element) => element.getBoundingClientRect().width),
      )
      .toBeGreaterThan(
        await canvasRegion.evaluate((element) => element.clientWidth),
      );
    await canvasRegion.focus();
    await canvasRegion.press("ArrowRight");
    await expect
      .poll(() => canvasRegion.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await viewer.getByLabel("Zoom do PDF").selectOption("1");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await row.screenshot({ path: testInfo.outputPath("pdf-privado.png") });
    await row.getByRole("button", { name: "Fechar PDF" }).click();
    expect(unexpectedRequests).toEqual([]);
    expect(dialogs).toEqual([]);
    expect(consoleText.join("\n")).not.toContain("pdf-script-sentinela");
    const audit = await localSystem()
      .from("audit_log")
      .select("id")
      .eq("target_id", stored.data!.id)
      .eq("action", "file_view");
    expect(audit.data!.length).toBeGreaterThan(0);
    await context.clearCookies();
    await loginAs(page, "clientB");
    for (const tab of [
      "resumo",
      "documentos",
      "mensagens",
      "decisoes",
      "indice",
      "historico",
    ])
      expect(
        (await page.goto(`/app/processos/${processId}?aba=${tab}`))?.status(),
      ).toBe(404);
    expect((await context.request.get(endpoint)).status()).toBe(404);
    expect((await context.request.head(endpoint)).status()).toBe(404);
    await context.clearCookies();
    await loginAs(page, "admin");
    expect((await context.request.get(endpoint)).status()).toBe(404);
    expect((await page.goto(`/painel/processos/${processId}`))?.status()).toBe(
      404,
    );
    await context.clearCookies();
    await loginAs(page, "calculator");
    expect(
      (await page.goto(`/painel/processos/${processId}?aba=resumo`))?.status(),
    ).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Resumo do processo" }),
    ).toBeVisible();
    expect(
      (
        await context.request.get(endpoint, { headers: { Range: "bytes=0-3" } })
      ).status(),
    ).toBe(206);
    await context.clearCookies();
    expect((await context.request.get(endpoint)).status()).toBe(404);
  } finally {
    await removePdfFixture(name);
  }
});
test("PDF protegido aceita senha, permite cancelar e reabrir sem persistir segredo", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const name = `pdf-protegido-ficticio-${randomUUID()}.pdf`,
    sentinel = "senha-pdf-ficticia-para-testes";
  const logs: string[] = [],
    leaks: string[] = [];
  page.on("console", (message) => logs.push(message.text()));
  page.on("request", (request) => {
    if (
      request.url().includes(sentinel) ||
      request.postData()?.includes(sentinel)
    )
      leaks.push("Senha em requisição");
  });
  try {
    await loginAs(page);
    await page.goto(`/app/processos/${processId}`);
    await page.getByLabel("Escolher arquivo do processo").setInputFiles({
      name,
      mimeType: "application/pdf",
      buffer: await readFile(encryptedPdfFixture),
    });
    await expect(page.getByRole("status")).toContainText(
      "Arquivo enviado e integridade confirmada.",
      { timeout: 60000 },
    );
    const row = page.getByRole("listitem").filter({ hasText: name });
    await row.getByRole("button", { name: "Visualizar PDF" }).click();
    await expect(row.getByLabel("Senha do PDF")).toBeVisible();
    await row.getByRole("button", { name: "Cancelar visualização" }).click();
    await expect(row.getByLabel("Senha do PDF")).toHaveCount(0);
    await row.getByRole("button", { name: "Visualizar PDF" }).click();
    await row.getByLabel("Senha do PDF").fill("senha-incorreta-ficticia");
    await row.getByRole("button", { name: "Abrir PDF", exact: true }).click();
    await expect(
      row.getByText("Senha incorreta. Tente novamente."),
    ).toBeVisible();
    await expect(row.getByLabel("Senha do PDF")).toHaveValue("");
    await row.getByLabel("Senha do PDF").fill(sentinel);
    await row.getByRole("button", { name: "Abrir PDF", exact: true }).click();
    await expect(row.getByText("Página 1 de 2", { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(row.locator("canvas")).toBeVisible();
    await row.screenshot({ path: testInfo.outputPath("pdf-protegido.png") });
    expect(logs.join("\n")).not.toContain(sentinel);
    expect(leaks).toEqual([]);
    const storage = await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    );
    expect(storage).not.toContain(sentinel);
    await row.getByRole("button", { name: "Fechar PDF" }).click();
  } finally {
    await removePdfFixture(name);
  }
});
test("PDF maior que 4,5 MB é transmitido e lido por intervalos", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "computador",
    "O mesmo proxy é exercitado no celular pelos arquivos menores.",
  );
  test.setTimeout(90000);
  const name = `pdf-stream-ficticio-${randomUUID()}.pdf`,
    buffer = await largePdfFixture();
  let partialResponses = 0;
  page.on("response", (response) => {
    if (response.url().endsWith("/content") && response.status() === 206)
      partialResponses++;
  });
  try {
    await loginAs(page);
    await page.goto(`/app/processos/${processId}`);
    await page
      .getByLabel("Escolher arquivo do processo")
      .setInputFiles({ name, mimeType: "application/pdf", buffer });
    await expect(page.getByRole("status")).toContainText(
      "Arquivo enviado e integridade confirmada.",
      { timeout: 60000 },
    );
    const stored = await localSystem()
      .from("files")
      .select("id")
      .eq("name", name)
      .single();
    const endpoint = `/api/files/${stored.data!.id}/content`;
    const full = await context.request.get(endpoint);
    expect(full.status()).toBe(200);
    expect(await full.body()).toEqual(buffer);
    const row = page.getByRole("listitem").filter({ hasText: name });
    await row.getByRole("button", { name: "Visualizar PDF" }).click();
    await expect(row.getByText("Página 1 de 2", { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(row.locator(".react-pdf__Page__textContent")).toContainText(
      "decisão",
    );
    expect(partialResponses).toBeGreaterThan(0);
    await row.getByRole("button", { name: "Fechar PDF" }).click();
  } finally {
    await removePdfFixture(name);
  }
});
