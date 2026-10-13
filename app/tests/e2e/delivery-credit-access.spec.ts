import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { acceptanceFixture } from "./acceptance-helper";
import { quoteSession } from "./quote-helper";
import { loginAs } from "./auth-helper";
import { pdfFixture } from "./pdf-helper";
test.setTimeout(120000);
for (const policy of ["before_balance", "after_balance"] as const) {
  test(
    "contratação explícita libera bytes pela política " +
      policy +
      " e recusa acesso após estorno",
    async ({ page, browser }, info) => {
      const f = await acceptanceFixture();
      const paths: string[] = [],
        fileIds: string[] = [];
      let calculator: Awaited<ReturnType<typeof quoteSession>> | undefined;
      let stranger: Awaited<ReturnType<typeof browser.newContext>> | undefined;
      let processId: string | undefined;
      const deliveryId = randomUUID();
      try {
        const sample = await f.create();
        processId = sample.process_id;
        const accepted = await f.db.rpc("accept_quote_system", sample.args());
        expect(accepted.error).toBeNull();
        const order = (
          await f.db
            .from("orders")
            .select("id,code,total_cents,deposit_cents")
            .eq("id", sample.order_id)
            .single()
        ).data!;
        // Valores e revisão técnica sintéticos explícitos; não altera fixture legada.
        expect(
          (
            await f.db.from("payments").insert({
              order_id: order.id,
              kind: "deposit",
              method: "pix_manual",
              amount_cents: order.deposit_cents,
              status: "confirmed",
            })
          ).error,
        ).toBeNull();
        expect(
          (
            await f.db
              .from("orders")
              .update({ status: "in_review" })
              .eq("id", order.id)
          ).error,
        ).toBeNull();
        expect(
          (
            await f.db
              .from("settings")
              .update({
                delivery_release_policy: policy,
                pix_key: "pix-ficticio-entrega",
              })
              .eq("singleton", true)
          ).error,
        ).toBeNull();
        const pdf = await readFile(pdfFixture);
        const data = [
          {
            name: "Calculo aceito fictício.pdf",
            mime: "application/pdf",
            bytes: pdf,
          },
          {
            name: "Projeto aceito fictício.pjc",
            mime: "application/octet-stream",
            bytes: Buffer.from("PJC fictício sem dados reais."),
          },
          {
            name: "Parecer aceito fictício.pdf",
            mime: "application/pdf",
            bytes: pdf,
          },
        ];
        for (const item of data) {
          const id = randomUUID(),
            path =
              f.calculator.id +
              "/" +
              sample.process_id +
              "/" +
              id +
              "/ficticio";
          paths.push(path);
          fileIds.push(id);
          expect(
            (
              await f.db.storage
                .from("processos")
                .upload(path, item.bytes, { contentType: item.mime })
            ).error,
          ).toBeNull();
          const hash = createHash("sha256").update(item.bytes).digest("hex");
          expect(
            (
              await f.db.from("files").insert({
                id,
                process_id: sample.process_id,
                order_id: order.id,
                folder: "deliverables",
                uploaded_by: f.calculator.id,
                name: item.name,
                mime: item.mime,
                path,
                size_bytes: item.bytes.length,
                sha256: hash,
                expected_sha256: hash,
                upload_status: "uploaded",
              })
            ).error,
          ).toBeNull();
        }
        calculator = await quoteSession("calculator");
        expect(
          (
            await calculator.rpc("confirm_order_delivery", {
              target_process: sample.process_id,
              target_order: order.id,
              request_id: deliveryId,
              payload: {
                calculationFile: fileIds[0],
                pjcFile: fileIds[1],
                reportFile: fileIds[2],
                attachments: [],
                pjeVersion: "2.13.1",
                indexMonth: "2026-10",
                liquidated: true,
                taxIdPresent: true,
                reviewed: true,
              },
            })
          ).error,
        ).toBeNull();
        await loginAs(page);
        await page.goto("/app/processos/" + sample.process_id + "?aba=resumo");
        const record = page.locator('[data-delivery-id="' + deliveryId + '"]');
        if (policy === "after_balance") {
          await expect(record).toContainText("aguarda a confirmação do saldo");
          await expect(record.locator('a[href^="/api/files/"]')).toHaveCount(0);
          expect(
            (
              await page.request.get("/api/files/" + fileIds[0] + "/download", {
                maxRedirects: 0,
              })
            ).status(),
          ).toBe(404);
          const balance = order.total_cents - order.deposit_cents;
          expect(
            (
              await f.db.from("payments").insert({
                order_id: order.id,
                kind: "balance",
                method: "pix_manual",
                amount_cents: balance,
                status: "confirmed",
              })
            ).error,
          ).toBeNull();
          await page.reload();
        }
        await expect(record).toContainText("Arquivos liberados para download.");
        await expect(record.locator('a[href^="/api/files/"]')).toHaveCount(3);
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
          path: info.outputPath("entrega-aceita-" + policy + ".png"),
          fullPage: true,
        });
        const download = await page.request.get(
          "/api/files/" + fileIds[0] + "/download",
          { maxRedirects: 0 },
        );
        expect(download.status()).toBe(307);
        expect(download.headers()["cache-control"]).toBe("private, no-store");
        const location = download.headers().location,
          url = new URL(location);
        expect(url.origin).toBe("http://127.0.0.1:54321");
        const claims = JSON.parse(
          Buffer.from(
            url.searchParams.get("token")!.split(".")[1],
            "base64url",
          ).toString(),
        ) as { exp: number };
        const remaining = claims.exp - Math.floor(Date.now() / 1000);
        expect(remaining).toBeGreaterThan(110);
        expect(remaining).toBeLessThanOrEqual(120);
        expect(
          (await (await page.request.get(location)).body()).equals(pdf),
        ).toBe(true);
        const content = "/api/files/" + fileIds[0] + "/content";
        const head = await page.request.head(content);
        expect(head.status()).toBe(200);
        expect(Number(head.headers()["content-length"])).toBe(pdf.length);
        const range = await page.request.get(content, {
          headers: { Range: "bytes=0-63" },
        });
        expect(range.status()).toBe(206);
        expect((await range.body()).equals(pdf.subarray(0, 64))).toBe(true);
        const full = await page.request.get(content);
        expect(full.status()).toBe(200);
        expect((await full.body()).equals(pdf)).toBe(true);
        const audit = await f.db
          .from("audit_log")
          .select("action")
          .eq("target_id", fileIds[0])
          .eq("actor_id", f.owner.owner_id);
        expect(
          audit.data?.filter((a) => a.action === "file_download"),
        ).toHaveLength(1);
        expect(
          audit.data?.filter((a) => a.action === "file_view"),
        ).toHaveLength(3);
        stranger = await browser.newContext({
          baseURL: "http://127.0.0.1:3000",
        });
        const other = await stranger.newPage();
        await loginAs(other, "clientB");
        for (const action of ["download", "content"]) {
          const denied = await other.request.get(
            "/api/files/" + fileIds[0] + "/" + action,
            { maxRedirects: 0 },
          );
          expect(denied.status()).toBe(404);
          expect(denied.headers()["cache-control"]).toBe("private, no-store");
        }
        await loginAs(other, "admin");
        for (const action of ["download", "content"])
          expect(
            (
              await other.request.get(
                "/api/files/" + fileIds[0] + "/" + action,
                { maxRedirects: 0 },
              )
            ).status(),
          ).toBe(404);
        const anonymous = await browser.newContext({
          baseURL: "http://127.0.0.1:3000",
        });
        try {
          for (const action of ["download", "content"])
            expect(
              (
                await anonymous.request.get(
                  "/api/files/" + fileIds[0] + "/" + action,
                  { maxRedirects: 0 },
                )
              ).status(),
            ).toBe(404);
          expect((await anonymous.request.head(content)).status()).toBe(404);
        } finally {
          await anonymous.close();
        }
        const before = audit.data?.length;
        expect(
          (
            await f.db
              .from("payments")
              .update({ status: "refunded" })
              .eq("order_id", order.id)
              .in(
                "kind",
                policy === "before_balance" ? ["deposit"] : ["balance"],
              )
          ).error,
        ).toBeNull();
        await page.reload();
        await expect(record.locator('a[href^="/api/files/"]')).toHaveCount(0);
        for (const action of ["download", "content"]) {
          const denied = await page.request.get(
            "/api/files/" + fileIds[0] + "/" + action,
            { maxRedirects: 0 },
          );
          expect(denied.status()).toBe(404);
          expect(denied.headers()["cache-control"]).toBe("private, no-store");
        }
        expect((await page.request.head(content)).status()).toBe(404);
        expect(
          (
            await page.request.get(content, {
              headers: { Range: "bytes=0-63" },
            })
          ).status(),
        ).toBe(404);
        expect(
          (
            await f.db
              .from("audit_log")
              .select("id")
              .eq("target_id", fileIds[0])
              .eq("actor_id", f.owner.owner_id)
          ).data?.length,
        ).toBe(before);
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
        await page.screenshot({
          path: info.outputPath("entrega-estorno-" + policy + ".png"),
          fullPage: true,
        });
      } finally {
        try {
          await stranger?.close();
          await calculator?.auth.signOut({ scope: "local" });
          // A entrega referencia os arquivos: retirar primeiro o registro do ensaio.
          if (processId)
            expect(
              (
                await f.db
                  .from("deliveries")
                  .delete()
                  .eq("id", deliveryId)
                  .eq("process_id", processId)
              ).error,
            ).toBeNull();
          if (paths.length)
            expect(
              (await f.db.storage.from("processos").remove(paths)).error,
            ).toBeNull();
          expect(
            (
              await f.db
                .from("audit_log")
                .delete()
                .in("target_id", [...fileIds, deliveryId])
            ).error,
          ).toBeNull();
        } finally {
          await f.cleanup();
          if (processId) {
            for (const table of ["files", "deliveries", "orders"] as const) {
              const remaining = await f.db
                .from(table)
                .select("id")
                .eq("process_id", processId);
              expect(remaining.error).toBeNull();
              expect(remaining.data).toEqual([]);
            }
            const remaining = await f.db
              .from("processes")
              .select("id")
              .eq("id", processId);
            expect(remaining.error).toBeNull();
            expect(remaining.data).toEqual([]);
          }
        }
      }
    },
  );
}
