import { getQuotePdfExport } from "@/modules/quotes/queries";
import { renderQuotePdf } from "@/modules/quotes/pdf";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getQuotePdfExport((await params).id);
  if (result.error)
    return new Response(result.error, { status: result.status, headers });
  try {
    const buffer = await renderQuotePdf(result.data!);
    return new Response(new Uint8Array(buffer), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="proposta-${result.data!.number}.pdf"`,
      },
    });
  } catch {
    return new Response("Não foi possível gerar o PDF. Tente novamente.", {
      status: 503,
      headers,
    });
  }
}
