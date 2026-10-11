import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { provisionLocalUser } from "../../scripts/provision-local-user";
import {
  localSystem,
  removeLocalUser,
  confirmMailpit,
  leaseLocalSettings,
  mailpitMessageIds,
  clearMailpit,
} from "./local-helper";
async function localPath(page: Page, path: string) {
  // Falhas exibem somente origem/path, nunca code, token ou fragmento.
  await expect
    .poll(() => new URL(page.url()).origin)
    .toBe("http://127.0.0.1:3000");
  await expect.poll(() => new URL(page.url()).pathname).toBe(path);
}
async function privateNavigation(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch {
    throw new Error("A navegação local de autenticação não foi concluída.");
  }
}
async function noSession(page: Page, context: BrowserContext) {
  const count = (await context.cookies()).filter(
    (cookie) =>
      cookie.name.includes("-auth-token") &&
      !cookie.name.includes("-code-verifier"),
  ).length;
  expect(count).toBe(0);
  await page.goto("/app");
  await localPath(page, "/entrar");
}
test.setTimeout(90000);
test("recuperação de senha e link de acesso pelo Mailpit", async ({
  page,
  context,
  request,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "computador",
    "Fluxo de e-mail único com Mailpit; formulários responsivos cobertos na suite base.",
  );
  const db = localSystem(),
    release = await leaseLocalSettings(),
    email = `recuperacao-${randomUUID()}@exemplo.com`,
    otherEmail = `outro-navegador-${randomUUID()}@exemplo.com`,
    password = process.env.ANDRE_TEST_PASSWORD!;
  let userId: string | undefined;
  let otherUserId: string | undefined;
  try {
    const created = await provisionLocalUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Recuperação fictícia" },
    });
    const id = created.data.user!.id;
    userId = id;
    await page.goto("/recuperar-senha");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    const previousRecovery = await mailpitMessageIds(email, request);
    await page.getByRole("button", { name: "Enviar link por e-mail" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Se o e-mail estiver cadastrado",
    );
    const verifier = (await context.cookies()).filter((cookie) =>
      cookie.name.includes("-code-verifier"),
    );
    expect(verifier.length).toBeGreaterThan(0);
    const invalidContext = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    try {
      await invalidContext.addCookies(verifier);
      const invalidPage = await invalidContext.newPage();
      await invalidPage.goto(
        "/auth/callback?code=CODIGO_FICTICIO_INVALIDO&next=https%3A%2F%2Fexterno.example.test",
      );
      await localPath(invalidPage, "/entrar");
      await expect(
        invalidPage.getByRole("main").getByRole("alert"),
      ).toContainText("Não foi possível usar este link.");
      await noSession(invalidPage, invalidContext);
    } finally {
      await invalidContext.close();
    }
    let callback: string | undefined;
    const rememberCallback = (request: { url(): string }) => {
      const url = new URL(request.url());
      if (
        url.origin === "http://127.0.0.1:3000" &&
        url.pathname === "/auth/callback" &&
        url.searchParams.has("code")
      )
        callback = url.toString();
    };
    page.on("request", rememberCallback);
    try {
      await confirmMailpit(email, page, request, previousRecovery);
    } finally {
      page.off("request", rememberCallback);
    }
    await localPath(page, "/nova-senha");
    await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();
    expect(!!callback).toBe(true);
    const replayContext = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    try {
      // Somente verifier anterior; nenhum cookie de sessão copiado.
      await replayContext.addCookies(verifier);
      const replayPage = await replayContext.newPage();
      await privateNavigation(replayPage, callback!);
      await localPath(replayPage, "/entrar");
      await expect(
        replayPage.getByRole("main").getByRole("alert"),
      ).toContainText("Não foi possível usar este link.");
      await noSession(replayPage, replayContext);
    } finally {
      await replayContext.close();
    }
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
    const previousMagic = await mailpitMessageIds(email, request);
    await page.getByRole("button", { name: "Enviar link por e-mail" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Se o e-mail estiver cadastrado",
    );
    await confirmMailpit(email, page, request, previousMagic);
    await localPath(page, "/app");
    await expect(page.getByRole("banner")).toContainText(
      "Recuperação fictícia",
    );

    await page.getByRole("button", { name: "Sair", exact: true }).click();
    // Usuário separado: o negativo não depende do cooldown de um envio anterior.
    const otherUser = await provisionLocalUser({
      email: otherEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Outro navegador fictício" },
    });
    otherUserId = otherUser.data.user!.id;
    await page.goto("/recuperar-senha");
    await page.getByLabel("E-mail", { exact: true }).fill(otherEmail);
    const previousDifferent = await mailpitMessageIds(otherEmail, request);
    await page.getByRole("button", { name: "Enviar link por e-mail" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Se o e-mail estiver cadastrado",
    );
    const otherContext = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    try {
      const otherPage = await otherContext.newPage();
      await confirmMailpit(otherEmail, otherPage, request, previousDifferent);
      await localPath(otherPage, "/entrar");
      await expect(
        otherPage.getByRole("main").getByRole("alert"),
      ).toContainText("Não foi possível usar este link.");
      await noSession(otherPage, otherContext);
    } finally {
      await otherContext.close();
    }
    await noSession(page, context);
  } finally {
    try {
      try {
        try {
          await clearMailpit(email, request);
        } finally {
          await clearMailpit(otherEmail, request);
        }
      } finally {
        try {
          if (userId) await removeLocalUser(userId);
        } finally {
          if (otherUserId) await removeLocalUser(otherUserId);
        }
      }
    } finally {
      await release();
    }
  }
});
