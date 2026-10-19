import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { loginAs } from "./auth-helper";
import { localSystem } from "./local-helper";
import { pdfFixture, removePdfFixture } from "./pdf-helper";

test("André consulta acessos reais, filtra, pagina e protege o histórico", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90000);
  const db = localSystem(),
    name = `acesso-ficticio-${randomUUID()}.pdf`,
    content = await readFile(pdfFixture);
  try {
    await loginAs(page);
    await page.goto("/app/processos/00000000-0000-4000-8000-000000000101");
    await page.getByLabel("Pasta de destino").selectOption("case");
    await page
      .getByLabel("Escolher arquivo do processo")
      .setInputFiles({ name, mimeType: "application/pdf", buffer: content });
    await expect(page.getByRole("status")).toContainText(
      "Arquivo enviado e integridade confirmada.",
      { timeout: 60000 },
    );
    const stored = await db
      .from("files")
      .select("id,uploaded_by,path")
      .eq("name", name)
      .single();
    expect(stored.error).toBeNull();
    const file = stored.data!;
    const endpoint = `/api/files/${file.id}/content`;
    // Uma visualização completa, HEAD, Range e download reais; sem imprimir URL assinada.
    const full = await context.request.get(endpoint);
    expect(full.status()).toBe(200);
    expect(await full.body()).toEqual(content);
    const head = await context.request.head(endpoint);
    expect(head.status()).toBe(200);
    expect(await head.body()).toHaveLength(0);
    const partial = await context.request.get(endpoint, {
      headers: { Range: "bytes=0-31" },
    });
    expect(partial.status()).toBe(206);
    expect(await partial.body()).toEqual(content.subarray(0, 32));
    const download = await context.request.get(
      `/api/files/${file.id}/download`,
      { maxRedirects: 0 },
    );
    expect(download.status()).toBe(307);
    const location = download.headers().location;
    if (!location || new URL(location).origin !== "http://127.0.0.1:54321")
      throw new Error("Destino privado local inválido.");
    expect(await (await context.request.get(location)).body()).toEqual(content);
    // Mais de uma página de autorizações reais, sem baixar o PDF repetidamente.
    for (let index = 0; index < 49; index++)
      expect((await context.request.head(endpoint)).status()).toBe(200);
    const expected = await db
      .from("audit_log")
      .select("id,action")
      .eq("target_type", "file")
      .eq("target_id", file.id)
      .in("action", ["file_view", "file_download"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    expect(expected.error).toBeNull();
    expect(expected.data).toHaveLength(53);
    const actor = await db
      .from("profiles")
      .select("full_name")
      .eq("id", file.uploaded_by)
      .single();
    await context.clearCookies();
    await loginAs(page, "calculator");
    await page
      .getByRole("link", { name: "Acessos a arquivos", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Acessos a arquivos", exact: true }),
    ).toBeVisible();
    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    await page.getByLabel("Arquivo", { exact: true }).fill(name);
    await page.getByLabel("Autor do acesso").fill(actor.data!.full_name);
    await page.getByLabel("Data inicial").fill(today);
    await page.getByLabel("Data final").fill(today);
    await page.getByRole("button", { name: "Consultar acessos" }).click();
    const records = page.locator("[data-audit-record]");
    await expect(records).toHaveCount(50);
    expect(
      await records.evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-audit-record")),
      ),
    ).toEqual(expected.data!.slice(0, 50).map((row) => row.id));
    await expect(records.first()).toContainText(actor.data!.full_name);
    await expect(records.first()).toContainText(name);
    // A checagem visual precisa detectar uma folha de estilos ausente no runtime.
    await expect(page.locator(".file-audit-filters")).toHaveCSS(
      "display",
      "grid",
    );
    expect(
      await records
        .first()
        .evaluate((row) => parseFloat(getComputedStyle(row).paddingTop)),
    ).toBeGreaterThan(0);
    const text = await page.locator("main").innerText();
    expect(text).not.toContain(file.path);
    expect(text).not.toContain("127.0.0.1");
    expect(text).not.toContain("upload_verified");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("acessos-arquivos.png"),
    });
    await records.first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("registros-arquivos.png"),
    });
    await page.getByRole("link", { name: "Próximos registros" }).click();
    await expect(records).toHaveCount(3);
    expect(
      await records.evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-audit-record")),
      ),
    ).toEqual(expected.data!.slice(50).map((row) => row.id));
    const pagedUrl = new URL(page.url());
    expect(pagedUrl.searchParams.get("arquivo")).toBe(name);
    expect(pagedUrl.searchParams.get("autor")).toBe(actor.data!.full_name);
    expect(pagedUrl.searchParams.get("inicio")).toBe(today);
    expect(pagedUrl.searchParams.get("fim")).toBe(today);
    await page.getByRole("link", { name: "Registros recentes" }).click();
    await expect(records).toHaveCount(50);
    expect(new URL(page.url()).searchParams.has("depois")).toBe(false);
    await page
      .getByLabel("Ação", { exact: true })
      .selectOption("file_download");
    await page.getByRole("button", { name: "Consultar acessos" }).click();
    await expect(records).toHaveCount(1);
    await expect(records.first()).toContainText("Download autorizado");
    await records.first().getByTitle("Filtrar por este arquivo").click();
    await expect(page.getByLabel("Arquivo", { exact: true })).toHaveValue(
      file.id,
    );
    await expect(page.getByLabel("Ação", { exact: true })).toHaveValue(
      "file_download",
    );
    await expect(records).toHaveCount(1);
    await page.getByLabel("Data inicial").fill("2000-01-01");
    await page.getByLabel("Data final").fill("2000-01-01");
    await page.getByRole("button", { name: "Consultar acessos" }).click();
    await expect(
      page.getByText("Nenhum acesso encontrado para estes filtros.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/painel/acessos?depois=invalido");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "referência da página é inválida",
    );
    for (const role of ["client", "clientB", "admin"] as const) {
      await context.clearCookies();
      await loginAs(page, role);
      if (role === "admin")
        await expect(
          page.getByRole("link", { name: "Acessos a arquivos", exact: true }),
        ).toHaveCount(0);
      await page.goto("/painel/acessos");
      await expect(page).toHaveURL(/\/acesso-negado$/);
      if (role !== "client")
        expect((await context.request.head(endpoint)).status()).toBe(404);
    }
    await context.clearCookies();
    await page.goto("/painel/acessos");
    await expect(page).toHaveURL(/\/entrar$/);
    expect((await context.request.head(endpoint)).status()).toBe(404);
  } finally {
    await removePdfFixture(name);
  }
});
