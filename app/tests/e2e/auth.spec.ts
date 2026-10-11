import { test, expect } from "@playwright/test";
import { loginAs } from "./auth-helper";
test("sessão server, logout e área protegida", async ({ page, context }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/entrar$/);
  await loginAs(page);
  await expect(page.getByRole("banner")).toContainText("Cliente A de teste");
  const session = (await context.cookies()).filter((cookie) =>
    cookie.name.startsWith("sb-"),
  );
  expect(session.length).toBeGreaterThan(0);
  expect(session.every((cookie) => cookie.httpOnly)).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("sb-");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/entrar$/);
});
test("cliente não entra no painel", async ({ page }) => {
  await loginAs(page);
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/acesso-negado$/);
  await expect(
    page.getByRole("heading", { name: "Acesso negado." }),
  ).toBeVisible();
});
test("calculista entra no painel e conta anônima recebe login", async ({
  page,
}) => {
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/entrar$/);
  await loginAs(page, "calculator");
  await expect(page.getByRole("banner")).toContainText("Calculista de teste");
});
test("senha incorreta recebe mensagem genérica", async ({ page }) => {
  await page.goto("/entrar");
  await page
    .getByLabel("E-mail", { exact: true })
    .first()
    .fill("clientea@exemplo.com");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("senha-ficticia-incorreta");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Não foi possível entrar." }),
  ).toHaveText("Não foi possível entrar. Confira o e-mail e a senha.");
  await expect(page).toHaveURL(/\/entrar$/);
});
