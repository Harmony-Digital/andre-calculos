import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { acceptanceFixture } from "./acceptance-helper";
import { loginAs } from "./auth-helper";
test.setTimeout(90000);
test("cliente vê Pix privado; André confirma uma vez após resposta perdida", async ({
  page,
}, testInfo) => {
  const fixture = await acceptanceFixture();
  try {
    const sample = await fixture.create({ documents: true });
    expect(
      (await fixture.db.rpc("accept_quote_system", sample.args())).error,
    ).toBeNull();
    const pix =
      "chave-exclusivamente-ficticia-para-teste-local-".repeat(3) +
      "@exemplo.com";
    expect(
      (
        await fixture.db
          .from("settings")
          .update({ pix_key: pix })
          .eq("singleton", true)
      ).error,
    ).toBeNull();
    await loginAs(page);
    await page.goto(`/app/processos/${sample.process_id}?aba=resumo`);
    const card = page.getByRole("region", { name: /^Sinal · P-/ });
    await expect(card.getByText(pix, { exact: true })).toBeVisible();
    await expect(card).toContainText("R$ 125,01");
    await expect(card.getByRole("button")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(testInfo.project.use.viewport!.width);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("sinal-pix.png"),
      fullPage: true,
    });
    await loginAs(page, "calculator");
    await page.goto(`/painel/processos/${sample.process_id}?aba=resumo`);
    const form = card.getByRole("form", { name: /^Confirmar sinal P-/ });
    const button = form.getByRole("button", {
      name: "Confirmar sinal recebido",
    });
    await expect(button).toBeEnabled();
    let dropped = false;
    await page.route("**/painel/processos/**", async (route) => {
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
    await button.click();
    await expect(form.getByRole("alert")).toContainText(
      "O valor foi preservado",
    );
    expect(dropped).toBe(true);
    const saved = (
      await fixture.db
        .from("payments")
        .select("id,amount_cents,confirmed_at,confirmed_by")
        .eq("order_id", sample.order_id)
    ).data!;
    expect(saved).toHaveLength(1);
    await button.click();
    await expect(card.getByRole("status")).toContainText(
      "Recebimento de R$ 125,01",
    );
    await expect(card.getByRole("button")).toHaveCount(0);
    await expect(
      page.getByText("Na fila", { exact: false }).first(),
    ).toBeVisible();
    expect(
      (
        await fixture.db
          .from("payments")
          .select("id,amount_cents,confirmed_at,confirmed_by")
          .eq("order_id", sample.order_id)
      ).data,
    ).toEqual(saved);
    expect(
      (
        await fixture.db
          .from("notifications")
          .select("id")
          .eq("dedup_key", `queued:${sample.order_id}:email`)
      ).data,
    ).toHaveLength(1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("sinal-recibo.png"),
      fullPage: true,
    });
    await loginAs(page);
    await page.goto(`/app/orcamentos/${sample.id}`);
    await expect(page.getByRole("status")).toContainText(
      "Acompanhe o andamento",
    );
    await page.goto(`/app/processos/${sample.process_id}?aba=resumo`);
    await expect(card).toContainText("Sinal confirmado");
    await expect(card.getByText(pix, { exact: true })).toHaveCount(0);
    await loginAs(page, "clientB");
    await page.goto(`/app/processos/${sample.process_id}?aba=resumo`);
    await expect(
      page.getByRole("heading", {
        name: "Página não encontrada",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("sinal-outro-cliente-indisponivel.png"),
      fullPage: true,
    });
  } finally {
    await fixture.cleanup();
  }
});
test("sem Pix orienta conversa; contrato dispensa sinal e estorno fica explícito", async ({
  page,
}, testInfo) => {
  const fixture = await acceptanceFixture();
  try {
    const sample = await fixture.create();
    expect(
      (await fixture.db.rpc("accept_quote_system", sample.args())).error,
    ).toBeNull();
    await fixture.db
      .from("settings")
      .update({ pix_key: null })
      .eq("singleton", true);
    await loginAs(page);
    await page.goto(`/app/processos/${sample.process_id}?aba=resumo`);
    const card = page.getByRole("region", { name: /^Sinal · P-/ });
    await expect(card).toContainText("Peça os dados para pagamento");
    await expect(
      card.getByRole("link", { name: "Conversar com André" }),
    ).toHaveAttribute(
      "href",
      `/app/processos/${sample.process_id}?aba=mensagens`,
    );
    await loginAs(page, "calculator");
    await page.goto(`/painel/processos/${sample.process_id}?aba=resumo`);
    await card
      .getByRole("button", { name: "Confirmar sinal recebido" })
      .click();
    await expect(card).toContainText("Sinal confirmado");
    await expect(
      page.getByText(/^Aguardando documentos · Entrega prevista:/),
    ).toBeVisible();
    const payment = (
      await fixture.db
        .from("payments")
        .select("id")
        .eq("order_id", sample.order_id)
        .single()
    ).data!;
    await fixture.db
      .from("payments")
      .update({ status: "refunded" })
      .eq("id", payment.id);
    await page.reload();
    await expect(card).toContainText("Pagamento devolvido");
    await expect(
      card.getByText("Sinal confirmado.", { exact: false }),
    ).toHaveCount(0);
    const contract = await fixture.create({ contract: true });
    expect(
      (await fixture.db.rpc("accept_quote_system", contract.args())).error,
    ).toBeNull();
    await page.goto(`/painel/processos/${contract.process_id}?aba=resumo`);
    await expect(card).toContainText("Sinal dispensado. Pagamento no final");
    await expect(card.getByRole("button")).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("sinal-contrato.png"),
      fullPage: true,
    });
  } finally {
    await fixture.cleanup();
  }
});
