import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAs } from "./auth-helper";
import {
  quoteFixture,
  createQuoteDraft,
  removeQuoteFixture,
} from "./quote-helper";
import { localSystem } from "./local-helper";
test.setTimeout(90000);
test("gera proposta fictícia, recupera resposta perdida e baixa PDF privado", async ({
  page,
  browser,
}, testInfo) => {
  const fixture = await quoteFixture(),
    draft = await createQuoteDraft();
  const contexts = [];
  try {
    await loginAs(page);
    await page.goto(`/app/novo-pedido?rascunho=${draft.order_id}`);
    await page.getByRole("button", { name: "Conferir respostas" }).click();
    await expect(
      page.getByRole("heading", { name: "Confira as informações" }),
    ).toBeVisible();
    let dropped = false;
    await page.route("**/app/novo-pedido?rascunho=*", async (route) => {
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
    await page
      .getByRole("button", { name: "Gerar proposta", exact: true })
      .click();
    await expect(
      page.getByRole("alert", { name: "Emissão da proposta" }),
    ).toContainText("Suas respostas estão salvas");
    const stored = await fixture.db
      .from("quotes")
      .select("id,number,proposal_snapshot")
      .eq("order_id", draft.order_id)
      .single();
    expect(stored.error).toBeNull();
    expect(
      (
        await fixture.db
          .from("notifications")
          .select("id")
          .contains("data", { quote_id: stored.data!.id })
      ).data,
    ).toEqual([]);
    // Alterar o cadastro não altera nem impede a recuperação da proposta emitida.
    await fixture.db
      .from("settings")
      .update({
        technical_name: "Nome fictício posterior",
        revision: fixture.settings.revision + 1,
      })
      .eq("singleton", true);
    await fixture.db
      .from("price_tables")
      .update({ active: false })
      .eq("id", fixture.price.id);
    await page.unroute("**/app/novo-pedido?rascunho=*");
    await page
      .getByRole("button", { name: "Gerar proposta", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/app/orcamentos/${stored.data!.id}$`),
    );
    await expect(
      page.getByText("Ensaio fictício - sem valor comercial.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/Responsável fictício para teste · CRC DF 000001\/O-0/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Aceitar", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Recusar", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Total", { exact: true }).locator(".."),
    ).toContainText("R$ 250,01");
    await expect(
      page.getByText("Sinal de 50%", { exact: true }).locator(".."),
    ).toContainText("R$ 125,01");
    await expect(
      page.getByText("Saldo na entrega", { exact: true }).locator(".."),
    ).toContainText("R$ 125,00");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(testInfo.project.use.viewport!.width);
    await page.screenshot({
      path: testInfo.outputPath("proposta.png"),
      fullPage: true,
    });
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Baixar proposta em PDF" }).click();
    await (await download).saveAs(testInfo.outputPath("proposta-ficticia.pdf"));
    const response = await page.request.get(
      `/api/quotes/${stored.data!.id}/pdf`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
    expect(
      (
        await fixture.db
          .from("quotes")
          .select("id")
          .eq("order_id", draft.order_id)
      ).data,
    ).toHaveLength(1);
    await page.goto(`/app/novo-pedido?rascunho=${draft.order_id}`);
    await expect(page).toHaveURL(
      new RegExp(`/app/orcamentos/${stored.data!.id}$`),
    );
    for (const role of ["clientB", "admin"] as const) {
      const context = await browser.newContext({
        baseURL: "http://127.0.0.1:3000",
      });
      contexts.push(context);
      const other = await context.newPage();
      await loginAs(other, role);
      expect(
        (
          await other.request.get(`/api/quotes/${stored.data!.id}/pdf`)
        ).status(),
      ).toBe(404);
      if (role === "clientB")
        expect(
          (await other.goto(`/app/orcamentos/${stored.data!.id}`))?.status(),
        ).toBe(404);
    }
    const anonymous = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    contexts.push(anonymous);
    expect(
      (
        await anonymous.request.get(`/api/quotes/${stored.data!.id}/pdf`)
      ).status(),
    ).toBe(404);
    const panel = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    contexts.push(panel);
    const calc = await panel.newPage();
    await loginAs(calc, "calculator");
    await calc.goto(`/painel/processos/${draft.process_id}?aba=resumo`);
    const simulationLink = calc
      .getByRole("link")
      .and(calc.locator(`a[href="/painel/orcamentos/${stored.data!.id}"]`));
    await expect(simulationLink).toContainText(stored.data!.number);
    await expect(simulationLink).toContainText("Versão 1");
    await expect(simulationLink).toContainText("Vigente");
    await expect(simulationLink).toContainText("Ensaio fictício");
    await simulationLink.click();
    await expect(calc).toHaveURL(
      new RegExp(`/painel/orcamentos/${stored.data!.id}$`),
    );
    expect(
      (await calc.request.get(`/api/quotes/${stored.data!.id}/pdf`)).status(),
    ).toBe(200);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await removeQuoteFixture(draft.order_id);
    await fixture.cleanup();
  }
});
test("checklist sem término contratual mantém bloqueio e não emite proposta", async ({
  page,
}) => {
  const fixture = await quoteFixture(),
    draft = await createQuoteDraft();
  try {
    const db = localSystem();
    await db
      .from("checklists")
      .update({ answers: { ...draft.answers, dismissalDate: "" } })
      .eq("order_id", draft.order_id);
    await loginAs(page);
    await page.goto(`/app/novo-pedido?rascunho=${draft.order_id}`);
    await page.getByRole("button", { name: "Conferir respostas" }).click();
    await page
      .getByRole("button", { name: "Gerar proposta", exact: true })
      .click();
    await expect(
      page.getByRole("alert", { name: "Emissão da proposta" }),
    ).toContainText("Falta confirmar a regra de meses");
    expect(
      (await db.from("quotes").select("id").eq("order_id", draft.order_id))
        .data,
    ).toEqual([]);
    expect(
      (
        await db
          .from("orders")
          .select("status,total_cents")
          .eq("id", draft.order_id)
          .single()
      ).data,
    ).toEqual({ status: "draft", total_cents: 0 });
  } finally {
    await removeQuoteFixture(draft.order_id);
    await fixture.cleanup();
  }
});
