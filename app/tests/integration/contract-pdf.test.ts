import { it, expect, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createContractPdfEvidence } from "../e2e/contract-pdf-helper";

it("renderiza snapshots aceitos, empresa longa e legado sem reescrever história", async () => {
  const name =
    process.env.ANDRE_CONTRACT_PDF_EVIDENCE_NAME ??
    `contrato-pdf-${randomUUID()}`;
  vi.stubEnv("ANDRE_QUOTE_FIXTURES", "1");
  try {
    await createContractPdfEvidence(name);
  } finally {
    vi.unstubAllEnvs();
  }
  const directory = resolve(process.cwd(), "../.data/revisao", name);
  const result = JSON.parse(
    await readFile(resolve(directory, "manifest.json"), "utf8"),
  );
  expect(result.allDataFictitious).toBe(true);
  expect(result.normalAfterIdentitySettingsEditsBytesEqual).toBe(true);
  expect(result.examples.map((entry: { file: string }) => entry.file)).toEqual([
    "normal.pdf",
    "empresa-longa.pdf",
    "legado.pdf",
  ]);
  for (const entry of result.examples) {
    const bytes = await readFile(resolve(directory, entry.file));
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
    expect(entry.repeatedBytesEqual).toBe(true);
  }
  expect(result.examples[1].archive.snapshot.terms.text.length).toBe(64000);
  expect(result.examples[1].archive.snapshot.privacy.text.length).toBe(64000);
  expect(result.examples[2].archive.snapshot.contractant).toMatchObject({
    source: "legacy",
    fullName: null,
    document: null,
    email: null,
  });
}, 90000);
