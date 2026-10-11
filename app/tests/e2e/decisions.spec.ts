import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loginAs } from "./auth-helper";
import { createMessageProcess, removeMessageProcess } from "./messages-helper";
import { localSystem, leaseLocalSettings } from "./local-helper";
import { fictionalServiceSettings as cfg } from "../settings-fixture";
const run = promisify(execFile);
test.setTimeout(90000);
const professional = {
  technical_name: cfg.technicalName,
  crc_number: cfg.crcNumber,
  crc_state: cfg.crcState,
  crc_category: cfg.crcCategory,
};
test("decisões preservam fonte, premissa e autoria; cliente confirma e exporta PDF privado", async ({
  page,
  browser,
}, testInfo) => {
  const release = await leaseLocalSettings(),
    db = localSystem(),
    prior = (
      await db.from("settings").select("*").eq("singleton", true).single()
    ).data!,
    process = await createMessageProcess();
  const own = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
      viewport: page.viewportSize()!,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    }),
    client = await own.newPage();
  try {
    expect(
      (
        await db
          .from("settings")
          .update({
            technical_name: null,
            crc_number: null,
            crc_state: null,
            crc_category: null,
          })
          .eq("singleton", true)
      ).error,
    ).toBeNull();
    await loginAs(page, "calculator");
    await page.goto(`/painel/processos/${process.id}?aba=decisoes`);
    await page.locator(".decision-composer > summary").click();
    const form = page.getByRole("form", {
        name: "Registrar decisão técnica",
        exact: true,
      }),
      key = await form.locator('input[name="requestId"]').inputValue();
    await form.getByLabel("Valor escolhido", { exact: true }).fill("\t ");
    await form
      .getByRole("button", { name: "Registrar decisão", exact: true })
      .click();
    await expect(form.getByRole("status")).toHaveText(
      "Confira os campos indicados.",
    );
    await expect(
      form.getByLabel("Valor escolhido", { exact: true }),
    ).toHaveValue("\t ");
    await expect(form.locator('input[name="requestId"]')).toHaveValue(key);
    const fill = async (
      parameter: string,
      value: string,
      source: string,
      originPage: string,
      rationale: string,
    ) => {
      await form
        .getByLabel("Parâmetro", { exact: true })
        .selectOption(parameter);
      await form.getByLabel("Valor escolhido", { exact: true }).fill(value);
      await form.getByLabel("Origem", { exact: true }).selectOption(source);
      await form
        .getByLabel("Página de origem (opcional)", { exact: true })
        .fill(originPage);
      await form.getByLabel("Justificativa", { exact: true }).fill(rationale);
      await form
        .getByRole("button", { name: "Registrar decisão", exact: true })
        .click();
      await expect(form.getByRole("status")).toHaveText("Decisão registrada.");
      await expect(
        form.getByLabel("Valor escolhido", { exact: true }),
      ).toHaveValue("");
    };
    await fill(
      "interest",
      "1% fictício",
      "judgment",
      "12",
      "Justificativa fictícia com § 1º e correção.",
    );
    await fill(
      "period",
      "Período fictício de análise",
      "lawyer",
      "",
      "Cliente poderá conferir esta escolha.",
    );
    await fill(
      "other",
      "<script>texto fictício</script>",
      "calculator",
      "",
      "Fonte ainda não confirmada.",
    );
    await expect(page.locator(".process-records > li")).toHaveCount(3);
    await expect(page.locator(".decision-confirmation")).toHaveCount(0);
    await expect(page.locator(".process-records script")).toHaveCount(0);
    expect(
      (
        await page.request.get(`/api/processes/${process.id}/decisions/pdf`)
      ).status(),
    ).toBe(409);
    await loginAs(client);
    await client.goto(`/app/processos/${process.id}?aba=decisoes`);
    await expect(client.locator(".decision-composer")).toHaveCount(0);
    const period = client
      .locator(".process-records > li")
      .filter({ hasText: "Período fictício de análise" });
    await expect(period).toContainText("Premissa");
    await period
      .getByLabel("Li e estou de acordo com esta decisão.", { exact: true })
      .check();
    await period
      .getByRole("button", { name: "Confirmar concordância", exact: true })
      .click();
    await expect(period).toContainText("Concordância de Cliente A de teste");
    await expect(period).not.toContainText("Premissa");
    await expect(period.locator(".decision-confirmation")).toHaveCount(0);
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
      path: testInfo.outputPath("decisoes.png"),
      fullPage: true,
    });
    expect(
      (await db.from("settings").update(professional).eq("singleton", true))
        .error,
    ).toBeNull();
    const response = await client.request.get(
      `/api/processes/${process.id}/decisions/pdf`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(response.headers()["content-disposition"]).toMatch(
      /^attachment; filename="decisoes-\d{20}\.pdf"$/,
    );
    const buffer = await response.body(),
      path = testInfo.outputPath("decisoes.pdf");
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    await writeFile(path, buffer);
    const text = (
      await run("pdftotext", ["-layout", "-enc", "UTF-8", path, "-"])
    ).stdout;
    for (const value of [
      "1% fictício",
      "Página 12",
      "§ 1º",
      "Premissa",
      "Calculista de teste",
      "Cliente A de teste",
      cfg.technicalName,
      "CRC DF 000001/O-0",
      "Período fictício de análise",
      "<script>texto fictício</script>",
    ])
      expect(text).toContain(value);
    expect(
      (
        await db
          .from("audit_log")
          .select("id")
          .eq("target_id", process.id)
          .eq("action", "decisions_pdf_access")
      ).data,
    ).toHaveLength(1);
    await client.goto(
      `/app/processos/${process.id}?aba=historico&tipo=decision_recorded`,
    );
    await expect(client.locator(".process-timeline > li")).toHaveCount(4);
    await expect(client.locator(".process-timeline")).toContainText(
      "Concordância registrada",
    );
    let currentRole: "calculator" | "clientB" | "admin" = "calculator";
    for (const role of ["clientB", "admin"] as const) {
      await page.goto(currentRole === "clientB" ? "/app" : "/painel");
      await page.getByRole("button", { name: "Sair", exact: true }).click();
      await loginAs(page, role);
      await page.goto(
        `${role === "admin" ? "/painel" : "/app"}/processos/${process.id}?aba=decisoes`,
      );
      await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
      expect(
        (
          await page.request.get(`/api/processes/${process.id}/decisions/pdf`)
        ).status(),
      ).toBe(404);
      currentRole = role;
    }
    await page.goto("/painel");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    expect(
      (
        await page.request.get(`/api/processes/${process.id}/decisions/pdf`)
      ).status(),
    ).toBe(404);
  } finally {
    await own.close();
    await removeMessageProcess(process.id);
    expect(
      (await db.from("settings").update(prior).eq("singleton", true)).error,
    ).toBeNull();
    await release();
  }
});
test("PDF inclui todos os registros em várias páginas e mantém texto nos limites da folha", async ({
  page,
}, testInfo) => {
  const release = await leaseLocalSettings(),
    db = localSystem(),
    prior = (
      await db.from("settings").select("*").eq("singleton", true).single()
    ).data!,
    process = await createMessageProcess();
  try {
    expect(
      (await db.from("settings").update(professional).eq("singleton", true))
        .error,
    ).toBeNull();
    const calculator = (
      await db.from("profiles").select("id").eq("role", "calculator").single()
    ).data!;
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: randomUUID(),
      process_id: process.id,
      parameter: "correction_index",
      value:
        index === 0
          ? "A".repeat(1000)
          : `Escolha fictícia ${String(index).padStart(3, "0")} com correção e juros.`,
      source: "judgment",
      page: index + 1,
      rationale:
        `Texto fictício ${index}: documentação, remuneração, dedução, § 1º e revisão. `.repeat(
          18,
        ) + `Final do registro ${String(index).padStart(3, "0")}.`,
      recorded_by: calculator.id,
      created_at: `2026-01-01T12:00:${String(index).padStart(2, "0")}.123456Z`,
    }));
    expect((await db.from("decisions").insert(rows)).error).toBeNull();
    await loginAs(page);
    const response = await page.request.get(
      `/api/processes/${process.id}/decisions/pdf`,
    );
    expect(response.status()).toBe(200);
    const path = testInfo.outputPath("decisoes-varias-paginas.pdf");
    await writeFile(path, await response.body());
    const info = (await run("pdfinfo", [path])).stdout;
    expect(info).toMatch(/Page size:\s+595\.\d+ x 841\.\d+ pts \(A4\)/);
    const pageCount = Number(info.match(/Pages:\s+(\d+)/)?.[1]);
    expect(pageCount).toBeGreaterThan(2);
    expect(info).toMatch(/JavaScript:\s+no/);
    const text = (
      await run("pdftotext", ["-layout", "-enc", "UTF-8", path, "-"])
    ).stdout;
    for (let index = 0; index < 12; index++)
      expect(text).toContain(
        `Final do registro ${String(index).padStart(3, "0")}.`,
      );
    const body = text.replace(
      /^[^\S\n]*Registro de decisões técnicas\s*\|\s*CRC[^\n]*\|\s*Página[^\n]*$/gmu,
      "",
    );
    expect(body.replace(/[\s\u200b]/gu, "")).toContain("A".repeat(1000));
    const footers = [...text.matchAll(/Página\s+(\d+)\s+de\s+(\d+)/gu)];
    expect(footers.map((match) => Number(match[1]))).toEqual(
      Array.from({ length: pageCount }, (_, index) => index + 1),
    );
    expect(footers.every((match) => Number(match[2]) === pageCount)).toBe(true);
    const boxes = (await run("pdftotext", ["-bbox-layout", path, "-"])).stdout;
    const words = [
      ...boxes.matchAll(
        /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g,
      ),
    ];
    expect(words.length).toBeGreaterThan(100);
    for (const word of words) {
      expect(Number(word[1])).toBeGreaterThanOrEqual(47);
      expect(Number(word[3])).toBeLessThanOrEqual(548);
      expect(Number(word[4])).toBeLessThanOrEqual(818);
    }
  } finally {
    await removeMessageProcess(process.id);
    expect(
      (await db.from("settings").update(prior).eq("singleton", true)).error,
    ).toBeNull();
    await release();
  }
});
