import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { loginAs } from "./auth-helper";
import { localSystem } from "./local-helper";
import { createMessageProcess, removeMessageProcess } from "./messages-helper";
import { pdfFixture } from "./pdf-helper";

test("cliente e calculista conversam com anexo privado, nomes e texto preservado após falha", async ({
  page,
  browser,
  context,
}, testInfo) => {
  test.setTimeout(90000);
  const process = await createMessageProcess(),
    db = localSystem(),
    name = `anexo-mensagem-ficticio-${randomUUID()}.pdf`;
  const calculator = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: page.viewportSize()!,
  });
  const replyPage = await calculator.newPage(),
    body =
      'Texto fictício com <img src="https://nao-usar.invalid/exemplo">\nSegunda linha privada.';
  const unexpected: string[] = [];
  for (const source of [page, replyPage])
    source.on("request", (request) => {
      if (new URL(request.url()).hostname.endsWith(".invalid"))
        unexpected.push("externa");
    });
  try {
    await loginAs(page);
    await page.goto(`/app/processos/${process.id}?aba=mensagens`);
    const form = page.locator(".message-form"),
      editor = form.getByLabel("Sua mensagem"),
      status = form.getByRole("status");
    const originalRequest = await form
      .locator('input[name="requestId"]')
      .inputValue();
    await editor.fill(body);
    await page.getByText("Adicionar novo anexo", { exact: true }).click();
    await expect(page.getByLabel("Pasta de destino")).toHaveCount(0);
    const uploader = page.getByRole("region", {
      name: "Enviar anexo da mensagem",
    });
    await uploader.getByLabel("Escolher arquivo do processo").setInputFiles({
      name,
      mimeType: "application/pdf",
      buffer: await readFile(pdfFixture),
    });
    await expect(uploader.getByRole("status")).toContainText(
      "Arquivo enviado e integridade confirmada.",
      { timeout: 60000 },
    );
    await expect(form.getByLabel(name)).toBeVisible();
    await expect(editor).toHaveValue(body);
    await expect(form.locator('input[name="requestId"]')).toHaveValue(
      originalRequest,
    );
    await form.getByLabel(name).check();
    const file = await db
      .from("files")
      .select("id,folder")
      .eq("process_id", process.id)
      .eq("name", name)
      .single();
    expect(file.error).toBeNull();
    expect(file.data!.folder).toBe("client");
    // Simula um anexo que perdeu a confirmação antes do primeiro envio.
    expect(
      (
        await db
          .from("files")
          .update({ upload_status: "pending" })
          .eq("id", file.data!.id)
      ).error,
    ).toBeNull();
    await form
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(status).toContainText("Não foi possível enviar.");
    await expect(editor).toHaveValue(body);
    await expect(form.locator('input[name="requestId"]')).toHaveValue(
      originalRequest,
    );
    expect(
      (await db.from("messages").select("id").eq("process_id", process.id))
        .data,
    ).toEqual([]);
    expect(
      (
        await db
          .from("files")
          .update({ upload_status: "uploaded" })
          .eq("id", file.data!.id)
      ).error,
    ).toBeNull();
    await form
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(status).toHaveText("Mensagem enviada.");
    await expect(editor).toHaveValue("");
    await expect(form.getByLabel(name)).not.toBeChecked();
    const row = page.locator(".process-records > li").filter({ hasText: body });
    await expect(row).toContainText("Cliente A de teste");
    await expect(row.locator("img")).toHaveCount(0);
    await expect(row.getByRole("link", { name, exact: true })).toBeVisible();
    const nextRequest = await form
      .locator('input[name="requestId"]')
      .inputValue();
    expect(nextRequest).not.toBe(originalRequest);
    const followup = "Segunda mensagem fictícia, após erro de validação.";
    await editor.fill(followup);
    await form
      .locator('input[name="requestId"]')
      .evaluate((element: HTMLInputElement) => {
        element.value = "identificador-invalido";
      });
    await form
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(status).toHaveText("Confira os campos indicados.");
    await expect(editor).toHaveValue(followup);
    await expect(form.locator('input[name="requestId"]')).toHaveValue(
      nextRequest,
    );
    await form
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(status).toHaveText("Mensagem enviada.");
    await expect(
      page.locator(".process-records > li").filter({ hasText: followup }),
    ).toHaveCount(1);
    await loginAs(replyPage, "calculator");
    await replyPage.goto(`/painel/processos/${process.id}?aba=mensagens`);
    await expect(
      replyPage.locator(".process-records > li").filter({ hasText: body }),
    ).toContainText("Cliente A de teste");
    await replyPage
      .getByLabel("Sua mensagem")
      .fill("Resposta fictícia do calculista: documento recebido.");
    await replyPage
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(
      replyPage.locator(".message-form").getByRole("status"),
    ).toHaveText("Mensagem enviada.");
    await page.reload();
    await expect(
      page
        .locator(".process-records > li")
        .filter({ hasText: "Resposta fictícia do calculista:" }),
    ).toContainText("Calculista de teste");
    expect(unexpected).toEqual([]);
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
    await editor.focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("conversa-privada.png"),
    });
    const download = await context.request.get(
      `/api/files/${file.data!.id}/download`,
    );
    expect(download.status()).toBe(200);
    expect(await download.body()).toEqual(await readFile(pdfFixture));
    const storedMessages = await db
      .from("messages")
      .select("id,body,attachment_ids")
      .eq("process_id", process.id);
    expect(storedMessages.data).toHaveLength(3);
    expect(
      storedMessages.data!.find((row) => row.id === originalRequest)
        ?.attachment_ids,
    ).toEqual([file.data!.id]);
    expect(
      storedMessages.data!.some(
        (row) => row.id === nextRequest && row.body === followup,
      ),
    ).toBe(true);
    const notices = await db
      .from("notifications")
      .select("data,status")
      .contains("data", { process_id: process.id });
    expect(notices.data!.length).toBeGreaterThan(0);
    for (const notice of notices.data!) {
      expect(Object.keys(notice.data).sort()).toEqual([
        "message_id",
        "process_id",
      ]);
      expect(notice.status).toBe("pending");
    }
    await context.clearCookies();
    await loginAs(page, "clientB");
    expect(
      (await page.goto(`/app/processos/${process.id}?aba=mensagens`))?.status(),
    ).toBe(404);
    expect(
      (
        await context.request.get(`/api/files/${file.data!.id}/download`)
      ).status(),
    ).toBe(404);
    await context.clearCookies();
    await loginAs(page, "admin");
    expect(
      (
        await page.goto(`/painel/processos/${process.id}?aba=mensagens`)
      )?.status(),
    ).toBe(404);
  } finally {
    await calculator.close();
    await removeMessageProcess(process.id);
  }
});

test("histórico paginado preserva mensagens no mesmo milissegundo e em empate exato", async ({
  page,
}) => {
  const process = await createMessageProcess(),
    db = localSystem();
  const messages = Array.from({ length: 112 }, (_, index) => ({
    id: randomUUID(),
    process_id: process.id,
    author_id: process.authorId,
    body: `Mensagem histórica fictícia ${String(index).padStart(3, "0")}`,
    created_at: `2026-01-01T12:00:00.123${index < 60 ? "456" : String(397 + index)}+00:00`,
  }));
  try {
    expect((await db.from("messages").insert(messages)).error).toBeNull();
    await loginAs(page);
    await page.goto(`/app/processos/${process.id}?aba=mensagens`);
    const seen: string[] = [];
    for (const expected of [50, 50, 12]) {
      const rows = page.locator(".process-records > li");
      await expect(rows).toHaveCount(expected);
      seen.push(...(await rows.locator("p").allTextContents()));
      const older = page.getByRole("link", {
        name: "Ver mensagens anteriores",
        exact: true,
      });
      if (seen.length < 112) {
        await older.click();
        await expect(page.getByLabel("Sua mensagem")).toHaveCount(0);
      } else await expect(older).toHaveCount(0);
    }
    expect(new Set(seen).size).toBe(112);
    expect([...seen].sort()).toEqual(messages.map((row) => row.body).sort());
    await page
      .getByRole("link", { name: "Voltar às mensagens recentes", exact: true })
      .click();
    await expect(page.getByLabel("Sua mensagem")).toBeVisible();
    await expect(page.locator(".process-records > li")).toHaveCount(50);
    expect(
      (
        await page.goto(
          `/app/processos/${process.id}?aba=mensagens&antes=cursor-invalido`,
        )
      )?.status(),
    ).toBe(404);
  } finally {
    await removeMessageProcess(process.id);
  }
});

test("resposta perdida após gravação pode ser reenviada sem duplicar a mensagem", async ({
  page,
}) => {
  const process = await createMessageProcess(),
    db = localSystem();
  try {
    await loginAs(page);
    await page.goto(`/app/processos/${process.id}?aba=mensagens`);
    const form = page.locator(".message-form"),
      editor = form.getByLabel("Sua mensagem");
    const requestId = await form
      .locator('input[name="requestId"]')
      .inputValue();
    const body = "Mensagem fictícia cuja resposta será interrompida.";
    let interrupted = false;
    await page.route("**/app/processos/**", async (route) => {
      if (
        !interrupted &&
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        interrupted = true;
        // O servidor termina a transação, mas a resposta não chega ao navegador.
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await editor.fill(body);
    await form
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(form.getByRole("status")).toContainText(
      "Seu texto foi preservado",
    );
    expect(interrupted).toBe(true);
    expect(
      (await db.from("messages").select("id").eq("id", requestId)).data,
    ).toEqual([{ id: requestId }]);
    await expect(editor).toHaveValue(body);
    await expect(form.locator('input[name="requestId"]')).toHaveValue(
      requestId,
    );
    await form
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(form.getByRole("status")).toHaveText("Mensagem enviada.");
    await expect(
      page.locator(".process-records > li").filter({ hasText: body }),
    ).toHaveCount(1);
    expect(
      (
        await db
          .from("audit_log")
          .select("id")
          .eq("target_id", requestId)
          .eq("action", "message_sent")
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await db
          .from("timeline_events")
          .select("id")
          .eq("process_id", process.id)
          .eq("kind", "message_sent")
      ).data,
    ).toHaveLength(1);
  } finally {
    await removeMessageProcess(process.id);
  }
});
