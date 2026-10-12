import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { paymentObligationFixture } from "./payment-obligation-helper";
import { quoteSession } from "./quote-helper";
import { loginAs } from "./auth-helper";
import { randomUUID } from "node:crypto";
test.setTimeout(90000);
test("reserva informa bloqueio de Pix e contrato preservando a tentativa", async ({
  page,
}, testInfo) => {
  const fixture = await paymentObligationFixture();
  let calculator: Awaited<ReturnType<typeof quoteSession>> | undefined;
  try {
    calculator = await quoteSession("calculator");
    const sample = await fixture.create();
    const context = await fixture.prepare(sample, calculator);
    expect(
      (
        await calculator.rpc("reserve_payment_intent", {
          target_context: context.id,
          request_id: randomUUID(),
        })
      ).error,
    ).toBeNull();
    await loginAs(page, "calculator");
    await page.goto(`/painel/processos/${sample.process_id}?aba=resumo`);
    const card = page.getByRole("region", { name: /^Sinal · P-/ });
    const confirm = card.getByRole("button", {
      name: "Confirmar sinal recebido",
    });
    await confirm.click();
    await expect(card.getByRole("alert")).toContainText(
      "Há uma cobrança pendente de resolução neste pedido",
    );
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(card.getByRole("alert")).toContainText(
      "Confira a cobrança antes de registrar outro recebimento",
    );
    expect(
      (
        await fixture.db
          .from("payments")
          .select("id")
          .eq("order_id", sample.order_id)
      ).data,
    ).toEqual([]);
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
    await page.screenshot({
      path: testInfo.outputPath("reserva-pix-bloqueado.png"),
      fullPage: true,
    });
    await page.goto("/painel/clientes");
    const row = page.locator(`[data-client-id="${fixture.owner.id}"]`);
    await row
      .getByText("Alterar condição de contrato", { exact: true })
      .click();
    const form = row.getByRole("form");
    await form.getByLabel("Pagamento do cliente").selectOption("yes");
    const reason = "Contrato fictício preservado enquanto há cobrança.";
    await form.getByLabel("Motivo da alteração").fill(reason);
    const requestId = await form.locator('[name="requestId"]').inputValue();
    const revision = await form.locator('[name="revision"]').inputValue();
    await form.getByRole("button", { name: "Salvar condição" }).click();
    await expect(form.getByRole("alert")).toContainText(
      "Há uma cobrança pendente de resolução para este cliente",
    );
    await expect(form.getByLabel("Motivo da alteração")).toHaveValue(reason);
    await expect(form.getByLabel("Pagamento do cliente")).toHaveValue("yes");
    await expect(form.locator('[name="requestId"]')).toHaveValue(requestId);
    await expect(form.locator('[name="revision"]')).toHaveValue(revision);
    expect(
      (
        await fixture.db
          .from("clients")
          .select("has_contract,contract_revision")
          .eq("id", fixture.owner.id)
          .single()
      ).data,
    ).toEqual({ has_contract: false, contract_revision: Number(revision) });
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
    await page.screenshot({
      path: testInfo.outputPath("reserva-contrato-bloqueado.png"),
      fullPage: true,
    });
  } finally {
    try {
      await calculator?.auth.signOut({ scope: "local" });
    } finally {
      await fixture.cleanup();
    }
  }
});
