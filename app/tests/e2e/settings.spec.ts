import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginAs } from "./auth-helper";
import { localSystem, leaseLocalSettings } from "./local-helper";
import { fictionalServiceSettings } from "../settings-fixture";
test.setTimeout(90000);
test("configurações acessíveis no celular e computador; cliente recebe negação", async ({
  page,
}, testInfo) => {
  await loginAs(page, "calculator");
  await page.goto("/painel/configuracoes");
  await expect(
    page.getByRole("heading", { name: "Configurações", exact: true }),
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
  ).toBeLessThanOrEqual(testInfo.project.use.viewport!.width);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("configuracoes.png"),
    fullPage: true,
  });
  await page.screenshot({ path: testInfo.outputPath("dados-visivel.png") });
  await page
    .getByRole("heading", { name: "Janela dos lembretes de prazo" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("janela-lembretes.png") });
  await page.locator("#precos").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("precos-visivel.png") });
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await loginAs(page);
  await page.goto("/painel/configuracoes");
  await expect(page).toHaveURL(/acesso-negado/);
});
test("salva dados profissionais, ativa preços e conserva histórico", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "computador",
    "O ensaio de configurações compartilhadas é único; a interface é verificada nas duas larguras.",
  );
  const release = await leaseLocalSettings(),
    db = localSystem();
  const prior = (
    await db.from("settings").select("*").eq("singleton", true).single()
  ).data!;
  const before = (
    await db
      .from("price_tables")
      .select("id,version,active")
      .order("version", { ascending: false })
  ).data!;
  const oldActive = before.find((row) => row.active)?.id,
    created: string[] = [];
  try {
    await loginAs(page, "calculator");
    await page.goto("/painel/configuracoes");
    const form = page.getByRole("form", {
      name: "Dados e condições do serviço",
    });
    await form
      .getByLabel("Nome completo do responsável")
      .fill(fictionalServiceSettings.technicalName);
    await form
      .getByLabel("Número do CRC")
      .fill(fictionalServiceSettings.crcNumber);
    await form.getByLabel("UF do CRC").selectOption("DF");
    await form.getByLabel("Categoria profissional").selectOption("Contador");
    await form
      .getByLabel("E-mail de contato")
      .fill(fictionalServiceSettings.contactEmail);
    await form.getByLabel("Celular de contato").fill("61999999999");
    await form.getByLabel("Chave Pix").fill(fictionalServiceSettings.pixKey);
    await form
      .getByLabel("Texto de garantia")
      .fill(fictionalServiceSettings.guarantee);
    await form
      .getByLabel("Condições da proposta")
      .fill(fictionalServiceSettings.conditions);
    await form.getByLabel("Início dos lembretes").fill("08:00");
    await form.getByLabel("Fim dos lembretes").fill("20:00");
    await form.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(form.getByRole("status")).toHaveText("Configurações salvas.");
    const savedWindow = await db
      .from("settings")
      .select("deadline_window_start,deadline_window_end,notification_times")
      .eq("singleton", true)
      .single();
    expect(savedWindow.data).toMatchObject({
      deadline_window_start: "08:00:00",
      deadline_window_end: "20:00:00",
      notification_times: ["09:00", "17:00"],
    });
    await page.reload();
    await expect(form.getByLabel("Início dos lembretes")).toHaveValue("08:00");
    await expect(form.getByLabel("Fim dos lembretes")).toHaveValue("20:00");
    await page.goto("/");
    await expect(
      page.getByText(/Responsável técnico: Responsável fictício/),
    ).toContainText("CRC DF 000001/O-0");
    await page.getByText("Quais são as condições de garantia?").click();
    await expect(
      page.getByText(fictionalServiceSettings.guarantee, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(fictionalServiceSettings.pixKey, { exact: true }),
    ).toHaveCount(0);
    await page.goto("/painel/configuracoes");
    const priceForm = page.getByRole("form", { name: "Tabela de preços" });
    await priceForm
      .getByLabel("Cálculo inicial (R$)", { exact: true })
      .fill("150,01");
    await priceForm
      .getByRole("button", { name: "Salvar exemplo inativo" })
      .click();
    await expect(priceForm.getByRole("status")).toContainText(
      "exemplo inativo",
    );
    const example = (
      await db
        .from("price_tables")
        .select("id,version,active,is_example")
        .order("version", { ascending: false })
        .limit(1)
        .single()
    ).data!;
    created.push(example.id);
    expect(example.active).toBe(false);
    expect(example.is_example).toBe(true);
    await priceForm.getByLabel("Esta é uma tabela de exemplo").uncheck();
    await priceForm.getByLabel("Confirmo que o André validou").check();
    await priceForm
      .getByRole("button", { name: "Salvar e ativar nova versão" })
      .click();
    await expect(priceForm.getByRole("status")).toContainText("ativada");
    const first = (
      await db
        .from("price_tables")
        .select("id,version,active,parameters")
        .order("version", { ascending: false })
        .limit(1)
        .single()
    ).data!;
    created.push(first.id);
    expect(first.active).toBe(true);
    expect(first.parameters.base.initial).toBe(15001);
    await expect(
      priceForm.getByRole("button", { name: "Salvar exemplo inativo" }),
    ).toBeVisible();
    await priceForm
      .getByLabel("Cálculo inicial (R$)", { exact: true })
      .fill("999,99");
    await priceForm.getByLabel("Esta é uma tabela de exemplo").uncheck();
    await priceForm.getByLabel("Confirmo que o André validou").check();
    await priceForm
      .getByRole("button", { name: "Salvar e ativar nova versão" })
      .click();
    await expect(priceForm.getByRole("status")).toContainText(
      `Versão ${first.version + 1} ativada`,
    );
    const second = (
      await db
        .from("price_tables")
        .select("id,version,active")
        .order("version", { ascending: false })
        .limit(1)
        .single()
    ).data!;
    created.push(second.id);
    expect(second.active).toBe(true);
    const old = (
      await db
        .from("price_tables")
        .select("active,parameters")
        .eq("id", first.id)
        .single()
    ).data!;
    expect(old.active).toBe(false);
    expect(old.parameters.base.initial).toBe(15001);
    await page.reload();
    await expect(
      page.getByLabel("Cálculo inicial (R$)", { exact: true }),
    ).toHaveValue("999,99");
    const historical = page
      .locator("#historico details")
      .filter({ hasText: `Versão ${first.version} · Histórica` });
    await historical.locator("summary").click();
    await expect(
      historical.getByText("R$ 150,01", { exact: true }),
    ).toBeVisible();
  } finally {
    const latest =
      (
        await db
          .from("price_tables")
          .select("id")
          .gt("version", before[0]?.version ?? 0)
      ).data ?? [];
    for (const row of latest)
      if (!created.includes(row.id)) created.push(row.id);
    if (created.length)
      await db.from("price_tables").update({ active: false }).in("id", created);
    if (oldActive)
      await db
        .from("price_tables")
        .update({ active: true })
        .eq("id", oldActive);
    const { id, created_at, updated_at, ...restore } = prior;
    void created_at;
    void updated_at;
    await db.from("settings").update(restore).eq("id", id);
    await release();
  }
});
