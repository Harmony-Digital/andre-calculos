import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { clientContractFixture } from "./client-contract-helper";
import { quoteSession } from "./quote-helper";
import { loginAs } from "./auth-helper";
test.setTimeout(90000);
test("André cadastra contrato após aceite e recupera resposta perdida sem repetir fila", async ({
  page,
}, testInfo) => {
  const fixture = await clientContractFixture();
  try {
    const sample = await fixture.create({ documents: true });
    expect(
      (await fixture.db.rpc("accept_quote_system", sample.args())).error,
    ).toBeNull();
    await loginAs(page, "calculator");
    await page.goto("/painel/clientes");
    const row = page.locator(`[data-client-id="${fixture.owner.id}"]`);
    await row
      .getByText("Alterar condição de contrato", { exact: true })
      .click();
    const form = row.getByRole("form");
    const button = form.getByRole("button", {
      name: "Salvar condição",
      exact: true,
    });
    await expect(button).toBeDisabled();
    await form.getByLabel("Pagamento do cliente").selectOption("yes");
    const reason =
      "Contrato fictício autorizado apenas para verificar o cadastro local.";
    await form.getByLabel("Motivo da alteração").fill(reason);
    fixture.remember(await form.locator('[name="requestId"]').inputValue());
    let dropped = false;
    await page.route("**/painel/clientes**", async (route) => {
      if (
        !dropped &&
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        dropped = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await button.click();
    await expect(form.getByRole("alert")).toContainText(
      "Sua escolha e motivo foram preservados",
    );
    await expect(form.getByLabel("Motivo da alteração")).toHaveValue(reason);
    await expect(form.getByLabel("Pagamento do cliente")).toHaveValue("yes");
    expect(dropped).toBe(true);
    const current = (
      await fixture.db
        .from("clients")
        .select("has_contract,contract_revision")
        .eq("id", fixture.owner.id)
        .single()
    ).data!;
    expect(current.has_contract).toBe(true);
    await button.click();
    await expect(form.getByRole("status")).toHaveText(
      "Condição de contrato salva.",
    );
    await expect(row.getByText(reason, { exact: false })).toBeVisible();
    await expect(form.getByLabel("Motivo da alteração")).toHaveValue("");
    expect(
      (
        await fixture.db
          .from("clients")
          .select("has_contract,contract_revision")
          .eq("id", fixture.owner.id)
          .single()
      ).data,
    ).toEqual(current);
    expect(
      (
        await fixture.db
          .from("notifications")
          .select("id")
          .eq("dedup_key", `queued:${sample.order_id}:email`)
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await fixture.db
          .from("payments")
          .select("id")
          .eq("order_id", sample.order_id)
      ).data,
    ).toEqual([]);
    await form.getByLabel("Pagamento do cliente").selectOption("no");
    await form
      .getByLabel("Motivo da alteração")
      .fill("Tentativa fictícia de retirar durante trabalho ativo.");
    await expect(button).toBeDisabled();
    await expect(row).toContainText("Há pedidos na fila ou em andamento");
    await expect(form.getByRole("status")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(testInfo.project.use.viewport!.width);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("cliente-contrato-recibo.png"),
      fullPage: true,
    });
    await loginAs(page);
    await page.goto(`/app/processos/${sample.process_id}?aba=resumo`);
    await expect(
      page.getByRole("region", { name: /^Sinal · P-/ }),
    ).toContainText("Sinal dispensado. Pagamento no final");
    await expect(page.getByText(reason, { exact: false })).toHaveCount(0);
    await page.goto("/painel/clientes");
    await expect(page).toHaveURL(/acesso-negado/);
  } finally {
    await fixture.cleanup();
  }
});
test("contrato depois do aceite comum aguarda documento e upload real libera fila", async ({
  page,
}, testInfo) => {
  const fixture = await clientContractFixture();
  try {
    const sample = await fixture.create();
    expect(
      (await fixture.db.rpc("accept_quote_system", sample.args())).error,
    ).toBeNull();
    await loginAs(page, "calculator");
    await page.goto("/painel/clientes");
    const row = page.locator(`[data-client-id="${fixture.owner.id}"]`);
    await row
      .getByText("Alterar condição de contrato", { exact: true })
      .click();
    const form = row.getByRole("form");
    await form.getByLabel("Pagamento do cliente").selectOption("yes");
    await form
      .getByLabel("Motivo da alteração")
      .fill("Contrato fictício com documento a enviar.");
    fixture.remember(await form.locator('[name="requestId"]').inputValue());
    await form.getByRole("button", { name: "Salvar condição" }).click();
    await expect(form.getByRole("status")).toHaveText(
      "Condição de contrato salva.",
    );
    await expect(form).toContainText("1 aguardando documentos");
    await loginAs(page);
    await page.goto(`/app/orcamentos/${sample.id}`);
    await expect(page.getByRole("status")).toContainText(
      "Confira a condição de pagamento",
    );
    await page.getByRole("link", { name: "Enviar documentos" }).click();
    await page.getByLabel("Escolher arquivo do processo").setInputFiles({
      name: "Processo inventado para contrato posterior.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nDocumento totalmente fictício.\n%%EOF"),
    });
    await expect(page.getByRole("status")).toContainText(
      "Arquivo enviado e integridade confirmada.",
      { timeout: 30000 },
    );
    expect(
      (
        await fixture.db
          .from("orders")
          .select("status")
          .eq("id", sample.order_id)
          .single()
      ).data!.status,
    ).toBe("queued");
    await page.goto(`/app/processos/${sample.process_id}?aba=resumo`);
    await expect(
      page.getByRole("region", { name: /^Sinal · P-/ }),
    ).toContainText("Sinal dispensado. Pagamento no final");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("cliente-contrato-pasta.png"),
      fullPage: true,
    });
  } finally {
    await fixture.cleanup();
  }
});
test("conflito preserva motivo e escolha; retirar antes da fila volta a exigir sinal", async ({
  page,
}) => {
  const fixture = await clientContractFixture();
  const calculator = await quoteSession("calculator");
  try {
    const sample = await fixture.create();
    expect(
      (await fixture.db.rpc("accept_quote_system", sample.args())).error,
    ).toBeNull();
    await loginAs(page, "calculator");
    await page.goto("/painel/clientes");
    const row = page.locator(`[data-client-id="${fixture.owner.id}"]`);
    await row
      .getByText("Alterar condição de contrato", { exact: true })
      .click();
    const form = row.getByRole("form");
    await form.getByLabel("Pagamento do cliente").selectOption("yes");
    const reason = "Motivo fictício preservado durante conflito.";
    await form.getByLabel("Motivo da alteração").fill(reason);
    fixture.remember(await form.locator('[name="requestId"]').inputValue());
    expect(
      (
        await calculator.rpc(
          "set_client_contract",
          await fixture.args({
            reason: "Outra sessão fictícia cadastrou primeiro.",
          }),
        )
      ).error,
    ).toBeNull();
    await form.getByRole("button", { name: "Salvar condição" }).click();
    await expect(form.getByRole("alert")).toContainText(
      "Recarregue para conferir",
    );
    await expect(form.getByLabel("Motivo da alteração")).toHaveValue(reason);
    await expect(form.getByLabel("Pagamento do cliente")).toHaveValue("yes");
    await page.reload();
    await row
      .getByText("Alterar condição de contrato", { exact: true })
      .click();
    await form.getByLabel("Pagamento do cliente").selectOption("no");
    await form
      .getByLabel("Motivo da alteração")
      .fill("Retirada fictícia antes de começar o trabalho.");
    fixture.remember(await form.locator('[name="requestId"]').inputValue());
    await form.getByRole("button", { name: "Salvar condição" }).click();
    await expect(form.getByRole("status")).toHaveText(
      "Condição de contrato salva.",
    );
    expect(
      (
        await fixture.db
          .from("orders")
          .select("status")
          .eq("id", sample.order_id)
          .single()
      ).data!.status,
    ).toBe("awaiting_payment");
    await loginAs(page);
    await page.goto(`/app/processos/${sample.process_id}?aba=resumo`);
    await expect(
      page.getByRole("region", { name: /^Sinal · P-/ }),
    ).toContainText("Peça os dados para pagamento");
  } finally {
    await calculator.auth.signOut({ scope: "local" });
    await fixture.cleanup();
  }
});
