import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { loginAs } from "./auth-helper";
import { localSystem } from "./local-helper";
import { leaseQueue } from "./queue-helper";
import { createDeliveryFixture, deliveryProfessional } from "./delivery-helper";

test("entregas paginadas preservam empates e microssegundos, com retorno ao início", async ({
  page,
}, info) => {
  page.setDefaultTimeout(10000);
  const releaseQueue = await leaseQueue(),
    fixture = await createDeliveryFixture(false),
    db = localSystem();
  try {
    const actor = (
      await db.from("profiles").select("id").eq("role", "calculator").single()
    ).data!;
    // Apenas registros fictícios para ensaiar ordenação; nenhum byte ou assinatura.
    const rows = Array.from({ length: 61 }, (_, i) => ({
      id: randomUUID(),
      process_id: fixture.process.id,
      order_id: fixture.order.id,
      confirmed_by: actor.id,
      pje_version: "2.13.1",
      index_month: "2026-10",
      checklist: { liquidated: true, taxIdPresent: true, reviewed: true },
      professional: {
        name: deliveryProfessional.technical_name,
        crcNumber: deliveryProfessional.crc_number,
        crcState: deliveryProfessional.crc_state,
        crcCategory: deliveryProfessional.crc_category,
      },
      payload: {},
      created_at:
        i < 55 ? "2026-10-11T12:00:00.123456Z" : "2026-10-11T12:00:00.123455Z",
    }));
    expect((await db.from("deliveries").insert(rows)).error).toBeNull();
    const expected = [...rows]
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            b.id.localeCompare(a.id),
        )
        .map((r) => r.id),
      base = `/app/processos/${fixture.process.id}?aba=resumo`,
      records = page.locator("[data-delivery-id]");
    expect(
      (
        await db
          .from("orders")
          .update({ status: "delivered", total_cents: 123456 })
          .eq("id", fixture.order.id)
      ).error,
    ).toBeNull();
    expect(
      (
        await db.from("delivery_releases").insert(
          expected.map((id, i) => ({
            delivery_id: id,
            policy: i === 0 ? "before_balance" : "after_balance",
            approved_by: actor.id,
          })),
        )
      ).error,
    ).toBeNull();
    await loginAs(page, "client");
    await page.goto(base);
    const found: string[] = [];
    for (let batch = 0; batch < 2; batch++) {
      await expect(records).toHaveCount(batch === 0 ? 50 : 11);
      await expect(records.first()).toHaveAttribute(
        "data-delivery-id",
        expected[found.length],
      );
      await expect(page.locator(".delivery-payment")).toHaveCount(1);
      await expect(page.locator(".delivery-payment")).toContainText(
        "Saldo em conciliação",
      );
      await expect(page.locator(".delivery-payment")).not.toContainText(
        "Chave Pix:",
      );
      await expect(
        page.locator(
          `[data-delivery-id="${expected[batch === 0 ? 1 : 50]}"] .delivery-payment`,
        ),
      ).toHaveCount(1);
      if (batch === 0) {
        await expect(records.first()).toContainText(
          "Arquivos liberados para download.",
        );
        await expect(records.first().locator(".delivery-payment")).toHaveCount(
          0,
        );
      }
      found.push(
        ...(await records.evaluateAll((items) =>
          items.map((item) => item.getAttribute("data-delivery-id")!),
        )),
      );
      if (batch === 0)
        await page
          .getByRole("link", { name: "Entregas anteriores", exact: true })
          .click();
    }
    expect(found).toEqual(expected);
    expect(new Set(found).size).toBe(61);
    await expect(
      page.getByRole("link", { name: "Entregas anteriores", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: "Voltar às entregas recentes",
        exact: true,
      }),
    ).toBeVisible();
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
      path: info.outputPath("historico-paginado-conciliacao.png"),
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Voltar às entregas recentes", exact: true })
      .click();
    await expect(records).toHaveCount(50);
    await expect(records.first()).toHaveAttribute(
      "data-delivery-id",
      expected[0],
    );
    expect((await page.goto(`${base}&antes=invalido`))?.status()).toBe(404);
    await page.goto(
      `${base}&antes=${encodeURIComponent(`1900-01-01T00:00:00Z~${randomUUID()}`)}`,
    );
    await expect(records).toHaveCount(0);
    await expect(
      page.getByText("Nenhuma entrega anterior neste processo.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Voltar às entregas recentes", exact: true })
      .click();
    await expect(records).toHaveCount(50);
    await loginAs(page, "calculator");
    await page.goto(`/painel/processos/${fixture.process.id}?aba=resumo`);
    await expect(records).toHaveCount(50);
    await page
      .getByRole("link", { name: "Entregas anteriores", exact: true })
      .click();
    await expect(records).toHaveCount(11);
    await expect(records.first()).toHaveAttribute(
      "data-delivery-id",
      expected[50],
    );
  } finally {
    try {
      await fixture.cleanup();
    } finally {
      await releaseQueue();
    }
  }
});
