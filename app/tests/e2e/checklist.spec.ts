import { test, expect } from "@playwright/test";
import { loginAs } from "./auth-helper";
import { fictionalCnj, removeLocalDraft } from "./draft-helper";
import { localSystem } from "./local-helper";
import AxeBuilder from "@axe-core/playwright";
test("salva as nove etapas, retoma rascunho e isola o cliente", async ({
  page,
  browser,
}, testInfo) => {
  const cnj = fictionalCnj();
  let draftId: string | undefined;
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  try {
    await loginAs(page);
    await page.goto("/app/novo-pedido");
    const next = () => page.getByRole("button", { name: "Continuar" }).click();
    await next();
    await expect(
      page.getByText("Informe um número CNJ trabalhista válido."),
    ).toBeVisible();
    await page.getByLabel("Número do processo").fill(cnj);
    await page.getByLabel("Vara do trabalho").fill("Vara de teste");
    await next();
    await expect(page).toHaveURL(/rascunho=/);
    draftId = new URL(page.url()).searchParams.get("rascunho")!;
    await page.reload();
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
      page.getByText("Suas respostas estão salvas.", { exact: false }),
    ).toBeVisible();
    const db = localSystem();
    const order = await db
      .from("orders")
      .select("id,code,status,total_cents,process_id")
      .eq("id", draftId!)
      .single();
    expect(order.data?.status).toBe("draft");
    expect(order.data?.total_cents).toBe(0);
    const checklist = await db
      .from("checklists")
      .select("schema_version,completed_step,revision,answers")
      .eq("order_id", draftId!)
      .single();
    expect(checklist.data?.schema_version).toBe(1);
    expect(checklist.data?.completed_step).toBe(8);
    expect(checklist.data?.revision).toBe(9);
    expect(
      (checklist.data?.answers as { instructions: string }).instructions,
    ).toBe("Cenário fictício de teste.");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("checklist-salvo.png"),
      fullPage: true,
    });
    const otherPage = await other.newPage();
    await loginAs(otherPage, "clientB");
    expect(
      (await otherPage.goto(`/app/novo-pedido?rascunho=${draftId}`))?.status(),
    ).toBe(404);
    expect(
      (
        await otherPage.goto(`/app/processos/${order.data!.process_id}`)
      )?.status(),
    ).toBe(404);
    await page.getByRole("button", { name: "Revisar respostas" }).click();
    await expect(page.getByLabel("Número do processo")).toHaveValue(cnj);
    await page.goto("/app");
    const row = page
      .getByRole("listitem")
      .filter({ hasText: order.data!.code });
    await row.getByRole("link", { name: "Continuar rascunho" }).click();
    await expect(page.getByLabel("Instruções ao André")).toHaveValue(
      "Cenário fictício de teste.",
    );
    await page.getByRole("button", { name: "Conferir respostas" }).click();
    await page.getByRole("link", { name: "Abrir pasta do processo" }).click();
    await expect(page.getByRole("heading", { name: cnj })).toBeVisible();
  } finally {
    await other.close();
    if (draftId) await removeLocalDraft(draftId);
  }
});
