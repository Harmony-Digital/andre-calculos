import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { queueStates } from "@/modules/queue/queue";
import {
  deadlineCalendarVersion,
  deadlineSnapshot,
  deadlineEvent,
  inDeadlineWindow,
} from "./deadlines";

/** Só o endpoint autenticado cria este cliente. O relógio da request não é aceito. */
export async function runDeadlineReminders(
  db: SupabaseClient<Database>,
  now = new Date(),
) {
  const snapshot = deadlineSnapshot(now);
  const config = await db
    .from("settings")
    .select("deadline_window_start,deadline_window_end")
    .eq("singleton", true)
    .single();
  if (config.error || !config.data)
    throw new Error("Janela de lembretes indisponível.");
  if (
    !inDeadlineWindow(
      snapshot.time,
      config.data.deadline_window_start.slice(0, 5),
      config.data.deadline_window_end.slice(0, 5),
    )
  )
    return { status: "outside_window", scanned: 0, consumed: 0 };
  let cursor: string | null = null,
    scanned = 0,
    consumed = 0;
  for (;;) {
    let query = db
      .from("orders")
      .select("id,status,internal_due_date")
      .in("status", [...queueStates])
      .lte("internal_due_date", snapshot.twoDays)
      .order("id", { ascending: true });
    if (cursor) query = query.gt("id", cursor);
    const page = await query.limit(100);
    if (page.error || !page.data)
      throw new Error("Pedidos para lembrete indisponíveis.");
    for (const order of page.data) {
      scanned++;
      const event = deadlineEvent(order, snapshot);
      if (!event || !order.internal_due_date) continue;
      const result = await db.rpc("enqueue_deadline_reminder", {
        target_order: order.id,
        expected_due: order.internal_due_date,
        reminder_event: event,
        reference_date: snapshot.today,
        one_day: snapshot.businessDay ? snapshot.oneDay : undefined,
        two_days: snapshot.businessDay ? snapshot.twoDays : undefined,
      });
      if (result.error)
        throw new Error(
          "Lembrete não confirmado; a próxima execução pode retomar.",
        );
      if (result.data === "consumed") consumed++;
    }
    if (page.data.length < 100) break;
    cursor = page.data[page.data.length - 1].id;
  }
  return {
    status: "prepared_locally",
    scanned,
    consumed,
    calendarVersion: deadlineCalendarVersion,
  };
}
