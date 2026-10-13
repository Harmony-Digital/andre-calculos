import { expect, type BrowserContext, type Page } from "@playwright/test";
/** Protocolo do ensaio: sair antes de iniciar outra navegação. */
export async function logoutAndConfirm(page: Page, context: BrowserContext) {
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).origin)
    .toBe("http://127.0.0.1:3000");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/entrar");
  const count = (await context.cookies()).filter(
    (cookie) =>
      cookie.name.includes("-auth-token") &&
      !cookie.name.includes("-code-verifier"),
  ).length;
  expect(count).toBe(0);
  await page.goto("/app");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/entrar");
}
