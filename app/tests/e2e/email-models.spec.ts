import { createElement } from "react";
import { render } from "react-email";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  emailContent,
  emailTemplates,
} from "../../src/modules/notifications/email-content";
import {
  fictionalEmailBrand,
  fictionalEmailNotice,
} from "../../src/modules/notifications/email-fixtures";
import { TransactionalEmail } from "../../src/modules/notifications/email-view";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

for (const template of emailTemplates) {
  test(`modelo de e-mail ${template} preserva privacidade e acessibilidade`, async ({
    page,
  }, info) => {
    const requests: string[] = [];
    await page.route("**/*", (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
    const content = emailContent(fictionalEmailNotice(template));
    const html = await render(
      createElement(TransactionalEmail, {
        content,
        brand: fictionalEmailBrand,
      }),
    );
    await page.setContent(html);
    await expect(page.locator("body")).toHaveAttribute("lang", "pt-BR");
    await expect(page.locator("title")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      content.heading,
    );
    const button = page.getByRole("link", {
      name: "Abrir portal",
      exact: true,
    });
    await expect(button).toHaveAttribute("href", content.href);
    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    await expect(
      page.getByText("Demonstração com identidade e dados fictícios."),
    ).toBeVisible();
    await expect(page.getByText(/CRC DEMO-000000\/O/)).toBeVisible();
    const size = await page.evaluate(() => ({
      width: window.innerWidth,
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
      "../docs/evidencias/emails",
      info.project.name,
    );
    await mkdir(directory, { recursive: true });
    await page.screenshot({
      path: resolve(directory, `${template}.png`),
      fullPage: true,
    });
  });
}
