import { NextResponse, type NextRequest } from "next/server";
import { createSystemClient } from "@/lib/supabase/admin";
import { getAuthorizedFile } from "@/modules/files/authorized-file";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const file = await getAuthorizedFile(id, "file_download");
  if (!file)
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  const system = createSystemClient();
  const signed = await system.storage
    .from("processos")
    .createSignedUrl(file.path, 120, { download: file.name });
  if (signed.error || !signed.data)
    return new NextResponse("Arquivo indisponível.", { status: 503 });
  return NextResponse.redirect(signed.data.signedUrl, {
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
