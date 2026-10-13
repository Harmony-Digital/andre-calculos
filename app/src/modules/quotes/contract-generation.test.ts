import { it, expect } from "vitest";
import { contractPdfFixture } from "../../../tests/contract-pdf-fixture";
import {
  contractPdfClaimSchema,
  contractPdfDownloadSchema,
} from "./contract-generation";
const fixture = () => {
  const archive = contractPdfFixture();
  return {
    state: "claimed",
    quoteId: archive.snapshot.quoteId,
    snapshotHash: archive.snapshotHash,
    rendererVersion: "contract-pdf-v1",
    objectPath: `contracts/${archive.snapshot.quoteId}/${archive.snapshotHash}/contract-pdf-v1.pdf`,
    claimId: "66666666-6666-4666-8666-666666666666",
    epoch: 1,
    leaseUntil: "2026-10-13T15:00:00Z",
    archive,
    prepared: null,
  };
};
it("reserva exige o mesmo contrato, snapshot e destino privado", () => {
  expect(contractPdfClaimSchema.parse(fixture()).state).toBe("claimed");
});
it.each(["quoteId", "snapshotHash", "objectPath", "rendererVersion"])(
  "recusa reserva adulterada em %s",
  (key) => {
    const input = { ...fixture(), [key]: "valor-divergente" };
    expect(contractPdfClaimSchema.safeParse(input).success).toBe(false);
  },
);
it("download não aceita caminho de outro contrato nem bucket público", () => {
  const c = fixture(),
    d = {
      quoteId: c.quoteId,
      bucket: "processos",
      objectPath: c.objectPath,
      sha256: "0".repeat(64),
      sizeBytes: 100,
      number: c.archive.snapshot.number,
    };
  expect(contractPdfDownloadSchema.safeParse(d).success).toBe(true);
  expect(
    contractPdfDownloadSchema.safeParse({
      ...d,
      objectPath: "outro/arquivo.pdf",
    }).success,
  ).toBe(false);
  expect(
    contractPdfDownloadSchema.safeParse({ ...d, bucket: "public" }).success,
  ).toBe(false);
});
