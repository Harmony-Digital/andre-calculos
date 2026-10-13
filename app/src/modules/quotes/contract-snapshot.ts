import { z } from "zod";
import { proposalSchema } from "./proposal";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const capturedText = z.string().max(64000).nullable();
const legalSnapshot = z.strictObject({
  version: z.string().min(1).max(200),
  text: z.string().min(1).max(64000),
  sha256: hash,
});
export const contractSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    quoteId: z.uuid(),
    number: z.string().regex(/^ORC-\d{4}-\d{4,}$/),
    proposal: proposalSchema,
    contractant: z.strictObject({
      source: z.enum(["acceptance", "legacy"]),
      actorId: z.uuid(),
      kind: z.enum(["person", "company"]).nullable(),
      fullName: capturedText,
      legalName: capturedText,
      document: capturedText,
      email: capturedText,
      phone: capturedText,
      oabNumber: capturedText,
      oabState: capturedText,
    }),
    terms: legalSnapshot,
    privacy: legalSnapshot,
    acceptance: z.strictObject({
      actorId: z.uuid(),
      acceptedAt: z.iso.datetime({ offset: true }),
      contextHash: hash,
    }),
  })
  .refine(
    (s) =>
      s.proposal.mode === "commercial" &&
      s.contractant.actorId === s.acceptance.actorId &&
      (s.contractant.source !== "legacy" ||
        Object.entries(s.contractant).every(
          ([key, value]) =>
            key === "source" || key === "actorId" || value === null,
        )),
    "Dados históricos do contrato inconsistentes.",
  );
export const contractArchiveSchema = z.strictObject({
  snapshotHash: hash,
  snapshot: contractSnapshotSchema,
});
export type ContractSnapshot = z.infer<typeof contractSnapshotSchema>;
export type ContractArchive = z.infer<typeof contractArchiveSchema>;
