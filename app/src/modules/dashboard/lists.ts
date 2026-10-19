import "server-only";
import { notFound } from "next/navigation";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { dashboardWindow } from "./window";
import { messageCursor, encodeMessageCursor } from "@/modules/messages/cursor";
import { clientContractContextSchema } from "@/modules/clients/contract";
const cursor = (value?: string) => {
  try {
    return messageCursor(value);
  } catch {
    notFound();
  }
};
export async function getPanelClients(period?: string, after?: string) {
  await authorize(["calculator"]);
  if (period && !["todos", "7dias"].includes(period)) notFound();
  const before = cursor(after),
    db = await createSessionClient(),
    window = dashboardWindow();
  let query = db
    .from("clients")
    .select(
      "id,legal_name,created_at,profile:profiles!clients_owner_id_fkey!inner(full_name,oab_number,oab_state,role)",
    )
    .eq("profile.role", "client")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(51);
  if (period === "7dias")
    query = query.gte("created_at", window.since).lte("created_at", window.now);
  if (before)
    query = query.or(
      `created_at.lt.${before.date},and(created_at.eq.${before.date},id.lt.${before.id})`,
    );
  const result = await query;
  if (result.error) throw new Error("Não foi possível consultar os clientes.");
  const rows = result.data.slice(0, 50);
  const contractResult = await db.rpc("get_client_contract_context", {
    target_clients: rows.map((row) => row.id),
  });
  const contexts = clientContractContextSchema
    .array()
    .safeParse(contractResult.data);
  if (contractResult.error || !contexts.success)
    throw new Error("Não foi possível conferir os contratos dos clientes.");
  const contracts = new Map(
    contexts.data.map((context) => [context.clientId, context]),
  );
  return {
    rows: rows.map((row) => {
      const contract = contracts.get(row.id);
      if (!contract) throw new Error("Condição do cliente indisponível.");
      return { ...row, contract };
    }),
    next: result.data.length > 50 ? encodeMessageCursor(result.data[49]) : null,
    before,
  };
}
export async function getPanelOrders(selection?: string, after?: string) {
  await authorize(["calculator"]);
  if (selection && !["todos", "propostas", "pagamento"].includes(selection))
    notFound();
  const before = cursor(after),
    db = await createSessionClient(),
    window = dashboardWindow();
  if (selection === "propostas") {
    let query = db
      .from("quotes")
      .select(
        "id,number,total_cents,valid_until,created_at,order:orders!inner(code,status,process_id,process:processes!orders_process_id_client_id_fkey(client:clients!processes_client_id_fkey(legal_name)))",
      )
      .is("accepted_at", null)
      .filter("quote_is_current", "eq", true)
      .gte("valid_until", window.now)
      .eq("order.status", "quoted")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(51);
    if (before)
      query = query.or(
        `created_at.lt.${before.date},and(created_at.eq.${before.date},id.lt.${before.id})`,
      );
    const result = await query;
    if (result.error)
      throw new Error("Não foi possível consultar as propostas.");
    return {
      rows: result.data.slice(0, 50).map((q) => ({
        id: q.id,
        code: q.number,
        orderCode: q.order.code,
        client: q.order.process?.client?.legal_name || "Cliente",
        processId: q.order.process_id,
        status: q.order.status,
        total: q.total_cents,
        createdAt: q.created_at,
        validUntil: q.valid_until,
      })),
      next:
        result.data.length > 50 ? encodeMessageCursor(result.data[49]) : null,
      before,
    };
  }
  let query = db
    .from("orders")
    .select(
      "id,code,status,total_cents,process_id,created_at,process:processes!orders_process_id_client_id_fkey(client:clients!processes_client_id_fkey(legal_name))",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(51);
  if (selection === "pagamento") query = query.eq("status", "awaiting_payment");
  if (before)
    query = query.or(
      `created_at.lt.${before.date},and(created_at.eq.${before.date},id.lt.${before.id})`,
    );
  const result = await query;
  if (result.error) throw new Error("Não foi possível consultar os pedidos.");
  return {
    rows: result.data.slice(0, 50).map((o) => ({
      id: o.id,
      code: o.code,
      orderCode: o.code,
      client: o.process?.client?.legal_name || "Cliente",
      processId: o.process_id,
      status: o.status,
      total: o.total_cents,
      createdAt: o.created_at,
      validUntil: null,
    })),
    next: result.data.length > 50 ? encodeMessageCursor(result.data[49]) : null,
    before,
  };
}
