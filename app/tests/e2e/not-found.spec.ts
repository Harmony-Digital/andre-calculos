import { test, expect } from "@playwright/test";
import { captureWebhookScreen } from "./webhook-screen-helper";

test("página inexistente preserva 404 e permite continuar em português pelo teclado", async ({
  page,
}, info) => {
  const response = await page.goto("/pagina-inexistente-ensaio?pedido=privado");
  expect(response?.status()).toBe(404);
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(
    page.getByRole("heading", { name: "Página não encontrada", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("privado");
  await expect(page.locator("main")).not.toContainText("could not be found");
  const site = page.getByRole("link", {
    name: "Voltar à página inicial",
    exact: true,
  });
  await expect(site).toHaveAttribute("href", "/");
  await captureWebhookScreen(page, info, "pagina-indisponivel");

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Ir para o conteúdo" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Portal de Cálculos — página inicial" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Acessar minha conta", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await site.click();
  await expect(page).toHaveURL(/\/\/?$/);
});
