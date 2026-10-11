import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const route of [
  "/",
  "/entrar",
  "/cadastro",
  "/app",
  "/app/novo-pedido",
  "/painel",
  "/termos",
  "/privacidade",
]) {
  test("navegação e acessibilidade em " + route, async ({ page }, testInfo) => {
    const response = await page.goto(route);
    expect(response?.ok()).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
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
    await testInfo.attach("Tela " + route, {
      body: await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("tela.png"),
      }),
      contentType: "image/png",
    });
  });
}
test("chamada principal leva ao cadastro", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Solicitar meu orçamento" }).click();
  await expect(page).toHaveURL(/\/cadastro$/);
});
test("rota de saúde responde", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    status: "ok",
    region: "local",
  });
});
