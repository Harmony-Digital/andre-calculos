import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionProfile } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { createSystemClient } from "@/lib/supabase/admin";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionProfile();
  const { id } = await params;
  if (
    !session ||
    !["client", "calculator"].includes(session.profile.role) ||
    !z.uuid().safeParse(id).success
  )
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  const supabase = await createSessionClient();
  const file = await supabase
    .from("files")
    .select("id,path,name,upload_status")
    .eq("id", id)
    .single();
  if (file.error || !file.data || file.data.upload_status !== "uploaded")
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  const audit = await supabase.rpc("record_file_access", { target_file: id });
  if (audit.error)
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  const system = createSystemClient();
  const signed = await system.storage
    .from("processos")
    .createSignedUrl(file.data.path, 120, { download: file.data.name });
  if (signed.error || !signed.data)
    return new NextResponse("Arquivo indisponível.", { status: 503 });
  return NextResponse.redirect(signed.data.signedUrl, {
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
