import { z } from "zod";
const name = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[\p{L}\p{M}\p{N} '&().,\/-]+$/u);
export const emailBrandSchema = z.strictObject({
  name,
  technicalName: name,
  crc: z
    .string()
    .trim()
    .min(1)
    .max(70)
    .regex(/^[A-Z0-9 /.-]+$/),
  category: name,
  demonstration: z.boolean(),
});
export type EmailBrand = z.infer<typeof emailBrandSchema>;
