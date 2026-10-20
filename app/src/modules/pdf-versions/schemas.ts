import { z } from "zod";
const uuid = z.uuid(),
  date = z.iso.datetime({ offset: true });
export const pdfHeadsSchema = z.array(
  z
    .object({
      fileId: uuid,
      name: z.string(),
      sequence: z.number().int().positive(),
    })
    .strict(),
);
export const pdfContextSchema = z
  .object({
    review: z
      .object({
        fileId: uuid,
        pageCount: z.number().int().min(1).max(100000),
        sequence: z.number().int().positive(),
        revision: z.number().int().positive(),
        registeredAt: date,
        registeredName: z.string().nullable(),
        previousFileId: uuid.nullable(),
        previousName: z.string().nullable(),
        previousCount: z.number().int().positive().nullable(),
      })
      .strict()
      .nullable(),
    pages: z
      .array(
        z
          .object({
            page: z.number().int().positive(),
            read: z.boolean(),
            sourcePage: z.number().int().positive().nullable(),
            inherited: z.boolean(),
            checkedName: z.string().nullable(),
            checkedAt: date.nullable(),
          })
          .strict(),
      )
      .max(50),
    entries: z
      .array(
        z
          .object({
            id: uuid,
            piece: z.string(),
            pages: z.string(),
            note: z.string().nullable(),
            revision: z.number().int().positive(),
            created_at: date,
            already_copied: z.boolean(),
            ready: z.boolean(),
          })
          .strict(),
      )
      .max(50),
    hasMoreEntries: z.boolean(),
    readCount: z.number().int().nonnegative(),
    mappedCount: z.number().int().nonnegative(),
    unmappedPrevious: z.number().int().nonnegative(),
  })
  .strict();
export type PdfContext = z.infer<typeof pdfContextSchema>;
export const pdfOriginsSchema = z
  .array(
    z
      .object({
        entryId: uuid,
        sourceEntryId: uuid,
        sourceFileId: uuid,
        sourceName: z.string().nullable(),
        sourcePages: z.string(),
        sourceRevision: z.number().int().positive(),
        copiedName: z.string(),
        copiedAt: date,
        edited: z.boolean(),
        requiresReview: z.boolean(),
      })
      .strict(),
  )
  .max(50);
export type PdfOrigin = z.infer<typeof pdfOriginsSchema>[number];
