import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { rejectionFixture } from "./rejection-helper";
import { loginAs } from "./auth-helper";
import { localNotificationSql as sql } from "./notification-helper";
test.setTimeout(90000);
test("recusa recupera resposta perdida, preserva PDF e aparece ao André", async ({
  page,
  browser,
}, info) => {
  const f = await rejectionFixture(),
    contexts = [];
  try {
    const s = await f.create({ expired: true });
    await loginAs(page);
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": "192.0.2.44, 203.0.113.1",
      "user-agent": "Navegador sintetico da recusa",
    });
    await page.goto(`/app/orcamentos/${s.id}`);
    const before = await page.request.get(`/api/quotes/${s.id}/pdf`);
    expect(before.status()).toBe(200);
    const pdfBefore = await before.body();
    await page.getByText("Recusar proposta", { exact: true }).click();
    const form = page.getByRole("form", { name: "Recusa da proposta" }),
      confirm = form.getByRole("checkbox"),
      reason = form.getByLabel("Motivo (opcional)");
    await expect(confirm).not.toBeChecked();
    await expect(
      form.getByRole("button", { name: "Confirmar recusa" }),
    ).toBeDisabled();
    await reason.fill("   Escolha fictícia para testar a recusa.   ");
    await confirm.focus();
    await page.keyboard.press("Space");
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
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("recusa-confirmacao.png"),
      fullPage: true,
    });
    let dropped = false;
    await page.route("**/app/orcamentos/**", async (route) => {
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
    await form.getByRole("button", { name: "Confirmar recusa" }).click();
    await expect(form.getByRole("alert")).toContainText(
      "Sua escolha foi preservada",
    );
    expect(dropped).toBe(true);
    await expect(confirm).toBeChecked();
    await expect(confirm).toBeDisabled();
    await expect(reason).toBeDisabled();
    await expect(reason).toHaveValue(
      "   Escolha fictícia para testar a recusa.   ",
    );
    const stored = sql(
      `select to_jsonb(r) from private.quote_rejections r where quote_id='${s.id}';`,
    );
    expect(JSON.parse(stored)).toMatchObject({
      reason: "Escolha fictícia para testar a recusa.",
      rejected_ip: "192.0.2.44",
      rejected_user_agent: "Navegador sintetico da recusa",
    });
    await form.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(
      page.getByRole("heading", { name: "Proposta recusada" }),
    ).toBeVisible();
    await expect(
      page.getByRole("form", { name: "Aceite da proposta" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("status", { name: "Recusa da proposta" }),
    ).toContainText("Escolha fictícia para testar a recusa.");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Proposta recusada" }),
    ).toBeVisible();
    expect(
      sql(
        `select to_jsonb(r) from private.quote_rejections r where quote_id='${s.id}';`,
      ),
    ).toBe(stored);
    expect(
      sql(
        `select count(*) from private.quote_rejection_requests where quote_id='${s.id}';`,
      ),
    ).toBe("1");
    const after = await page.request.get(`/api/quotes/${s.id}/pdf`);
    expect(after.status()).toBe(200);
    const pdfAfter = await after.body();
    expect(pdfAfter.subarray(0, 5).toString()).toBe("%PDF-");
    const text = (pdf: Buffer) =>
      execFileSync("pdftotext", ["-", "-"], { input: pdf, encoding: "utf8" });
    expect(text(pdfAfter)).toBe(text(pdfBefore));
    expect(text(pdfAfter)).toContain(s.number);
    expect(pdfBefore.subarray(0, 5).toString()).toBe("%PDF-");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath("recusa-recibo.png"),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Abrir pasta do processo" }).click();
    await page.goto(`/app/processos/${s.process_id}?aba=historico`);
    await expect(
      page.getByText("Proposta recusada", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Escolha fictícia para testar a recusa.", { exact: true }),
    ).toBeVisible();
    for (const role of ["calculator", "clientB", "admin"] as const) {
      const context = await browser.newContext({
        baseURL: "http://127.0.0.1:3000",
      });
      contexts.push(context);
      const other = await context.newPage();
      await loginAs(other, role);
      const response = await other.goto(
        `/${role === "clientB" ? "app" : "painel"}/orcamentos/${s.id}`,
      );
      if (role === "calculator") {
        await expect(
          other.getByRole("heading", { name: "Proposta recusada" }),
        ).toBeVisible();
        await expect(
          other.getByRole("form", { name: "Recusa da proposta" }),
        ).toHaveCount(0);
        expect(
          (await other.request.get(`/api/quotes/${s.id}/pdf`)).status(),
        ).toBe(200);
      } else {
        expect(response?.status()).toBe(404);
        expect(
          (await other.request.get(`/api/quotes/${s.id}/pdf`)).status(),
        ).toBe(404);
      }
    }
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await f.cleanup();
  }
});
test("conflito definitivo conserva escolha e exige recarga completa", async ({
  page,
}) => {
  const f = await rejectionFixture();
  try {
    const s = await f.create();
    await loginAs(page);
    await page.goto(`/app/orcamentos/${s.id}`);
    await page.getByText("Recusar proposta", { exact: true }).click();
    const form = page.getByRole("form", { name: "Recusa da proposta" });
    await form
      .getByLabel("Motivo (opcional)")
      .fill("Escolha concorrente fictícia");
    await form.getByRole("checkbox").check();
    expect((await f.db.rpc("accept_quote_system", s.args())).error).toBeNull();
    await form.getByRole("button", { name: "Confirmar recusa" }).click();
    await expect(form.getByRole("alert")).toContainText("Recarregue a página");
    await expect(
      form.getByRole("button", { name: "Tentar novamente" }),
    ).toBeDisabled();
    await expect(form.getByLabel("Motivo (opcional)")).toHaveValue(
      "Escolha concorrente fictícia",
    );
    await form.getByRole("link", { name: "Recarregar proposta" }).click();
    await expect(
      page.getByRole("heading", { name: "Contratação registrada" }),
    ).toBeVisible();
    await expect(
      page.getByRole("form", { name: "Recusa da proposta" }),
    ).toHaveCount(0);
    expect(
      sql(
        `select count(*) from private.quote_rejections where quote_id='${s.id}';`,
      ),
    ).toBe("0");
  } finally {
    await f.cleanup();
  }
});
