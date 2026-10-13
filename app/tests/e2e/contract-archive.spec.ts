import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { acceptanceFixture } from "./acceptance-helper";
import { loginAs } from "./auth-helper";
import { localNotificationSql as sql } from "./notification-helper";
test.setTimeout(90000);
for (const lostAcceptance of [false, true])
  test(`contrato privado fica disponível e baixa os bytes arquivados${lostAcceptance ? " após perda da resposta do aceite" : " pela retomada"}`, async ({
    page,
  }, info) => {
    const fixture = await acceptanceFixture();
    try {
      const sample = await fixture.create();
      if (!lostAcceptance)
        expect(
          (await fixture.db.rpc("accept_quote_system", sample.args())).error,
        ).toBeNull();
      await loginAs(page);
      await page.setExtraHTTPHeaders({
        "x-forwarded-for": "192.0.2.44",
        "user-agent": "Navegador sintético do contrato",
      });
      await page.goto(`/app/orcamentos/${sample.id}`);
      if (lostAcceptance) {
        const form = page.getByRole("form", { name: "Aceite da proposta" });
        await form.getByRole("checkbox").check();
        let dropped = false;
        await page.route("**/app/orcamentos/**", async (route) => {
          if (
            !dropped &&
            route.request().method() === "POST" &&
            route.request().headers()["next-action"]
          ) {
            dropped = true;
            await route.fetch();
            await route.abort("failed");
          } else await route.continue();
        });
        await form
          .getByRole("button", { name: "Aceitar", exact: true })
          .click();
        await expect(
          form.getByRole("alert", { name: "Aceite da proposta" }),
        ).toContainText("Sua escolha foi preservada");
        await expect(form.getByRole("checkbox")).toBeChecked();
        await form
          .getByRole("button", { name: "Aceitar", exact: true })
          .click();
        expect(dropped).toBe(true);
      } else {
        const card = page.getByRole("region", {
          name: "Contrato da contratação",
        });
        await expect(card).toContainText("preparando o PDF");
        await page.screenshot({
          path: info.outputPath("contrato-pendente.png"),
          fullPage: true,
        });
        await card.getByRole("button", { name: "Atualizar contrato" }).click();
      }
      const link = page.getByRole("link", {
        name: "Baixar contrato em PDF",
        exact: true,
      });
      await expect(link).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(info.project.use.viewport!.width);
      await link.focus();
      await expect(link).toBeFocused();
      const waiting = page.waitForEvent("download");
      await page.keyboard.press("Enter");
      const download = await waiting,
        bytes = await readFile((await download.path())!);
      expect(download.suggestedFilename()).toBe(
        `contrato-${sample.number}.pdf`,
      );
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      const hash = createHash("sha256").update(bytes).digest("hex");
      expect(
        sql(
          `select sha256 from private.quote_contract_pdf_archives where quote_id='${sample.id}';`,
        ),
      ).toBe(hash);
      expect(
        sql(
          `select count(*) from public.audit_log where target_id='${sample.id}' and action='contract_pdf_downloaded';`,
        ),
      ).toBe("1");
      expect(await page.content()).not.toContain("contracts/");
      expect(
        sql(
          `select count(*) from private.quote_acceptances where quote_id='${sample.id}';`,
        ),
      ).toBe("1");
      expect(
        sql(
          `select count(*) from private.quote_contract_pdf_archives where quote_id='${sample.id}';`,
        ),
      ).toBe("1");
      await page.screenshot({
        path: info.outputPath("contrato-disponivel.png"),
        fullPage: true,
      });
      await page.goto(`/app/processos/${sample.process_id}?aba=resumo`);
      await expect(
        page.getByRole("link", { name: "Baixar contrato em PDF", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath("contrato-na-pasta.png"),
        fullPage: true,
      });
      await loginAs(page, "calculator");
      await page.goto(`/painel/orcamentos/${sample.id}`);
      await expect(
        page.getByRole("link", { name: "Baixar contrato em PDF", exact: true }),
      ).toBeVisible();
      const response = await page.request.get(
        `/api/quotes/${sample.id}/contract`,
      );
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
      expect(
        createHash("sha256")
          .update(await response.body())
          .digest("hex"),
      ).toBe(hash);
      for (const role of ["clientB", "admin"] as const) {
        await loginAs(page, role);
        expect(
          (
            await page.request.get(`/api/quotes/${sample.id}/contract`)
          ).status(),
        ).toBe(404);
        expect(
          (
            await page.request.get(`/api/quotes/${sample.id}/contract/status`)
          ).status(),
        ).toBe(404);
      }
      await page.context().clearCookies();
      expect(
        (await page.request.get(`/api/quotes/${sample.id}/contract`)).status(),
      ).toBe(404);
    } finally {
      await fixture.cleanup();
    }
  });
