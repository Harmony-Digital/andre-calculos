import { InvoiceView } from "@/components/invoice-view";
export default async function Invoice({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pedido?: string; aviso?: string; fase?: string }>;
}) {
  const { id } = await params,
    search = await searchParams;
  return (
    <InvoiceView
      processId={id}
      orderId={search.pedido ?? ""}
      phase={search.fase ?? "deposit"}
      openingChanged={search.aviso === "atualizada"}
    />
  );
}
