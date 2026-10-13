import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { independentCleanup } from "../../src/lib/testing/independent-cleanup";
import { notificationFixture } from "./notification-helper";
import { preferenceDiagnostic } from "./preference-diagnostic-helper";

test("diagnóstico das preferências omite payload e preserva limpeza com página fechada", async ({
  browser,
}, info) => {
  const fixture = await notificationFixture();
  let context: BrowserContext | undefined;
  const key = randomUUID();
  const diagnostic = preferenceDiagnostic();
  const released: string[] = [];
  let primaryFailed = false;
  try {
    context = await browser.newContext({ viewport: info.project.use.viewport });
    const page = await context.newPage();
    await page.route("http://127.0.0.1:3000/diagnostico-ficticio", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<form aria-label='E-mail para Nova mensagem'><input type='hidden' name='revision' value='0'><input type='hidden' name='requestId'><fieldset><select><option value='no'>Desligado</option></select><button>Salvar</button></fieldset><p role='status'></p></form>",
      }),
    );
    await page.route("http://127.0.0.1:3000/painel/configuracoes", (route) =>
      route.fulfill({
        status: 200,
        body: "Resposta fictícia que não deve ser exportada",
      }),
    );
    await page.goto("http://127.0.0.1:3000/diagnostico-ficticio");
    await page.locator('input[name="requestId"]').evaluate((node, value) => {
      (node as HTMLInputElement).value = value;
    }, key);
    diagnostic.stage("controlled-diagnostic-only");
    diagnostic.begin(page, "new_message", "E-mail", key);
    await page.evaluate(async (requestId) => {
      const response = await fetch("/painel/configuracoes", {
        method: "POST",
        body: `requestId=${requestId}&contact=conteudo-privado-ficticio`,
        headers: { "x-private-example": "header-privado-ficticio" },
      });
      await response.text();
    }, key);
    const report = await diagnostic.capture(fixture, info);
    expect(report).toMatchObject({
      stage: "controlled-diagnostic-only",
      postStarted: true,
      responseStatus: 200,
      responseFinished: true,
      requestFailed: false,
      database: { receiptExists: false },
      form: {
        pending: false,
        revision: "0",
        selected: "no",
        requestIdChanged: false,
        statusEmpty: true,
        successMessage: false,
      },
    });
    for (const privateValue of [
      key,
      fixture.id,
      "conteudo-privado-ficticio",
      "header-privado-ficticio",
      "Resposta fictícia",
    ]) {
      expect(JSON.stringify(report)).not.toContain(privateValue);
    }
    await page.close();
    expect(await diagnostic.capture(fixture, info)).toMatchObject({
      pageClosed: true,
      database: { receiptExists: false },
    });
    await independentCleanup(
      [
        {
          name: "routes",
          run: async () => {
            await page.unrouteAll({ behavior: "wait" });
          },
        },
        {
          name: "context",
          run: async () => {
            await context?.close();
            released.push("context");
          },
        },
        {
          name: "remaining-resource",
          run: async () => {
            released.push("remaining-resource");
          },
        },
      ],
      true,
      () => {},
    );
    expect(released).toEqual(["context", "remaining-resource"]);
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    await independentCleanup(
      [
        {
          name: "context",
          run: async () => {
            await context?.close();
          },
        },
        { name: "fixture", run: () => fixture.cleanup() },
      ],
      primaryFailed,
      (failed) =>
        console.info(
          JSON.stringify({ diagnostic: "controlled_cleanup", failed }),
        ),
    );
  }
});
