import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function accessible(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("advogado explora solicitação, proposta e linha do tempo sem serviços reais", async ({
  page,
}) => {
  test.setTimeout(120000);
  const external: string[] = [];
  page.on("request", (req) => {
    if (
      /^https?:/.test(req.url()) &&
      !["127.0.0.1", "localhost"].includes(new URL(req.url()).hostname)
    )
      external.push(req.url());
  });
  await page.goto("/demonstracao");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Com clareza",
  );
  await accessible(page);
  await page
    .getByRole("button", { name: "Conhecer a área do advogado" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bom dia, Marina." }),
  ).toBeVisible();
  await accessible(page);
  await page
    .getByRole("button", { name: "Solicitar orçamento", exact: true })
    .last()
    .click();
  for (let i = 0; i < 8; i++) {
    await expect(page.locator(".demo-form-title .demo-eyebrow")).toHaveText(
      `Etapa ${i + 1} de 9`,
    );
    await accessible(page);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
  }
  await page.getByRole("button", { name: "Gerar orçamento fictício" }).click();
  await expect(
    page.getByRole("tab", { name: "Proposta", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".demo-proposal-total")).toContainText("650,00");
  await expect(
    page.getByRole("button", { name: "Simular aceite" }),
  ).toBeDisabled();
  await accessible(page);
  await page.getByRole("checkbox", { name: "Li a proposta fictícia" }).check();
  await page.getByRole("button", { name: "Simular aceite" }).click();
  await page.getByRole("button", { name: "Simular sinal de 50%" }).click();
  await expect(page.locator(".demo-order-heading")).toContainText(
    "Aguardando sinal",
  );
  await page.getByRole("button", { name: "Anexar documento fictício" }).click();
  await expect(page.locator(".demo-order-heading")).toContainText("Na fila");
  await page.getByRole("tab", { name: "Linha do tempo" }).click();
  await expect(page.locator(".demo-timeline")).toContainText(
    "Sinal de 50% confirmado — simulação",
  );
  await expect(page.locator(".demo-timeline .future time")).toHaveCount(0);
  await accessible(page);
  await page.getByLabel("Visão demonstrativa").selectOption("professional");
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Simular próxima etapa" }).click();
  await page.getByRole("button", { name: "Simular revisão e entrega" }).click();
  await expect(page.locator(".demo-order-heading")).toContainText(
    "Entrega disponível",
  );
  await expect(page.locator(".demo-timeline .future")).toHaveCount(0);
  await page.getByRole("tab", { name: "Mensagens" }).click();
  await page
    .getByLabel("Mensagem demonstrativa")
    .fill("Mensagem fictícia para a apresentação.");
  await page.getByRole("button", { name: "Simular envio" }).click();
  await expect(page.locator(".demo-message-list")).toContainText(
    "Mensagem fictícia para a apresentação.",
  );
  await page.reload();
  await page.getByRole("button", { name: /MAR-2026-004/ }).click();
  await expect(page.locator(".demo-order-heading")).toContainText(
    "Entrega disponível",
  );
  await page.getByRole("tab", { name: "Documentos" }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar explicação do exemplo" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "MAR-2026-004-exemplo-ficticio.txt",
  );
  await accessible(page);
  await page.getByRole("button", { name: "Calendário", exact: true }).click();
  await accessible(page);
  await page.getByRole("button", { name: "Reiniciar", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await accessible(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Reiniciar", exact: true }).click();
  await page.getByRole("button", { name: "Reiniciar exemplos" }).click();
  await expect(page.locator(".demo-order-row")).toHaveCount(3);
  expect(external).toEqual([]);
});

test("demonstração tolera armazenamento indisponível e recusa prazo insuficiente", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Armazenamento indisponível no teste");
      },
    });
  });
  await page.goto("/demonstracao");
  await page
    .getByRole("button", { name: "Conhecer a área do advogado" })
    .click();
  await page
    .getByRole("button", { name: "Solicitar orçamento", exact: true })
    .last()
    .click();
  await page
    .getByRole("navigation", { name: "Etapas do checklist" })
    .getByRole("button", { name: /Prazo/ })
    .click();
  await page.getByLabel("Prazo em dias úteis", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Gerar orçamento fictício" }).click();
  await expect(page.locator(".demo-form-error")).toContainText("não comporta");
});
