import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAs } from "./auth-helper";
import { localSystem } from "./local-helper";
import { leaseQueue, queueFixture } from "./queue-helper";
import { todayInSaoPaulo } from "../../src/modules/queue/queue";
import { addBusinessDays } from "../../src/modules/deadlines/calendar";

test.setTimeout(90000);
function visibleRows(page: Page) {
  return page.locator(
    page.viewportSize()!.width < 900
      ? ".queue-mobile > li"
      : ".queue-table tbody > tr",
  );
}
test("fila mostra prazos e pagamentos, filtra situações e exige calculista", async ({
  page,
  browser,
}, info) => {
  const release = await leaseQueue(),
    today = todayInSaoPaulo(),
    yesterday = new Date(new Date(`${today}T12:00:00Z`).getTime() - 86400000)
      .toISOString()
      .slice(0, 10),
    fixture = await queueFixture([
      { status: "queued", due: yesterday },
      { status: "in_analysis", due: today },
      { status: "awaiting_client", due: addBusinessDays(today, 2) },
      { status: "in_calculation", due: addBusinessDays(today, 3) },
      { status: "in_review", due: null },
      { status: "in_adjustment", due: addBusinessDays(today, 2) },
      ...["draft", "awaiting_payment", "delivered", "cancelled"].map(
        (status) => ({ status, due: yesterday }),
      ),
    ]),
    db = localSystem();
  try {
    const payment = (
      index: number,
      amount_cents: number,
      kind = "deposit",
      status = "confirmed",
    ) => ({
      order_id: fixture.orders[index].id,
      method: "pix_manual",
      amount_cents,
      kind,
      status,
    });
    expect(
      (
        await db
          .from("payments")
          .insert([
            payment(0, 123456, "triage"),
            payment(0, 61728, "deposit", "pending"),
            payment(0, 61728, "deposit", "refunded"),
            payment(1, 20000),
            payment(1, 41728),
            payment(2, 20000),
            payment(3, 61728),
            payment(3, 61728, "balance"),
          ])
      ).error,
    ).toBeNull();
    await loginAs(page, "calculator");
    await page.goto("/painel/fila");
    const rows = visibleRows(page);
    await expect(rows).toHaveCount(6);
    const ids = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-order-id")),
    );
    expect(ids[0]).toBe(fixture.orders[0].id);
    expect(ids.at(-1)).toBe(fixture.orders[4].id);
    for (const index of [6, 7, 8, 9])
      expect(ids).not.toContain(fixture.orders[index].id);
    const own = (index: number) =>
      page.locator(
        `${page.viewportSize()!.width < 900 ? ".queue-mobile > li" : ".queue-table tbody > tr"}[data-order-id="${fixture.orders[index].id}"]`,
      );
    await expect(own(0)).toContainText("Atrasado");
    await expect(own(0)).toContainText("Sinal pendente");
    await expect(own(1)).toContainText("Vence hoje");
    await expect(own(1)).toContainText("Sinal confirmado");
    await expect(own(2)).toContainText("Próximo do prazo");
    await expect(own(2)).toContainText("Sinal parcial");
    await expect(own(3)).toContainText("No prazo");
    await expect(own(3)).toContainText("Quitado");
    await expect(own(4)).toContainText("Prazo a definir");
    await expect(own(4)).toContainText("A definir");
    await expect(own(0)).toContainText("1.234,56");
    await expect(own(0)).toContainText(
      yesterday.split("-").reverse().join("/"),
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
    await page.screenshot({
      path: info.outputPath("fila-calculista.png"),
      fullPage: true,
    });
    await own(0).getByRole("link", { name: fixture.orders[0].code }).click();
    await expect(page).toHaveURL(
      new RegExp(`/painel/processos/${fixture.process.id}\\?aba=resumo`),
    );
    await page.goto("/painel/fila");
    await page.getByLabel("Filtrar situação").selectOption("in_review");
    await page.getByRole("button", { name: "Aplicar filtro" }).click();
    await expect(visibleRows(page)).toHaveCount(1);
    await expect(visibleRows(page).first()).toHaveAttribute(
      "data-order-id",
      fixture.orders[4].id,
    );
    for (const role of ["client", "admin"] as const) {
      const context = await browser.newContext({
        baseURL: "http://127.0.0.1:3000",
        viewport: page.viewportSize()!,
      });
      try {
        const other = await context.newPage();
        await loginAs(other, role);
        await other.goto("/painel/fila");
        await expect(other).toHaveURL(/\/acesso-negado$/);
        await expect(other.locator("[data-order-id]")).toHaveCount(0);
      } finally {
        await context.close();
      }
    }
  } finally {
    await fixture.cleanup();
    await release();
  }
});

test("fila pagina datas empatadas e ausentes sem perdas; filtro vem antes do limite", async ({
  page,
}) => {
  const release = await leaseQueue(),
    fixture = await queueFixture([
      ...Array.from({ length: 55 }, () => ({
        status: "in_analysis",
        due: "2026-01-01",
      })),
      ...Array.from({ length: 49 }, () => ({
        status: "in_review",
        due: "2026-02-02",
      })),
      ...Array.from({ length: 12 }, () => ({ status: "in_review", due: null })),
    ]);
  const sort = (
    a: (typeof fixture.orders)[number],
    b: (typeof fixture.orders)[number],
  ) =>
    (a.internal_due_date ?? "9999-99-99").localeCompare(
      b.internal_due_date ?? "9999-99-99",
    ) || a.id.localeCompare(b.id);
  try {
    await loginAs(page, "calculator");
    for (const filtered of [false, true]) {
      await page.goto(`/painel/fila${filtered ? "?situacao=in_review" : ""}`);
      const found: string[] = [],
        expected = fixture.orders
          .filter((row) => !filtered || row.status === "in_review")
          .sort(sort)
          .map((row) => row.id);
      do {
        await expect(visibleRows(page).first()).toBeVisible();
        const batch = await visibleRows(page).evaluateAll((rows) =>
          rows.map((row) => row.getAttribute("data-order-id")!),
        );
        expect(batch.length).toBeLessThanOrEqual(50);
        found.push(...batch);
        const next = page.getByRole("link", {
          name: "Próximos pedidos",
          exact: true,
        });
        if (!(await next.count())) break;
        await next.click();
        await expect(visibleRows(page).first()).toHaveAttribute(
          "data-order-id",
          expected[found.length],
        );
        if (filtered)
          await expect(page.getByLabel("Filtrar situação")).toHaveValue(
            "in_review",
          );
      } while (found.length < 200);
      expect(found).toEqual(expected);
      expect(new Set(found).size).toBe(found.length);
      if (filtered) {
        await page.getByLabel("Filtrar situação").selectOption("in_analysis");
        await page.getByRole("button", { name: "Aplicar filtro" }).click();
        expect(new URL(page.url()).searchParams.has("depois")).toBe(false);
        await expect(visibleRows(page)).toHaveCount(50);
      }
    }
    for (const search of [
      "situacao=draft",
      "depois=invalido",
      `depois=2026-02-30~${fixture.orders[0].id}`,
    ]) {
      const response = await page.goto(`/painel/fila?${search}`);
      expect(response?.status()).toBe(404);
      await expect(page.locator("[data-order-id]")).toHaveCount(0);
    }
  } finally {
    await fixture.cleanup();
    await release();
  }
});
