import "server-only";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { queueStates } from "@/modules/queue/queue";
import { getWorkQueue } from "@/modules/queue/queries";
import { dashboardWindow, deadlineRange } from "./window";
export async function getDashboard() {
  await authorize(["calculator"]);
  const db = await createSessionClient(),
    window = dashboardWindow();
  const near = deadlineRange("vencendo", window),
    late = deadlineRange("atrasados", window);
  const results = await Promise.all([
    db
      .from("clients")
      .select("id,profile:profiles!clients_owner_id_fkey!inner(role)", {
        count: "exact",
        head: true,
      })
      .eq("profile.role", "client")
      .gte("created_at", window.since)
      .lte("created_at", window.now),
    db
      .from("quotes")
      .select("id,order:orders!inner(status)", { count: "exact", head: true })
      .is("accepted_at", null)
      .filter("quote_is_current", "eq", true)
      .gte("valid_until", window.now)
      .eq("order.status", "quoted"),
    db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "awaiting_payment"),
    db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued"),
    db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", [...queueStates])
      .gte("internal_due_date", near.gte!)
      .lte("internal_due_date", near.lte!),
    db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", [...queueStates])
      .lt("internal_due_date", late.lt!),
  ]);
  if (results.some((result) => result.error || result.count === null))
    throw new Error("Não foi possível consultar os indicadores.");
  const [registrations, quotes, payments, queued, soon, overdue] = results.map(
    (result) => result.count!,
  );
  const work = await getWorkQueue(undefined, undefined, undefined, window);
  return {
    counts: { registrations, quotes, payments, queued, soon, overdue },
    window,
    next: work.rows.slice(0, 5),
  };
}
