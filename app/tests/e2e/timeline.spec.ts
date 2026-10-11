import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { loginAs } from "./auth-helper";
import { localSystem } from "./local-helper";
import { createMessageProcess, removeMessageProcess } from "./messages-helper";
test("calculista registra nota auditada e o cliente lê com filtro, sem poder editar", async ({
  page,
  browser,
}, testInfo) => {
  const process = await createMessageProcess(),
    db = localSystem();
  const own = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
      viewport: page.viewportSize()!,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    }),
    client = await own.newPage();
  try {
    await loginAs(page, "calculator");
    await page.goto(`/painel/processos/${process.id}?aba=mensagens`);
    await page
      .getByLabel("Sua mensagem")
      .fill("Mensagem fictícia antes da nota.");
    await page
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(page.locator(".message-form").getByRole("status")).toHaveText(
      "Mensagem enviada.",
    );
    await page
      .getByRole("navigation", { name: "Abas da pasta do processo" })
      .getByRole("link", { name: "Linha do tempo", exact: true })
      .click();
    await expect(page.locator(".process-timeline > li")).toContainText(
      "Mensagem enviada",
    );
    const form = page.locator(".note-form"),
      editor = form.getByLabel("Registrar nota na pasta"),
      status = form.getByRole("status"),
      id = await form.locator('input[name="requestId"]').inputValue();
    await editor.fill("\t ");
    await form
      .getByRole("button", { name: "Registrar nota", exact: true })
      .click();
    await expect(status).toHaveText("Confira os campos indicados.");
    await expect(editor).toHaveValue("\t ");
    await expect(editor).toHaveAttribute("aria-invalid", "true");
    const text =
      "Nota fictícia com <script>texto</script>\nA fonte será conferida pelo calculista.";
    await editor.fill(text);
    await form
      .getByRole("button", { name: "Registrar nota", exact: true })
      .click();
    await expect(status).toHaveText("Nota registrada.");
    await expect(editor).toHaveValue("");
    await expect(
      page.locator(".process-timeline > li").filter({ hasText: text }),
    ).toContainText("Calculista de teste");
    expect(
      (
        await db
          .from("audit_log")
          .select("id")
          .eq("target_id", id)
          .eq("action", "note_added")
      ).data,
    ).toHaveLength(1);
    await loginAs(client);
    await client.goto(`/app/processos/${process.id}?aba=historico`);
    await expect(client.locator(".note-form")).toHaveCount(0);
    await client.getByLabel("Filtrar atividade").selectOption("note_added");
    await client.getByRole("button", { name: "Filtrar", exact: true }).click();
    await expect(client).toHaveURL(/tipo=note_added/);
    await expect(client.locator(".process-timeline > li")).toHaveCount(1);
    await expect(client.locator(".process-timeline")).toContainText(text);
    await expect(client.locator(".process-timeline script")).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page: client })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await client.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await client.evaluate(() => {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await client.screenshot({
      fullPage: true,
      path: testInfo.outputPath("linha-do-tempo.png"),
    });
    await client.getByLabel("Filtrar atividade").selectOption("message_sent");
    await client.getByRole("button", { name: "Filtrar", exact: true }).click();
    await expect(client.locator(".process-timeline > li")).toHaveCount(1);
    await expect(client.locator(".process-timeline")).toContainText(
      "Mensagem enviada",
    );
  } finally {
    await own.close();
    await removeMessageProcess(process.id);
  }
});
test("filtro ocorre antes do limite e a paginação preserva o tipo e todos os empates", async ({
  page,
}) => {
  const process = await createMessageProcess(),
    db = localSystem();
  const notes = Array.from({ length: 112 }, (_, index) => ({
    id: randomUUID(),
    process_id: process.id,
    actor_id: process.authorId,
    kind: "note_added",
    data: { note: `Nota histórica fictícia ${String(index).padStart(3, "0")}` },
    created_at: "2026-01-01T12:00:00.123456+00:00",
  }));
  const uploads = Array.from({ length: 105 }, () => ({
    id: randomUUID(),
    process_id: process.id,
    actor_id: process.authorId,
    kind: "file_uploaded",
    data: {},
    created_at: "2026-01-01T12:00:00.123457+00:00",
  }));
  try {
    expect(
      (await db.from("timeline_events").insert([...notes, ...uploads])).error,
    ).toBeNull();
    await loginAs(page);
    await page.goto(`/app/processos/${process.id}?aba=historico`);
    await expect(page.locator(".process-timeline > li")).toHaveCount(100);
    await page.getByLabel("Filtrar atividade").selectOption("note_added");
    await page.getByRole("button", { name: "Filtrar", exact: true }).click();
    const rows = page.locator(".process-timeline > li");
    await expect(rows).toHaveCount(100);
    const first = await rows.locator(".preserve-lines").allTextContents();
    await page
      .getByRole("link", { name: "Ver atividades anteriores", exact: true })
      .click();
    await expect(page).toHaveURL(/tipo=note_added.*antes=/);
    await expect(rows).toHaveCount(12);
    const all = [
      ...first,
      ...(await rows.locator(".preserve-lines").allTextContents()),
    ];
    expect(new Set(all).size).toBe(112);
    expect(all.sort()).toEqual(notes.map((row) => row.data.note).sort());
    await page.getByLabel("Filtrar atividade").selectOption("file_uploaded");
    await page.getByRole("button", { name: "Filtrar", exact: true }).click();
    expect(new URL(page.url()).searchParams.has("antes")).toBe(false);
    await expect(rows).toHaveCount(100);
    await expect(page.locator(".process-timeline .preserve-lines")).toHaveCount(
      0,
    );
    await page
      .getByRole("link", { name: "Ver atividades anteriores", exact: true })
      .click();
    await expect(rows).toHaveCount(5);
    await expect(
      page.getByRole("link", {
        name: "Ver atividades anteriores",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      (
        await page.goto(
          `/app/processos/${process.id}?aba=historico&tipo=kind.eq.1`,
        )
      )?.status(),
    ).toBe(404);
    expect(
      (
        await page.goto(
          `/app/processos/${process.id}?aba=historico&antes=invalido`,
        )
      )?.status(),
    ).toBe(404);
  } finally {
    await removeMessageProcess(process.id);
  }
});
