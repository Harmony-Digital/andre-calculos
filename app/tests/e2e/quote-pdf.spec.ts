import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
  quoteFixture,
  createQuoteDraft,
  removeQuoteFixture,
} from "./quote-helper";
import { fictionalPriceParameters } from "../settings-fixture";
import { loginAs } from "./auth-helper";
test.setTimeout(90000);
test("PDF mantém seis itens e quatro mil caracteres de condições em várias páginas", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "computador",
    "A paginação do PDF independe da largura; o download é testado nos dois projetos.",
  );
  const longToken = "IDENTIFICADOR_FICTICIO_".repeat(20),
    end = "\nFIM DO ENSAIO FICTICIO.";
  const conditions =
    "Condição fictícia de serviço, sem cobrança. O documento testa paginação e preservação dos textos; não autoriza contratação.\n"
      .repeat(40)
      .slice(0, 4000 - longToken.length - end.length - 1) +
    "\n" +
    longToken +
    end;
  const fixture = await quoteFixture(conditions, {
    ...fictionalPriceParameters,
    perWage: 3333,
    perContractMonth: 101,
    perExtraClaimant: 1001,
  });
  const draft = await createQuoteDraft({
    deadlineDays: 60,
    timecardFormat: "image",
    timecardMonths: 7,
    claimants: 2,
    urgency: true,
    wageItems: [
      "overtime",
      "interval",
      "night",
      "unhealthy",
      "dangerous",
      "severance",
    ],
  });
  try {
    await loginAs(page);
    await page.goto(`/app/novo-pedido?rascunho=${draft.order_id}`);
    await page.getByRole("button", { name: "Conferir respostas" }).click();
    await page
      .getByRole("button", { name: "Gerar proposta", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/orcamentos\//);
    const quote = await fixture.db
      .from("quotes")
      .select("id,proposal_snapshot")
      .eq("order_id", draft.order_id)
      .single();
    expect(
      (quote.data!.proposal_snapshot as { items: unknown[] }).items,
    ).toHaveLength(6);
    expect(conditions.length).toBe(4000);
    const response = await page.request.get(
      `/api/quotes/${quote.data!.id}/pdf`,
    );
    expect(response.status()).toBe(200);
    await writeFile(
      testInfo.outputPath("proposta-longa.pdf"),
      await response.body(),
    );
    await writeFile(
      testInfo.outputPath("proposta-longa-qa.json"),
      JSON.stringify({ conditions, longToken }),
    );
  } finally {
    await removeQuoteFixture(draft.order_id);
    await fixture.cleanup();
  }
});
