import { downloadContractPdf } from "@/modules/quotes/contract-download";
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
  const result = await downloadContractPdf((await params).id);
  if (result.error)
    return new Response(result.error, { status: result.status, headers });
  return new Response(new Uint8Array(result.bytes!), {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="contrato-${result.number}.pdf"`,
    },
  });
}
