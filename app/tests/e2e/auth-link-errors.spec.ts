import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { localSystem } from "./local-helper";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

for (const [name, code] of [
  ["sem código", ""],
  ["código fictício inválido", "&code=CODIGO_FICTICIO_INVALIDO"],
] as const) {
  test(`falha de link ${name} tem orientação e preserva o acesso protegido`, async ({
    page,
    context,
  }, testInfo) => {
    localSystem();
    const callback = `/auth/callback?next=https%3A%2F%2Fexterno.example.test&error_description=TEXTO_FICTICIO_OCULTO${code}`;
    const response = await context.request.get(callback, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    const destination = new URL(response.headers().location);
    expect(destination.origin).toBe("http://127.0.0.1:3000");
    expect(destination.pathname).toBe("/entrar");
    expect([...destination.searchParams]).toEqual([["link", "invalido"]]);

    await page.goto(callback);
    await expect.poll(() => new URL(page.url()).pathname).toBe("/entrar");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Não foi possível usar este link.",
    );
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "mesmo navegador",
    );
    await expect(page.locator("details")).toHaveAttribute("open", "");
    await expect(page.locator("#link-email")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "TEXTO_FICTICIO_OCULTO",
    );
    await expect(page.locator("body")).not.toContainText(
      "CODIGO_FICTICIO_INVALIDO",
    );
    await page.locator("details summary").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#link-email")).toBeFocused();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (!code) {
      const root = resolve(
        process.cwd(),
        "../docs/evidencias/autenticacao/retorno",
        testInfo.project.name,
      );
      await mkdir(root, { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: resolve(root, "link-invalido.png"),
        fullPage: true,
      });
    }
    const sessionCount = (await context.cookies()).filter(
      (cookie) =>
        cookie.name.includes("-auth-token") &&
        !cookie.name.includes("-code-verifier"),
    ).length;
    expect(sessionCount).toBe(0);
    await page.goto("/app");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/entrar");
  });
}

test("parâmetro desconhecido não exibe conteúdo nem abre o formulário", async ({
  page,
}) => {
  localSystem();
  await page.goto(
    "/entrar?link=TEXTO_FICTICIO_OCULTO&error_description=TEXTO_FICTICIO_OCULTO",
  );
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.locator("details")).not.toHaveAttribute("open", "");
  await expect(page.locator("body")).not.toContainText("TEXTO_FICTICIO_OCULTO");
});
