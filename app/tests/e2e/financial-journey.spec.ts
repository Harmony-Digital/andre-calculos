import {
  test,
  expect,
  type Page,
  type TestInfo,
  type BrowserContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { quoteSession } from "./quote-helper";
import { localNotificationSql as sql } from "./notification-helper";
import { financialJourneyDriver } from "./financial-journey-driver";
import { localSystem } from "./local-helper";
import { loginAs } from "./auth-helper";
import { pdfFixture } from "./pdf-helper";

test.setTimeout(240000);
async function closeContext(context: BrowserContext | undefined) {
  if (!context) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      context.close(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Navegador fictício não encerrou no prazo.")),
          8000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function accessible(page: Page, info: TestInfo, name: string) {
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
  const path = info.outputPath(`${name}.png`);
  if (name === "02a-preferencia-calculista")
    await page
      .locator("#avisos .notification-events > li")
      .filter({
        has: page.getByRole("form", {
          name: "E-mail para Situação financeira atualizada",
          exact: true,
        }),
      })
      .screenshot({ path });
  else await page.screenshot({ path, fullPage: true });
}

test("jornada financeira produz histórico real, fila, preferências e download auditado", async ({
  page,
  browser,
}, info) => {
  const driver = await financialJourneyDriver();
  let calculatorContext: BrowserContext | undefined,
    strangerContext: BrowserContext | undefined,
    failure: unknown;
  let contractKey: string | undefined;
  try {
    const m = driver.metadata,
      db = localSystem(),
      pdf = await readFile(pdfFixture);
    calculatorContext = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
      viewport: info.project.use.viewport,
      isMobile: info.project.use.isMobile,
      hasTouch: info.project.use.hasTouch,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    });
    const calculator = await calculatorContext.newPage();
    page.setDefaultTimeout(10000);
    calculator.setDefaultTimeout(10000);
    // Aceite/contexto comercial são pré-condições sintéticas dos helpers existentes.
    // T/Y/origem/vínculo/AC abaixo usam produtores reais da fixture local.
    await driver.command("observe", "received");
    await driver.command("origin");
    await driver.command("apply");
    await driver.command("bind");
    const terminal = await driver.command("resolve");
    expect(terminal?.reason).toBe("financial_received");
    expect((await driver.command("view")).status).toBe("awaiting_documents");
    await loginAs(page);
    await loginAs(calculator, "calculator");
    await page.goto(`/app/processos/${m.processId}?aba=historico`);
    await expect(page.locator(".process-timeline")).toContainText(
      "Pagamento confirmado",
    );
    await accessible(page, info, "01-recebimento-cliente");

    await page.goto(`/app/processos/${m.processId}?aba=documentos`);
    await page.getByLabel("Pasta de destino").selectOption("case");
    await page.getByLabel("Escolher arquivo do processo").setInputFiles({
      name: "Processo fictício da jornada financeira.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await expect
      .poll(async () => (await driver.command("view")).status, {
        timeout: 60000,
      })
      .toBe("queued");
    const original = (
      await db
        .from("files")
        .select("id,sha256,uploaded_by,upload_status")
        .eq("process_id", m.processId)
        .eq("folder", "case")
        .single()
    ).data!;
    expect(original.sha256).toBe(
      createHash("sha256").update(pdf).digest("hex"),
    );
    expect(original.upload_status).toBe("uploaded");
    await accessible(page, info, "02-documento-cliente");
    expect(
      (
        await db
          .from("notifications")
          .select("id")
          .eq("dedup_key", `queued:${m.orderId}:email`)
      ).data,
    ).toHaveLength(1);
    await calculator.goto("/painel/fila");
    await expect(
      calculator.locator(
        `${info.project.use.viewport!.width < 900 ? ".queue-mobile > li" : ".queue-table tbody > tr"}[data-order-id="${m.orderId}"]`,
      ),
    ).toBeVisible();

    await calculator.goto("/painel/configuracoes#avisos");
    const preference = calculator.getByRole("form", {
      name: "E-mail para Situação financeira atualizada",
      exact: true,
    });
    await preference.getByRole("combobox").selectOption("no");
    await preference
      .getByRole("button", { name: "Salvar", exact: true })
      .click();
    await expect(preference.getByRole("status")).toHaveText(
      "Preferência salva.",
    );
    const before = await driver.command("view"),
      calcEmails = before.notifications.filter(
        (n: { channel: string; dedup: string }) =>
          n.channel === "email" &&
          n.dedup.startsWith("financial:") &&
          n.dedup.includes(":calculator:"),
      );
    expect(calcEmails).toHaveLength(1);
    await accessible(calculator, info, "02a-preferencia-calculista");
    const move = async (
      scenario:
        | "chargeback_dispute"
        | "chargeback_debit"
        | "chargeback_restore"
        | "unknown"
        | "current",
      credit: number | null,
    ) => {
      await driver.command("observe", scenario);
      await driver.command("apply");
      const v = await driver.command("view");
      expect(v.projection.depositCreditCents).toBe(credit);
      expect(v.status).toBe("queued");
      return v;
    };
    await move("chargeback_dispute", null);
    await move("chargeback_debit", 10500);
    await move("chargeback_restore", 11501);
    await move("unknown", null);
    const after = await move("current", 11501);
    expect(
      after.notifications.filter(
        (n: { channel: string; dedup: string }) =>
          n.channel === "email" &&
          n.dedup.startsWith("financial:") &&
          n.dedup.includes(":calculator:"),
      ),
    ).toEqual(calcEmails);
    expect(
      after.notifications.filter((n: { dedup: string }) =>
        n.dedup.includes(":client:email"),
      ).length,
    ).toBeGreaterThan(
      before.notifications.filter((n: { dedup: string }) =>
        n.dedup.includes(":client:email"),
      ).length,
    );
    const stable = await driver.command("view");
    await driver.command("replay");
    expect(await driver.command("view")).toEqual(stable);
    for (const [viewer, name, prefix] of [
      [page, "cliente", "app"],
      [calculator, "calculista", "painel"],
    ] as const) {
      await viewer.goto(`/${prefix}/processos/${m.processId}?aba=historico`);
      const timeline = viewer.locator(".process-timeline");
      for (const label of [
        "Pagamento confirmado",
        "Estorno registrado",
        "Crédito restabelecido",
        "Pagamento em conciliação",
        "Conciliação concluída",
      ])
        await expect(timeline).toContainText(label);
      await expect(timeline).toContainText("Sistema");
      await accessible(viewer, info, `03-financeiro-${name}`);
      await viewer
        .getByLabel("Filtrar atividade")
        .selectOption("payment_updated");
      await viewer
        .getByRole("button", { name: "Filtrar", exact: true })
        .click();
      await expect(timeline).not.toContainText("Pagamento confirmado");
      await expect(timeline.locator(":scope > li")).toHaveCount(
        after.events.filter(
          (e: { kind: string }) => e.kind === "payment_updated",
        ).length,
      );
    }
    async function operate(event: string, target: string) {
      await calculator.goto(`/painel/processos/${m.processId}?aba=resumo`);
      const form = calculator.getByRole("form", { name: /Etapas do pedido/ });
      await form.getByLabel("Próxima etapa").selectOption(event);
      await form
        .getByRole("button", { name: "Registrar etapa", exact: true })
        .click();
      await expect(form.getByRole("status")).toContainText("Etapa registrada");
      await expect
        .poll(async () => (await driver.command("view")).status)
        .toBe(target);
    }
    await operate("start_analysis", "in_analysis");
    await operate("start_calculation", "in_calculation");
    await operate("submit_review", "in_review");
    const names = [
      "Cálculo fictício financeiro.pdf",
      "Projeto fictício financeiro.pjc",
      "Parecer fictício financeiro.pdf",
    ];
    await calculator.goto(`/painel/processos/${m.processId}?aba=documentos`);
    await calculator
      .getByLabel("Pasta de destino")
      .selectOption("deliverables");
    for (const [i, name] of names.entries()) {
      await expect(
        calculator.getByLabel("Escolher arquivo do processo"),
      ).toBeEnabled({ timeout: 60000 });
      await calculator
        .getByLabel("Escolher arquivo do processo")
        .setInputFiles({
          name,
          mimeType: i === 1 ? "application/octet-stream" : "application/pdf",
          buffer:
            i === 1
              ? Buffer.from(
                  "PJC inventado para ensaio local, sem cálculo real.",
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
                .eq("process_id", m.processId)
                .eq("name", name)
                .eq("upload_status", "uploaded")
            ).data?.length,
          { timeout: 60000 },
        )
        .toBe(1);
      await expect(
        calculator.locator(".upload-box").getByRole("status"),
      ).toHaveText("Arquivo enviado e integridade confirmada.", {
        timeout: 60000,
      });
      await expect(
        calculator.getByRole("region", { name: "Pasta Entregas", exact: true }),
      ).toContainText(name);
      await expect(
        calculator.getByLabel("Escolher arquivo do processo"),
      ).toBeEnabled({ timeout: 60000 });
    }
    const files = (
        await db
          .from("files")
          .select("id,name")
          .eq("process_id", m.processId)
          .eq("folder", "deliverables")
      ).data!,
      fileId = files.find((f) => f.name === names[0])!.id;
    expect(
      (
        await page.request.get(`/api/files/${fileId}/download`, {
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(404);
    await calculator.goto(`/painel/processos/${m.processId}?aba=resumo`);
    await calculator
      .getByText(`Confirmar entrega do pedido ${m.code}`, { exact: true })
      .click();
    const delivery = calculator.getByRole("form", {
        name: `Confirmar entrega ${m.code}`,
        exact: true,
      }),
      deliveryId = await delivery
        .locator('input[name="requestId"]')
        .inputValue();
    for (const [i, label] of [
      "PDF do cálculo",
      "Arquivo PJC",
      "Parecer assinado em PDF",
    ].entries())
      await delivery
        .getByLabel(label, { exact: true })
        .selectOption(files.find((f) => f.name === names[i])!.id);
    await delivery.getByLabel("Versão do PJe-Calc").fill("2.13.1");
    await delivery.getByLabel("Mês da tabela de índices").fill("10/2026");
    for (const label of [
      "Confirmei que o cálculo está liquidado.",
      "Confirmei que o CPF ou CNPJ está cadastrado no PJC.",
      "Revisei o cálculo e conferi a assinatura do parecer, o nome e o CRC nos arquivos.",
    ])
      await delivery.getByLabel(label, { exact: true }).check();
    await delivery
      .getByRole("button", { name: "Confirmar entrega", exact: true })
      .click();
    const released = calculator.locator(`[data-delivery-id="${deliveryId}"]`);
    await expect(released).toBeVisible();
    await page.goto(`/app/processos/${m.processId}?aba=resumo`);
    const clientDelivery = page.locator(`[data-delivery-id="${deliveryId}"]`);
    await expect(clientDelivery).toContainText(
      "aguarda a definição da regra de pagamento",
    );
    await expect(clientDelivery.locator('a[href^="/api/files/"]')).toHaveCount(
      0,
    );
    expect(
      (
        await page.request.get(`/api/files/${fileId}/download`, {
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(404);
    // Aprovação fictícia apenas desta entrega: D6/after_balance continuam pendentes em V.
    await released
      .getByText("Definir regra desta entrega", { exact: true })
      .click();
    const rule = released.getByRole("form", {
      name: "Regra desta entrega",
      exact: true,
    });
    await rule
      .getByLabel("Quando liberar os arquivos?", { exact: true })
      .selectOption("before_balance");
    await rule
      .getByLabel(
        "Confirmei a regra com o responsável técnico e aprovo sua aplicação.",
      )
      .check();
    await rule
      .getByRole("button", { name: "Aprovar regra desta entrega", exact: true })
      .click();
    await expect(rule).toHaveCount(0);
    await page.reload();
    // O crédito11501 não cobre o sinal12501; aprovação da política não cria recebimento.
    await expect(clientDelivery).toContainText(
      "aguarda a confirmação do sinal",
    );
    await expect(clientDelivery.locator('a[href^="/api/files/"]')).toHaveCount(
      0,
    );
    expect(
      (
        await page.request.get(`/api/files/${fileId}/download`, {
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(404);
    const customer = (
      await db
        .from("clients")
        .select("contract_revision")
        .eq("id", m.clientId)
        .single()
    ).data!;
    const contractActor = await quoteSession("calculator");
    contractKey = randomUUID();
    try {
      const receipt = await contractActor.rpc("set_client_contract", {
        target_client: m.clientId,
        has_contract: true,
        expected_revision: customer.contract_revision,
        reason:
          "Contrato vigente fictício para ensaio da liberação com sinal parcial.",
        request_id: contractKey,
      });
      expect(receipt.error).toBeNull();
    } finally {
      await contractActor.auth.signOut({ scope: "local" });
    }
    expect((await driver.command("view")).projection.depositCreditCents).toBe(
      11501,
    );
    await page.reload();
    await expect(clientDelivery).toContainText(
      "Arquivos liberados para download.",
    );
    await expect(clientDelivery.getByRole("link")).toHaveCount(3);
    const response = await page.request.get(`/api/files/${fileId}/download`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const location = response.headers().location,
      url = new URL(location);
    expect(url.origin).toBe("http://127.0.0.1:54321");
    const token = url.searchParams.get("token")!,
      claims = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
      ) as { exp: number },
      remaining = claims.exp - Math.floor(Date.now() / 1000);
    expect(remaining).toBeGreaterThan(110);
    expect(remaining).toBeLessThanOrEqual(120);
    const download = await page.request.get(location);
    expect(download.ok()).toBe(true);
    expect((await download.body()).equals(pdf)).toBe(true);
    expect(
      (
        await db
          .from("audit_log")
          .select("id")
          .eq("target_id", fileId)
          .eq("action", "file_download")
          .eq("actor_id", original.uploaded_by)
      ).data,
    ).toHaveLength(1);
    await accessible(page, info, "04-entrega-liberada-cliente");
    await accessible(calculator, info, "04-entrega-calculista");
    strangerContext = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
      viewport: info.project.use.viewport,
      isMobile: info.project.use.isMobile,
      hasTouch: info.project.use.hasTouch,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    });
    const stranger = await strangerContext.newPage();
    await loginAs(stranger, "clientB");
    expect(
      (await stranger.goto(`/app/processos/${m.processId}`))?.status(),
    ).toBe(404);
    for (const endpoint of ["download", "content"]) {
      const denied = await stranger.request.get(
        `/api/files/${fileId}/${endpoint}`,
        { maxRedirects: 0 },
      );
      expect(denied.status()).toBe(404);
      expect((await denied.body()).equals(pdf)).toBe(false);
    }
    expect(
      (
        await db
          .from("notifications")
          .select("id")
          .eq("dedup_key", `queued:${m.orderId}:email`)
      ).data,
    ).toHaveLength(1);
    expect((await driver.command("view")).status).toBe("delivered");
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      await closeContext(strangerContext);
      await closeContext(calculatorContext);
    } catch (error) {
      if (!failure) throw error;
    } finally {
      try {
        if (contractKey)
          sql(
            `delete from public.audit_log where target_id='${contractKey}' and action='client_contract_changed';delete from private.client_contract_changes where id='${contractKey}';`,
          );
      } finally {
        await driver.close();
      }
    }
  }
});

for (const [scenario, credit, remaining, excess] of [
  ["partial", 10000, 2501, 0],
  ["excess", 13000, 0, 499],
] as const) {
  test(`${scenario}: posição/linha do tempo e documento não duplicam sinal`, async ({
    page,
    browser,
  }, info) => {
    const driver = await financialJourneyDriver();
    let context: BrowserContext | undefined, failure: unknown;
    try {
      const m = driver.metadata,
        db = localSystem(),
        pdf = await readFile(pdfFixture);
      context = await browser.newContext({
        baseURL: "http://127.0.0.1:3000",
        viewport: info.project.use.viewport,
        isMobile: info.project.use.isMobile,
        hasTouch: info.project.use.hasTouch,
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
      });
      const calculator = await context.newPage();
      page.setDefaultTimeout(10000);
      calculator.setDefaultTimeout(10000);
      await driver.command("observe", scenario);
      await driver.command("origin");
      await driver.command("apply");
      await driver.command("bind");
      const v = await driver.command("view");
      expect(v.projection.depositCreditCents).toBe(credit);
      expect(v.projection.remainingDepositCents).toBe(remaining);
      expect(v.projection.depositExcessCents).toBe(excess);
      expect(v.projection.manualDepositCents).toBe(0);
      const terminal = await driver.command("resolve");
      expect(terminal?.reason ?? null).toBe(
        scenario === "partial" ? null : "financial_received",
      );
      await loginAs(page);
      await page.goto(`/app/processos/${m.processId}?aba=historico`);
      await expect(page.locator(".process-timeline")).toContainText(
        "Pagamento confirmado",
      );
      await accessible(page, info, `${scenario}-historico-cliente`);
      await page.goto(`/app/processos/${m.processId}?aba=documentos`);
      await page.getByLabel("Pasta de destino").selectOption("case");
      await page.getByLabel("Escolher arquivo do processo").setInputFiles({
        name: `Processo fictício ${scenario}.pdf`,
        mimeType: "application/pdf",
        buffer: pdf,
      });
      await expect
        .poll(
          async () =>
            (
              await db
                .from("files")
                .select("sha256")
                .eq("process_id", m.processId)
                .eq("upload_status", "uploaded")
            ).data?.length,
          { timeout: 60000 },
        )
        .toBe(1);
      const next = await driver.command("view");
      expect(next.status).toBe(
        scenario === "partial" ? "awaiting_payment" : "queued",
      );
      expect(next.posts).toBe(1);
      expect(next.claims).toBe(1);
      expect(next.reservations).toBe(scenario === "partial" ? 1 : 0);
      const old = await driver.command("view");
      await driver.command("replay");
      expect(await driver.command("view")).toEqual(old);
      await page.goto(`/app/processos/${m.processId}?aba=resumo`);
      await accessible(page, info, `${scenario}-resumo-cliente`);
      await loginAs(calculator, "calculator");
      await calculator.goto(`/painel/processos/${m.processId}?aba=historico`);
      await expect(calculator.locator(".process-timeline")).toContainText(
        "Pagamento confirmado",
      );
      await accessible(calculator, info, `${scenario}-historico-calculista`);
      await calculator.goto("/painel/fila");
      const row = calculator.locator(
        `${info.project.use.viewport!.width < 900 ? ".queue-mobile > li" : ".queue-table tbody > tr"}[data-order-id="${m.orderId}"]`,
      );
      if (scenario === "partial") await expect(row).toHaveCount(0);
      else await expect(row).toBeVisible();
      if (scenario === "partial") {
        await driver.command("observe", "refund_full");
        await driver.command("apply");
        expect(
          (await driver.command("view")).projection.depositCreditCents,
        ).toBe(0);
        expect((await driver.command("resolve"))?.reason).toBe(
          "financial_refunded",
        );
        for (const [viewer, name, prefix] of [
          [page, "cliente", "app"],
          [calculator, "calculista", "painel"],
        ] as const) {
          await viewer.goto(
            `/${prefix}/processos/${m.processId}?aba=historico`,
          );
          await expect(viewer.locator(".process-timeline")).toContainText(
            "Estorno registrado",
          );
          await accessible(viewer, info, `refund-integral-${name}`);
        }
        const final = await driver.command("view");
        await driver.command("replay");
        expect(await driver.command("view")).toEqual(final);
      }
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      try {
        await closeContext(context);
      } catch (error) {
        if (!failure) throw error;
      } finally {
        await driver.close();
      }
    }
  });
}
