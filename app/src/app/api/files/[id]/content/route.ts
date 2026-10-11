import { type NextRequest } from "next/server";
import { getAuthorizedFile } from "@/modules/files/authorized-file";
import { createSystemClient } from "@/lib/supabase/admin";
import { supabaseConfig } from "@/lib/supabase/config";
import { parseByteRange } from "@/modules/files/byte-range";

export const runtime = "nodejs";
export const maxDuration = 300;
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
async function read(request: NextRequest, id: string, method: "GET" | "HEAD") {
  const file = await getAuthorizedFile(id, "file_view");
  if (!file)
    return new Response("Arquivo não encontrado.", {
      status: 404,
      headers: privateHeaders,
    });
  let range;
  try {
    range = parseByteRange(request.headers.get("range"), file.size_bytes);
  } catch {
    return new Response(null, {
      status: 416,
      headers: {
        ...privateHeaders,
        "Content-Range": `bytes */${file.size_bytes}`,
      },
    });
  }
  try {
    const signed = await createSystemClient()
      .storage.from("processos")
      .createSignedUrl(file.path, 120);
    if (signed.error || !signed.data) throw new Error();
    const url = new URL(signed.data.signedUrl),
      origin = new URL(supabaseConfig()!.url).origin;
    if (
      url.origin !== origin ||
      !url.pathname.startsWith("/storage/v1/object/sign/processos/")
    )
      throw new Error();
    const upstream = await fetch(url, {
      method,
      cache: "no-store",
      redirect: "error",
      signal: request.signal,
      headers: {
        "Accept-Encoding": "identity",
        ...(range ? { Range: range.header } : {}),
      },
    });
    const length = range ? range.end - range.start + 1 : file.size_bytes;
    const contentRange = range
      ? `bytes ${range.start}-${range.end}/${file.size_bytes}`
      : null;
    if (
      upstream.status !== (range ? 206 : 200) ||
      Number(upstream.headers.get("content-length")) !== length ||
      (range && upstream.headers.get("content-range") !== contentRange)
    ) {
      await upstream.body?.cancel();
      throw new Error();
    }
    const headers = new Headers({
      ...privateHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Accept-Ranges": "bytes",
      "Content-Length": String(length),
    });
    if (contentRange) headers.set("Content-Range", contentRange);
    // O stream preserva contrapressão/cancelamento. Nenhum PDF inteiro nem URL assinada sai em logs.
    return new Response(method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return new Response("Arquivo indisponível. Tente novamente.", {
      status: 503,
      headers: privateHeaders,
    });
  }
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return read(request, (await params).id, "GET");
}
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return read(request, (await params).id, "HEAD");
}
