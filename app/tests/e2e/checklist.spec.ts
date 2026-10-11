import { test, expect } from "@playwright/test";
import { loginAs } from "./auth-helper";
import AxeBuilder from "@axe-core/playwright";
test("preenche as nove etapas, corrige erros e confere sem persistir", async ({
  page,
}) => {
  await loginAs(page);
  await page.goto("/app/novo-pedido");
  const next = () => page.getByRole("button", { name: "Continuar" }).click();
  await next();
  await expect(
    page.getByText("Informe um número CNJ trabalhista válido."),
  ).toBeVisible();
  await page.getByLabel("Número do processo").fill("9999999-06.2026.5.10.9999");
  await page.getByLabel("Vara do trabalho").fill("Vara de teste");
  await next();
  await page
    .getByLabel("Tipo de cálculo", { exact: true })
    .selectOption("liquidation");
  await next();
  await page.getByLabel("Existe sentença").check();
  await next();
  await page.getByLabel("Data de admissão").fill("2020-02-03");
  await page.getByLabel("Data de demissão").fill("2025-04-10");
  await page.getByLabel("Data de ajuizamento").fill("2025-05-12");
  await page.getByLabel("Data-base do cálculo").fill("2026-02-02");
  await next();
  await next();
  await expect(page.getByText("Selecione ao menos uma verba.")).toBeVisible();
  await page.getByLabel("Verbas rescisórias", { exact: true }).check();
  await next();
  await page.getByLabel("Registros de jornada").selectOption("image");
  await next();
  await expect(
    page.getByText("Informe meses ou páginas de cartões para digitar."),
  ).toBeVisible();
  await page.getByLabel("Meses de cartões para digitar").fill("2");
  await next();
  await page.getByLabel("Sentença", { exact: true }).check();
  await page
    .getByLabel("Quantidade estimada de páginas do processo")
    .fill("200");
  await next();
  await page.getByLabel("Data da ciência da intimação").fill("2026-02-02");
  await next();
  await page
    .getByLabel("Instruções ao André")
    .fill("Cenário fictício de teste.");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Conferir respostas" }).click();
  await expect(
    page.getByRole("heading", { name: "Confira as informações" }),
  ).toBeVisible();
  await expect(page.getByText("Alta", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Ainda não há pedido salvo", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revisar respostas" }).click();
  await expect(page.getByLabel("Número do processo")).toHaveValue(
    "9999999-06.2026.5.10.9999",
  );
  await page.reload();
  await expect(page.getByLabel("Número do processo")).toHaveValue("");
});
