import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { revisionFixture } from "./revision-helper";
import { loginAs } from "./auth-helper";
import { localNotificationSql as sql } from "./notification-helper";
test.setTimeout(90000);
const text = (buffer: Buffer) =>
  execFileSync("pdftotext", ["-", "-"], { input: buffer, encoding: "utf8" });
test("ajuste com resposta perdida chega ao advogado, preserva histórico/PDF e permite aceite vigente", async ({
  page,
  browser,
}, info) => {
  const f = await revisionFixture(),
    contexts = [];
  try {
    const s = await f.create();
    await loginAs(page, "calculator");
    await page.goto(`/painel/orcamentos/${s.id}`);
    const original = await page.request.get(`/api/quotes/${s.id}/pdf`);
    expect(original.status()).toBe(200);
    const oldText = text(await original.body());
    await page.getByText("Ajustar orçamento", { exact: true }).click();
    const form = page.getByRole("form", { name: "Ajuste do orçamento" });
    const input = form.getByRole("textbox").first();
    const unit = s.proposal.items[0].unitCents + 101;
    await input.fill((unit / 100).toFixed(2).replace(".", ","));
    await form
      .getByLabel("Motivo do ajuste")
      .fill("Revisão fictícia combinada para esta proposta.");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath("ajuste-formulario.png"),
      fullPage: true,
    });
    let dropped = false;
    await page.route("**/painel/orcamentos/**", async (route) => {
      if (
        !dropped &&
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        dropped = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await form.getByRole("button", { name: "Criar nova versão" }).click();
    await expect(form.getByRole("alert")).toContainText("preservados");
    expect(dropped).toBe(true);
    await expect(input).toHaveValue((unit / 100).toFixed(2).replace(".", ","));
    await expect(form.getByLabel("Motivo do ajuste")).toHaveValue(
      "Revisão fictícia combinada para esta proposta.",
    );
    await form.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(
      page.getByRole("heading", { name: "Nova versão criada" }),
    ).toBeVisible();
    const next = sql(
      `select id from public.quotes where supersedes_id='${s.id}';`,
    );
    expect(
      sql(`select count(*) from public.quotes where order_id='${s.order_id}';`),
    ).toBe("2");
    await page.getByRole("link", { name: "Abrir nova proposta" }).click();
    await expect(page).toHaveURL(new RegExp(next));
    await expect(
      page.getByRole("heading", { name: "Histórico de versões" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Versão 2/ })).toBeVisible();
    expect(
      text(await (await page.request.get(`/api/quotes/${s.id}/pdf`)).body()),
    ).toBe(oldText);
    const pdf = await (
      await page.request.get(`/api/quotes/${next}/pdf`)
    ).body();
    await writeFile(info.outputPath("proposta-revisada.pdf"), pdf);
    const newText = text(pdf);
    expect(newText).toContain("Versão 2");
    expect(newText).toContain("Revisão fictícia combinada");
    expect(newText).not.toBe(oldText);
    await page.screenshot({
      path: info.outputPath("ajuste-calculista-versao2.png"),
      fullPage: true,
    });
    const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
    contexts.push(ctx);
    const client = await ctx.newPage();
    await loginAs(client);
    await client.goto(`/app/orcamentos/${s.id}`);
    await expect(
      client.getByText("Versão substituída", { exact: true }),
    ).toBeVisible();
    await expect(
      client
        .getByRole("form", { name: "Aceite da proposta" })
        .getByRole("button", { name: "Aceitar", exact: true }),
    ).toBeDisabled();
    await expect(
      client.getByRole("form", { name: "Recusa da proposta" }),
    ).toHaveCount(0);
    await client.getByRole("link", { name: "Abrir proposta vigente" }).click();
    await expect(
      client.getByRole("heading", { name: "Histórico de versões" }),
    ).toBeVisible();
    await expect(
      client.getByText(
        "Motivo: Revisão fictícia combinada para esta proposta.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      client.getByRole("form", { name: "Ajuste do orçamento" }),
    ).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page: client })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await client.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(info.project.use.viewport!.width);
    await client.screenshot({
      path: info.outputPath("ajuste-advogado-versao2.png"),
      fullPage: true,
    });
    const acceptance = client.getByRole("form", { name: "Aceite da proposta" });
    await acceptance.getByRole("checkbox").check();
    await acceptance
      .getByRole("button", { name: "Aceitar", exact: true })
      .click();
    await expect(
      client.getByRole("heading", { name: "Contratação registrada" }),
    ).toBeVisible();
    await client
      .getByRole("link", { name: "Abrir pasta do processo", exact: true })
      .click();
    await client.getByRole("link", { name: "Resumo", exact: true }).click();
    await expect(
      client.getByRole("link", { name: /Versão 2.*Vigente/ }),
    ).toBeVisible();
    await expect(
      client.getByRole("link", { name: /Versão 1.*Substituída/ }),
    ).toBeVisible();
    for (const role of ["clientB", "admin"] as const) {
      const otherCtx = await browser.newContext({
        baseURL: "http://127.0.0.1:3000",
      });
      contexts.push(otherCtx);
      const other = await otherCtx.newPage();
      await loginAs(other, role);
      const response = await other.goto(
        `/${role === "clientB" ? "app" : "painel"}/orcamentos/${next}`,
      );
      expect(response?.status()).toBe(404);
      expect(
        (await other.request.get(`/api/quotes/${next}/pdf`)).status(),
      ).toBe(404);
    }
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await f.cleanup();
  }
});
test("nova versão pode ser recusada e ajuste sem motivo não cria versão", async ({
  page,
  browser,
}) => {
  const f = await revisionFixture();
  let context;
  try {
    const s = await f.create();
    await loginAs(page, "calculator");
    await page.goto(`/painel/orcamentos/${s.id}`);
    await page.getByText("Ajustar orçamento", { exact: true }).click();
    const form = page.getByRole("form", { name: "Ajuste do orçamento" });
    await form.getByRole("textbox").first().fill("180,01");
    await form.getByRole("button", { name: "Criar nova versão" }).click();
    await expect(form.getByRole("alert")).toContainText("Motivo");
    expect(
      sql(`select count(*) from public.quotes where order_id='${s.order_id}';`),
    ).toBe("1");
    await form
      .getByLabel("Motivo do ajuste")
      .fill("Condição fictícia revista pelo calculista");
    await form.getByRole("button", { name: "Criar nova versão" }).click();
    await expect(
      page.getByRole("heading", { name: "Nova versão criada" }),
    ).toBeVisible();
    const next = sql(
      `select id from public.quotes where supersedes_id='${s.id}';`,
    );
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
    const client = await context.newPage();
    await loginAs(client);
    await client.goto(`/app/orcamentos/${next}`);
    await client.getByText("Recusar proposta", { exact: true }).click();
    const refusal = client.getByRole("form", { name: "Recusa da proposta" });
    await refusal.getByRole("checkbox").check();
    await refusal.getByRole("button", { name: "Confirmar recusa" }).click();
    await expect(
      client.getByRole("heading", { name: "Proposta recusada" }),
    ).toBeVisible();
    await page.goto(`/painel/orcamentos/${next}`);
    await expect(
      page.getByRole("form", { name: "Ajuste do orçamento" }),
    ).toHaveCount(0);
  } finally {
    await context?.close();
    await f.cleanup();
  }
});
