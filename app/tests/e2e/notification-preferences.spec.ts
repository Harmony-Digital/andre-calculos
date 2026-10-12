import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { notificationFixture } from "./notification-helper";
import { createMessageProcess, removeMessageProcess } from "./messages-helper";
import { loginAs } from "./auth-helper";
test.setTimeout(90000);
test("preferências por canal preservam escolha, recusam edição antiga e controlam novos avisos", async ({
  page,
  browser,
}, info) => {
  const fixture = await notificationFixture();
  let context: BrowserContext | undefined,
    temporaryProcess: string | undefined,
    sessionClient: SupabaseClient | undefined;
  try {
    const fixtureProcess = await createMessageProcess();
    temporaryProcess = fixtureProcess.id;
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
      viewport: page.viewportSize()!,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    });
    const other = await context.newPage();
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    sessionClient = client;
    const form = (p: Page, channel: "E-mail" | "WhatsApp") =>
      p.getByRole("form", {
        name: `${channel} para Nova mensagem`,
        exact: true,
      });
    const send = async () => {
      const id = randomUUID();
      expect(
        (
          await client.rpc("send_process_message", {
            target_process: fixtureProcess.id,
            message_body: "Mensagem fictícia para preferências",
            attachments: [],
            request_id: id,
          })
        ).error,
      ).toBeNull();
      const notifications = await fixture.db
        .from("notifications")
        .select("channel,status")
        .in("dedup_key", [`message:${id}:email`, `message:${id}:whatsapp`]);
      expect(notifications.error).toBeNull();
      return { id, rows: notifications.data! };
    };
    const save = async (
      p: Page,
      channel: "E-mail" | "WhatsApp",
      value: "yes" | "no",
    ) => {
      const f = form(p, channel);
      await expect(
        f.getByRole("button", { name: "Salvar", exact: true }),
      ).toBeEnabled();
      await f.getByRole("combobox").selectOption(value);
      fixture.remember(await f.locator('input[name="requestId"]').inputValue());
      await f.getByRole("button", { name: "Salvar", exact: true }).click();
      return f;
    };
    expect(
      (
        await client.auth.signInWithPassword({
          email: "clientea@exemplo.com",
          password: process.env.ANDRE_TEST_PASSWORD!,
        })
      ).error,
    ).toBeNull();
    await loginAs(page, "calculator");
    await page.goto("/painel/configuracoes#avisos");
    await loginAs(other, "calculator");
    await other.goto("/painel/configuracoes#avisos");
    await expect(page.locator("#avisos form")).toHaveCount(20);
    const financial = page.getByRole("form", {
      name: "E-mail para Situação financeira atualizada",
      exact: true,
    });
    await financial.getByRole("combobox").selectOption("no");
    fixture.remember(
      await financial.locator('input[name="requestId"]').inputValue(),
    );
    await financial
      .getByRole("button", { name: "Salvar", exact: true })
      .click();
    await expect(financial.getByRole("status")).toHaveText(
      "Preferência salva.",
    );
    await page.reload();
    await expect(financial.getByRole("combobox")).toHaveValue("no");
    await expect(form(page, "E-mail").getByRole("combobox")).toHaveValue("yes");
    await expect(form(page, "WhatsApp").getByRole("combobox")).toHaveValue(
      "no",
    );
    const pending = await send();
    expect(pending.rows).toEqual([{ channel: "email", status: "pending" }]);
    const email = await save(page, "E-mail", "no");
    await expect(email.getByRole("status")).toHaveText("Preferência salva.");
    await expect(email.locator('input[name="revision"]')).toHaveValue("1");
    const omitted = await send();
    expect(omitted.rows).toEqual([]);
    const stale = await save(other, "E-mail", "yes");
    await expect(stale.getByRole("status")).toContainText("Recarregue");
    expect(
      (
        await fixture.db
          .from("notification_preferences")
          .select("enabled")
          .eq("profile_id", fixture.id)
          .eq("event", "new_message")
          .eq("channel", "email")
          .single()
      ).data?.enabled,
    ).toBe(false);
    await save(page, "E-mail", "yes");
    await expect(email.locator('input[name="revision"]')).toHaveValue("2");
    expect((await send()).rows).toEqual([
      { channel: "email", status: "pending" },
    ]);
    const whatsapp = form(page, "WhatsApp"),
      key = await whatsapp.locator('input[name="requestId"]').inputValue();
    let drop = true;
    await page.route("**/painel/configuracoes", async (route) => {
      if (drop && route.request().method() === "POST") {
        drop = false;
        await route.abort("failed");
      } else await route.continue();
    });
    await save(page, "WhatsApp", "yes");
    await expect(whatsapp.getByRole("status")).toContainText(
      "Não foi possível salvar",
    );
    await expect(whatsapp.getByRole("combobox")).toHaveValue("yes");
    await expect(whatsapp.locator('input[name="requestId"]')).toHaveValue(key);
    await page.unroute("**/painel/configuracoes");
    let loseReceipt = true,
      receiptDropped = false;
    await page.route("**/painel/configuracoes", async (route) => {
      if (loseReceipt && route.request().method() === "POST") {
        loseReceipt = false;
        await route.fetch();
        await route.abort("failed");
        receiptDropped = true;
      } else await route.continue();
    });
    await save(page, "WhatsApp", "yes");
    await expect.poll(() => receiptDropped).toBe(true);
    await expect(whatsapp.getByRole("status")).toContainText(
      "Não foi possível salvar",
    );
    await expect(whatsapp.locator('input[name="requestId"]')).toHaveValue(key);
    await expect
      .poll(
        async () =>
          (
            await fixture.db
              .from("notification_preferences")
              .select("enabled,revision")
              .eq("profile_id", fixture.id)
              .eq("event", "new_message")
              .eq("channel", "whatsapp")
              .single()
          ).data,
      )
      .toEqual({ enabled: true, revision: 1 });
    expect(loseReceipt).toBe(false);
    await page.unroute("**/painel/configuracoes");
    await save(page, "E-mail", "yes");
    await expect(email.locator('input[name="revision"]')).toHaveValue("3");
    await expect(whatsapp.locator('input[name="revision"]')).toHaveValue("0");
    await expect(whatsapp.locator('input[name="requestId"]')).toHaveValue(key);
    await other.reload();
    const newer = await save(other, "WhatsApp", "no");
    await expect(newer.getByRole("status")).toHaveText("Preferência salva.");
    await save(page, "WhatsApp", "yes");
    await expect(whatsapp.getByRole("status")).toContainText(
      "a preferência mudou depois. Recarregue",
    );
    expect((await send()).rows.map((r) => r.channel)).toEqual(["email"]);
    await page.reload();
    await save(page, "WhatsApp", "yes");
    await expect(whatsapp.getByRole("status")).toHaveText("Preferência salva.");
    expect((await send()).rows.map((r) => r.channel).sort()).toEqual([
      "email",
      "whatsapp",
    ]);
    expect(
      (
        await fixture.db
          .from("notifications")
          .select("channel,status")
          .eq("dedup_key", `message:${pending.id}:email`)
      ).data,
    ).toEqual(pending.rows);
    expect(
      (
        await fixture.db
          .from("notifications")
          .select("id")
          .eq("dedup_key", `message:${omitted.id}:email`)
      ).data,
    ).toEqual([]);
    await page.reload();
    await expect(form(page, "WhatsApp").getByRole("combobox")).toHaveValue(
      "yes",
    );
    await expect(form(page, "E-mail").getByRole("combobox")).toHaveValue("yes");
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
    await page
      .getByRole("heading", { name: "Preferências de aviso", exact: true })
      .click();
    const originalViewport = page.viewportSize()!;
    const sectionHeight = await page
      .locator("#avisos")
      .evaluate((node) => Math.ceil(node.getBoundingClientRect().height));
    await page.setViewportSize({
      width: originalViewport.width,
      height: Math.max(originalViewport.height, sectionHeight + 80),
    });
    await page.locator("#avisos").scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    await page
      .locator("#avisos")
      .screenshot({ path: info.outputPath("preferencias-avisos.png") });
    await page.setViewportSize(originalViewport);
    await other.getByRole("button", { name: "Sair", exact: true }).click();
    await loginAs(other, "admin");
    await other.goto("/painel/configuracoes");
    await expect(
      other.getByRole("heading", {
        name: "Preferências de aviso",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await loginAs(page, "client");
    await page.goto("/painel/configuracoes");
    await expect(page).toHaveURL(/\/acesso-negado$/);
  } finally {
    try {
      await page.unrouteAll({ behavior: "wait" });
      await context?.close();
      await sessionClient?.auth.signOut({ scope: "local" });
      if (temporaryProcess) await removeMessageProcess(temporaryProcess);
    } finally {
      await fixture.cleanup();
    }
  }
});
