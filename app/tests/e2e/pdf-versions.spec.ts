import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import AxeBuilder from "@axe-core/playwright";
import { loginAs } from "./auth-helper";
import { localSystem } from "./local-helper";
import { createMessageProcess, removeMessageProcess } from "./messages-helper";
async function pdf(labels: string[]) {
  return renderToBuffer(
    createElement(
      Document,
      {},
      labels.map((label) =>
        createElement(
          Page,
          { key: label, size: "A4" },
          createElement(Text, {}, `Documento ficticio - pagina ${label}`),
        ),
      ),
    ),
  );
}
test("versões de PDF preservam leitura, correspondências e origem do índice", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90000);
  const db = localSystem(),
    fixture = await createMessageProcess(),
    base = `/painel/processos/${fixture.id}`;
  const oldName = `versao-anterior-ficticia-${randomUUID()}.pdf`,
    newName = `versao-atual-ficticia-${randomUUID()}.pdf`;
  const oldPdf = await pdf(["A", "B", "C", "D"]),
    newPdf = await pdf(["C", "X", "A", "D"]);
  try {
    await loginAs(page);
    await page.goto(`/app/processos/${fixture.id}`);
    for (const [name, buffer] of [
      [oldName, oldPdf],
      [newName, newPdf],
    ] as const) {
      await page
        .getByLabel("Escolher arquivo do processo")
        .setInputFiles({ name, mimeType: "application/pdf", buffer });
      await expect(page.getByRole("status")).toContainText(
        "Arquivo enviado e integridade confirmada.",
        { timeout: 60000 },
      );
      await expect(
        page.getByRole("listitem").filter({ hasText: name }),
      ).toBeVisible({ timeout: 60000 });
    }
    const files = await db
      .from("files")
      .select("id,name,sha256")
      .eq("process_id", fixture.id);
    expect(files.error).toBeNull();
    const old = files.data!.find((f) => f.name === oldName)!,
      current = files.data!.find((f) => f.name === newName)!;
    expect(old.sha256).not.toBe(current.sha256);
    await context.clearCookies();
    await loginAs(page, "calculator");
    await page.goto(`${base}?aba=indice`);
    for (const [piece, pages] of [
      ["judgment", "1"],
      ["appeal", "3"],
      ["defense", "1-3"],
    ]) {
      const editor = page.locator("details.page-index-editor").filter({
        has: page.getByText("Adicionar peça ao índice", { exact: true }),
      });
      if (
        !(await editor
          .locator("summary")
          .evaluate((e) => e.parentElement!.hasAttribute("open")))
      )
        await editor.locator("summary").click();
      const form = page.getByRole("form", {
        name: "Adicionar peça ao índice",
        exact: true,
      });
      await form.getByLabel("PDF e versão").selectOption(old.id);
      await form.getByLabel("Tipo de peça").selectOption(piece);
      await form.getByLabel("Páginas", { exact: true }).fill(pages);
      await form
        .getByRole("button", { name: "Adicionar peça", exact: true })
        .click();
      await expect(form.getByRole("status")).toContainText("Índice salvo.");
    }
    await page
      .getByRole("link", { name: "Conferir versões e páginas lidas" })
      .click();
    const selectFile = async (id: string) => {
      await page.getByLabel("PDF para conferir").selectOption(id);
      await page
        .getByRole("button", { name: "Abrir conferência", exact: true })
        .click();
    };
    const register = async (previous?: string) => {
      const form = page.getByRole("form", {
        name: "Registrar versão",
        exact: true,
      });
      await form.getByLabel("Quantidade de páginas conferida").fill("4");
      if (previous)
        await form
          .getByLabel("Versão anterior", { exact: true })
          .selectOption(previous);
      await form
        .getByLabel("Conferi a quantidade de páginas e o vínculo indicado.")
        .check();
      await form
        .getByRole("button", { name: "Registrar versão", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: previous ? "Leitura da versão 2" : "Leitura da versão 1",
          exact: true,
        }),
      ).toBeVisible();
    };
    const mark = async (pages: string) => {
      await page
        .getByText("Marcar ou desmarcar páginas lidas", { exact: true })
        .click();
      const form = page.getByRole("form", {
        name: "Salvar marcação",
        exact: true,
      });
      await form.getByLabel("Páginas conferidas").fill(pages);
      await form
        .getByRole("button", { name: "Salvar marcação", exact: true })
        .click();
      await expect(form.getByRole("status")).toContainText(
        "Marcação de leitura salva.",
      );
    };
    await selectFile(old.id);
    await register();
    await mark("1, 3-4");
    await selectFile(current.id);
    await page
      .getByRole("button", { name: "Visualizar PDF", exact: true })
      .click();
    await expect(page.getByText("Página 1 de 4", { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator(".react-pdf__Page__textContent")).toContainText(
      "pagina C",
    );
    await page.getByRole("button", { name: "Fechar PDF", exact: true }).click();
    await register(old.id);
    await expect(page.locator('[data-pdf-page="1"]')).toContainText(
      "Leitura pendente",
    );
    const mapping = page.getByRole("form", {
      name: "Confirmar correspondências",
      exact: true,
    });
    await mapping
      .getByLabel("Correspondências anterior:atual")
      .fill("3:1, 1:3, 4:4");
    await mapping.getByLabel("Conferi manualmente", { exact: false }).check();
    await mapping
      .getByRole("button", { name: "Confirmar correspondências", exact: true })
      .click();
    await expect(mapping.getByRole("status")).toContainText(
      "Correspondências salvas",
    );
    await expect(page.locator('[data-pdf-page="1"]')).toContainText(
      "Lida na versão anterior",
    );
    await expect(page.locator('[data-pdf-page="2"]')).toContainText(
      "Leitura pendente",
    );
    await expect(page.locator('[data-pdf-page="3"]')).toContainText(
      "página 1 anterior",
    );
    const incomplete = page
      .locator("[data-source-entry]")
      .filter({ hasText: "Contestação" });
    await expect(
      incomplete.getByRole("button", {
        name: "Reaproveitar referência",
        exact: true,
      }),
    ).toBeDisabled();
    for (const piece of ["Sentença", "Acórdão"]) {
      const row = page
        .locator("[data-source-entry]")
        .filter({ hasText: piece });
      await row
        .getByRole("button", { name: "Reaproveitar referência", exact: true })
        .click();
      await expect(row.getByRole("status")).toContainText(
        "Referência reaproveitada com origem preservada.",
      );
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expect(page.locator(".pdf-pages")).toHaveCSS("display", "grid");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.locator('[data-pdf-page="1"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("leitura-versoes.png") });
    const readingDetails = page.locator("details.pdf-review-editor");
    if (!(await readingDetails.evaluate((e) => e.hasAttribute("open"))))
      await readingDetails.locator("summary").click();
    const currentRead = page.getByRole("form", {
      name: "Salvar marcação",
      exact: true,
    });
    await currentRead.getByLabel("Páginas conferidas").fill("2");
    const priorKey = await currentRead
      .locator('input[name="requestId"]')
      .inputValue();
    await page
      .getByRole("link", {
        name: "Abrir a versão anterior para comparar",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("PDF para conferir")).toHaveValue(old.id);
    const oldDetails = page.locator("details.pdf-review-editor");
    if (!(await oldDetails.evaluate((e) => e.hasAttribute("open"))))
      await oldDetails.locator("summary").click();
    const oldRead = page.getByRole("form", {
      name: "Salvar marcação",
      exact: true,
    });
    await expect(oldRead.getByLabel("Páginas conferidas")).toHaveValue("");
    expect(
      await oldRead.locator('input[name="requestId"]').inputValue(),
    ).not.toBe(priorKey);
    await selectFile(current.id);
    await page
      .getByRole("link", { name: "Voltar ao índice", exact: true })
      .click();
    await expect(page.locator("[data-pdf-origin]")).toHaveCount(2);
    await expect(
      page.locator("[data-pdf-origin]").first().locator(".."),
    ).toContainText("Versão 2");
    await expect(page.locator("[data-pdf-origin]").first()).toContainText(
      oldName,
    );
    await expect(page.locator("[data-pdf-origin]").first()).toContainText(
      "Calculista de teste",
    );
    const copied = await db
      .from("page_index")
      .select("piece,pages")
      .eq("file_id", current.id)
      .order("piece");
    expect(copied.data).toEqual([
      { piece: "appeal", pages: "1" },
      { piece: "judgment", pages: "3" },
    ]);
    await page.screenshot({ path: testInfo.outputPath("indice-origem.png") });
    await page
      .getByRole("link", { name: "Conferir versões e páginas lidas" })
      .click();
    await selectFile(current.id);
    const correction = page.getByRole("form", {
      name: "Confirmar correspondências",
      exact: true,
    });
    await correction.getByLabel("Correspondências anterior:atual").fill("0:3");
    await correction
      .getByLabel("Conferi manualmente", { exact: false })
      .check();
    await correction
      .getByRole("button", { name: "Confirmar correspondências", exact: true })
      .click();
    await expect(correction.getByRole("status")).toContainText(
      "Correspondências salvas",
    );
    await page
      .getByRole("link", { name: "Voltar ao índice", exact: true })
      .click();
    await expect(
      page.getByText(
        "A correspondência mudou. Reconfira esta referência antes de usar.",
        { exact: true },
      ),
    ).toBeVisible();
    for (const [id, buffer] of [
      [old.id, oldPdf],
      [current.id, newPdf],
    ] as const)
      expect(
        await (await context.request.get(`/api/files/${id}/content`)).body(),
      ).toEqual(buffer);
    expect(
      (await db.from("files").select("sha256").eq("id", old.id).single()).data
        ?.sha256,
    ).toBe(old.sha256);
    await context.clearCookies();
    await loginAs(page);
    await page.goto(`/app/processos/${fixture.id}?aba=indice`);
    await expect(page.locator("[data-pdf-origin]")).toHaveCount(2);
    await expect(
      page.getByRole("link", { name: "Conferir versões e páginas lidas" }),
    ).toHaveCount(0);
    for (const role of ["client", "clientB", "admin"] as const) {
      if (role !== "client") {
        await context.clearCookies();
        await loginAs(page, role);
      }
      await page.goto(`${base}/versoes`);
      await expect(page).toHaveURL(/\/acesso-negado$/);
    }
    await context.clearCookies();
    await page.goto(`${base}/versoes`);
    await expect(page).toHaveURL(/\/entrar$/);
  } finally {
    await removeMessageProcess(fixture.id);
  }
});
