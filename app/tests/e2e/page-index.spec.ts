import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loginAs } from "./auth-helper";
import { localSystem } from "./local-helper";
import { createMessageProcess, removeMessageProcess } from "./messages-helper";
import { pdfFixture } from "./pdf-helper";
test.setTimeout(90000);
test("calculista cria, edita e remove referências da versão certa; cliente lê sem editar", async ({
  page,
  browser,
}, testInfo) => {
  const process = await createMessageProcess(),
    db = localSystem(),
    content = await readFile(pdfFixture),
    own = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
      viewport: page.viewportSize()!,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    }),
    client = await own.newPage();
  try {
    await loginAs(page, "calculator");
    for (const version of [1, 2]) {
      await page.goto(`/painel/processos/${process.id}?aba=documentos`);
      await page.getByLabel("Pasta de destino").selectOption("case");
      await page.getByLabel("Escolher arquivo do processo").setInputFiles({
        name: `indice-ficticio-v${version}.pdf`,
        mimeType: "application/pdf",
        buffer: content,
      });
      await expect(page.getByRole("status")).toContainText(
        "Arquivo enviado e integridade confirmada.",
      );
      expect(
        (
          await db
            .from("files")
            .update({ version })
            .eq("process_id", process.id)
            .eq("name", `indice-ficticio-v${version}.pdf`)
        ).error,
      ).toBeNull();
    }
    await page.goto(`/painel/processos/${process.id}?aba=indice`);
    await page.getByText("Adicionar peça ao índice", { exact: true }).click();
    const form = page.getByRole("form", {
        name: "Adicionar peça ao índice",
        exact: true,
      }),
      key = await form.locator('input[name="requestId"]').inputValue();
    await form
      .getByLabel("PDF e versão")
      .selectOption({ label: "indice-ficticio-v1.pdf · Versão 1" });
    await form.getByLabel("Tipo de peça").selectOption("judgment");
    await form.getByLabel("Páginas", { exact: true }).fill("4-3");
    await form
      .getByLabel("Observação (opcional)")
      .fill("<script>observação fictícia</script>");
    await form
      .getByRole("button", { name: "Adicionar peça", exact: true })
      .click();
    await expect(form.getByRole("status")).toHaveText(
      "Confira os campos indicados.",
    );
    await expect(form.getByLabel("Páginas", { exact: true })).toHaveValue(
      "4-3",
    );
    await expect(form.locator('input[name="requestId"]')).toHaveValue(key);
    await form.getByLabel("Páginas", { exact: true }).fill(" 1 - 2 ");
    await form
      .getByRole("button", { name: "Adicionar peça", exact: true })
      .click();
    await expect(form.getByRole("status")).toHaveText("Índice salvo.");
    await expect(form.getByLabel("Páginas", { exact: true })).toHaveValue("");
    let row = page
      .locator(".process-records > li")
      .filter({ hasText: "Sentença · Páginas 1-2" });
    await expect(row).toContainText("indice-ficticio-v1.pdf · Versão 1");
    await expect(page.locator(".process-records script")).toHaveCount(0);
    await loginAs(client);
    await client.goto(`/app/processos/${process.id}?aba=indice`);
    await expect(client.locator(".process-records > li")).toHaveCount(1);
    await expect(client.locator(".page-index-editor")).toHaveCount(0);
    await expect(client.locator(".process-records")).not.toContainText(
      "indice-ficticio-v2.pdf",
    );
    await row.getByText("Editar entrada", { exact: true }).click();
    const edit = row.getByRole("form", {
      name: "Editar entrada do índice",
      exact: true,
    });
    await edit.getByLabel("Tipo de peça").selectOption("initial");
    await edit.getByLabel("Páginas", { exact: true }).fill("2");
    await edit
      .getByLabel("Observação (opcional)")
      .fill("Peça fictícia conferida.");
    await edit
      .getByRole("button", { name: "Salvar alteração", exact: true })
      .click();
    row = page
      .locator(".process-records > li")
      .filter({ hasText: "Inicial · Páginas 2" });
    await expect(row).toContainText("Peça fictícia conferida.");
    await client.reload();
    await expect(client.locator(".process-records")).toContainText(
      "Inicial · Páginas 2",
    );
    expect(
      (
        await new AxeBuilder({ page: client })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await client.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await client.screenshot({
      path: testInfo.outputPath("indice-cliente.png"),
      fullPage: true,
    });
    await row.getByText("Editar entrada", { exact: true }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: testInfo.outputPath("indice-calculista.png"),
      fullPage: true,
    });
    const removal = row.getByRole("form", {
      name: "Remover entrada do índice",
      exact: true,
    });
    await expect(
      removal.getByRole("button", { name: "Remover entrada", exact: true }),
    ).toBeDisabled();
    await removal
      .getByLabel("Remover esta entrada do índice.", { exact: true })
      .check();
    await removal
      .getByRole("button", { name: "Remover entrada", exact: true })
      .click();
    await expect(page.locator(".process-records > li")).toHaveCount(0);
    await client.reload();
    await expect(
      client.getByText("Nenhuma peça indexada.", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await db
          .from("timeline_events")
          .select("id")
          .eq("process_id", process.id)
          .eq("kind", "index_updated")
      ).data,
    ).toHaveLength(3);
  } finally {
    await own.close();
    await removeMessageProcess(process.id);
  }
});
test("índice pagina sem perder empates e preserva campos quando outra sessão altera a entrada", async ({
  page,
  browser,
}, testInfo) => {
  const process = await createMessageProcess(),
    db = localSystem(),
    fileId = randomUUID(),
    other = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
      viewport: page.viewportSize()!,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    }),
    second = await other.newPage();
  try {
    const calculator = (
      await db.from("profiles").select("id").eq("role", "calculator").single()
    ).data!;
    expect(
      (
        await db.from("files").insert({
          id: fileId,
          process_id: process.id,
          folder: "case",
          path: `${calculator.id}/${process.id}/${fileId}/indice-ficticio.pdf`,
          name: "Paginação fictícia.pdf",
          mime: "application/pdf",
          size_bytes: 100,
          uploaded_by: calculator.id,
          upload_status: "uploaded",
          sha256: "0".repeat(64),
        })
      ).error,
    ).toBeNull();
    const rows = Array.from({ length: 61 }, (_, index) => ({
      id: randomUUID(),
      process_id: process.id,
      file_id: fileId,
      piece: "judgment",
      pages: String(index + 1),
      note: `Referência fictícia ${String(index).padStart(3, "0")}`,
      recorded_by: calculator.id,
      created_at: `2026-01-01T12:00:00.${String(index % 3).padStart(6, "0")}Z`,
    }));
    expect((await db.from("page_index").insert(rows)).error).toBeNull();
    await loginAs(page, "calculator");
    await loginAs(second, "calculator");
    for (const view of [page, second]) {
      await view.goto(`/painel/processos/${process.id}?aba=indice`);
      await view
        .locator(".process-records > li")
        .first()
        .getByText("Editar entrada", { exact: true })
        .click();
    }
    const first = page.locator(".process-records > li").first(),
      stale = second
        .locator(".process-records > li")
        .first()
        .getByRole("form", { name: "Editar entrada do índice", exact: true }),
      requestId = await stale.locator('input[name="requestId"]').inputValue();
    const edit = first.getByRole("form", {
      name: "Editar entrada do índice",
      exact: true,
    });
    await edit.getByLabel("Páginas", { exact: true }).fill("1");
    await edit
      .getByRole("button", { name: "Salvar alteração", exact: true })
      .click();
    await expect(page.locator(".process-records > li").first()).toContainText(
      "Páginas 1",
    );
    await stale.getByLabel("Páginas", { exact: true }).fill("9");
    await stale
      .getByRole("button", { name: "Salvar alteração", exact: true })
      .click();
    await expect(stale.getByRole("status")).toHaveText(
      "O índice mudou. Recarregue a página antes de editar; os campos foram preservados.",
    );
    await expect(stale.getByLabel("Páginas", { exact: true })).toHaveValue("9");
    await expect(stale.locator('input[name="requestId"]')).toHaveValue(
      requestId,
    );
    await page.goto("/painel");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await loginAs(page);
    await page.goto(`/app/processos/${process.id}?aba=indice`);
    await expect(page.locator(".process-records > li")).toHaveCount(50);
    const found = new Set(
      await page
        .locator(".process-records > li > .preserve-lines")
        .allTextContents(),
    );
    await page
      .getByRole("link", { name: "Peças anteriores", exact: true })
      .click();
    await expect(page.locator(".process-records > li")).toHaveCount(11);
    for (const value of await page
      .locator(".process-records > li > .preserve-lines")
      .allTextContents())
      found.add(value);
    expect(found.size).toBe(61);
    await page
      .getByRole("link", { name: "Peças mais recentes", exact: true })
      .click();
    await expect(page.locator(".process-records > li")).toHaveCount(50);
    await page.goto(`/app/processos/${process.id}?aba=indice&antes=invalid`);
    await expect(
      page.getByRole("heading", {
        name: "Página não encontrada",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("indice-cursor-invalido-indisponivel.png"),
      fullPage: true,
    });
  } finally {
    await other.close();
    await removeMessageProcess(process.id);
  }
});
