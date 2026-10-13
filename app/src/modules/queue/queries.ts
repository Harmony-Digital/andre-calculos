import "server-only";
import { notFound } from "next/navigation";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { parseCurrentOrderCredits } from "@/modules/payments/order-credit";
import {
  dashboardWindow,
  deadlineFilter,
  deadlineRange,
  type DashboardWindow,
} from "@/modules/dashboard/window";
import {
  queueStates,
  queueFilter,
  queueCursor,
  encodeQueueCursor,
  queuePaymentStatus,
  queuePaymentNote,
} from "./queue";
export async function getWorkQueue(
  filter?: string,
  after?: string,
  deadline?: string,
  window: DashboardWindow = dashboardWindow(),
) {
  await authorize(["calculator"]);
  let status, cursor;
  let period: ReturnType<typeof deadlineFilter>;
  try {
    status = queueFilter(filter);
    cursor = queueCursor(after);
    period = deadlineFilter(deadline);
  } catch {
    notFound();
  }
  const db = await createSessionClient();
  let query = db
    .from("orders")
    .select(
      "id,code,process_id,calc_type,complexity,status,internal_due_date,process:processes!orders_process_id_client_id_fkey(client:clients!processes_client_id_fkey(legal_name))",
    )
    .in("status", status ? [status] : [...queueStates])
    .order("internal_due_date", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(51);
  const range = deadlineRange(period, window);
  if (range.gte) query = query.gte("internal_due_date", range.gte);
  if (range.lte) query = query.lte("internal_due_date", range.lte);
  if (range.lt) query = query.lt("internal_due_date", range.lt);
  if (cursor) {
    if (cursor.due === null)
      query = query.is("internal_due_date", null).gt("id", cursor.id);
    else
      query = query.or(
        `internal_due_date.gt.${cursor.due},and(internal_due_date.eq.${cursor.due},id.gt.${cursor.id}),internal_due_date.is.null`,
      );
  }
  const result = await query;
  if (result.error) throw new Error("Não foi possível carregar a fila.");
  const selected = result.data.slice(0, 50);
  const ids = selected.map((row) => row.id);
  const response = ids.length
    ? await db.rpc("get_current_order_credits", { target_orders: ids })
    : { data: [], error: null };
  if (response.error)
    throw new Error("Não foi possível conferir os valores da fila.");
  const credits = parseCurrentOrderCredits(response.data, ids);
  const rows = selected.map((row) => {
    if (!row.process?.client)
      throw new Error("Não foi possível carregar o cliente.");
    const credit = credits.get(row.id)!;
    return {
      ...row,
      clientName: row.process.client.legal_name || "Cliente",
      credit,
      totalCents: credit.projection.totalCents,
      payment: queuePaymentStatus(credit),
      paymentNote: queuePaymentNote(credit),
    };
  });
  return {
    rows,
    status,
    period,
    today: window.today,
    after: cursor,
    next: result.data.length > 50 ? encodeQueueCursor(result.data[49]) : null,
  };
}
