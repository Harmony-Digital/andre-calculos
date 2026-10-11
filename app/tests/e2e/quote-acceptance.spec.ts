import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { acceptanceFixture } from "./acceptance-helper";
import { loginAs } from "./auth-helper";
import { localNotificationSql } from "./notification-helper";
test.setTimeout(90000);
test("aceite pela pasta recupera resposta perdida, preserva recibo e restringe acesso", async ({
  page,
  browser,
}, testInfo) => {
  const fixture = await acceptanceFixture();
  const contexts = [];
  try {
    const sample = await fixture.create();
    await loginAs(page);
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": "192.0.2.44, 203.0.113.1",
      "user-agent": "Navegador sintetico do aceite",
    });
    await page.goto(`/app/processos/${sample.process_id}?aba=resumo`);
    await page.getByRole("link", { name: sample.number, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/app/orcamentos/${sample.id}$`));
    const form = page.getByRole("form", { name: "Aceite da proposta" });
    const confirm = form.getByRole("checkbox");
    await expect(confirm).not.toBeChecked();
    await expect(
      form.getByRole("button", { name: "Aceitar", exact: true }),
    ).toBeDisabled();
    await page
      .getByText(`Termos de serviço · ${fixture.terms}`, { exact: true })
      .click();
    await page
      .getByText(`Informação de privacidade · ${fixture.privacy}`, {
        exact: true,
      })
      .click();
    await expect(page.getByText(/Termos fictícios exclusivos/)).toBeVisible();
    await confirm.focus();
    await page.keyboard.press("Space");
    await expect(confirm).toBeChecked();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(testInfo.project.use.viewport!.width);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("aceite.png"),
      fullPage: true,
    });
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
    await form.getByRole("button", { name: "Aceitar", exact: true }).click();
    await expect(
      form.getByRole("alert", { name: "Aceite da proposta" }),
    ).toContainText("Sua escolha foi preservada");
    expect(dropped).toBe(true);
    const stored = (
      await fixture.db
        .from("quotes")
        .select("accepted_at,accepted_ip,accepted_user_agent")
        .eq("id", sample.id)
        .single()
    ).data!;
    expect(stored.accepted_at).not.toBeNull();
    expect(stored.accepted_ip).toBe("192.0.2.44");
    expect(stored.accepted_user_agent).toBe("Navegador sintetico do aceite");
    await expect(confirm).toBeChecked();
    // O reenvio recupera o recibo original, mesmo quando as versões atuais mudaram.
    await fixture.db
      .from("settings")
      .update({ approved_terms_version: null })
      .eq("singleton", true);
    await form.getByRole("button", { name: "Aceitar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Contratação registrada" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "Confira a situação do sinal",
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Contratação registrada" }),
    ).toBeVisible();
    const replay = (
      await fixture.db
        .from("quotes")
        .select("accepted_at,accepted_ip,accepted_user_agent")
        .eq("id", sample.id)
        .single()
    ).data!;
    expect(replay).toEqual(stored);
    await expect(
      page.getByRole("link", { name: "Ver sinal e pagamento" }),
    ).toHaveAttribute("href", `/app/processos/${sample.process_id}?aba=resumo`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("recibo.png"),
      fullPage: true,
    });
    expect(
      localNotificationSql(
        `select count(*) from private.quote_acceptance_requests where quote_id='${sample.id}'::uuid;`,
      ),
    ).toBe("1");
    expect(
      (
        await fixture.db
          .from("timeline_events")
          .select("id")
          .eq("order_id", sample.order_id)
          .eq("kind", "quote_accepted")
      ).data,
    ).toHaveLength(1);
    const pdf = await page.request.get(`/api/quotes/${sample.id}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["cache-control"]).toBe("private, no-store");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await page.getByRole("link", { name: "Abrir pasta do processo" }).click();
    await page.goto(`/app/processos/${sample.process_id}?aba=resumo`);
    await expect(
      page.getByRole("link", { name: sample.number, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Aguardando sinal", { exact: false }),
    ).toBeVisible();
    for (const role of ["clientB", "calculator", "admin"] as const) {
      const context = await browser.newContext({
        baseURL: "http://127.0.0.1:3000",
      });
      contexts.push(context);
      const other = await context.newPage();
      await loginAs(other, role);
      const prefix = role === "clientB" ? "/app" : "/painel";
      const response = await other.goto(`${prefix}/orcamentos/${sample.id}`);
      if (role === "calculator") {
        await expect(
          other.getByRole("heading", { name: "Contratação registrada" }),
        ).toBeVisible();
        await expect(
          other.getByRole("form", { name: "Aceite da proposta" }),
        ).toHaveCount(0);
        expect(
          (await other.request.get(`/api/quotes/${sample.id}/pdf`)).status(),
        ).toBe(200);
        const messages = other.getByRole("link", {
          name: "Ver sinal e pagamento",
        });
        await expect(messages).toHaveAttribute(
          "href",
          `/painel/processos/${sample.process_id}?aba=resumo`,
        );
        await messages.click();
        await expect(
          other.getByRole("heading", {
            name: "Resumo do processo",
            exact: true,
          }),
        ).toBeVisible();
      } else {
        expect(response?.status()).toBe(404);
        expect(
          (await other.request.get(`/api/quotes/${sample.id}/pdf`)).status(),
        ).toBe(404);
      }
    }
    const anonymous = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    contexts.push(anonymous);
    expect(
      (await anonymous.request.get(`/api/quotes/${sample.id}/pdf`)).status(),
    ).toBe(404);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await fixture.cleanup();
  }
});
test("contrato libera a fila só com documento confirmado", async ({
  page,
  browser,
}) => {
  const fixture = await acceptanceFixture();
  const contexts: BrowserContext[] = [];
  try {
    await loginAs(page);
    for (const documents of [false, true]) {
      const sample = await fixture.create({ contract: true, documents });
      await page.goto(`/app/orcamentos/${sample.id}`);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Aceitar", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Contratação registrada" }),
      ).toBeVisible();
      await expect(page.getByRole("status")).toContainText(
        documents ? "Acompanhe o andamento" : "envie pelo menos um documento",
      );
      await page.goto(`/app/processos/${sample.process_id}?aba=resumo`);
      await expect(
        page.getByText(documents ? "Na fila" : "Aguardando documentos", {
          exact: false,
        }),
      ).toBeVisible();
      await page.goto(`/app/processos/${sample.process_id}?aba=historico`);
      await expect(
        page.getByRole("list").getByText("Proposta aceita", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Pedido entrou na fila", { exact: true }),
      ).toHaveCount(documents ? 1 : 0);
      if (!documents) {
        const calculator = await browser.newContext({
          baseURL: "http://127.0.0.1:3000",
        });
        contexts.push(calculator);
        const panel = await calculator.newPage();
        await loginAs(panel, "calculator");
        await panel.goto(`/painel/orcamentos/${sample.id}`);
        const link = panel.getByRole("link", { name: "Ver documentos" });
        await expect(link).toHaveAttribute(
          "href",
          `/painel/processos/${sample.process_id}?aba=documentos`,
        );
        await link.click();
        await expect(
          panel.getByRole("heading", { name: "Enviar documento do processo" }),
        ).toBeVisible();
      }
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await fixture.cleanup();
  }
});
test("validade e documentos legais divergentes impedem contratação", async ({
  page,
  browser,
}) => {
  const fixture = await acceptanceFixture();
  const contexts: BrowserContext[] = [];
  try {
    await loginAs(page);
    const expired = await fixture.create({ expired: true });
    await page.goto(`/app/orcamentos/${expired.id}`);
    await expect(
      page.getByText(
        "A validade desta proposta terminou. Solicite uma nova proposta.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("checkbox")).toBeDisabled();
    const sample = await fixture.create();
    await fixture.db
      .from("settings")
      .update({ approved_terms_version: null })
      .eq("singleton", true);
    await page.goto(`/app/orcamentos/${sample.id}`);
    await expect(
      page.getByText(
        "Os documentos legais precisam ser reconferidos antes da contratação.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("checkbox")).toBeDisabled();
    const calculator = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    contexts.push(calculator);
    const panel = await calculator.newPage();
    await loginAs(panel, "calculator");
    for (const [id, message] of [
      [
        expired.id,
        "A validade desta proposta terminou. Solicite uma nova proposta.",
      ],
      [
        sample.id,
        "Os documentos legais precisam ser reconferidos antes da contratação.",
      ],
    ]) {
      await panel.goto(`/painel/orcamentos/${id}`);
      await expect(panel.getByText(message, { exact: true })).toBeVisible();
      await expect(
        panel.getByRole("form", { name: "Aceite da proposta" }),
      ).toHaveCount(0);
    }
    expect(
      localNotificationSql(
        `select count(*) from private.quote_acceptances where quote_id in ('${sample.id}'::uuid,'${expired.id}'::uuid);`,
      ),
    ).toBe("0");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await fixture.cleanup();
  }
});

test("versões legais extensas permanecem legíveis e acessíveis", async ({
  page,
}, testInfo) => {
  const fixture = await acceptanceFixture({
    terms: "teste-" + "t".repeat(194),
    privacy: "teste-" + "p".repeat(194),
  });
  try {
    const sample = await fixture.create();
    await loginAs(page);
    await page.goto(`/app/orcamentos/${sample.id}`);
    await page
      .getByText(`Termos de serviço · ${fixture.terms}`, { exact: true })
      .click();
    await page
      .getByText(`Informação de privacidade · ${fixture.privacy}`, {
        exact: true,
      })
      .click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(testInfo.project.use.viewport!.width);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("legais-extensos.png"),
      fullPage: true,
    });
  } finally {
    await fixture.cleanup();
  }
});
test("primeiro upload após contrato libera fila e recupera confirmação perdida", async ({
  page,
}) => {
  const fixture = await acceptanceFixture();
  try {
    const sample = await fixture.create({ contract: true });
    await loginAs(page);
    await page.goto(`/app/orcamentos/${sample.id}`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Aceitar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "R$ 250,01 para pagamento no final",
    );
    await page.getByRole("link", { name: "Enviar documentos" }).click();
    const name = "Documento inventado para contrato.pdf";
    let dropped = false;
    await page.route("**/app/processos/**", async (route) => {
      const request = route.request();
      if (
        !dropped &&
        request.method() === "POST" &&
        request.headers()["next-action"]
      ) {
        const file = (
          await fixture.db
            .from("files")
            .select("id")
            .eq("process_id", sample.process_id)
            .eq("name", name)
            .maybeSingle()
        ).data;
        if (file && request.postData()?.includes(file.id)) {
          dropped = true;
          await route.fetch();
          await route.abort("failed");
          return;
        }
      }
      await route.continue();
    });
    await page.getByLabel("Escolher arquivo do processo").setInputFiles({
      name,
      mimeType: "application/pdf",
      buffer: Buffer.from(
        "%PDF-1.7\nDocumento inventado, sem processo real.\n%%EOF",
      ),
    });
    await expect(
      page.getByRole("button", { name: "Confirmar envio", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    expect(dropped).toBe(true);
    const stored = (
      await fixture.db
        .from("files")
        .select("id,upload_status")
        .eq("process_id", sample.process_id)
        .eq("name", name)
        .single()
    ).data!;
    expect(stored.upload_status).toBe("uploaded");
    await page
      .getByRole("button", { name: "Confirmar envio", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Arquivo enviado e integridade confirmada.",
    );
    expect(
      (
        await fixture.db
          .from("files")
          .select("id")
          .eq("process_id", sample.process_id)
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await fixture.db
          .from("audit_log")
          .select("id")
          .eq("target_id", stored.id)
          .eq("action", "upload_verified")
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await fixture.db
          .from("notifications")
          .select("id")
          .eq("dedup_key", `queued:${sample.order_id}:email`)
      ).data,
    ).toHaveLength(1);
    await page.goto(`/app/processos/${sample.process_id}?aba=resumo`);
    await expect(page.getByText("Na fila", { exact: false })).toBeVisible();
    await page.goto(`/app/processos/${sample.process_id}?aba=historico`);
    await expect(
      page
        .getByRole("list")
        .getByText("Pedido entrou na fila", { exact: true }),
    ).toHaveCount(1);
    await page.goto(`/app/orcamentos/${sample.id}`);
    await expect(page.getByRole("status")).toContainText(
      "Acompanhe o andamento",
    );
  } finally {
    await fixture.cleanup();
  }
});
