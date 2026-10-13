import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { renderContractPdf } from "./contract-pdf";
import { contractPdfFixture } from "../../../tests/contract-pdf-fixture";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
it("mesmo snapshot gera os mesmos bytes apesar da mudança do relógio", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    const data = contractPdfFixture();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const first = await renderContractPdf(data);
    vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
    const second = await renderContractPdf(structuredClone(data));
    expect(first.subarray(0, 5).toString()).toBe("%PDF-");
    expect(first.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
    expect(sha(second)).toBe(sha(first));
  } finally {
    vi.useRealTimers();
  }
}, 20000);
it("legado válido produz PDF mantendo a identidade ausente", async () => {
  const data = contractPdfFixture(),
    person = data.snapshot.contractant;
  data.snapshot.contractant = {
    source: "legacy",
    actorId: person.actorId,
    kind: null,
    fullName: null,
    legalName: null,
    document: null,
    email: null,
    phone: null,
    oabNumber: null,
    oabState: null,
  };
  const result = await renderContractPdf(data);
  expect(result.subarray(0, 5).toString()).toBe("%PDF-");
}, 20000);
it.each(["actor", "legacy", "fixture", "hash"])(
  "recusa archive inconsistente antes de gerar arquivo: %s",
  async (kind) => {
    const data = contractPdfFixture();
    if (kind === "actor")
      data.snapshot.contractant.actorId =
        "66666666-6666-4666-8666-666666666666";
    if (kind === "legacy") data.snapshot.contractant.source = "legacy";
    if (kind === "fixture") data.snapshot.proposal.mode = "fixture";
    if (kind === "hash") data.snapshotHash = "hash inválido";
    await expect(renderContractPdf(data)).rejects.toThrow();
  },
);
