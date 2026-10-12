import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { financialJourneyDriver } from "./financial-journey-driver";
import { localSystem } from "./local-helper";
import { localNotificationSql as sql } from "./notification-helper";
import { quoteSession } from "./quote-helper";
import { loginAs } from "./auth-helper";
import { pdfFixture } from "./pdf-helper";
import {
  parseDeliveryAccessContexts,
  deriveDeliveryCreditAccess,
  deliveryCreditAccessLabels,
  type DeliveryCreditAccess,
} from "@/modules/delivery/credit-access";
import type { FinancialScenario } from "./financial-journey-helper";

test.setTimeout(240000);
async function capture(page: Page, info: TestInfo, name: string) {
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
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath(name + ".png"),
    fullPage: true,
  });
}

for (const policy of ["before_balance", "after_balance"] as const) {
  for (const journey of [
    "partial",
    "excess",
    "refund",
    "chargeback",
  ] as const) {
    test(`${policy}/${journey}: crédito atual governa tela e bytes sem alterar entrega ou cobrar em duplicidade`, async ({
      page,
      browser,
    }, info) => {
      const driver = await financialJourneyDriver(),
        m = driver.metadata,
        db = localSystem();
      const paths: string[] = [],
        fileIds: string[] = [],
        contractKeys: string[] = [];
      const deliveryId = randomUUID();
      let actor: Awaited<ReturnType<typeof quoteSession>> | undefined;
      let calculatorContext:
        Awaited<ReturnType<typeof browser.newContext>> | undefined;
      let strangerContext:
        Awaited<ReturnType<typeof browser.newContext>> | undefined;
      try {
        const initial =
          journey === "partial" || journey === "excess" ? journey : "received";
        await driver.command("observe", initial);
        await driver.command("origin");
        await driver.command("apply");
        await driver.command("bind");
        await driver.command("resolve");
        const orderResult = await db
          .from("orders")
          .select("total_cents,deposit_cents")
          .eq("id", m.orderId)
          .single();
        expect(orderResult.error).toBeNull();
        const order = orderResult.data!;
        if (policy === "after_balance") {
          // Parcela manual sintética: não substitui o comando comercial de M3.09.
          expect(
            (
              await db.from("payments").insert({
                order_id: m.orderId,
                kind: "balance",
                method: "pix_manual",
                amount_cents: order.total_cents - order.deposit_cents,
                status: "confirmed",
              })
            ).error,
          ).toBeNull();
        }
        // Revisão técnica é uma pré-condição sintética explícita deste ensaio.
        expect(
          (
            await db
              .from("orders")
              .update({ status: "in_review" })
              .eq("id", m.orderId)
          ).error,
        ).toBeNull();
        expect(
          (
            await db
              .from("settings")
              .update({
                delivery_release_policy: policy,
                pix_key: "pix-ficticio-jornada-entrega",
              })
              .eq("singleton", true)
          ).error,
        ).toBeNull();
        const pdf = await readFile(pdfFixture);
        const assets = [
          {
            name: "Calculo fictício da jornada.pdf",
            mime: "application/pdf",
            bytes: pdf,
          },
          {
            name: "Projeto fictício da jornada.pjc",
            mime: "application/octet-stream",
            bytes: Buffer.from(
              "PJC fictício: transporte de teste, sem cálculo real.",
            ),
          },
          {
            name: "Parecer fictício da jornada.pdf",
            mime: "application/pdf",
            bytes: pdf,
          },
        ];
        for (const asset of assets) {
          const id = randomUUID(),
            path = `${m.calculatorId}/${m.processId}/${id}/ficticio`;
          paths.push(path);
          fileIds.push(id);
          expect(
            (
              await db.storage
                .from("processos")
                .upload(path, asset.bytes, { contentType: asset.mime })
            ).error,
          ).toBeNull();
          const hash = createHash("sha256").update(asset.bytes).digest("hex");
          expect(
            (
              await db.from("files").insert({
                id,
                process_id: m.processId,
                order_id: m.orderId,
                folder: "deliverables",
                uploaded_by: m.calculatorId,
                path,
                name: asset.name,
                mime: asset.mime,
                size_bytes: asset.bytes.length,
                sha256: hash,
                expected_sha256: hash,
                upload_status: "uploaded",
              })
            ).error,
          ).toBeNull();
        }
        actor = await quoteSession("calculator");
        expect(
          (
            await actor.rpc("confirm_order_delivery", {
              target_process: m.processId,
              target_order: m.orderId,
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
        calculatorContext = await browser.newContext({
          baseURL: "http://127.0.0.1:3000",
          viewport: info.project.use.viewport,
          isMobile: info.project.use.isMobile,
          hasTouch: info.project.use.hasTouch,
          locale: "pt-BR",
          timezoneId: "America/Sao_Paulo",
        });
        const calculator = await calculatorContext.newPage();
        await loginAs(page);
        await loginAs(calculator, "calculator");
        const summary = `/app/processos/${m.processId}?aba=resumo`;
        const record = page.locator(`[data-delivery-id="${deliveryId}"]`);
        const panelRecord = calculator.locator(
          `[data-delivery-id="${deliveryId}"]`,
        );
        const snapshots = async () => {
          const delivery = await db
            .from("deliveries")
            .select(
              "id,order_id,process_id,professional,pje_version,index_month,checklist,payload",
            )
            .eq("id", deliveryId)
            .single();
          const files = await db
            .from("delivery_files")
            .select("file_id,kind,snapshot")
            .eq("delivery_id", deliveryId)
            .order("file_id");
          expect(delivery.error).toBeNull();
          expect(files.error).toBeNull();
          return { delivery: delivery.data!, files: files.data! };
        };
        const original = await snapshots();
        const first = await driver.command("view");
        expect(
          first.events.filter(
            (e: { effect: string }) => e.effect === "received",
          ),
        ).toHaveLength(1);
        const protection = (v: typeof first) => ({
          run: v.run,
          claims: v.claims,
          reservations: v.reservations,
          posts: v.posts,
        });
        let protectedBefore = protection(first);
        const audit = async () => {
          const result = await db
            .from("audit_log")
            .select("id,actor_id,action")
            .eq("target_id", fileIds[0])
            .order("id");
          expect(result.error).toBeNull();
          return result.data!;
        };
        const privateResponse = (headers: Record<string, string>) => {
          expect(headers["cache-control"]).toBe("private, no-store");
          expect(headers["referrer-policy"]).toBe("no-referrer");
        };
        async function verify(
          expected: DeliveryCreditAccess,
          credit: number | null,
          name: string,
          screenshot = true,
        ) {
          const current = await driver.command("view");
          expect(current.projection.depositCreditCents).toBe(credit);
          expect(current.status).toBe("delivered");
          expect(protection(current)).toEqual(protectedBefore);
          const contextResult = await actor!.rpc(
            "get_current_delivery_access_contexts",
            {
              target_process: m.processId,
              target_deliveries: [deliveryId],
            },
          );
          expect(contextResult.error).toBeNull();
          const context = parseDeliveryAccessContexts(
            contextResult.data,
            m.processId,
            [original.delivery],
          ).get(deliveryId)!;
          expect(context.credit.projection.depositCreditCents).toBe(credit);
          expect(deriveDeliveryCreditAccess(context)).toBe(expected);
          await page.goto(summary);
          await calculator.goto(`/painel/processos/${m.processId}?aba=resumo`);
          await expect(record).toContainText(
            deliveryCreditAccessLabels[expected],
          );
          await expect(panelRecord).toContainText(
            deliveryCreditAccessLabels[expected],
          );
          await expect(record.locator('a[href^="/api/files/"]')).toHaveCount(
            expected === "ready" ? 3 : 0,
          );
          await expect(
            panelRecord.locator('a[href^="/api/files/"]'),
          ).toHaveCount(3);
          expect(await snapshots()).toEqual(original);
          if (expected === "financial_pending")
            await expect(record).not.toContainText(
              "pix-ficticio-jornada-entrega",
            );
          const before = await audit(),
            content = `/api/files/${fileIds[0]}/content`;
          if (expected !== "ready") {
            for (const request of [
              () =>
                page.request.get(`/api/files/${fileIds[0]}/download`, {
                  maxRedirects: 0,
                }),
              () => page.request.get(content),
              () => page.request.head(content),
              () =>
                page.request.get(content, { headers: { Range: "bytes=0-63" } }),
            ]) {
              const denied = await request();
              expect(denied.status()).toBe(404);
              privateResponse(denied.headers());
            }
            expect(await audit()).toEqual(before);
          } else {
            const head = await page.request.head(content);
            expect(head.status()).toBe(200);
            privateResponse(head.headers());
            expect(Number(head.headers()["content-length"])).toBe(pdf.length);
            const range = await page.request.get(content, {
              headers: { Range: "bytes=0-63" },
            });
            expect(range.status()).toBe(206);
            expect((await range.body()).equals(pdf.subarray(0, 64))).toBe(true);
            const full = await page.request.get(content);
            expect(full.status()).toBe(200);
            expect((await full.body()).equals(pdf)).toBe(true);
            const download = await page.request.get(
              `/api/files/${fileIds[0]}/download`,
              { maxRedirects: 0 },
            );
            expect(download.status()).toBe(307);
            privateResponse(download.headers());
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
            const after = await audit();
            for (const [action, increment] of [
              ["file_view", 3],
              ["file_download", 1],
            ] as const)
              expect(after.filter((a) => a.action === action)).toHaveLength(
                before.filter((a) => a.action === action).length + increment,
              );
          }
          if (screenshot) {
            await capture(page, info, `${policy}-${journey}-${name}-cliente`);
            await capture(
              calculator,
              info,
              `${policy}-${journey}-${name}-calculista`,
            );
          }
        }
        const insufficient =
          policy === "before_balance" ? "deposit_pending" : "balance_pending";
        await verify(
          journey === "partial" ? insufficient : "ready",
          journey === "partial" ? 10000 : journey === "excess" ? 13000 : 12501,
          "01-inicial",
        );
        async function move(scenario: FinancialScenario) {
          await driver.command("observe", scenario);
          return await driver.command("apply");
        }
        if (journey === "partial") {
          async function contract(enabled: boolean, expectedCode?: string) {
            const customer = await db
              .from("clients")
              .select("contract_revision,has_contract")
              .eq("id", m.clientId)
              .single();
            expect(customer.error).toBeNull();
            const id = randomUUID();
            contractKeys.push(id);
            const result = await actor!.rpc("set_client_contract", {
              target_client: m.clientId,
              has_contract: enabled,
              expected_revision: customer.data!.contract_revision,
              request_id: id,
              reason:
                "Contrato fictício para verificar a política na jornada financeira.",
            });
            if (expectedCode) {
              expect(result.error?.code).toBe(expectedCode);
              const unchanged = await db
                .from("clients")
                .select("contract_revision,has_contract")
                .eq("id", m.clientId)
                .single();
              expect(unchanged.error).toBeNull();
              expect(unchanged.data).toEqual(customer.data);
              expect(protection(await driver.command("view"))).toEqual(
                protectedBefore,
              );
            } else expect(result.error).toBeNull();
          }
          await contract(true, "PT423");
          expect((await move("received")).effects).toEqual(["received"]);
          await verify("ready", 12501, "02-recebido");
          // Resolver o recebimento comprovado consome só a proteção dessa cobrança.
          const terminal = await driver.command("resolve");
          expect(terminal?.reason).toBe("financial_received");
          const resolved = await driver.command("view");
          expect(resolved.run.id).toBe(first.run.id);
          expect(resolved.run.state).toBe("resolved");
          expect(resolved.run.revision).toBe(first.run.revision + 1);
          expect(resolved.claims).toBe(first.claims);
          expect(resolved.posts).toBe(first.posts);
          expect(resolved.reservations).toBe(0);
          protectedBefore = protection(resolved);
          await move("unknown");
          await verify("financial_pending", null, "03-conciliacao");
          await contract(true);
          await verify(
            policy === "before_balance" ? "ready" : "financial_pending",
            null,
            "04-contrato",
          );
          await contract(false, "PT409");
          await verify(
            policy === "before_balance" ? "ready" : "financial_pending",
            null,
            "05-retirada-recusada",
            false,
          );
          await move("current");
          await verify("ready", 12501, "06-conciliado");
        } else if (journey === "excess") {
          await expect(page.locator(".deposit-card")).not.toContainText(
            "Transfira",
          );
          await expect(record).not.toContainText(
            "pix-ficticio-jornada-entrega",
          );
        } else if (journey === "refund") {
          await move("refund_partial");
          await verify(insufficient, 11500, "02-estorno-parcial");
          await move("refund_full");
          await verify(insufficient, 0, "03-estorno-integral");
        } else {
          await move("chargeback_dispute");
          await verify("financial_pending", null, "02-disputa");
          await move("chargeback_debit");
          await verify(insufficient, 10500, "03-debito");
          await move("chargeback_restore");
          await verify(insufficient, 11501, "04-reversao-parcial");
          await move("chargeback_restore_full");
          await verify("ready", 12501, "05-reversao-integral");
        }
        const stable = await driver.command("view");
        await driver.command("replay");
        expect(await driver.command("view")).toEqual(stable);
        expect(
          stable.events.filter(
            (e: { effect: string }) => e.effect === "received",
          ),
        ).toHaveLength(journey === "partial" ? 2 : 1);
        strangerContext = await browser.newContext({
          baseURL: "http://127.0.0.1:3000",
        });
        const stranger = await strangerContext.newPage();
        await loginAs(stranger, "clientB");
        const before = await audit();
        expect((await stranger.goto(summary))?.status()).toBe(404);
        for (const action of ["download", "content"])
          expect(
            (
              await stranger.request.get(`/api/files/${fileIds[0]}/${action}`, {
                maxRedirects: 0,
              })
            ).status(),
          ).toBe(404);
        expect(await audit()).toEqual(before);
      } finally {
        try {
          await strangerContext?.close();
          await calculatorContext?.close();
          await actor?.auth.signOut({ scope: "local" });
          if (paths.length)
            expect(
              (await db.storage.from("processos").remove(paths)).error,
            ).toBeNull();
          expect(
            (
              await db
                .from("audit_log")
                .delete()
                .in("target_id", [...fileIds, deliveryId])
            ).error,
          ).toBeNull();
          for (const key of contractKeys)
            sql(
              `delete from public.audit_log where action='client_contract_changed' and target_id='${key}';delete from private.client_contract_changes where id='${key}' and client_id='${m.clientId}';`,
            );
        } finally {
          await driver.close();
          for (const table of ["files", "deliveries", "orders"] as const) {
            const remaining = await db
              .from(table)
              .select("id")
              .eq("process_id", m.processId);
            expect(remaining.error).toBeNull();
            expect(remaining.data).toEqual([]);
          }
          const remaining = await db
            .from("processes")
            .select("id")
            .eq("id", m.processId);
          expect(remaining.error).toBeNull();
          expect(remaining.data).toEqual([]);
        }
      }
    });
  }
}
