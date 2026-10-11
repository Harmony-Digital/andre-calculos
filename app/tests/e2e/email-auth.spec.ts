import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { localSystem, removeLocalUser, confirmMailpit } from "./local-helper";
test("recuperação de senha e link de acesso pelo Mailpit", async ({
  page,
  context,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "computador",
    "Fluxo de e-mail único com Mailpit; formulários responsivos cobertos na suite base.",
  );
  const db = localSystem(),
    email = `recuperacao-${randomUUID()}@exemplo.com`,
    password = process.env.ANDRE_TEST_PASSWORD!;
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Recuperação fictícia" },
  });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  try {
    await page.goto("/recuperar-senha");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Enviar link por e-mail" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Se o e-mail estiver cadastrado",
    );
    await confirmMailpit(email, context, request);
    await page.goto("/nova-senha");
    await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();
    const newPassword = randomBytes(24).toString("base64url");
    await page.getByLabel("Nova senha", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirme a nova senha").fill(newPassword);
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page).toHaveURL(/\/entrar\?senha=atualizada$/);
    await page.locator("#login-email").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    expect(
      (
        await db
          .from("audit_log")
          .select("id")
          .eq("actor_id", id)
          .eq("action", "password_changed")
      ).data,
    ).toHaveLength(1);
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await page.getByText("Entrar com um link por e-mail").click();
    await page.locator("#link-email").fill(email);
    await page.getByRole("button", { name: "Enviar link por e-mail" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Se o e-mail estiver cadastrado",
    );
    await confirmMailpit(email, context, request);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app$/);
  } finally {
    await removeLocalUser(id);
  }
});
