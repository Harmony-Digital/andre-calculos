import { getContractPdfState } from "@/modules/quotes/contract-queries";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getContractPdfState((await params).id);
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };
  return result.error
    ? Response.json({ error: result.error }, { status: result.status, headers })
    : Response.json(result.data, { headers });
}
