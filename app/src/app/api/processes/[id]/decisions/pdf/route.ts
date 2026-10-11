import { getAuthorizedDecisionExport } from "@/modules/decisions/export";
import { renderDecisionPdf } from "@/modules/decisions/pdf";
export const runtime = "nodejs";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAuthorizedDecisionExport(id);
  if (result.error)
    return new Response(result.error, {
      status: result.status,
      headers: privateHeaders,
    });
  try {
    const buffer = await renderDecisionPdf(result.data!);
    return new Response(new Uint8Array(buffer), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="decisoes-${result.data!.process.cnj}.pdf"`,
      },
    });
  } catch {
    return new Response(
      "Não foi possível gerar o documento. Tente novamente.",
      { status: 503, headers: privateHeaders },
    );
  }
}
