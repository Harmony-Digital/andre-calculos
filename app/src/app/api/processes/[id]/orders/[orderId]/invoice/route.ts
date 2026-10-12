import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/modules/auth/session";
import { getInvoicePage } from "@/modules/payments/invoice-page-data";
import { portalOrigin } from "@/modules/auth/origin";
import { invoicePhaseSchema } from "@/modules/payments/invoice-presentation";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
/** O clique abre por consulta atual; nenhum destino fornecido pelo navegador. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  try {
    const { id, orderId } = await params,
      session = await authorize(["client", "calculator"]);
    const phase = invoicePhaseSchema.parse(
      request.nextUrl.searchParams.get("fase") ?? "deposit",
    );
    const { invoice } = await getInvoicePage(orderId, id, phase);
    if (invoice.state === "active" && invoice.invoiceUrl)
      return NextResponse.redirect(invoice.invoiceUrl, {
        status: 303,
        headers,
      });
    const path = `${session.profile.role === "calculator" ? "/painel" : "/app"}/processos/${invoice.processId}/fatura?pedido=${invoice.orderId}${phase === "balance" ? "&fase=balance" : ""}&aviso=atualizada`;
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
