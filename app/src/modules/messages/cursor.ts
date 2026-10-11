import { z } from "zod";
const schema = z.object({
  date: z.iso
    .datetime({ offset: true })
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/,
    ),
  id: z.uuid(),
});
export function messageCursor(value: string | undefined) {
  if (!value) return null;
  const [date, id, ...extra] = value.split("~");
  if (extra.length) throw new Error("Cursor inválido.");
  return schema.parse({ date, id });
}
export function encodeMessageCursor(value: { created_at: string; id: string }) {
  // Date do JavaScript perde os microssegundos usados no desempate do PostgreSQL.
  const cursor = schema.parse({ date: value.created_at, id: value.id });
  return `${cursor.date}~${cursor.id}`;
}
