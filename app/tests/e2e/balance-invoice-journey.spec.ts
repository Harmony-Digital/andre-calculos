import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { balanceJourneyDriver } from "./balance-journey-driver";
import { localNotificationSql as sql } from "./notification-helper";
import { loginAs } from "./auth-helper";
import { randomUUID } from "node:crypto";
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
const urls = (
  m: Awaited<ReturnType<typeof balanceJourneyDriver>>["metadata"],
  actor = "client",
) => {
  const base = `${actor === "calculator" ? "/painel" : "/app"}/processos/${m.processId}`;
  return {
    base,
    view: `${base}/fatura?pedido=${m.orderId}&fase=balance`,
    endpoint: `/api/processes/${m.processId}/orders/${m.orderId}/invoice?fase=balance`,
  };
};
const count = (order: string) =>
  sql(
    `select count(*) from private.payment_invoice_queries where order_id='${order}';`,
  );
for (const actor of ["client", "calculator"] as const) {
  test(`${actor}: saldo atual, perda/reenvio e crédito alterado preservam a emissão`, async ({
    page,
    context,
  }, info) => {
    const d = await balanceJourneyDriver(),
      m = d.metadata,
      u = urls(m, actor);
    try {
      await loginAs(page, actor);
      await page.goto(`${u.base}?aba=resumo`);
      const before = await d.command("view");
      await page
        .getByRole("link", { name: "Consultar fatura do saldo", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Cobrança do saldo disponível." }),
      ).toBeVisible();
      await expect(
        page.locator(".invoice-page .eyebrow").first(),
      ).toContainText(`${m.code} · Pagamento do saldo`);
      await expect(page.locator(".invoice-summary")).toContainText("R$ 125,00");
      await expect(page.locator(".invoice-summary")).toContainText(
        "Recebimento do saldo",
      );
      await expect(page.locator(".invoice-summary")).toContainText(
        "A confirmar",
      );
      expect(await page.content()).not.toContain("sandbox.asaas.com/i/");
      await capture(page, info, "01-ativa");
      const opened = await context.request.get(u.endpoint, { maxRedirects: 0 });
      expect(opened.status()).toBe(303);
      expect(opened.headers()["location"]).toBe(
        `https://sandbox.asaas.com/i/${m.paymentId}`,
      );
      expect(opened.headers()["cache-control"]).toBe("private, no-store");
      expect(opened.headers()["referrer-policy"]).toBe("no-referrer");
      expect(await d.command("view")).toEqual(before);
      sql(
        `insert into private.payment_fixture_controls(scope_id,client_id,operation,behavior,calls_left) values('${m.scopeId}','${m.clientId}','payment_get','not_found',1);`,
      );
      await page
        .getByRole("link", { name: "Atualizar situação da fatura" })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "A cobrança do saldo precisa de conferência.",
        }),
      ).toBeVisible();
      await expect(page.locator(".invoice-financial")).toContainText(
        "A conferir",
      );
      await expect(
        page.getByRole("link", { name: "Abrir fatura conferida" }),
      ).toHaveCount(0);
      await capture(page, info, "02-incerta");
      await page
        .getByRole("link", { name: "Atualizar situação da fatura" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Cobrança do saldo disponível." }),
      ).toBeVisible();
      let dropped = false;
      await page.route("**/fatura?*", async (route) => {
        if (!dropped) {
          dropped = true;
          await route.fetch();
          await route.abort();
        } else await route.continue();
      });
      await page.goto(u.view).catch(() => {});
      expect(dropped).toBe(true);
      await page.unroute("**/fatura?*");
      await page.goto(u.view);
      await expect(
        page.getByRole("heading", { name: "Cobrança do saldo disponível." }),
      ).toBeVisible();
      expect(await d.command("view")).toEqual(before);
      await capture(page, info, "03-reenvio");
      await d.command("signalRefund");
      const changed = await context.request.get(u.endpoint, {
        maxRedirects: 0,
      });
      expect(changed.status()).toBe(303);
      expect(changed.headers()["location"]).toContain("fase=balance");
      expect(changed.headers()["location"]).not.toContain("asaas");
      await page.goto(changed.headers()["location"]);
      await expect(
        page.getByRole("heading", {
          name: "A cobrança do saldo precisa de conferência.",
        }),
      ).toBeVisible();
      await expect(page.getByRole("status")).toContainText(
        "A abertura não foi concluída",
      );
      await expect(
        page.getByRole("link", { name: "Abrir fatura conferida" }),
      ).toHaveCount(0);
      await capture(page, info, "04-credito-alterado");
      expect((await d.command("view")).posts).toBe(1);
    } finally {
      await d.close();
    }
    expect(count(m.orderId)).toBe("0");
  });
}
for (const actor of ["client", "calculator"] as const) {
  test(`${actor}: saldo recebido e proposta gratuita têm estados próprios`, async ({
    page,
    context,
  }, info) => {
    const d = await balanceJourneyDriver(),
      m = d.metadata,
      u = urls(m, actor);
    try {
      await d.command("receive");
      await loginAs(page, actor);
      await page.goto(u.view);
      await expect(
        page.getByRole("heading", { name: "Saldo confirmado.", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".invoice-financial")).toContainText("R$ 0,00");
      await expect(
        page.getByRole("heading", { name: "Sinal confirmado.", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Abrir fatura conferida" }),
      ).toHaveCount(0);
      await capture(page, info, "05-paga");
      const r = await context.request.get(u.endpoint, { maxRedirects: 0 });
      expect(r.status()).toBe(303);
      expect(r.headers()["location"]).toContain("fase=balance");
      const free = await d.command("createZeroOrder");
      await page.goto(
        `${actor === "calculator" ? "/painel" : "/app"}/processos/${free.processId}/fatura?pedido=${free.orderId}&fase=balance`,
      );
      await expect(
        page.getByRole("heading", { name: "Sem saldo para este pedido." }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Saldo confirmado.", exact: true }),
      ).toHaveCount(0);
      await capture(page, info, "06-gratuita");
    } finally {
      await d.close();
    }
  });
  test(`${actor}: saldo parcial mostra restante e entrega retirada bloqueia abertura atual`, async ({
    page,
    context,
  }, info) => {
    const d = await balanceJourneyDriver(),
      m = d.metadata,
      u = urls(m, actor);
    try {
      await d.command("receive", "partial");
      await loginAs(page, actor);
      await page.goto(u.view);
      await expect(
        page.getByRole("heading", {
          name: "A cobrança do saldo está bloqueada.",
        }),
      ).toBeVisible();
      await expect(page.locator(".invoice-financial")).toContainText(
        "R$ 10,00",
      );
      await expect(
        page.getByRole("link", { name: "Abrir fatura conferida" }),
      ).toHaveCount(0);
      await capture(page, info, "07-parcial");
      await d.command("dropDelivery");
      const r = await context.request.get(u.endpoint, { maxRedirects: 0 });
      expect(r.status()).toBe(303);
      expect(r.headers()["location"]).toContain("fase=balance");
      await page.goto(r.headers()["location"]);
      await expect(page.locator(".invoice-page")).toContainText(
        "A entrega técnica deste pedido ainda precisa ser conferida.",
      );
      await capture(page, info, "08-sem-entrega");
    } finally {
      await d.close();
    }
  });
}
for (const [method, label] of [
  ["BOLETO", "Boleto"],
  ["CREDIT_CARD", "Cartão de crédito"],
  ["UNDEFINED", "Escolha na fatura"],
] as const) {
  test(`${method}: saldo abre fatura sem campos de cartão`, async ({
    page,
    context,
  }, info) => {
    const d = await balanceJourneyDriver(method),
      m = d.metadata,
      u = urls(m);
    try {
      await loginAs(page);
      await page.goto(u.view);
      await expect(page.locator(".invoice-summary")).toContainText(label);
      await expect(
        page.locator(
          ".invoice-page input,.invoice-page select,.invoice-page textarea",
        ),
      ).toHaveCount(0);
      await expect(page.locator('[autocomplete^="cc-"]')).toHaveCount(0);
      expect(await page.content()).not.toContain("sandbox.asaas.com/i/");
      await capture(page, info, "09-" + method.toLowerCase());
      const r = await context.request.get(u.endpoint, { maxRedirects: 0 });
      expect(r.status()).toBe(303);
      expect(r.headers()["location"]).toBe(
        `https://sandbox.asaas.com/i/${m.paymentId}`,
      );
      expect((await d.command("view")).posts).toBe(1);
    } finally {
      await d.close();
    }
  });
}
test("saldo recusa papéis, pares e fase inválidos; auditoria falha sem devolver URL", async ({
  page,
  context,
  browser,
}) => {
  const d = await balanceJourneyDriver(),
    m = d.metadata,
    u = urls(m);
  const name = "balance_ui_audit_" + randomUUID().replaceAll("-", "");
  let trigger = false;
  const anon = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  try {
    expect(
      (await anon.request.get(u.endpoint, { maxRedirects: 0 })).status(),
    ).toBe(404);
    for (const actor of ["clientB", "admin"] as const) {
      await loginAs(page, actor);
      expect(
        (await context.request.get(u.endpoint, { maxRedirects: 0 })).status(),
      ).toBe(404);
      const url = urls(m, actor === "admin" ? "calculator" : actor).view;
      expect((await page.goto(url))!.status()).toBe(404);
      await page.goto(actor === "admin" ? "/painel" : "/app");
      await page.getByRole("button", { name: "Sair", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Entrar", exact: true }),
      ).toBeVisible();
    }
    await loginAs(page);
    expect(
      (await page.goto(u.view.replace(m.processId, m.orderId)))!.status(),
    ).toBe(404);
    expect(
      (await page.goto(
        u.view.replace("fase=balance", "fase=invalid"),
      ))!.status(),
    ).toBe(404);
    expect(
      (
        await context.request.get(
          u.endpoint.replace("fase=balance", "fase=invalid"),
          { maxRedirects: 0 },
        )
      ).status(),
    ).toBe(404);
    expect(count(m.orderId)).toBe("0");
    sql(
      `create function private.${name}() returns trigger language plpgsql set search_path='' as $$begin if new.action='payment_invoice_viewed' and new.target_id='${m.orderId}' then raise exception 'Falha ficticia';end if;return new;end$$;create trigger ${name} before insert on public.audit_log for each row execute function private.${name}();`,
    );
    trigger = true;
    const failed = await context.request.get(u.endpoint, { maxRedirects: 0 });
    expect(failed.status()).toBe(404);
    expect(failed.headers()["location"]).toBeUndefined();
    expect(failed.headers()["cache-control"]).toBe("private, no-store");
    expect(
      sql(
        `select count(*) from private.payment_invoice_queries where order_id='${m.orderId}' and completed_at is not null;`,
      ),
    ).toBe("0");
    sql(
      `drop trigger ${name} on public.audit_log;drop function private.${name}();`,
    );
    trigger = false;
    const current = await context.request.get(u.endpoint, { maxRedirects: 0 });
    expect(current.status()).toBe(303);
    expect(current.headers()["location"]).toBe(
      `https://sandbox.asaas.com/i/${m.paymentId}`,
    );
  } finally {
    if (trigger)
      sql(
        `drop trigger if exists ${name} on public.audit_log;drop function if exists private.${name}();`,
      );
    await anon.close();
    await d.close();
  }
  expect(count(m.orderId)).toBe("0");
});
