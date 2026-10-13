import { z } from "zod";
import { contractArchiveSchema } from "./contract-snapshot";
const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const contractPdfStateSchema = z.strictObject({
  quoteId: z.uuid(),
  state: z.enum(["pending", "processing", "failed", "ready"]),
});
export const contractPdfClaimSchema = z.union([
  z.strictObject({
    state: z.enum(["busy", "stale", "quarantined", "ready"]),
    quoteId: z.uuid(),
  }),
  z
    .strictObject({
      state: z.literal("claimed"),
      quoteId: z.uuid(),
      claimId: z.uuid(),
      epoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      leaseUntil: z.iso.datetime({ offset: true }),
      rendererVersion: z.literal("contract-pdf-v1"),
      snapshotHash: hash,
      objectPath: z.string(),
      archive: contractArchiveSchema,
      prepared: z
        .strictObject({
          sha256: hash,
          sizeBytes: z.number().int().min(1).max(50000000),
        })
        .nullable(),
    })
    .refine(
      (c) =>
        c.quoteId === c.archive.snapshot.quoteId &&
        c.snapshotHash === c.archive.snapshotHash &&
        c.objectPath ===
          `contracts/${c.quoteId}/${c.snapshotHash}/${c.rendererVersion}.pdf`,
      "Reserva contratual divergente.",
    ),
]);
export const contractPdfDownloadSchema = z
  .strictObject({
    quoteId: z.uuid(),
    bucket: z.literal("processos"),
    objectPath: z.string(),
    sha256: hash,
    sizeBytes: z.number().int().min(1).max(50000000),
    number: z.string().regex(/^ORC-\d{4}-\d{4,}$/),
  })
  .refine(
    (d) =>
      new RegExp(
        `^contracts/${d.quoteId}/[0-9a-f]{64}/contract-pdf-v1\\.pdf$`,
      ).test(d.objectPath),
    "Arquivo contratual divergente.",
  );
export type ContractPdfState = z.infer<typeof contractPdfStateSchema>["state"];
