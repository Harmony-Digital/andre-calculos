import { test, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { loginAs } from "./auth-helper";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupFileFixture } from "./file-fixture-cleanup";
if (
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321" ||
  process.env.ANDRE_LOCAL_TESTS !== "1"
)
  throw new Error("Uploads de teste somente no Supabase local do projeto.");
const processId = "00000000-0000-4000-8000-000000000101";
test("upload de 300 MB retoma do offset após cortar a rede", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "computador",
    "O ensaio grande roda no computador; uploads menores cobrem celular.",
  );
  test.setTimeout(180000);
  const dir = await mkdtemp(join(tmpdir(), "andre-upload-"));
  const name = `arquivo-ficticio-300mb-${randomUUID()}.pdf`,
    path = join(dir, name),
    bytes = 300 * 1024 * 1024;
  const file = await open(path, "w");
  await file.write("%PDF-1.7\nSomente fixture de infraestrutura.\n");
  await file.truncate(bytes);
  await file.close();
  const system = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  try {
    await loginAs(page);
    await page.goto(`/app/processos/${processId}`);
    const firstChunk = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/upload/resumable/sign/") &&
        response.status() === 204,
      { timeout: 60000 },
    );
    await page.getByLabel("Escolher arquivo do processo").setInputFiles(path);
    await firstChunk;
    await context.setOffline(true);
    await expect(
      page.getByRole("button", { name: "Retomar envio" }),
    ).toBeVisible();
    await context.setOffline(false);
    const resumed = page.waitForResponse(
      (response) =>
        response.request().method() === "HEAD" &&
        response.url().includes("/upload/resumable/sign/") &&
        response.ok(),
      { timeout: 30000 },
    );
    await page.getByRole("button", { name: "Retomar envio" }).click();
    const offset = Number((await resumed).headers()["upload-offset"]);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(bytes);
    await expect(page.getByRole("status")).toContainText(
      "Arquivo enviado e integridade confirmada.",
      { timeout: 120000 },
    );
    const stored = await system
      .from("files")
      .select("id,size_bytes,sha256,upload_status")
      .eq("name", name)
      .single();
    expect(stored.data?.size_bytes).toBe(bytes);
    expect(stored.data?.upload_status).toBe("uploaded");
    expect(stored.data?.sha256).toMatch(/^[0-9a-f]{64}$/);
    console.info(
      `Retomada verificada: ${offset} bytes preservados; total ${bytes} bytes; hash confirmado no servidor.`,
    );
  } finally {
    try {
      await context.setOffline(false);
    } finally {
      try {
        await cleanupFileFixture(name);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  }
});
test("arquivo privado, integridade, auditoria e isolamento", async ({
  page,
  context,
}, testInfo) => {
  const name = `documento-ficticio-${randomUUID()}.pdf`;
  const content = Buffer.from(
    "%PDF-1.7\nDocumento inteiramente fictício para teste.\n%%EOF",
  );
  const system = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  let observed: { id: string; path: string; sha256: string } | undefined;
  const interruption = new Error("Interrupção fictícia após as verificações.");
  async function scenario() {
    try {
      await loginAs(page);
      const response = await page.goto(`/app/processos/${processId}`);
      expect(response?.status()).toBe(200);
      await page
        .getByLabel("Escolher arquivo do processo")
        .setInputFiles({ name, mimeType: "application/pdf", buffer: content });
      await expect(page.getByRole("status")).toContainText(
        "Arquivo enviado e integridade confirmada.",
        { timeout: 60000 },
      );
      const row = page.getByRole("listitem").filter({ hasText: name });
      await expect(row).toBeVisible();
      const href = await row
        .getByRole("link", { name: "Baixar arquivo" })
        .getAttribute("href");
      const download = await context.request.get(href!, { maxRedirects: 0 });
      expect(download.status()).toBe(307);
      const signed = new URL(download.headers().location);
      const claims = JSON.parse(
        Buffer.from(
          signed.searchParams.get("token")!.split(".")[1],
          "base64url",
        ).toString(),
      );
      expect(claims.exp - claims.iat).toBe(120);
      const result = await context.request.get(signed.toString());
      expect(result.ok()).toBe(true);
      expect(await result.body()).toEqual(content);
      const stored = await system
        .from("files")
        .select("id,path,sha256")
        .eq("name", name)
        .single();
      if (stored.data) observed = stored.data;
      expect(stored.data?.sha256).toBe(
        createHash("sha256").update(content).digest("hex"),
      );
      expect(
        (
          await system
            .from("audit_log")
            .select("id")
            .eq("target_id", stored.data!.id)
            .eq("action", "file_download")
        ).data!.length,
      ).toBeGreaterThan(0);
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
      await page.screenshot({
        path: testInfo.outputPath("pasta-documentos.png"),
        fullPage: true,
      });
      await context.clearCookies();
      await loginAs(page, "clientB");
      expect((await page.goto(`/app/processos/${processId}`))?.status()).toBe(
        404,
      );
      expect(
        (await context.request.get(href!, { maxRedirects: 0 })).status(),
      ).toBe(404);
      const anonymous = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );
      const denied = await anonymous.storage
        .from("processos")
        .download(stored.data!.path);
      expect(denied.error).not.toBeNull();
      // Comprova a limpeza também quando o fluxo termina com erro após o upload.
      throw interruption;
    } finally {
      await cleanupFileFixture(name);
    }
  }
  await expect(scenario()).rejects.toBe(interruption);
  expect(observed).toBeDefined();
  const absent = await system.from("files").select("id").eq("name", name);
  expect(absent.error).toBeNull();
  expect(absent.data).toEqual([]);
  const audit = await system
    .from("audit_log")
    .select("id")
    .eq("target_type", "file")
    .eq("target_id", observed!.id);
  expect(audit.error).toBeNull();
  expect(audit.data).toEqual([]);
  const events = await system
    .from("timeline_events")
    .select("id")
    .eq("process_id", processId)
    .eq("kind", "file_uploaded")
    .contains("data", { file_id: observed!.id });
  expect(events.error).toBeNull();
  expect(events.data).toEqual([]);
  const missingObject = await system.storage
    .from("processos")
    .download(observed!.path);
  expect(missingObject.error).not.toBeNull();
  expect(missingObject.data).toBeNull();
});
