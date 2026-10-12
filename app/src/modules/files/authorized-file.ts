import "server-only";
import { z } from "zod";
import { getSessionProfile } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { maxFileBytes } from "./validation";
const fileMetadataSchema = z.strictObject({
  id: z.uuid().transform((value) => value.toLowerCase()),
  path: z.string().min(1).max(4096),
  name: z.string().min(1).max(255),
  mime: z.string().min(1).max(255),
  size_bytes: z.number().int().positive().max(maxFileBytes),
  upload_status: z.literal("uploaded"),
});

export async function getAuthorizedFile(
  id: string,
  action: "file_view" | "file_download",
) {
  try {
    const session = await getSessionProfile();
    if (
      !session ||
      !["client", "calculator"].includes(session.profile.role) ||
      !z.uuid().safeParse(id).success
    )
      return null;
    const supabase = await createSessionClient();
    const result = await supabase.rpc("authorize_file_access", {
      target_file: id,
      access_kind: action,
    });
    const file = fileMetadataSchema.safeParse(result.data);
    if (
      result.error ||
      !file.success ||
      file.data.id !== id.toLowerCase() ||
      (action === "file_view" && file.data.mime !== "application/pdf")
    )
      return null;
    return file.data;
  } catch {
    return null;
  }
}
