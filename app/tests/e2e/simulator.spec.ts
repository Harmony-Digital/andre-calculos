import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { localSystem, leaseLocalSettings } from "./local-helper";
import { demoPriceTable } from "../../src/modules/demo/model";
const check = async (page: Page) => {
  expect(
    await page
      .getByRole("main")
      .getByRole("heading", { level: 1 })
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(34);
  const form = page.getByRole("form", { name: "Simular valor do serviço" });
  if (await form.count()) {
    const first = (await form.boundingBox())!,
      second = (await page
        .getByRole("region", { name: "Resultado da estimativa" })
        .boundingBox())!;
    if (page.viewportSize()!.width >= 1000)
      expect(second.x).toBeGreaterThanOrEqual(first.x + first.width + 15);
    else expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  }

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
};
async function counts() {
  const db = localSystem();
  return Promise.all(
    ["quotes", "orders", "payments"].map(async (table) => {
      const r = await db
        .from(table)
        .select("id", { count: "exact", head: true });
      expect(r.error).toBeNull();
      return r.count;
    }),
  );
}
test("estimativa anônima discrimina adicionais sem prazo, envio ou contratação", async ({
  page,
  context,
}, info) => {
  page.setDefaultTimeout(10000);
  const before = await counts(),
    posts: string[] = [],
    databaseCalls: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(new URL(r.url()).pathname);
    if (new URL(r.url()).port === "54321")
      databaseCalls.push(new URL(r.url()).pathname);
  });
  await page.goto("/demonstracao/simulador");

  await expect(page.getByRole("main")).toContainText("CRC DEMO-000000/O");
  const form = page.getByRole("form", { name: "Simular valor do serviço" }),
    result = page.getByRole("region", { name: "Resultado da estimativa" });
  await form.getByRole("button", { name: "Calcular estimativa" }).click();
  await expect(result).toContainText("R$ 350,00");
  await form.getByLabel("Quantidade de verbas", { exact: true }).fill("3");
  await expect(result).not.toContainText("R$ 350,00");
  await form.getByLabel("Período contratual (meses)").fill("40");
  await form.getByLabel("Quantidade de reclamantes").fill("2");
  await form
    .getByLabel("Cartões de ponto", { exact: true })
    .selectOption("image");
  await form.getByLabel("Meses de cartões para digitação").fill("3");
  await form.getByLabel("Há urgência?").selectOption("yes");
  await form.getByRole("button", { name: "Calcular estimativa" }).click();
  await expect(result).toContainText("R$ 1.088,10");
  await expect(result.getByRole("listitem")).toHaveCount(6);
  await expect(result).toContainText("demo-2026-v1");
  await expect(result).not.toContainText("dias úteis");
  await expect(result).toContainText(
    "não cria proposta, contratação ou cobrança",
  );
  await expect(
    result.getByRole("link", { name: "Preencher o checklist completo" }),
  ).toHaveAttribute("href", "/cadastro");
  expect(await counts()).toEqual(before);
  expect(posts).toEqual([]);
  expect(databaseCalls).toEqual([]);
  expect(
    (await context.cookies()).filter((c) => c.name.includes("-auth-token")),
  ).toEqual([]);
  await check(page);
  await page.screenshot({
    path: info.outputPath("simulador-demonstrativo.png"),
    fullPage: true,
  });
});
test("quantidades inválidas preservam campos e não deixam estimativa antiga visível", async ({
  page,
}, info) => {
  page.setDefaultTimeout(10000);
  await page.goto("/demonstracao/simulador");
  const form = page.getByRole("form", { name: "Simular valor do serviço" }),
    result = page.getByRole("region", { name: "Resultado da estimativa" }),
    wages = form.getByLabel("Quantidade de verbas", { exact: true });
  await wages.fill("1.5");
  await form.getByRole("button", { name: "Calcular estimativa" }).click();
  await expect(wages).toBeFocused();
  await expect(form).toContainText(
    "Informe a quantidade de verbas em número inteiro.",
  );
  await expect(wages).toHaveValue("1.5");
  await expect(result).not.toContainText("R$");
  await wages.fill("3");
  await form
    .getByLabel("Cartões de ponto", { exact: true })
    .selectOption("handwritten");
  const cards = form.getByLabel("Meses de cartões para digitação");
  await cards.fill("0");
  await form.getByRole("button", { name: "Calcular estimativa" }).click();
  await expect(form).toContainText(
    "Informe a quantidade de cartões para digitação.",
  );
  await expect(cards).toBeFocused();
  await cards.fill("2");
  await form.getByRole("button", { name: "Calcular estimativa" }).click();
  await expect(result).toContainText("R$ 620,00");
  await check(page);
  await page.screenshot({
    path: info.outputPath("simulador-validacao.png"),
    fullPage: true,
  });
});
test("rota comercial sem tabela ativa não inventa preço nem usa a tabela demonstrativa", async ({
  page,
}, info) => {
  page.setDefaultTimeout(10000);
  const db = localSystem(),
    release = await leaseLocalSettings();
  let activeIds: string[] = [];
  try {
    const active = await db
      .from("price_tables")
      .select("id")
      .eq("active", true);
    expect(active.error).toBeNull();
    activeIds = active.data?.map((x) => x.id) ?? [];
    expect(
      (
        await db
          .from("price_tables")
          .update({ active: false })
          .eq("active", true)
      ).error,
    ).toBeNull();
    await page.goto("/simular");
    await expect(
      page.getByRole("region", { name: "Simulador em validação" }),
    ).toBeVisible();
    await expect(
      page.getByRole("form", { name: "Simular valor do serviço" }),
    ).toHaveCount(0);
    await expect(page.getByRole("main")).not.toContainText("R$");
    await check(page);
    await page.screenshot({
      path: info.outputPath("simulador-indisponivel.png"),
      fullPage: true,
    });
  } finally {
    try {
      if (activeIds.length)
        expect(
          (
            await db
              .from("price_tables")
              .update({ active: true })
              .in("id", activeIds)
          ).error,
        ).toBeNull();
    } finally {
      await release();
    }
  }
});
test("projeção ativa e identificação fictícias exercitam a estimativa comercial sem emitir proposta", async ({
  page,
}, info) => {
  page.setDefaultTimeout(10000);
  const release = await leaseLocalSettings(),
    db = localSystem();
  let id: string | undefined,
    prior: Record<string, unknown> | null = null,
    activeIds: string[] = [];
  try {
    const cfg = await db
      .from("settings")
      .select("technical_name,crc_state,crc_number,crc_category")
      .eq("singleton", true)
      .single();
    expect(cfg.error).toBeNull();
    prior = cfg.data;
    const active = await db
        .from("price_tables")
        .select("id")
        .eq("active", true),
      latest = await db
        .from("price_tables")
        .select("version")
        .order("version", { ascending: false })
        .limit(1);
    expect(active.error).toBeNull();
    expect(latest.error).toBeNull();
    activeIds = active.data?.map((x) => x.id) ?? [];
    const { version, isExample, complexitySettings, ...parameters } =
      demoPriceTable;
    void version;
    void isExample;
    void complexitySettings;
    const created = await db
      .from("price_tables")
      .insert({
        version: (latest.data?.[0]?.version ?? 0) + 1,
        active: false,
        is_example: false,
        parameters,
      })
      .select("id,version")
      .single();
    expect(created.error).toBeNull();
    id = created.data!.id;
    expect(
      (
        await db
          .from("price_tables")
          .update({ active: false })
          .eq("active", true)
      ).error,
    ).toBeNull();
    expect(
      (
        await db
          .from("price_tables")
          .update({ active: true, activated_at: new Date().toISOString() })
          .eq("id", id)
      ).error,
    ).toBeNull();
    expect(
      (
        await db
          .from("settings")
          .update({
            technical_name: "Responsável fictício do simulador",
            crc_state: "SP",
            crc_number: "000001/O-0",
            crc_category: "Contador",
          })
          .eq("singleton", true)
      ).error,
    ).toBeNull();
    const before = await counts();
    await page.goto("/simular");
    await expect(page.getByRole("main")).toContainText("CRC SP 000001/O-0");
    const form = page.getByRole("form", { name: "Simular valor do serviço" });
    await form.getByLabel("Quantidade de verbas", { exact: true }).fill("1");
    await form.getByLabel("Período contratual (meses)").fill("36");
    await form.getByRole("button", { name: "Calcular estimativa" }).click();
    const result = page.getByRole("region", {
      name: "Resultado da estimativa",
    });
    await expect(result).toContainText("R$ 350,00");
    await expect(result).toContainText(`Tabela · ${created.data!.version}`);
    await expect(result).not.toContainText("dias úteis");
    expect(await counts()).toEqual(before);
    await check(page);
    await page.screenshot({
      path: info.outputPath("simulador-tabela-ativa.png"),
      fullPage: true,
    });
  } finally {
    try {
      if (id)
        expect(
          (await db.from("price_tables").update({ active: false }).eq("id", id))
            .error,
        ).toBeNull();
      if (activeIds.length)
        expect(
          (
            await db
              .from("price_tables")
              .update({ active: true })
              .in("id", activeIds)
          ).error,
        ).toBeNull();
      if (prior)
        expect(
          (await db.from("settings").update(prior).eq("singleton", true)).error,
        ).toBeNull();
    } finally {
      await release();
    }
  }
});
