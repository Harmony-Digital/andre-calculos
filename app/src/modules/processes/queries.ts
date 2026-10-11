import "server-only";
import { z } from "zod";
import { notFound } from "next/navigation";
import { authorize, getSessionProfile } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
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
export async function getProcess(id: string) {
  const session = await getSessionProfile();
  if (!session || !["client", "calculator"].includes(session.profile.role))
    notFound();
  await authorize(["client", "calculator"]);
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("processes")
    .select("id,cnj_number,court,chamber,client_id")
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  const result = await supabase
    .from("files")
    .select("id,name,mime,size_bytes,folder,sha256,created_at")
    .eq("process_id", id)
    .eq("upload_status", "uploaded")
    .order("created_at", { ascending: false });
  if (result.error) throw new Error("Não foi possível carregar os documentos.");
  return { process: data, files: result.data };
}
