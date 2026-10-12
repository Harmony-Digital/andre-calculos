import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/modules/auth/session";
import { getInvoicePage } from "@/modules/payments/invoice-page-data";
import { portalOrigin } from "@/modules/auth/origin";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
/** O clique abre por consulta atual; nenhum destino fornecido pelo navegador. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  try {
    const { id, orderId } = await params,
      session = await authorize(["client", "calculator"]);
    const { invoice } = await getInvoicePage(orderId, id);
    if (invoice.state === "active" && invoice.invoiceUrl)
      return NextResponse.redirect(invoice.invoiceUrl, {
        status: 303,
        headers,
      });
    const path = `${session.profile.role === "calculator" ? "/painel" : "/app"}/processos/${invoice.processId}/fatura?pedido=${invoice.orderId}&aviso=atualizada`;
    return NextResponse.redirect(new URL(path, portalOrigin()), {
      status: 303,
      headers,
    });
  } catch {
    return new NextResponse(
      "Fatura indisponível. Volte à pasta do processo e solicite uma nova conferência.",
      { status: 404, headers },
    );
  }
}
