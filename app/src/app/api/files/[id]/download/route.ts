import { NextResponse, type NextRequest } from "next/server";
import { createSystemClient } from "@/lib/supabase/admin";
import { getAuthorizedFile } from "@/modules/files/authorized-file";
import { supabaseConfig } from "@/lib/supabase/config";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const file = await getAuthorizedFile(id, "file_download");
  if (!file)
    return new NextResponse("Arquivo não encontrado.", {
      status: 404,
      headers: privateHeaders,
    });
  try {
    const system = createSystemClient();
    const signed = await system.storage
      .from("processos")
      .createSignedUrl(file.path, 120, { download: file.name });
    if (signed.error || !signed.data)
      return new NextResponse("Arquivo indisponível.", {
        status: 503,
        headers: privateHeaders,
      });
    const url = new URL(signed.data.signedUrl);
    if (
      url.origin !== new URL(supabaseConfig()!.url).origin ||
      !url.pathname.startsWith("/storage/v1/object/sign/processos/")
    )
      throw new Error();
    return NextResponse.redirect(signed.data.signedUrl, {
      headers: privateHeaders,
    });
  } catch {
    return new NextResponse("Arquivo indisponível.", {
      status: 503,
      headers: privateHeaders,
    });
  }
}
