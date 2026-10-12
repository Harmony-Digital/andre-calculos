import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { authTemplateDefinitions } from "../../src/modules/notifications/auth-email-templates";
import {
  fictionalConfirmationUrl,
  renderAuthTemplateFixture,
} from "../fixtures/auth-templates";

for (const template of authTemplateDefinitions) {
  test(`modelo Auth ${template.name} preserva o link e a apresentação`, async ({
    page,
  }, info) => {
    const requests: string[] = [];
    await page.route("**/*", (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
    const url = fictionalConfirmationUrl(template.next);
    const html = await readFile(
      resolve(
        process.cwd(),
        "../supabase/templates/auth",
        `${template.name}.html`,
      ),
      "utf8",
    );
    await page.setContent(renderAuthTemplateFixture(html, url));
    await expect(page.locator("body")).toHaveAttribute("lang", "pt-BR");
    await expect(page.locator("title")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      template.heading,
    );
    const action = page.getByRole("link", {
      name: template.action,
      exact: true,
    });
    const alternative = page.getByRole("link", {
      name: "Continuar pelo link alternativo",
      exact: true,
    });
    for (const link of [action, alternative])
      await expect(link).toHaveAttribute("href", url);
    await page.keyboard.press("Tab");
    await expect(action).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(alternative).toBeFocused();
    await expect(page.getByText(/mesmo navegador e dispositivo/)).toBeVisible();
    await expect(
      page.getByText("Demonstração com identidade e dados fictícios."),
    ).toBeVisible();
    await expect(page.getByText(/CRC DEMO-000000\/O/)).toBeVisible();
    const size = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(size.width).toBe(info.project.use.viewport!.width);
    expect(size.scroll).toBeLessThanOrEqual(size.width);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(requests).toEqual([]);
    const directory = resolve(
      process.cwd(),
      "../docs/evidencias/emails/autenticacao",
      info.project.name,
    );
    await mkdir(directory, { recursive: true });
    await page.screenshot({
      path: resolve(directory, `${template.name}.png`),
      fullPage: true,
    });
  });
}
