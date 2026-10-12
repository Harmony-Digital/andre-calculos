import "server-only";
import { z } from "zod";
import { notFound } from "next/navigation";
import { authorize, getSessionProfile } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { depositInfoSchema } from "@/modules/payments/deposit";
import { parseDeliveryDisplay } from "@/modules/delivery/display-context";
import type { ProcessTab } from "./tabs";
import { messageCursor, encodeMessageCursor } from "@/modules/messages/cursor";
import { eventFilter } from "@/modules/timeline/types";
export async function listProcesses() {
  await authorize(["client", "calculator"]);
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("processes")
    .select("id,cnj_number,court,chamber,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar os processos.");
  return data;
}
export async function getProcess(
  id: string,
  tab: ProcessTab = "documentos",
  before?: string,
  eventType?: string,
) {
  const session = await getSessionProfile();
  if (!session || !["client", "calculator"].includes(session.profile.role))
    notFound();
  await authorize(["client", "calculator"]);
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("processes")
    .select("id,cnj_number,court,chamber,client_id,side,claimants_count")
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  let cursor;
  let selectedEvent;
  try {
    cursor = messageCursor(
      tab === "mensagens" ||
        tab === "historico" ||
        tab === "indice" ||
        tab === "resumo"
        ? before
        : undefined,
    );
    selectedEvent = eventFilter(tab === "historico" ? eventType : undefined);
  } catch {
    notFound();
  }
  let messageQuery = supabase
    .from("messages")
    .select("id,author_id,body,attachment_ids,created_at")
    .eq("process_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(51);
  if (cursor)
    messageQuery = messageQuery.or(
      `created_at.lt.${cursor.date},and(created_at.eq.${cursor.date},id.lt.${cursor.id})`,
    );
  let timelineQuery = supabase
    .from("timeline_events")
    .select("id,kind,data,actor_id,created_at")
    .eq("process_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(101);
  if (selectedEvent) timelineQuery = timelineQuery.eq("kind", selectedEvent);
  if (cursor)
    timelineQuery = timelineQuery.or(
      `created_at.lt.${cursor.date},and(created_at.eq.${cursor.date},id.lt.${cursor.id})`,
    );
  let indexQuery = supabase
    .from("page_index")
    .select(
      "id,file_id,piece,pages,note,revision,created_at,source:files!page_index_file_id_process_id_fkey(name,version,upload_status)",
    )
    .eq("process_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(51);
  if (cursor)
    indexQuery = indexQuery.or(
      `created_at.lt.${cursor.date},and(created_at.eq.${cursor.date},id.lt.${cursor.id})`,
    );
  let deliveryQuery = supabase
    .from("deliveries")
    .select(
      "id,order_id,pje_version,index_month,professional,created_at,files:delivery_files(file_id,kind,snapshot),order:orders!deliveries_order_id_process_id_fkey(code)",
    )
    .eq("process_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(51);
  if (cursor)
    deliveryQuery = deliveryQuery.or(
      `created_at.lt.${cursor.date},and(created_at.eq.${cursor.date},id.lt.${cursor.id})`,
    );
  const [
    files,
    orders,
    messages,
    decisions,
    index,
    events,
    deliveries,
    contractQuotes,
    deposits,
  ] = await Promise.all([
    supabase
      .from("files")
      .select(
        "id,name,mime,size_bytes,folder,version,sha256,created_at,order_id",
      )
      .eq("process_id", id)
      .eq("upload_status", "uploaded")
      .order("created_at", { ascending: false }),
    tab === "resumo"
      ? supabase
          .from("orders")
          .select(
            "id,code,calc_type,status,status_revision,resume_status,delivery_date,quotes(id,number,is_simulation,proposal_snapshot)",
          )
          .eq("process_id", id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    tab === "mensagens"
      ? messageQuery
      : Promise.resolve({ data: [], error: null }),
    tab === "decisoes"
      ? supabase
          .from("decisions")
          .select(
            "id,parameter,value,source,page,rationale,recorded_by,client_confirmed_at,client_confirmed_by,created_at",
          )
          .eq("process_id", id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    tab === "indice" ? indexQuery : Promise.resolve({ data: [], error: null }),
    tab === "historico"
      ? timelineQuery
      : Promise.resolve({ data: [], error: null }),
    tab === "resumo"
      ? deliveryQuery
      : Promise.resolve({ data: [], error: null }),
    tab === "resumo"
      ? supabase.rpc("get_process_contract_quote_ids", { target_process: id })
      : Promise.resolve({ data: [], error: null }),
    tab === "resumo"
      ? supabase.rpc("get_process_deposit_instructions", { target_process: id })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (
    [
      files,
      orders,
      messages,
      decisions,
      index,
      events,
      deliveries,
      contractQuotes,
      deposits,
    ].some((result) => result.error)
  )
    throw new Error("Não foi possível carregar a pasta do processo.");
  const authorIds = [
    ...new Set([
      ...(messages.data ?? []).map((row) => row.author_id),
      ...(decisions.data ?? []).map((row) => row.recorded_by),
      ...(events.data ?? []).flatMap((row) =>
        row.actor_id ? [row.actor_id] : [],
      ),
    ]),
  ];
  const profiles = authorIds.length
    ? await supabase.rpc("get_process_participants", { target_process: id })
    : { data: [], error: null };
  if (profiles.error)
    throw new Error("Não foi possível carregar os responsáveis.");
  const deliveryRecords = (deliveries.data ?? []).slice(0, 50);
  const displayResult =
    tab === "resumo" && deliveryRecords.length
      ? await supabase.rpc("get_delivery_display_context", {
          target_process: id,
          target_deliveries: deliveryRecords.map((row) => row.id),
        })
      : {
          data: {
            schemaVersion: 1,
            semantics: "delivery_display",
            effects: "none",
            contexts: [],
            payments: [],
          },
          error: null,
        };
  if (displayResult.error)
    throw new Error("Não foi possível conferir as entregas e o saldo.");
  const display = parseDeliveryDisplay(displayResult.data, id, deliveryRecords);
  return {
    deposits: new Map(
      depositInfoSchema
        .array()
        .parse(deposits.data ?? [])
        .map((row) => [row.orderId, row]),
    ),
    process: data,
    role: session.profile.role,
    files: files.data ?? [],
    orders: orders.data ?? [],
    contractQuoteIds: new Set(
      (contractQuotes.data ?? []).map((row) => row.quote_id),
    ),
    deliveries: deliveryRecords,
    olderDeliveries:
      (deliveries.data?.length ?? 0) > 50
        ? encodeMessageCursor(deliveries.data![49])
        : null,
    deliveryAccess: display.contexts,
    deliveryPayments: display.payments,
    messages: (messages.data ?? []).slice(0, 50).reverse(),
    olderMessages:
      (messages.data?.length ?? 0) > 50
        ? encodeMessageCursor(messages.data![49])
        : null,
    decisions: decisions.data ?? [],
    index: (index.data ?? []).slice(0, 50),
    olderIndex:
      (index.data?.length ?? 0) > 50
        ? encodeMessageCursor(index.data![49])
        : null,
    events: (events.data ?? []).slice(0, 100),
    selectedEvent,
    olderEvents:
      (events.data?.length ?? 0) > 100
        ? encodeMessageCursor(events.data![99])
        : null,
    authors: new Map(
      (profiles.data ?? []).map((row) => [row.profile_id, row.display_name]),
    ),
  };
}
