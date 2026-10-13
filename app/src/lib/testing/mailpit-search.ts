import { z } from "zod";

const searchSchema = z.object({
  messages_count: z.number().int().nonnegative().max(100),
  start: z.literal(0),
  count: z.number().int().nonnegative().max(100).optional(),
  messages: z
    .array(
      z.object({
        ID: z.string().regex(/^[a-zA-Z0-9_-]+$/),
        To: z.array(z.object({ Address: z.string() })),
      }),
    )
    .max(100),
});

/** IDs de uma busca local completa, sem depender do total da caixa compartilhada. */
export function mailpitSearchIds(value: unknown, email: string): string[] {
  const parsed = searchSchema.safeParse(value);
  if (!parsed.success)
    throw new Error("A busca fictícia local tem formato inválido.");
  const result = parsed.data;
  if (
    result.messages_count !== result.messages.length ||
    (result.count !== undefined && result.count !== result.messages.length) ||
    new Set(result.messages.map((message) => message.ID)).size !==
      result.messages.length
  )
    throw new Error("A busca fictícia local está incompleta ou inconsistente.");
  // Uma busca aproximada pode retornar outro destinatário. Nunca limpar seus IDs.
  return result.messages
    .filter((message) => message.To.some((to) => to.Address === email))
    .map((message) => message.ID);
}
