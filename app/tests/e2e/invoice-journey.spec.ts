import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { financialJourneyDriver } from "./financial-journey-driver";
import { localNotificationSql as sql } from "./notification-helper";
import { loginAs } from "./auth-helper";
import { randomUUID } from "node:crypto";
import { quoteSession } from "./quote-helper";
import { localSystem } from "./local-helper";

test.setTimeout(150000);
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
for (const actor of ["client", "calculator"] as const) {
  test(`${actor}: consulta atual, estados e reenvio da fatura preservam crédito e emissão`, async ({
    page,
    context,
    browser,
  }, info) => {
    const driver = await financialJourneyDriver(),
      m = driver.metadata;
    const base = `${actor === "calculator" ? "/painel" : "/app"}/processos/${m.processId}`,
      view = `${base}/fatura?pedido=${m.orderId}`,
      endpoint = `/api/processes/${m.processId}/orders/${m.orderId}/invoice`;
    const state = () =>
      sql(
        `select md5(json_build_object('run',(select row_to_json(r) from private.payment_execution_runs r where intent_id='${m.intentId}'),'claim',(select row_to_json(c) from private.payment_intent_dispatch_claims c where intent_id='${m.intentId}'),'reservation',(select row_to_json(v) from private.payment_intent_reservations v where intent_id='${m.intentId}'),'position',(select row_to_json(p) from private.payment_financial_positions p where charge_id='${m.chargeId}'),'charge',(select row_to_json(c) from private.payment_financial_charges c where id='${m.chargeId}'),'posts',(select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${m.intentId}'))::text);`,
      );
    const wire = sql(
      `select provider_payment_id from private.payment_financial_charges where id='${m.chargeId}';`,
    );
    const scope = sql(
      `select scope_id from private.payment_financial_charges where id='${m.chargeId}';`,
    );
    let stranger: Awaited<ReturnType<typeof browser.newContext>> | undefined;
    try {
      sql(
        `update private.payment_fixture_payments set refunds='[]' where scope_id='${scope}' and id='${wire}';`,
      );
      await driver.command("observe", "current");
      await driver.command("apply");
      await loginAs(page, actor);
      await page.goto(`${base}?aba=resumo`);
      const before = state();
      await page
        .getByRole("link", { name: "Consultar fatura do sinal", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Cobrança do sinal disponível." }),
      ).toBeVisible();
      await expect(
        page.locator(".invoice-page .eyebrow").first(),
      ).toContainText(m.code);
      await expect(page.locator(".invoice-summary")).toContainText("R$ 125,01");
      await expect(page.locator(".invoice-summary")).toContainText(
        "A confirmar",
      );
      expect(
        await page.locator('a[href^="https://sandbox.asaas.com"]').count(),
      ).toBe(0);
      await capture(page, info, "01-ativa");
      const opened = await context.request.get(endpoint, { maxRedirects: 0 });
      expect(opened.status()).toBe(303);
      expect(opened.headers()["location"]).toBe(
        `https://sandbox.asaas.com/i/${wire}`,
      );
      expect(opened.headers()["cache-control"]).toBe("private, no-store");
      expect(opened.headers()["referrer-policy"]).toBe("no-referrer");
      expect(state()).toBe(before);
      // Resposta perdida: servidor terminou a leitura; navegador não recebe o HTML.
      let dropped = false;
      await page.route("**/fatura?pedido=*", async (route) => {
        if (!dropped) {
          dropped = true;
          await route.fetch();
          await route.abort();
        } else await route.continue();
      });
      await page.goto(view).catch(() => {});
      expect(dropped).toBe(true);
      await page.unroute("**/fatura?pedido=*");
      await page.goto(view);
      await expect(
        page.getByRole("heading", { name: "Cobrança do sinal disponível." }),
      ).toBeVisible();
      expect(state()).toBe(before);
      await page
        .getByRole("link", { name: "Atualizar situação da fatura" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Cobrança do sinal disponível." }),
      ).toBeVisible();
      expect(state()).toBe(before);
      sql(
        `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior,calls_left) values('${scope}','${m.clientId}','payment_get','not_found',1);`,
      );
      await page.reload();
      await expect(
        page.getByRole("heading", {
          name: "A cobrança do sinal precisa de conferência.",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Abrir fatura conferida" }),
      ).toHaveCount(0);
      await capture(page, info, "02-incerta");
      await expect(page.locator(".invoice-financial")).toContainText(
        "A conferir",
      );
      await page
        .getByRole("link", { name: "Atualizar situação da fatura" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Cobrança do sinal disponível." }),
      ).toBeVisible();
      sql(
        "update private.payment_fixture_environment set enabled=false where singleton;",
      );
      await page.reload();
      await expect(
        page.getByRole("heading", {
          name: "A cobrança do sinal está bloqueada.",
        }),
      ).toBeVisible();
      await expect(
        page.getByText("O pagamento automático ainda não está disponível.", {
          exact: true,
        }),
      ).toBeVisible();
      await capture(page, info, "03-bloqueada");
      sql(
        "update private.payment_fixture_environment set enabled=true where singleton;",
      );
      await driver.command("observe", "partial");
      await driver.command("apply");
      await page.reload();
      await expect(
        page.getByRole("link", { name: "Abrir fatura conferida" }),
      ).toHaveCount(0);
      await capture(page, info, "04-parcial");
      await expect(page.locator(".invoice-financial")).toContainText(
        "R$ 25,01",
      );
      await driver.command("observe", "received");
      await driver.command("apply");
      await driver.command("origin");
      await driver.command("bind");
      await driver.command("resolve");
      // O endpoint precisa reler mesmo se a tela anterior ainda tivesse um botão.
      const paid = await context.request.get(endpoint, { maxRedirects: 0 });
      expect(paid.status()).toBe(303);
      expect(paid.headers()["location"]).toContain(
        `${base}/fatura?pedido=${m.orderId}&aviso=atualizada`,
      );
      await page.goto(view);
      await expect(
        page.getByRole("heading", { name: "Sinal confirmado.", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Abrir fatura conferida" }),
      ).toHaveCount(0);
      await capture(page, info, "05-paga");
      await driver.command("observe", "refund_full");
      await driver.command("apply");
      await page.reload();
      await expect(
        page.getByRole("link", { name: "Abrir fatura conferida" }),
      ).toHaveCount(0);
      await capture(page, info, "06-estorno");
      stranger = await browser.newContext({
        baseURL: "http://127.0.0.1:3000",
        viewport: info.project.use.viewport,
      });
      const other = await stranger.newPage();
      await loginAs(other, "clientB");
      expect(
        (
          await stranger.request.get(
            `/app/processos/${m.processId}/fatura?pedido=${m.orderId}`,
          )
        ).status(),
      ).toBe(404);
      const denied = await stranger.request.get(endpoint, { maxRedirects: 0 });
      expect(denied.status()).toBe(404);
      expect(denied.headers()["location"]).toBeUndefined();
      const queries = sql(
        `select coalesce(json_agg(row_to_json(q))::text,'[]') from private.payment_invoice_queries q where order_id='${m.orderId}';`,
      );
      expect(queries).not.toMatch(
        /https?:|invoiceUrl|bodyText|document|email|cpfCnpj/,
      );
    } finally {
      await stranger?.close();
      await driver.close();
    }
    expect(
      sql(
        `select count(*) from private.payment_invoice_queries where order_id='${m.orderId}';`,
      ),
    ).toBe("0");
  });
}

for (const [method, label] of [
  ["BOLETO", "Boleto"],
  ["CREDIT_CARD", "Cartão de crédito"],
  ["UNDEFINED", "Escolha na fatura"],
] as const) {
  test(`${method}: fatura válida não captura cartão ou emite nova cobrança`, async ({
    page,
    context,
  }, info) => {
    const d = await financialJourneyDriver(method),
      m = d.metadata;
    const scope = sql(
        `select scope_id from private.payment_financial_charges where id='${m.chargeId}';`,
      ),
      payment = sql(
        `select provider_payment_id from private.payment_financial_charges where id='${m.chargeId}';`,
      );
    try {
      sql(
        `update private.payment_fixture_payments set refunds='[]' where scope_id='${scope}' and id='${payment}';`,
      );
      await d.command("observe", "current");
      await d.command("apply");
      await loginAs(page);
      await page.goto(
        `/app/processos/${m.processId}/fatura?pedido=${m.orderId}`,
      );
      await expect(page.locator(".invoice-summary")).toContainText(label);
      await expect(
        page.getByRole("link", { name: "Abrir fatura conferida" }),
      ).toBeVisible();
      expect(
        await page
          .locator(
            ".invoice-page input, .invoice-page select, .invoice-page textarea",
          )
          .count(),
      ).toBe(0);
      expect(await page.locator('input[autocomplete^="cc-"]').count()).toBe(0);
      await capture(page, info, "metodo-" + method);
      const r = await context.request.get(
        `/api/processes/${m.processId}/orders/${m.orderId}/invoice`,
        { maxRedirects: 0 },
      );
      expect(r.status()).toBe(303);
      expect(r.headers()["location"]).toBe(
        `https://sandbox.asaas.com/i/${payment}`,
      );
      expect(
        sql(
          `select count(*) from private.payment_fixture_requests where operation='payment_create' and payload->>'reference'='${m.intentId}';`,
        ),
      ).toBe("1");
    } finally {
      await d.close();
    }
  });
}
test("rota privada nega anon/admin/pedido-processo trocados e faz rollback quando auditoria falha", async ({
  page,
  context,
  browser,
}) => {
  const d = await financialJourneyDriver(),
    m = d.metadata;
  const scope = sql(
      `select scope_id from private.payment_financial_charges where id='${m.chargeId}';`,
    ),
    payment = sql(
      `select provider_payment_id from private.payment_financial_charges where id='${m.chargeId}';`,
    );
  const endpoint = `/api/processes/${m.processId}/orders/${m.orderId}/invoice`;
  let admin: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    sql(
      `update private.payment_fixture_payments set refunds='[]' where scope_id='${scope}' and id='${payment}';`,
    );
    await d.command("observe", "current");
    await d.command("apply");
    expect(
      (await context.request.get(endpoint, { maxRedirects: 0 })).status(),
    ).toBe(404);
    await loginAs(page);
    const other = randomUUID();
    expect(
      (
        await context.request.get(
          `/api/processes/${other}/orders/${m.orderId}/invoice`,
          { maxRedirects: 0 },
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await context.request.get(
          `/api/processes/${m.processId}/orders/${other}/invoice`,
          { maxRedirects: 0 },
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await context.request.get(
          `/api/processes/${m.processId}/orders/invalido/invoice`,
          { maxRedirects: 0 },
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await context.request.get(
          `/app/processos/${other}/fatura?pedido=${m.orderId}`,
          { maxRedirects: 0 },
        )
      ).status(),
    ).toBe(404);
    admin = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
    const a = await admin.newPage();
    await loginAs(a, "admin");
    expect(
      (await admin.request.get(endpoint, { maxRedirects: 0 })).status(),
    ).toBe(404);
    expect(
      (
        await admin.request.get(
          `/painel/processos/${m.processId}/fatura?pedido=${m.orderId}`,
        )
      ).status(),
    ).toBe(404);
    expect(
      sql(
        `select count(*) from private.payment_invoice_queries where order_id='${m.orderId}';`,
      ),
    ).toBe("0");
    sql(
      `create function private.invoice_ui_test_audit_fail() returns trigger language plpgsql set search_path='' as $$begin if new.action='payment_invoice_viewed' and new.target_id='${m.orderId}'::uuid then raise exception 'Auditoria ficticia indisponivel';end if;return new;end$$;create trigger invoice_ui_test_audit_fail before insert on public.audit_log for each row execute function private.invoice_ui_test_audit_fail();`,
    );
    try {
      const failed = await context.request.get(endpoint, { maxRedirects: 0 });
      expect(failed.status()).toBe(404);
      expect(failed.headers()["location"]).toBeUndefined();
      expect(failed.headers()["cache-control"]).toBe("private, no-store");
      expect(
        sql(
          `select count(*) from private.payment_invoice_queries where order_id='${m.orderId}' and completed_at is not null;`,
        ),
      ).toBe("0");
      expect(
        sql(
          `select count(*) from public.audit_log where action='payment_invoice_viewed' and target_id='${m.orderId}';`,
        ),
      ).toBe("0");
    } finally {
      sql(
        "drop trigger invoice_ui_test_audit_fail on public.audit_log;drop function private.invoice_ui_test_audit_fail();",
      );
    }
    expect(
      (await context.request.get(endpoint, { maxRedirects: 0 })).status(),
    ).toBe(303);
  } finally {
    await admin?.close();
    await d.close();
  }
});

test("dispensa por contrato e proposta sem sinal não declaram pagamento ou oferecem fatura", async ({
  page,
  context,
}, info) => {
  const d = await financialJourneyDriver(),
    m = d.metadata,
    db = localSystem();
  const receipts: string[] = [];
  let calc: Awaited<ReturnType<typeof quoteSession>> | undefined;
  try {
    // Recebimento/terminal reais da fixture antes de alterar condição contratual.
    await d.command("observe", "received");
    await d.command("apply");
    await d.command("origin");
    await d.command("bind");
    await d.command("resolve");
    calc = await quoteSession("calculator");
    const setContract = async (enabled: boolean) => {
      const revision = Number(
          sql(
            `select contract_revision from public.clients where id='${m.clientId}';`,
          ),
        ),
        id = randomUUID();
      const r = await calc!.rpc("set_client_contract", {
        target_client: m.clientId,
        has_contract: enabled,
        expected_revision: revision,
        request_id: id,
        reason: "Condição fictícia para conferir apresentação sem cobrança",
      });
      expect(r.error).toBeNull();
      receipts.push(id);
    };
    await setContract(true);
    await loginAs(page);
    await page.goto(`/app/processos/${m.processId}/fatura?pedido=${m.orderId}`);
    await expect(
      page.getByRole("heading", { name: "Pagamento conforme contrato." }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sinal confirmado." }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Abrir fatura conferida" }),
    ).toHaveCount(0);
    await capture(page, info, "07-contrato");
    await setContract(false);
    const free = await d.command("createZeroOrder");
    await page.goto(
      `/app/processos/${free.processId}/fatura?pedido=${free.orderId}`,
    );
    await expect(
      page.getByRole("heading", { name: "Sem sinal para este pedido." }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sinal confirmado." }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Abrir fatura conferida" }),
    ).toHaveCount(0);
    await capture(page, info, "08-sem-sinal");
    const r = await context.request.get(
      `/api/processes/${free.processId}/orders/${free.orderId}/invoice`,
      { maxRedirects: 0 },
    );
    expect(r.status()).toBe(303);
    expect(r.headers()["location"]).toContain(
      `/app/processos/${free.processId}/fatura`,
    );
    expect(
      sql(
        `select count(*) from private.payment_invoice_queries where order_id in('${m.orderId}','${free.orderId}');`,
      ),
    ).toBe("0");
  } finally {
    await calc?.auth.signOut({ scope: "local" });
    for (const id of receipts) {
      await db
        .from("audit_log")
        .delete()
        .eq("action", "client_contract_changed")
        .eq("target_id", id);
      sql(`delete from private.client_contract_changes where id='${id}';`);
    }
    await d.close();
  }
});
