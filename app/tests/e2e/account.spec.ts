import { test, expect, type BrowserContext } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { provisionLocalUser } from "../../scripts/provision-local-user";
import {
  localSystem,
  removeLocalUser,
  leaseLocalSettings,
} from "./local-helper";
test.setTimeout(90000);
test("perfil, senha e solicitação de exclusão auditados", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const db = localSystem(),
    release = await leaseLocalSettings();
  const email = `conta-${randomUUID()}@exemplo.com`;
  const password = process.env.ANDRE_TEST_PASSWORD!;
  let userId: string | undefined, otherDevice: BrowserContext | undefined;
  try {
    const created = await provisionLocalUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Pessoa fictícia" },
    });
    const id = created.data.user!.id;
    userId = id;
    otherDevice = await browser.newContext();
    const otherPage = await otherDevice.newPage();
    await otherPage.goto("http://127.0.0.1:3000/entrar");
    await otherPage.locator("#login-email").fill(email);
    await otherPage.getByLabel("Senha", { exact: true }).fill(password);
    await otherPage
      .getByRole("button", { name: "Entrar", exact: true })
      .click();
    await expect(otherPage).toHaveURL(/\/app$/);
    await page.goto("/entrar");
    await page.locator("#login-email").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await page.getByRole("link", { name: "Minha conta" }).click();
    await page
      .getByLabel("Nome completo", { exact: true })
      .fill("Pessoa de teste atualizada");
    await page.getByLabel("Celular com DDD").fill("(61) 99999-9999");
    await page.getByLabel("Escritório ou empresa").fill("Escritório fictício");
    await page.getByLabel("Cidade", { exact: true }).fill("Cidade fictícia");
    await page.getByLabel("Número da OAB").fill("123A");
    await page.getByLabel("UF da OAB").selectOption("DF");
    await page.getByRole("button", { name: "Salvar dados" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Seus dados foram atualizados.",
    );
    await page.reload();
    await expect(page.getByLabel("Nome completo", { exact: true })).toHaveValue(
      "Pessoa de teste atualizada",
    );
    expect(
      (
        await db
          .from("profiles")
          .select("phone,city,role")
          .eq("id", id)
          .single()
      ).data,
    ).toEqual({
      phone: "+5561999999999",
      city: "Cidade fictícia",
      role: "client",
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page
      .getByRole("heading", { name: "Minha conta", exact: true })
      .click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("conta.png"),
      fullPage: true,
    });
    await page.getByLabel("Desejo registrar um pedido de exclusão").check();
    await page
      .getByRole("button", { name: "Solicitar exclusão da conta" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Pedido de exclusão registrado.",
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Solicitar exclusão da conta" }),
    ).toHaveCount(0);
    const requests = await db
      .from("audit_log")
      .select("id")
      .eq("actor_id", id)
      .eq("action", "account_deletion_requested");
    expect(requests.data).toHaveLength(1);
    const changedPassword = randomBytes(24).toString("base64url");
    await page.getByLabel("Nova senha", { exact: true }).fill(changedPassword);
    await page.getByLabel("Confirme a nova senha").fill(changedPassword);
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page).toHaveURL(/\/entrar\?senha=atualizada$/);
    await otherPage.goto("http://127.0.0.1:3000/app");
    await expect(otherPage).toHaveURL(/\/entrar$/);
    await page.locator("#login-email").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(changedPassword);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await context.clearCookies();
  } finally {
    try {
      await otherDevice?.close();
      if (userId) await removeLocalUser(userId);
    } finally {
      await release();
    }
  }
});
