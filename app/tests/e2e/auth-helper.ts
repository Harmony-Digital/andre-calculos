import { expect, type Page } from "@playwright/test";
export async function loginAs(
  page: Page,
  role: "client" | "clientB" | "calculator" | "admin" = "client",
) {
  const password = process.env.ANDRE_TEST_PASSWORD;
  if (!password)
    throw new Error("Execute os testes autenticados pelo scripts/dev-env.sh.");
  await page.goto("/entrar");
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("E-mail", { exact: true })
    .first()
    .fill(
      role === "client" || role === "clientB"
        ? `${role === "client" ? "clientea" : "clienteb"}@exemplo.com`
        : `${role === "calculator" ? "calculista" : "admin"}@exemplo.com`,
    );
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(
    role === "client" || role === "clientB" ? /\/app$/ : /\/painel$/,
  );
}
