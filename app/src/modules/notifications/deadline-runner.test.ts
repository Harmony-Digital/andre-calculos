import { it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
vi.mock("server-only", () => ({}));
import { runDeadlineReminders } from "./deadline-runner";
const now = new Date("2026-10-16T12:00:00Z");
function mockDb(
  pages: { id: string; status: string; internal_due_date: string }[][],
  start = "07:00:00",
  end = "21:00:00",
) {
  const cursors: string[] = [],
    rpc = vi.fn().mockResolvedValue({ data: "consumed", error: null });
  const db = {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        lte: () => q,
        order: () => q,
        gt: (_key: string, cursor: string) => {
          cursors.push(cursor);
          return q;
        },
        limit: () =>
          Promise.resolve({ data: pages.shift() ?? [], error: null }),
        single: () =>
          Promise.resolve({
            data: { deadline_window_start: start, deadline_window_end: end },
            error: null,
          }),
      };
      if (table !== "settings" && table !== "orders")
        throw new Error("Tabela inesperada.");
      return q;
    },
    rpc,
  };
  return { db: db as unknown as SupabaseClient<Database>, rpc, cursors };
}
const order = (n: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  status: "queued",
  internal_due_date: "2026-10-15",
});
it("percorre mais de cem pedidos usando UUID e consegue repetir após resposta perdida", async () => {
  const rows = Array.from({ length: 205 }, (_, i) => order(i + 1));
  const a = mockDb([rows.slice(0, 100), rows.slice(100, 200), rows.slice(200)]);
  expect(await runDeadlineReminders(a.db, now)).toMatchObject({
    scanned: 205,
    consumed: 205,
  });
  expect(a.cursors).toEqual([rows[99].id, rows[199].id]);
  expect(a.rpc.mock.calls.map((call) => call[1].target_order)).toEqual(
    rows.map((r) => r.id),
  );
  const b = mockDb([rows.slice(0, 100)]);
  b.rpc.mockResolvedValue({ data: "duplicate", error: null });
  expect(await runDeadlineReminders(b.db, now)).toMatchObject({
    scanned: 100,
    consumed: 0,
  });
});
it("fora da janela não tenta enfileirar e nenhuma request controla o relógio do banco", async () => {
  const a = mockDb([[order(1)]], "10:00:00", "21:00:00");
  expect(await runDeadlineReminders(a.db, now)).toMatchObject({
    status: "outside_window",
    scanned: 0,
    consumed: 0,
  });
  expect(a.rpc).not.toHaveBeenCalled();
  const b = mockDb([[order(1)]]);
  await runDeadlineReminders(b.db, now);
  expect(b.rpc.mock.calls[0][1]).toEqual({
    target_order: order(1).id,
    expected_due: "2026-10-15",
    reminder_event: "deadline_overdue",
    reference_date: "2026-10-16",
    one_day: "2026-10-19",
    two_days: "2026-10-20",
  });
});
it("snapshot sem dia útil não autoriza antecipados; candidato alterado não conta como consumido", async () => {
  const a = mockDb([
    [order(1), { ...order(2), internal_due_date: "2026-10-19" }],
  ]);
  a.rpc.mockResolvedValue({ data: "stale", error: null });
  expect(
    await runDeadlineReminders(a.db, new Date("2026-10-17T12:00:00Z")),
  ).toMatchObject({ scanned: 2, consumed: 0 });
  expect(a.rpc).toHaveBeenCalledTimes(1);
  expect(a.rpc.mock.calls[0][1].one_day).toBeUndefined();
});
it("falha interrompe a execução; próxima tentativa pode usar recibos sem duplicar", async () => {
  const a = mockDb([[order(1), order(2)]]);
  a.rpc
    .mockResolvedValueOnce({ data: "consumed", error: null })
    .mockResolvedValueOnce({ data: null, error: { code: "lost_response" } });
  await expect(runDeadlineReminders(a.db, now)).rejects.toThrow(
    "próxima execução",
  );
});
