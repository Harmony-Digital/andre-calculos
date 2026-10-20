import {
  test,
  expect,
  type Page,
  type TestInfo,
  type BrowserContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loginAs } from "./auth-helper";
import { confirmMailpit, mailpitMessageIds } from "./local-helper";
import { fullJourneyFixture } from "./full-journey-helper";
import { fictionalCnj } from "./draft-helper";
import { pdfFixture } from "./pdf-helper";
import { todayInSaoPaulo } from "@/modules/quotes/proposal";
import {
  operationLabels,
  type OperationalEvent,
} from "@/modules/orders/operations";
import {
  orderStateLabels,
  type OrderState,
} from "@/modules/orders/state-machine";

test.setTimeout(180000);
async function accessible(page: Page, info: TestInfo, name: string) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(info.project.use.viewport!.width);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
  });
}

test("mesmo cliente e pedido: cadastro até download, com fronteiras sintéticas explícitas", async ({
  page,
  request,
  browser,
}, info) => {
  const fixture = await fullJourneyFixture(),
    db = fixture.db,
    name = "Advogado inteiramente fictício da jornada",
    processNumber = fictionalCnj();
  let calculatorContext: BrowserContext | undefined;
  let orderId = "",
    processId = "",
    actor = "";
  try {
    calculatorContext = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
      viewport: info.project.use.viewport,
      isMobile: info.project.use.isMobile,
      hasTouch: info.project.use.hasTouch,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    });
    const calc = await calculatorContext.newPage(),
      pdf = await readFile(pdfFixture);
    async function operate(
      event: OperationalEvent,
      target: OrderState,
      reason = "",
    ) {
      await calc.goto(`/painel/processos/${processId}?aba=resumo`);
      const form = calc.getByRole("form", { name: /Etapas do pedido/ });
      await form.getByLabel("Próxima etapa").selectOption(event);
      await form.getByLabel("Motivo ou informação para o cliente").fill(reason);
      await form
        .getByRole("button", { name: "Registrar etapa", exact: true })
        .click();
      await expect(form.getByRole("status")).toContainText("Etapa registrada");
      await expect
        .poll(async () => (await fixture.ownedOrder(orderId)).status)
        .toBe(target);
      await page.goto(`/app/processos/${processId}?aba=resumo`);
      await expect(page.locator(".process-records > li").first()).toContainText(
        orderStateLabels[target],
      );
      await expect(
        page.getByRole("form", { name: /Etapas do pedido/ }),
      ).toHaveCount(0);
      if (target !== "in_review")
        await expect(
          calc.getByRole("form", { name: /Confirmar entrega/ }),
        ).toHaveCount(0);
      expect(operationLabels[event]).toBeTruthy();
    }
    page.setDefaultTimeout(10000);
    calc.setDefaultTimeout(10000);
    await test.step("cadastro real na UI e confirmação no Mailpit local", async () => {
      expect(
        (
          await db
            .from("settings")
            .update({
              approved_terms_version: null,
              approved_privacy_version: null,
              delivery_release_policy: null,
              pix_key: "pix-ficticio-jornada@exemplo.com",
            })
            .eq("singleton", true)
        ).error,
      ).toBeNull();
      await page.goto("/cadastro");
      await expect(
        page.getByRole("button", { name: "Criar minha conta" }),
      ).toBeDisabled();
      expect(
        (
          await db
            .from("settings")
            .update({
              approved_terms_version: fixture.registrationTerms,
              approved_privacy_version: fixture.registrationPrivacy,
            })
            .eq("singleton", true)
        ).error,
      ).toBeNull();
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Criar minha conta" }),
      ).toBeEnabled();
      await accessible(page, info, "01-cadastro");
      await page.getByLabel("Nome completo", { exact: true }).fill(name);
      await page.getByLabel("E-mail", { exact: true }).fill(fixture.email);
      await page.getByLabel("Celular com DDD").fill("61999999999");
      await page
        .getByLabel("Escritório ou empresa")
        .fill("Empresa fictícia da jornada");
      await page.getByLabel("Cidade", { exact: true }).fill("Cidade fictícia");
      await page.getByLabel("Tipo de cadastro").selectOption("company");
      await page.getByLabel("CPF ou CNPJ").fill("12.ABC.345/01DE-35");
      await page.getByLabel("Número da OAB").fill("123A");
      await page.getByLabel("UF da OAB").selectOption("DF");
      await page
        .getByLabel("Senha", { exact: true })
        .fill(process.env.ANDRE_TEST_PASSWORD!);
      await page
        .getByLabel("Confirme a senha", { exact: true })
        .fill(process.env.ANDRE_TEST_PASSWORD!);
      await page.getByLabel("Li e aceito").check();
      const previousEmails = await mailpitMessageIds(fixture.email, request);
      await page.getByRole("button", { name: "Criar minha conta" }).click();
      await expect(page.getByRole("status")).toContainText(
        "Confira seu e-mail e confirme o cadastro",
      );
      actor = (await fixture.identity())!;
      expect(actor).toBeTruthy();
      await confirmMailpit(fixture.email, page, request, previousEmails);
      await expect.poll(() => new URL(page.url()).pathname).toBe("/app");
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      const consents = await db
        .from("consents")
        .select("version")
        .eq("profile_id", actor);
      expect(consents.error).toBeNull();
      expect(consents.data!.map((row) => row.version).sort()).toEqual(
        [fixture.registrationPrivacy, fixture.registrationTerms].sort(),
      );
      await loginAs(calc, "calculator");
    });

    await test.step("checklist de nove passos cria o único processo e pedido", async () => {
      await page.goto("/app/novo-pedido");
      const next = () =>
        page.getByRole("button", { name: "Continuar", exact: true }).click();
      await page.getByLabel("Número do processo").fill(processNumber);
      await page
        .getByLabel("Vara do trabalho")
        .fill("Vara fictícia da jornada");
      await next();
      await expect(page).toHaveURL(/\?rascunho=[0-9a-f-]+/);
      orderId = new URL(page.url()).searchParams.get("rascunho")!;
      expect(orderId).toBeTruthy();
      await page.reload();
      await page
        .getByLabel("Tipo de cálculo", { exact: true })
        .selectOption("liquidation");
      await next();
      await page.getByLabel("Existe sentença").check();
      await next();
      for (const [label, value] of [
        ["Data de admissão", "2020-02-03"],
        ["Data de demissão", "2025-04-10"],
        ["Data de ajuizamento", "2025-05-12"],
        ["Data-base do cálculo", todayInSaoPaulo(new Date())],
      ])
        await page.getByLabel(label, { exact: true }).fill(value);
      await next();
      await page.getByLabel("Verbas rescisórias", { exact: true }).check();
      await next();
      await page.getByLabel("Registros de jornada").selectOption("none");
      await next();
      await page.getByLabel("Sentença", { exact: true }).check();
      await page
        .getByLabel("Quantidade estimada de páginas do processo")
        .fill("200");
      await next();
      await page
        .getByLabel("Data da ciência da intimação")
        .fill(todayInSaoPaulo(new Date()));
      await page.getByLabel("Tipo de ato").selectOption("other");
      await page.getByLabel("Dias úteis para outro ato").fill("30");
      await next();
      await page
        .getByLabel("Instruções ao André")
        .fill("Jornada inteiramente fictícia, sem processo ou cobrança real.");
      await page.getByRole("button", { name: "Conferir respostas" }).click();
      await expect(
        page.getByRole("heading", { name: "Confira as informações" }),
      ).toBeVisible();
      const order = await fixture.ownedOrder(orderId);
      processId = order.process_id;
      expect(order.actor).toBe(actor);
      expect(order.status).toBe("draft");
      expect(
        (await db.from("orders").select("id").eq("client_id", order.client_id))
          .data,
      ).toHaveLength(1);
      const actions = page.locator(".checklist-summary-actions"),
        panel = page.locator(".panel").filter({ has: actions }),
        bounds = await panel.boundingBox();
      expect(bounds).not.toBeNull();
      for (const action of await actions.locator("button, a").all()) {
        await expect(action).toBeVisible();
        const box = await action.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(
          bounds!.x + bounds!.width,
        );
      }
      await accessible(page, info, "02-checklist");
    });

    await test.step("proposta simulada da UI mantém contratação bloqueada", async () => {
      await page
        .getByRole("button", { name: "Gerar proposta", exact: true })
        .click();
      await expect(page).toHaveURL(/\/app\/orcamentos\/[0-9a-f-]+$/);
      await expect(
        page.getByText("Ensaio fictício - sem valor comercial.", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Aceitar", exact: true }),
      ).toBeDisabled();
      const simulation = await db
        .from("quotes")
        .select("id,is_simulation,accepted_at,number")
        .eq("order_id", orderId)
        .single();
      expect(simulation.error).toBeNull();
      expect(simulation.data!.is_simulation).toBe(true);
      expect(simulation.data!.accepted_at).toBeNull();
      expect(
        (await db.from("payments").select("id").eq("order_id", orderId)).data,
      ).toEqual([]);
      expect((await fixture.ownedOrder(orderId)).status).toBe("quoted");
      const response = await page.request.get(
        `/api/quotes/${simulation.data!.id}/pdf`,
      );
      expect(response.status()).toBe(200);
      expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
      await calc.goto(`/painel/processos/${processId}?aba=resumo`);
      const simulationLink = calc.getByRole("link", {
        name: simulation.data!.number,
        exact: false,
      });
      await expect(simulationLink).toHaveAttribute(
        "href",
        `/painel/orcamentos/${simulation.data!.id}`,
      );
      await expect(simulationLink).toContainText("Versão 1");
      await expect(simulationLink).toContainText("Vigente");
      await expect(simulationLink).toContainText("Ensaio fictício");
      await simulationLink.click();
      await expect(calc).toHaveURL(
        new RegExp(`/painel/orcamentos/${simulation.data!.id}$`),
      );
      await accessible(page, info, "03-proposta-simulada");
    });

    let quoteId = "";
    await test.step("FRONTEIRA SINTÉTICA: contexto contratual local no mesmo pedido", async () => {
      // M2.12 depende de insumos reais. Esta preparação não verifica seu produtor.
      const sample = await fixture.prepareContract(orderId);
      quoteId = sample.id;
      expect(sample.process_id).toBe(processId);
      expect(sample.actor).toBe(actor);
    });
    await test.step("cliente aceita pela UI; André lê o mesmo recibo", async () => {
      await page.goto(`/app/processos/${processId}?aba=resumo`);
      await page.locator(`a[href="/app/orcamentos/${quoteId}"]`).click();
      await page
        .getByText(`Termos de serviço · ${fixture.terms}`, { exact: true })
        .click();
      await page
        .getByText(`Informação de privacidade · ${fixture.privacy}`, {
          exact: true,
        })
        .click();
      await expect(
        page.getByText(/Termos fictícios exclusivos da jornada/),
      ).toBeVisible();
      const form = page.getByRole("form", { name: "Aceite da proposta" });
      await form.getByRole("checkbox").check();
      await accessible(page, info, "04-aceite");
      await form.getByRole("button", { name: "Aceitar", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Contratação registrada" }),
      ).toBeVisible();
      const quote = await db
        .from("quotes")
        .select("accepted_at,accepted_by")
        .eq("id", quoteId)
        .single();
      expect(quote.error).toBeNull();
      expect(quote.data!.accepted_by).toBe(actor);
      expect(quote.data!.accepted_at).not.toBeNull();
      expect((await fixture.ownedOrder(orderId)).status).toBe(
        "awaiting_payment",
      );
      await calc.goto(`/painel/orcamentos/${quoteId}`);
      await expect(
        calc.getByRole("heading", { name: "Contratação registrada" }),
      ).toBeVisible();
    });

    await test.step("sinal confirmado pelo André ainda exige documento para fila", async () => {
      await page.goto(`/app/processos/${processId}?aba=resumo`);
      await expect(
        page.getByRole("region", { name: /^Sinal · P-/ }),
      ).toContainText("pix-ficticio-jornada@exemplo.com");
      await calc.goto(`/painel/processos/${processId}?aba=resumo`);
      await calc
        .getByRole("button", { name: "Confirmar sinal recebido" })
        .click();
      await expect(
        calc.getByRole("region", { name: /^Sinal · P-/ }),
      ).toContainText("Sinal confirmado");
      const payments = await db
        .from("payments")
        .select("kind,status,amount_cents")
        .eq("order_id", orderId);
      expect(payments.data).toEqual([
        {
          kind: "deposit",
          status: "confirmed",
          amount_cents: (await fixture.ownedOrder(orderId)).deposit_cents,
        },
      ]);
      expect((await fixture.ownedOrder(orderId)).status).toBe(
        "awaiting_documents",
      );
      await accessible(calc, info, "05-sinal-andre");
    });

    await test.step("upload real confirma integridade e coloca o mesmo pedido na fila", async () => {
      await page.goto(`/app/processos/${processId}?aba=documentos`);
      await page.getByLabel("Pasta de destino").selectOption("case");
      await page.getByLabel("Escolher arquivo do processo").setInputFiles({
        name: "Processo fictício da jornada.pdf",
        mimeType: "application/pdf",
        buffer: pdf,
      });
      await expect
        .poll(async () => (await fixture.ownedOrder(orderId)).status)
        .toBe("queued");
      const file = await db
        .from("files")
        .select("sha256,upload_status,uploaded_by")
        .eq("process_id", processId)
        .eq("name", "Processo fictício da jornada.pdf")
        .single();
      expect(file.data).toEqual({
        sha256: createHash("sha256").update(pdf).digest("hex"),
        upload_status: "uploaded",
        uploaded_by: actor,
      });
      await calc.goto("/painel/fila");
      await expect(
        calc.locator(
          `${info.project.use.viewport!.width < 900 ? ".queue-mobile > li" : ".queue-table tbody > tr"}[data-order-id="${orderId}"]`,
        ),
      ).toBeVisible();
      expect(
        (
          await db
            .from("notifications")
            .select("id")
            .eq("dedup_key", `queued:${orderId}:email`)
        ).data,
      ).toHaveLength(1);
      await accessible(page, info, "06-documento-cliente");
      await operate("start_analysis", "in_analysis");
      await accessible(calc, info, "06a-analise-andre");
    });

    await test.step("cliente e André trocam mensagens no mesmo processo", async () => {
      await page.goto(`/app/processos/${processId}?aba=mensagens`);
      await page
        .getByLabel("Sua mensagem")
        .fill("Documento fictício enviado para a jornada.");
      await page
        .getByRole("button", { name: "Enviar mensagem", exact: true })
        .click();
      await expect(
        page.locator(".message-form").getByRole("status"),
      ).toHaveText("Mensagem enviada.");
      await calc.goto(`/painel/processos/${processId}?aba=mensagens`);
      await expect(
        calc
          .locator(".process-records > li")
          .filter({ hasText: "Documento fictício enviado para a jornada." }),
      ).toContainText(name);
      await calc
        .getByLabel("Sua mensagem")
        .fill("Recebi o documento fictício e vou conferir a premissa.");
      await calc
        .getByRole("button", { name: "Enviar mensagem", exact: true })
        .click();
      await expect(
        calc.locator(".message-form").getByRole("status"),
      ).toHaveText("Mensagem enviada.");
      await page.reload();
      await expect(
        page
          .locator(".process-records > li")
          .filter({ hasText: "Recebi o documento fictício" }),
      ).toContainText("Calculista de teste");
      expect(
        (await db.from("messages").select("id").eq("process_id", processId))
          .data,
      ).toHaveLength(2);
      await accessible(page, info, "07-conversa");
    });

    await test.step("André registra decisão; só o cliente confirma concordância", async () => {
      await calc.goto(`/painel/processos/${processId}?aba=decisoes`);
      await calc.locator(".decision-composer > summary").click();
      const form = calc.getByRole("form", {
        name: "Registrar decisão técnica",
        exact: true,
      });
      await form
        .getByLabel("Parâmetro", { exact: true })
        .selectOption("period");
      await form
        .getByLabel("Valor escolhido", { exact: true })
        .fill("Período fictício da jornada");
      await form.getByLabel("Origem", { exact: true }).selectOption("lawyer");
      await form
        .getByLabel("Justificativa", { exact: true })
        .fill("Escolha fictícia submetida à conferência do cliente.");
      await form
        .getByRole("button", { name: "Registrar decisão", exact: true })
        .click();
      await expect(form.getByRole("status")).toHaveText("Decisão registrada.");
      await page.goto(`/app/processos/${processId}?aba=decisoes`);
      const row = page
        .locator(".process-records > li")
        .filter({ hasText: "Período fictício da jornada" });
      await expect(row).toContainText("Premissa");
      await row
        .getByLabel("Li e estou de acordo com esta decisão.", { exact: true })
        .check();
      await row
        .getByRole("button", { name: "Confirmar concordância", exact: true })
        .click();
      await expect(row).toContainText(`Concordância de ${name}`);
      await expect(row).not.toContainText("Premissa");
      const decision = await db
        .from("decisions")
        .select("client_confirmed_by")
        .eq("process_id", processId)
        .single();
      expect(decision.data!.client_confirmed_by).toBe(actor);
      await accessible(page, info, "08-decisao");
    });

    await test.step("André opera cálculo, espera e revisão pela interface", async () => {
      await operate("start_calculation", "in_calculation");
      await accessible(calc, info, "08a-calculo-andre");
      await operate(
        "request_information",
        "awaiting_client",
        "Falta esclarecimento fictício sobre o período.",
      );
      await accessible(page, info, "08b-pausa-cliente");
      await page.reload();
      await operate("receive_information", "in_calculation");
      await accessible(calc, info, "08c-retomada-andre");
      await operate("submit_review", "in_review");
      await operate(
        "return_calculation",
        "in_calculation",
        "Conferir arredondamento fictício antes de assinar.",
      );
      await operate("submit_review", "in_review");
      await accessible(calc, info, "08d-revisao-andre");
      await page.goto(`/app/processos/${processId}?aba=historico`);
      await expect(
        page.getByText("Em cálculo → Aguardando cliente", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Falta esclarecimento fictício sobre o período.", {
          exact: true,
        }),
      ).toBeVisible();
      const events = await db
        .from("timeline_events")
        .select("id,data,actor_id")
        .eq("order_id", orderId)
        .eq("kind", "status_changed");
      const operational = events.data!.filter(
        (row) =>
          row.data &&
          typeof row.data === "object" &&
          !Array.isArray(row.data) &&
          "operation" in row.data,
      );
      expect(operational).toHaveLength(7);
      expect(
        (
          await db
            .from("audit_log")
            .select("id")
            .in(
              "target_id",
              operational.map((row) => row.id),
            )
        ).data,
      ).toHaveLength(7);
      await accessible(page, info, "08e-timeline-cliente");
    });
    const deliverableNames = [
      "Cálculo fictício da jornada.pdf",
      "Projeto fictício da jornada.pjc",
      "Parecer fictício da jornada.pdf",
    ];
    let calculationId = "",
      deliveryId = "";
    await test.step("André envia três artefatos e confirma checklist da entrega", async () => {
      await calc.goto(`/painel/processos/${processId}?aba=documentos`);
      await calc.getByLabel("Pasta de destino").selectOption("deliverables");
      for (const [i, fileName] of deliverableNames.entries()) {
        await calc.getByLabel("Escolher arquivo do processo").setInputFiles({
          name: fileName,
          mimeType: i === 1 ? "application/octet-stream" : "application/pdf",
          buffer:
            i === 1
              ? Buffer.from(
                  "PJC inventado exclusivamente para ensaio; sem cálculo real.",
                )
              : pdf,
        });
        await expect
          .poll(
            async () =>
              (
                await db
                  .from("files")
                  .select("id")
                  .eq("process_id", processId)
                  .eq("name", fileName)
                  .eq("upload_status", "uploaded")
              ).data?.length,
          )
          .toBe(1);
      }
      const files = (
        await db
          .from("files")
          .select("id,name")
          .eq("process_id", processId)
          .eq("folder", "deliverables")
      ).data!;
      calculationId = files.find(
        (file) => file.name === deliverableNames[0],
      )!.id;
      expect(
        (
          await page.request.get(`/api/files/${calculationId}/download`, {
            maxRedirects: 0,
          })
        ).status(),
      ).toBe(404);
      await calc.goto(`/painel/processos/${processId}?aba=resumo`);
      const order = await fixture.ownedOrder(orderId);
      await calc
        .getByText(`Confirmar entrega do pedido ${order.code}`, { exact: true })
        .click();
      const form = calc.getByRole("form", {
        name: `Confirmar entrega ${order.code}`,
        exact: true,
      });
      deliveryId = await form.locator('input[name="requestId"]').inputValue();
      for (const [i, label] of [
        "PDF do cálculo",
        "Arquivo PJC",
        "Parecer assinado em PDF",
      ].entries())
        await form
          .getByLabel(label, { exact: true })
          .selectOption(
            files.find((file) => file.name === deliverableNames[i])!.id,
          );
      await form.getByLabel("Versão do PJe-Calc").fill("2.13.1");
      await form.getByLabel("Mês da tabela de índices").fill("10/2026");
      for (const label of [
        "Confirmei que o cálculo está liquidado.",
        "Confirmei que o CPF ou CNPJ está cadastrado no PJC.",
        "Revisei o cálculo e conferi a assinatura do parecer, o nome e o CRC nos arquivos.",
      ])
        await form.getByLabel(label, { exact: true }).check();
      await accessible(calc, info, "09-entrega-andre");
      await form
        .getByRole("button", { name: "Confirmar entrega", exact: true })
        .click();
      await expect(
        calc.locator(`[data-delivery-id="${deliveryId}"]`),
      ).toBeVisible();
      expect((await fixture.ownedOrder(orderId)).status).toBe("delivered");
      expect(
        (
          await db
            .from("notifications")
            .select("id")
            .eq("dedup_key", `delivery:${deliveryId}:email`)
        ).data,
      ).toHaveLength(1);
    });

    await test.step("D6 nula e saldo pendente bloqueiam bytes; aprovação é só desta entrega fictícia", async () => {
      await page.goto(`/app/processos/${processId}?aba=resumo`);
      const row = page.locator(`[data-delivery-id="${deliveryId}"]`);
      await expect(row).toContainText(
        "aguarda a definição da regra de pagamento",
      );
      await expect(row.locator('a[href^="/api/files/"]')).toHaveCount(0);
      expect(
        (
          await page.request.get(`/api/files/${calculationId}/download`, {
            maxRedirects: 0,
          })
        ).status(),
      ).toBe(404);
      const release = calc.locator(`[data-delivery-id="${deliveryId}"]`);
      await release
        .getByText("Definir regra desta entrega", { exact: true })
        .click();
      const form = release.getByRole("form", {
        name: "Regra desta entrega",
        exact: true,
      });
      await form
        .getByLabel("Quando liberar os arquivos?", { exact: true })
        .selectOption("after_balance");
      await form
        .getByLabel(
          "Confirmei a regra com o responsável técnico e aprovo sua aplicação.",
          { exact: true },
        )
        .check();
      await form
        .getByRole("button", {
          name: "Aprovar regra desta entrega",
          exact: true,
        })
        .click();
      await expect(form).toHaveCount(0);
      await page.reload();
      await expect(row).toContainText("aguarda a confirmação do saldo");
      expect(
        (
          await page.request.get(`/api/files/${calculationId}/download`, {
            maxRedirects: 0,
          })
        ).status(),
      ).toBe(404);
      expect(
        (await db.from("settings").select("delivery_release_policy").single())
          .data!.delivery_release_policy,
      ).toBeNull();
    });
    await test.step("FRONTEIRA SINTÉTICA: saldo local confirmado (M3.09 futura)", async () => {
      await fixture.prepareBalance(orderId);
    });
    await test.step("cliente baixa bytes originais por URL de 120s com auditoria", async () => {
      await page.reload();
      const row = page.locator(`[data-delivery-id="${deliveryId}"]`);
      await expect(row).toContainText("Arquivos liberados para download.");
      await expect(row.locator('a[href^="/api/files/"]')).toHaveCount(3);
      const response = await page.request.get(
        `/api/files/${calculationId}/download`,
        { maxRedirects: 0 },
      );
      expect(response.status()).toBe(307);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
      expect(response.headers()["referrer-policy"]).toBe("no-referrer");
      // Não colocar URL/token nas mensagens de asserção ou nos artefatos.
      const signed = new URL(response.headers().location);
      expect(signed.origin).toBe("http://127.0.0.1:54321");
      const claims = JSON.parse(
        Buffer.from(
          signed.searchParams.get("token")!.split(".")[1],
          "base64url",
        ).toString(),
      );
      expect(claims.exp - claims.iat).toBe(120);
      let downloaded: Buffer;
      try {
        const bytes = await page.request.get(signed.toString());
        if (bytes.status() !== 200) throw new Error();
        downloaded = await bytes.body();
      } catch {
        // O call log original inclui o token da URL; nunca o propagar.
        throw new Error("Download assinado local não concluído.");
      }
      expect(downloaded).toEqual(pdf);
      const download = page.waitForEvent("download");
      await row
        .locator(`a[href="/api/files/${calculationId}/download"]`)
        .click();
      expect(await (await download).failure()).toBeNull();
      expect(
        (
          await db
            .from("audit_log")
            .select("id")
            .eq("target_id", calculationId)
            .eq("actor_id", actor)
            .eq("action", "file_download")
        ).data!.length,
      ).toBeGreaterThanOrEqual(2);
      const order = await fixture.ownedOrder(orderId);
      expect(order.process_id).toBe(processId);
      expect(order.actor).toBe(actor);
      expect(
        (await db.from("orders").select("id").eq("client_id", order.client_id))
          .data,
      ).toHaveLength(1);
      await accessible(page, info, "10-download-cliente");
    });
  } finally {
    try {
      await calculatorContext?.close();
    } finally {
      try {
        await page.close();
      } finally {
        await fixture.cleanup();
      }
    }
  }
});
