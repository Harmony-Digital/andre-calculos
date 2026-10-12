import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { loginAs } from "./auth-helper";
import { localSystem, leaseLocalSettings } from "./local-helper";
import { leaseQueue } from "./queue-helper";
import { createDeliveryFixture, deliveryProfessional } from "./delivery-helper";
import { pdfFixture } from "./pdf-helper";
test.setTimeout(90000);
for (const policy of [null, "after_balance"] as const) {
  test(`entrega conferida preserva versões e ${policy === null ? "bloqueia sem regra aprovada" : "libera só após saldo confirmado"}`, async ({
    page,
    browser,
  }, info) => {
    const releaseSettings = await leaseLocalSettings(),
      releaseQueue = await leaseQueue(),
      db = localSystem(),
      prior = (
        await db
          .from("settings")
          .select(
            "technical_name,crc_number,crc_state,crc_category,delivery_release_policy,revision,pix_key",
          )
          .eq("singleton", true)
          .single()
      ).data!,
      fixture = await createDeliveryFixture(false),
      pdf = await readFile(pdfFixture),
      context = await browser.newContext({
        baseURL: "http://127.0.0.1:3000",
        viewport: page.viewportSize()!,
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
      }),
      client = await context.newPage(),
      policyKeys = new Set<string>();
    try {
      expect(
        (
          await db
            .from("settings")
            .update({
              ...deliveryProfessional,
              delivery_release_policy: policy,
              pix_key: "chave-pix-ficticia",
            })
            .eq("singleton", true)
        ).error,
      ).toBeNull();
      await loginAs(page, "calculator");
      await loginAs(client);
      await page.goto(`/painel/processos/${fixture.process.id}?aba=documentos`);
      await page.getByLabel("Pasta de destino").selectOption("deliverables");
      const names = [
        "Calculo fictício.pdf",
        "Projeto fictício.pjc",
        "Parecer fictício.pdf",
      ];
      for (const [i, name] of names.entries()) {
        await page.getByLabel("Escolher arquivo do processo").setInputFiles({
          name,
          mimeType: i === 1 ? "application/octet-stream" : "application/pdf",
          buffer:
            i === 1
              ? Buffer.from(
                  "PJC fictício para ensaio de transporte; sem cálculo ou dados reais.",
                )
              : pdf,
        });
        await expect
          .poll(
            async () =>
              (
                await db
                  .from("files")
                  .select("id")
                  .eq("process_id", fixture.process.id)
                  .eq("name", name)
                  .eq("upload_status", "uploaded")
              ).data?.length,
          )
          .toBe(1);
        await expect(page.getByRole("status")).toContainText(
          "Arquivo enviado e integridade confirmada.",
        );
      }
      const files = (
          await db
            .from("files")
            .select("id,name")
            .eq("process_id", fixture.process.id)
        ).data!,
        fileId = files.find((f) => f.name === names[0])!.id;
      await client.goto(`/app/processos/${fixture.process.id}?aba=documentos`);
      await expect(client.getByLabel("Pasta Entregas")).toContainText(
        "Nenhum documento nesta pasta.",
      );
      for (const action of ["download", "content"])
        expect(
          (
            await client.request.get(`/api/files/${fileId}/${action}`, {
              maxRedirects: 0,
            })
          ).status(),
        ).toBe(404);
      await page.goto(`/painel/processos/${fixture.process.id}?aba=resumo`);
      await page
        .getByText(`Confirmar entrega do pedido ${fixture.order.code}`, {
          exact: true,
        })
        .click();
      const form = page.getByRole("form", {
          name: `Confirmar entrega ${fixture.order.code}`,
          exact: true,
        }),
        key = await form.locator('input[name="requestId"]').inputValue();
      await form
        .getByLabel("PDF do cálculo", { exact: true })
        .selectOption({ label: `${names[0]} · Versão 1` });
      await form
        .getByLabel("Arquivo PJC", { exact: true })
        .selectOption({ label: `${names[1]} · Versão 1` });
      await form
        .getByLabel("Parecer assinado em PDF")
        .selectOption({ label: `${names[2]} · Versão 1` });
      await form.getByLabel("Versão do PJe-Calc").fill("2.13.1");
      await form.getByLabel("Mês da tabela de índices").fill("10/2026");
      await form
        .getByLabel("Confirmei que o cálculo está liquidado.", { exact: true })
        .check();
      await form
        .getByLabel("Confirmei que o CPF ou CNPJ está cadastrado no PJC.", {
          exact: true,
        })
        .check();
      await form
        .getByRole("button", { name: "Confirmar entrega", exact: true })
        .click();
      await expect(form.getByRole("status")).toHaveText(
        "Confira os campos indicados.",
      );
      await expect(form.getByLabel("Versão do PJe-Calc")).toHaveValue("2.13.1");
      await expect(form.locator('input[name="requestId"]')).toHaveValue(key);
      await form
        .getByLabel(
          "Revisei o cálculo e conferi a assinatura do parecer, o nome e o CRC nos arquivos.",
          { exact: true },
        )
        .check();
      await db
        .from("settings")
        .update({ crc_number: null })
        .eq("singleton", true);
      await form
        .getByRole("button", { name: "Confirmar entrega", exact: true })
        .click();
      await expect(form.getByRole("status")).toHaveText(
        "Complete o nome e o CRC nas configurações antes de confirmar a entrega.",
      );
      await expect(form.locator('input[name="requestId"]')).toHaveValue(key);
      await expect(form.getByLabel("Arquivo PJC", { exact: true })).toHaveValue(
        files.find((f) => f.name === names[1])!.id,
      );
      await db
        .from("settings")
        .update(deliveryProfessional)
        .eq("singleton", true);
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
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: info.outputPath(`entrega-checklist-${policy ?? "pendente"}.png`),
        fullPage: true,
      });
      await form
        .getByRole("button", { name: "Confirmar entrega", exact: true })
        .click();
      const record = page.locator(`[data-delivery-id="${key}"]`);
      await expect(record).toBeVisible();
      await expect(record).toContainText("CRC DF 000001/O-0");
      await expect(form).toHaveCount(0);
      expect(
        (
          await db
            .from("timeline_events")
            .select("id")
            .eq("process_id", fixture.process.id)
            .eq("kind", "delivered")
        ).data,
      ).toHaveLength(1);
      expect(
        (
          await db
            .from("notifications")
            .select("id")
            .eq("dedup_key", `delivery:${key}:email`)
        ).data,
      ).toHaveLength(1);
      await client.goto(`/app/processos/${fixture.process.id}?aba=resumo`);
      const own = client.locator(`[data-delivery-id="${key}"]`);
      await expect(own).toContainText(
        policy === null
          ? "aguarda a definição da regra de pagamento"
          : "aguarda a confirmação do saldo",
      );
      await expect(own.locator('a[href^="/api/files/"]')).toHaveCount(0);
      await expect(client.locator(".delivery-form")).toHaveCount(0);
      for (const action of ["download", "content"])
        expect(
          (
            await client.request.get(`/api/files/${fileId}/${action}`, {
              maxRedirects: 0,
            })
          ).status(),
        ).toBe(404);
      expect(
        (
          await new AxeBuilder({ page: client })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await client.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(page.viewportSize()!.width);
      await client.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      await client.screenshot({
        path: info.outputPath(`entrega-cliente-${policy ?? "pendente"}.png`),
        fullPage: true,
      });
      if (policy === null) {
        await page.goto("/painel/configuracoes#entregas");
        let future = page.getByRole("form", {
          name: "Regra das próximas entregas",
          exact: true,
        });
        await expect(
          future.getByLabel("Quando liberar os arquivos?", { exact: true }),
        ).toHaveValue("");
        const approval =
          "Confirmei a regra com o responsável técnico e aprovo sua aplicação.";
        await expect(
          future.getByLabel(approval, { exact: true }),
        ).not.toBeChecked();
        await future
          .getByRole("button", {
            name: "Aprovar regra das próximas entregas",
            exact: true,
          })
          .click();
        await expect(future.getByRole("status")).toHaveText(
          "Confira os campos indicados.",
        );
        await future
          .getByLabel("Quando liberar os arquivos?", { exact: true })
          .selectOption("after_balance");
        await future.getByLabel(approval, { exact: true }).check();
        const staleKey = await future
          .locator('input[name="requestId"]')
          .inputValue();
        policyKeys.add(staleKey);
        expect(
          (
            await db
              .from("settings")
              .update({ revision: prior.revision + 1 })
              .eq("singleton", true)
          ).error,
        ).toBeNull();
        await future
          .getByRole("button", {
            name: "Aprovar regra das próximas entregas",
            exact: true,
          })
          .click();
        await expect(future.getByRole("status")).toHaveText(
          "As configurações ou a tentativa mudaram. Recarregue para conferir antes de aprovar.",
        );
        await expect(future.locator('input[name="requestId"]')).toHaveValue(
          staleKey,
        );
        await expect(
          future.getByLabel("Quando liberar os arquivos?", { exact: true }),
        ).toHaveValue("after_balance");
        await page.reload();
        future = page.getByRole("form", {
          name: "Regra das próximas entregas",
          exact: true,
        });
        await future
          .getByLabel("Quando liberar os arquivos?", { exact: true })
          .selectOption("after_balance");
        await future.getByLabel(approval, { exact: true }).check();
        policyKeys.add(
          await future.locator('input[name="requestId"]').inputValue(),
        );
        await expect(
          future.getByLabel("Quando liberar os arquivos?", { exact: true }),
        ).toHaveValue("after_balance");
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.evaluate(() =>
          (document.activeElement as HTMLElement | null)?.blur(),
        );
        await page.locator("#entregas").screenshot({
          path: info.outputPath("politica-futura-pendente.png"),
        });
        await future
          .getByRole("button", {
            name: "Aprovar regra das próximas entregas",
            exact: true,
          })
          .click();
        await expect(future.getByRole("status")).toHaveText(
          "Regra aprovada para as próximas entregas.",
        );
        await expect(future).toContainText(
          "Regra atual: Depois da confirmação do saldo",
        );
        await expect(
          future.getByLabel("Quando liberar os arquivos?", { exact: true }),
        ).toHaveValue("");
        await expect(
          future.getByLabel(approval, { exact: true }),
        ).not.toBeChecked();
        await expect(future.locator('input[name="revision"]')).toHaveValue(
          String(prior.revision + 2),
        );
        await client.reload();
        await expect(own).toContainText(
          "aguarda a definição da regra de pagamento",
        );
        await expect(own.locator('a[href^="/api/files/"]')).toHaveCount(0);
        expect(
          (
            await db
              .from("delivery_releases")
              .select("delivery_id")
              .eq("delivery_id", key)
          ).data,
        ).toEqual([]);
        await page.goto(`/painel/processos/${fixture.process.id}?aba=resumo`);
        const original = page.locator(`[data-delivery-id="${key}"]`);
        await original
          .getByText("Definir regra desta entrega", { exact: true })
          .click();
        const existing = original.getByRole("form", {
          name: "Regra desta entrega",
          exact: true,
        });
        await expect(
          existing.getByLabel("Quando liberar os arquivos?", { exact: true }),
        ).toHaveValue("");
        await existing
          .getByLabel("Quando liberar os arquivos?", { exact: true })
          .selectOption("before_balance");
        const releaseKey = await existing
          .locator('input[name="requestId"]')
          .inputValue();
        await existing
          .getByRole("button", {
            name: "Aprovar regra desta entrega",
            exact: true,
          })
          .click();
        await expect(existing.getByRole("status")).toHaveText(
          "Confira os campos indicados.",
        );
        await expect(existing.locator('input[name="requestId"]')).toHaveValue(
          releaseKey,
        );
        await existing.getByLabel(approval, { exact: true }).check();
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
        await page.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
          window.scrollTo(0, 0);
        });
        await expect(page.locator(".skip-link")).not.toBeFocused();
        await page.screenshot({
          path: info.outputPath("regra-entrega-pendente.png"),
          fullPage: true,
        });
        await existing
          .getByRole("button", {
            name: "Aprovar regra desta entrega",
            exact: true,
          })
          .click();
        await expect(existing).toHaveCount(0);
        await client.reload();
        await expect(own).toContainText("Arquivos liberados para download.");
        await expect(own.locator('a[href^="/api/files/"]')).toHaveCount(3);
        expect(
          (
            await client.request.get(`/api/files/${fileId}/download`, {
              maxRedirects: 0,
            })
          ).status(),
        ).toBe(307);
        expect(
          (
            await db
              .from("audit_log")
              .select("id")
              .eq("target_id", fileId)
              .eq("action", "file_download")
              .eq("actor_id", fixture.process.authorId)
          ).data,
        ).toHaveLength(1);
        await client.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
          window.scrollTo(0, 0);
        });
        await client.screenshot({
          path: info.outputPath("entrega-cliente-liberada-antes-saldo.png"),
          fullPage: true,
        });
      }
      if (policy === "after_balance") {
        await expect(own).toContainText("Saldo em conciliação");
        await expect(own).not.toContainText("Chave Pix: chave-pix-ficticia");
        await expect(
          own.getByRole("link", {
            name: "Abrir conversa do processo",
            exact: true,
          }),
        ).toBeVisible();
        const payment = (
          kind: string,
          amount_cents: number,
          status = "confirmed",
        ) => ({
          order_id: fixture.order.id,
          kind,
          amount_cents,
          status,
          method: "pix_manual",
        });
        expect(
          (
            await db
              .from("payments")
              .insert([
                payment("deposit", 61728),
                payment("triage", 123456),
                payment("balance", 61728, "pending"),
              ])
          ).error,
        ).toBeNull();
        expect(
          (
            await client.request.get(`/api/files/${fileId}/download`, {
              maxRedirects: 0,
            })
          ).status(),
        ).toBe(404);
        await client.reload();
        await expect(own).toContainText("Saldo em conciliação");
        expect(
          (
            await db
              .from("payments")
              .update({ status: "confirmed" })
              .eq("order_id", fixture.order.id)
              .eq("kind", "balance")
          ).error,
        ).toBeNull();
        await client.reload();
        await expect(own).toContainText("Arquivos liberados para download.");
        await expect(
          own.locator(".delivery-file-list").getByRole("link"),
        ).toHaveCount(3);
        const response = await client.request.get(
          `/api/files/${fileId}/download`,
          { maxRedirects: 0 },
        );
        expect(response.status()).toBe(307);
        expect(response.headers()["cache-control"]).toContain("no-store");
        const location = response.headers().location,
          url = new URL(location);
        expect(url.origin).toBe("http://127.0.0.1:54321");
        const token = url.searchParams.get("token")!,
          claims = JSON.parse(
            Buffer.from(token.split(".")[1], "base64url").toString(),
          ) as { exp: number };
        const remaining = claims.exp - Math.floor(Date.now() / 1000);
        expect(remaining).toBeGreaterThan(110);
        expect(remaining).toBeLessThanOrEqual(120);
        let bytes: Buffer;
        try {
          const download = await client.request.get(location);
          if (!download.ok()) throw new Error();
          bytes = await download.body();
        } catch {
          throw new Error("Download fictício da entrega não concluído.");
        }
        expect(bytes.equals(pdf)).toBe(true);
        expect(
          (
            await db
              .from("audit_log")
              .select("id")
              .eq("target_id", fileId)
              .eq("action", "file_download")
              .eq("actor_id", fixture.process.authorId)
          ).data,
        ).toHaveLength(1);
        await client.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
          window.scrollTo(0, 0);
        });
        await client.screenshot({
          path: info.outputPath("entrega-cliente-liberada.png"),
          fullPage: true,
        });
        expect(
          (
            await db
              .from("payments")
              .update({ status: "refunded" })
              .eq("order_id", fixture.order.id)
              .eq("kind", "balance")
          ).error,
        ).toBeNull();
        expect(
          (await client.request.get(`/api/files/${fileId}/content`)).status(),
        ).toBe(404);
      }
      const outside = await browser.newContext({
        baseURL: "http://127.0.0.1:3000",
      });
      try {
        const other = await outside.newPage();
        await loginAs(other, "clientB");
        expect(
          (
            await other.request.get(`/api/files/${fileId}/download`, {
              maxRedirects: 0,
            })
          ).status(),
        ).toBe(404);
        expect(
          (
            await other.goto(`/app/processos/${fixture.process.id}?aba=resumo`)
          )?.status(),
        ).toBe(404);
      } finally {
        await outside.close();
      }
    } finally {
      await context.close();
      try {
        await fixture.cleanup();
        if (policyKeys.size) {
          expect(
            (
              await db
                .from("audit_log")
                .delete()
                .in("target_id", [...policyKeys])
            ).error,
          ).toBeNull();
          expect(
            (
              await db
                .from("delivery_policy_approvals")
                .delete()
                .in("id", [...policyKeys])
            ).error,
          ).toBeNull();
        }
        await db.from("settings").update(prior).eq("singleton", true);
      } finally {
        await releaseQueue();
        await releaseSettings();
      }
    }
  });
}
