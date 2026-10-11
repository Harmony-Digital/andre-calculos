import "server-only";
import { z } from "zod";
import { notFound } from "next/navigation";
import { authorize, getSessionProfile } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
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
      tab === "mensagens" || tab === "historico" || tab === "indice"
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
  const [files, orders, messages, decisions, index, events, deliveries] =
    await Promise.all([
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
            .select("id,code,calc_type,status,delivery_date")
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
      tab === "indice"
        ? indexQuery
        : Promise.resolve({ data: [], error: null }),
      tab === "historico"
        ? timelineQuery
        : Promise.resolve({ data: [], error: null }),
      tab === "resumo"
        ? supabase
            .from("deliveries")
            .select(
              "id,order_id,pje_version,index_month,professional,created_at,files:delivery_files(file_id,kind,snapshot),release:delivery_releases(policy),order:orders!deliveries_order_id_process_id_fkey(code,status,total_cents,payments!payments_order_id_fkey(amount_cents,kind,status))",
            )
            .eq("process_id", id)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (
    [files, orders, messages, decisions, index, events, deliveries].some(
      (result) => result.error,
    )
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
  return {
    process: data,
    role: session.profile.role,
    files: files.data ?? [],
    orders: orders.data ?? [],
    deliveries: deliveries.data ?? [],
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
