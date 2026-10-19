import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { calculationUpdateFixture } from "./calculation-update-helper";
import { loginAs } from "./auth-helper";
import { todayInSaoPaulo } from "@/modules/quotes/proposal";
test.setTimeout(120000);
test("atualização preserva origem, revisa rascunho e emite proposta própria pela tabela vigente", async ({
  page,
}, info) => {
  const f = await calculationUpdateFixture();
  try {
    await loginAs(page);
    await page.goto(`/app/processos/${f.sample.process_id}?aba=resumo`);
    await page
      .getByRole("link", {
        name: `Solicitar atualização · ${f.sample.order_code}`,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Solicitar atualização" }),
    ).toBeVisible();
    const missing = info.project.name === "celular";
    if (missing)
      await page.getByLabel("PJC do cálculo anterior").selectOption("missing");
    await page
      .getByRole("button", { name: "Criar pedido de atualização" })
      .click();
    await expect(page).toHaveURL(/novo-pedido\?rascunho=/);
    const orderId = new URL(page.url()).searchParams.get("rascunho")!;
    await expect(
      page.getByRole("region", { name: "Origem da atualização" }),
    ).toContainText(f.sample.order_code);
    if (missing) {
      await expect(
        page.getByRole("region", { name: "Origem da atualização" }),
      ).toContainText("PJC ausente");
      await page.getByLabel("Escolher arquivo do processo").setInputFiles({
        name: "Reenvio fictício.pjc",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("PJC fictício de reenvio; sem dados reais."),
      });
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Arquivo enviado e integridade confirmada." }),
      ).toBeVisible();
      await page
        .getByLabel("PJC enviado para esta atualização")
        .selectOption({ label: "Reenvio fictício.pjc" });
      await page.getByRole("button", { name: "Usar este PJC" }).click();
      await expect(
        page.getByRole("region", { name: "Origem da atualização" }),
      ).toContainText("Enviado para esta atualização");
    }
    for (let step = 0; step < 9; step++) {
      if (step === 1)
        await expect(
          page.getByLabel("Tipo de cálculo", { exact: true }),
        ).toHaveValue("update");
      if (step === 3) {
        await expect(page.getByLabel("Data-base do cálculo")).toHaveValue("");
        await page.getByLabel("Data-base do cálculo").fill("2026-11-01");
      }
      if (step === 7)
        await page
          .getByLabel("Data da ciência da intimação")
          .fill(todayInSaoPaulo(new Date()));
      await page
        .getByRole("button", {
          name: step === 8 ? "Conferir respostas" : "Continuar",
          exact: true,
        })
        .click();
    }
    await expect(
      page.getByRole("heading", { name: "Confira as informações" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Gerar proposta" }),
    ).toBeDisabled();
    await page
      .getByLabel(
        "Revisei todas as respostas herdadas, o PJC e a nova data-base.",
      )
      .check();
    await page.getByRole("button", { name: "Gerar proposta" }).click();
    await expect(page).toHaveURL(/app\/orcamentos\//);
    await expect(
      page.getByRole("heading", { name: "Proposta de serviço" }),
    ).toBeVisible();
    await expect(
      page.getByText("Ensaio fictício - sem valor comercial.", {
        exact: false,
      }),
    ).toBeVisible();
    const quoteId = new URL(page.url()).pathname.split("/").at(-1)!;
    const quote = (
      await f.db
        .from("quotes")
        .select("order_id,price_table_id,proposal_snapshot")
        .eq("id", quoteId)
        .single()
    ).data!;
    expect(quote.order_id).toBe(orderId);
    expect(
      (
        await f.db
          .from("quotes")
          .select("accepted_at")
          .eq("id", quoteId)
          .single()
      ).data?.accepted_at,
    ).toBeNull();
    expect(quote.price_table_id).toBe(f.price.id);
    expect(quote.proposal_snapshot.priceVersion).toBe(String(f.price.version));
    expect(
      (await f.db.from("orders").select("status").eq("id", orderId).single())
        .data,
    ).toMatchObject({ status: "quoted" });
    expect(
      (await f.db.from("payments").select("id").eq("order_id", orderId)).data,
    ).toEqual([]);
    expect(f.snapshot()).toBe(f.original);
    const directory = "../docs/evidencias/atualizacao-pjc";
    await mkdir(directory, { recursive: true });
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
      path: `${directory}/${info.project.name}-proposta.png`,
      fullPage: true,
    });
    await loginAs(page, "calculator");
    await page.goto(`/painel/processos/${f.sample.process_id}?aba=resumo`);
    await expect(
      page.getByRole("region", { name: "Origem da atualização" }),
    ).toContainText(f.sample.order_code);
    await expect(
      page
        .getByRole("region", { name: "Origem da atualização" })
        .getByRole("link", {
          name: missing ? "Reenvio fictício.pjc" : "Original fictício.pjc",
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
      path: `${directory}/${info.project.name}-andre.png`,
      fullPage: true,
    });
    await writeFile(
      `${directory}/${info.project.name}.json`,
      JSON.stringify(
        {
          viewport: page.viewportSize(),
          path: missing
            ? "ausente → upload real → vínculo → revisão → proposta"
            : "PJC guardado → revisão → proposta",
          originalPreserved: f.snapshot() === f.original,
          newQuote: true,
          inheritedPayments: 0,
          axeViolations: 0,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await f.cleanup();
  }
});
