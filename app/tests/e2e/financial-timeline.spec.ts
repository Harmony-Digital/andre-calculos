import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { loginAs } from "./auth-helper";
import { localSystem } from "./local-helper";
import { createMessageProcess, removeMessageProcess } from "./messages-helper";

test("cliente e calculista distinguem movimentos financeiros na linha do tempo", async ({
  page,
  browser,
}, info) => {
  const process = await createMessageProcess(),
    db = localSystem(),
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
      viewport: page.viewportSize()!,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    }),
    calculator = await context.newPage();
  const labels = [
    "Pagamento confirmado",
    "Estorno registrado",
    "Crédito restabelecido",
    "Pagamento em conciliação",
    "Conciliação concluída",
  ];
  try {
    expect(
      (
        await db.from("timeline_events").insert(
          ["received", "debited", "restored", "reconcile", "reconciled"].map(
            (effect) => ({
              id: randomUUID(),
              process_id: process.id,
              actor_id: null,
              kind:
                effect === "received" ? "payment_confirmed" : "payment_updated",
              data: {
                effect,
                application_id: randomUUID(),
                code: "P-TESTE",
                bodyText: "CONTEUDO_PRIVADO_FICTICIO",
                invoiceUrl: "https://example.invalid/privado",
              },
            }),
          ),
        )
      ).error,
    ).toBeNull();
    await loginAs(page);
    await page.goto(`/app/processos/${process.id}?aba=historico`);
    await loginAs(calculator, "calculator");
    await calculator.goto(`/painel/processos/${process.id}?aba=historico`);
    for (const [viewer, name] of [
      [page, "cliente"],
      [calculator, "calculista"],
    ] as const) {
      for (const label of labels)
        await expect(viewer.locator(".process-timeline")).toContainText(label);
      await expect(viewer.locator(".process-timeline")).toContainText(
        "Sistema",
      );
      await expect(viewer.locator(".process-timeline")).not.toContainText(
        "CONTEUDO_PRIVADO_FICTICIO",
      );
      await expect(viewer.locator(".process-timeline")).not.toContainText(
        "example.invalid",
      );
      await viewer
        .getByLabel("Filtrar atividade")
        .selectOption("payment_updated");
      await viewer
        .getByRole("button", { name: "Filtrar", exact: true })
        .click();
      await expect(viewer.locator(".process-timeline > li")).toHaveCount(4);
      await expect(viewer.locator(".process-timeline")).not.toContainText(
        "Pagamento confirmado",
      );
      expect(
        (
          await new AxeBuilder({ page: viewer })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await viewer.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(viewer.viewportSize()!.width);
      await viewer.screenshot({
        fullPage: true,
        path: info.outputPath(`financeiro-${name}.png`),
      });
    }
  } finally {
    await context.close();
    await removeMessageProcess(process.id);
  }
});
