import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { localSystem, leaseLocalSettings } from "./local-helper";
import { leaseQueue, queueFixture } from "./queue-helper";
import { loginAs } from "./auth-helper";
import { dashboardWindow } from "../../src/modules/dashboard/window";
const rows = (page: Page) =>
  page.locator(
    page.viewportSize()!.width < 900
      ? ".queue-mobile > li"
      : ".queue-table tbody > tr",
  );
test.setTimeout(90000);
test("painel conta além de cinquenta e os cartões abrem listas coerentes, com acesso restrito", async ({
  page,
  browser,
}, info) => {
  const releaseSettings = await leaseLocalSettings(),
    releaseQueue = await leaseQueue(),
    db = localSystem(),
    now = new Date(),
    window = dashboardWindow(now),
    yesterday = new Date(Date.parse(`${window.today}T12:00:00Z`) - 86400000)
      .toISOString()
      .slice(0, 10),
    fixture = await queueFixture([
      ...Array.from({ length: 116 }, () => ({
        status: "queued",
        due: yesterday,
      })),
      { status: "in_analysis", due: window.today },
      { status: "in_adjustment", due: window.soon },
      { status: "in_review", due: null },
      ...Array.from({ length: 7 }, () => ({
        status: "awaiting_payment",
        due: yesterday,
      })),
      ...Array.from({ length: 4 }, () => ({
        status: "quoted",
        due: yesterday,
      })),
      { status: "delivered", due: yesterday },
      ...Array.from({ length: 59 }, () => ({
        status: "quoted",
        due: yesterday,
      })),
    ]),
    priorClients = (
      await db
        .from("clients")
        .select(
          "id,created_at,profile:profiles!clients_owner_id_fkey!inner(role)",
        )
        .eq("profile.role", "client")
    ).data!;
  try {
    expect(priorClients).toHaveLength(2);
    for (const [i, c] of priorClients.entries())
      expect(
        (
          await db
            .from("clients")
            .update({
              created_at: new Date(
                now.getTime() + (i === 0 ? -8 : 1) * 86400000,
              ).toISOString(),
            })
            .eq("id", c.id)
        ).error,
      ).toBeNull();
    const offers = [
      { index: 126, accepted: false, expired: false },
      { index: 127, accepted: false, expired: false },
      // Cada proposta vigente é a única folha de um pedido distinto.
      ...Array.from({ length: 59 }, (_, i) => ({
        index: 131 + i,
        accepted: false,
        expired: false,
      })),
      { index: 128, accepted: false, expired: true },
      { index: 129, accepted: true, expired: false },
      { index: 130, accepted: false, expired: false },
    ].map((o) => ({
      id: randomUUID(),
      number: `ORC-ENSAIO-${randomUUID()}`,
      order_id: fixture.orders[o.index].id,
      items: [],
      total_cents: 123456,
      valid_until: new Date(
        now.getTime() + (o.expired ? -86400000 : 86400000),
      ).toISOString(),
      accepted_at: o.accepted ? now.toISOString() : null,
      created_at: now.toISOString(),
    }));
    expect((await db.from("quotes").insert(offers)).error).toBeNull();
    await loginAs(page, "calculator");
    await page.goto("/painel");
    const value = (key: string) =>
      page.locator(`[data-stat="${key}"] .stat-value`);
    for (const [key, count] of Object.entries({
      registrations: 0,
      quotes: 61,
      payments: 7,
      queued: 116,
      soon: 2,
      overdue: 116,
    }))
      await expect(value(key)).toHaveText(String(count));
    await expect(page.locator("[data-next-order]")).toHaveCount(5);
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
      globalThis.scrollTo(0, 0);
    });
    await page.screenshot({
      path: info.outputPath("painel-calculista.png"),
      fullPage: true,
    });
    await page.locator('[data-stat="overdue"]').click();
    const found: string[] = [],
      expectedLate = fixture.orders
        .slice(0, 116)
        .map((o) => o.id)
        .sort();
    do {
      await expect(rows(page).first()).toBeVisible();
      found.push(
        ...(await rows(page).evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("data-order-id")!),
        )),
      );
      await expect(page.getByLabel("Filtrar prazo")).toHaveValue("atrasados");
      const next = page.getByRole("link", {
        name: "Próximos pedidos",
        exact: true,
      });
      if (!(await next.count())) break;
      await next.click();
      await expect(rows(page).first()).toHaveAttribute(
        "data-order-id",
        expectedLate[found.length],
      );
    } while (found.length < 200);
    expect(found).toEqual(expectedLate);
    expect(new Set(found).size).toBe(116);
    await page.goto("/painel");
    await page.locator('[data-stat="soon"]').click();
    await expect(rows(page)).toHaveCount(2);
    const nearIds = await rows(page).evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("data-order-id")),
    );
    expect(nearIds).toEqual([fixture.orders[116].id, fixture.orders[117].id]);
    await page.goto("/painel");
    await page.locator('[data-stat="queued"]').click();
    await expect(page.getByLabel("Filtrar situação")).toHaveValue("queued");
    await expect(rows(page)).toHaveCount(50);
    await page.goto("/painel");
    await page.locator('[data-stat="payments"]').click();
    await expect(page.locator("[data-panel-record]")).toHaveCount(7);
    await page.goto("/painel");
    await page.locator('[data-stat="quotes"]').click();
    const expectedQuotes = offers
        .slice(0, 61)
        .map((q) => q.id)
        .sort()
        .reverse(),
      quoted: string[] = [];
    for (const size of [50, 11]) {
      await expect(page.locator("[data-panel-record]")).toHaveCount(size);
      await expect(page.getByLabel("Selecionar pedidos")).toHaveValue(
        "propostas",
      );
      quoted.push(
        ...(await page
          .locator("[data-panel-record]")
          .evaluateAll((nodes) =>
            nodes.map((n) => n.getAttribute("data-panel-record")!),
          )),
      );
      if (size === 50) {
        await page
          .getByRole("link", { name: "Próximos registros", exact: true })
          .click();
        await expect(
          page.locator("[data-panel-record]").first(),
        ).toHaveAttribute("data-panel-record", expectedQuotes[50]);
      }
    }
    expect(quoted).toEqual(expectedQuotes);
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
      globalThis.scrollTo(0, 0);
    });
    await page.screenshot({ path: info.outputPath("propostas-paginadas.png") });
    expect(
      (
        await db
          .from("clients")
          .update({
            created_at: new Date(now.getTime() - 86400000).toISOString(),
          })
          .eq("id", priorClients[0].id)
      ).error,
    ).toBeNull();
    await page.goto("/painel");
    await expect(value("registrations")).toHaveText("1");
    await page.locator('[data-stat="registrations"]').click();
    await expect(page.locator("[data-client-id]")).toHaveCount(1);
    await expect(page.locator("[data-client-id]")).toHaveAttribute(
      "data-client-id",
      priorClients[0].id,
    );
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
      globalThis.scrollTo(0, 0);
    });
    await page.screenshot({ path: info.outputPath("clientes-filtrados.png") });
    for (const path of [
      "/painel/fila?prazo=amanha",
      "/painel/clientes?periodo=ontem",
      "/painel/pedidos?selecao=rascunhos",
      "/painel/pedidos?depois=invalido",
    ])
      expect((await page.goto(path))?.status()).toBe(404);
    for (const role of ["client", "admin"] as const) {
      const context = await browser.newContext({
        baseURL: "http://127.0.0.1:3000",
        viewport: page.viewportSize()!,
      });
      try {
        const other = await context.newPage();
        await loginAs(other, role);
        for (const path of ["/painel", "/painel/clientes", "/painel/pedidos"]) {
          await other.goto(path);
          await expect(other).toHaveURL(
            role === "admin" && path === "/painel"
              ? /\/painel$/
              : /\/acesso-negado$/,
          );
          if (role === "admin" && path === "/painel")
            await expect(
              other.getByRole("link", {
                name: "Abrir configurações",
                exact: true,
              }),
            ).toBeVisible();
          await expect(
            other.locator("[data-stat],[data-client-id],[data-panel-record]"),
          ).toHaveCount(0);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    for (const c of priorClients)
      expect(
        (
          await db
            .from("clients")
            .update({ created_at: c.created_at })
            .eq("id", c.id)
        ).error,
      ).toBeNull();
    await fixture.cleanup();
    await releaseQueue();
    await releaseSettings();
  }
});
