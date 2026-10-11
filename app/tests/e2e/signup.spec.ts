import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  localSystem,
  removeLocalUser,
  confirmMailpit,
  leaseLocalSettings,
} from "./local-helper";
import AxeBuilder from "@axe-core/playwright";
test("cadastro com confirmação e consentimentos sintéticos", async ({
  page,
  context,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "computador",
    "O ensaio altera settings locais; uma execução única cobre o fluxo e as duas larguras.",
  );
  const db = localSystem();
  const release = await leaseLocalSettings();
  const cfg = await db
    .from("settings")
    .select("id,approved_terms_version,approved_privacy_version,contact_email")
    .single();
  expect(cfg.error).toBeNull();
  const email = `cadastro-${randomUUID()}@exemplo.com`;
  let userId: string | undefined;
  try {
    await db
      .from("settings")
      .update({ approved_terms_version: null, approved_privacy_version: null })
      .eq("id", cfg.data!.id);
    await page.goto("/cadastro");
    await expect(
      page.getByRole("button", { name: "Criar minha conta" }),
    ).toBeDisabled();
    await db
      .from("settings")
      .update({
        approved_terms_version: "fixture-termos-v1",
        approved_privacy_version: "fixture-privacidade-v1",
        contact_email: "calculista@exemplo.com",
      })
      .eq("id", cfg.data!.id);
    await page.reload();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(
      page.getByRole("button", { name: "Criar minha conta" }),
    ).toBeEnabled();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(375);
    await page
      .getByLabel("Nome completo", { exact: true })
      .fill("Cadastro inteiramente fictício");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Celular com DDD").fill("61999999999");
    await page
      .getByLabel("Escritório ou empresa")
      .fill("Empresa fictícia de teste");
    await page.getByLabel("Cidade", { exact: true }).fill("Cidade fictícia");
    await page.getByLabel("Tipo de cadastro").selectOption("company");
    await page.getByLabel("CPF ou CNPJ").fill("12.ABC.345/01DE-35");
    await page.getByLabel("Número da OAB").fill("123A");
    await page.getByLabel("UF da OAB").selectOption("DF");
    await page
      .getByLabel("Senha", { exact: true })
      .fill(process.env.ANDRE_TEST_PASSWORD!);
    await page
      .getByLabel("Confirme a senha", { exact: true })
      .fill(process.env.ANDRE_TEST_PASSWORD!);
    await page.getByLabel("Li e aceito").check();
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Confira seu e-mail e confirme o cadastro",
    );
    const users = await db.auth.admin.listUsers();
    userId = users.data.users.find((user) => user.email === email)?.id;
    expect(userId).toBeDefined();
    expect(
      users.data.users.find((user) => user.id === userId)?.email_confirmed_at,
    ).toBeFalsy();
    await confirmMailpit(email, context, request);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app$/);
    await expect(
      page.getByText("Cadastro inteiramente fictício", { exact: true }),
    ).toBeVisible();
    const consents = await db
      .from("consents")
      .select("document,version,accepted_at")
      .eq("profile_id", userId!);
    expect(consents.data).toHaveLength(2);
    expect(consents.data!.map((row) => row.version).sort()).toEqual([
      "fixture-privacidade-v1",
      "fixture-termos-v1",
    ]);
    expect(consents.data!.every((row) => Date.parse(row.accepted_at) > 0)).toBe(
      true,
    );
    const notification = await db
      .from("notifications")
      .select("id,data")
      .eq("dedup_key", `signup:${userId}:email`)
      .single();
    expect(notification.error).toBeNull();
    expect(notification.data?.data).not.toHaveProperty("document");
    expect(
      (
        await db
          .from("clients")
          .select("kind,document")
          .eq("owner_id", userId!)
          .single()
      ).data,
    ).toEqual({ kind: "company", document: "12ABC34501DE35" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page).toHaveURL(/\/entrar$/);
    await page.locator("#login-email").fill(email);
    await page
      .getByLabel("Senha", { exact: true })
      .fill(process.env.ANDRE_TEST_PASSWORD!);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
  } finally {
    await db
      .from("settings")
      .update({
        approved_terms_version: cfg.data!.approved_terms_version,
        approved_privacy_version: cfg.data!.approved_privacy_version,
        contact_email: cfg.data!.contact_email,
      })
      .eq("id", cfg.data!.id);
    if (!userId)
      userId = (await db.auth.admin.listUsers()).data.users.find(
        (user) => user.email === email,
      )?.id;
    if (userId) {
      await db
        .from("notifications")
        .delete()
        .eq("dedup_key", `signup:${userId}:email`);
      await removeLocalUser(userId);
    }
    await release();
  }
});
