import "server-only";
import { z } from "zod";
import { getSessionProfile } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";

export async function getAuthorizedFile(
  id: string,
  action: "file_view" | "file_download",
) {
  const session = await getSessionProfile();
  if (
    !session ||
    !["client", "calculator"].includes(session.profile.role) ||
    !z.uuid().safeParse(id).success
  )
    return null;
  const supabase = await createSessionClient();
  const file = await supabase
    .from("files")
    .select("id,path,name,mime,size_bytes,upload_status")
    .eq("id", id)
    .single();
  if (
    file.error ||
    !file.data ||
    file.data.upload_status !== "uploaded" ||
    (action === "file_view" && file.data.mime !== "application/pdf")
  )
    return null;
  const audit = await supabase.rpc("record_file_access", {
    target_file: id,
    access_kind: action,
  });
  return audit.error ? null : file.data;
}
