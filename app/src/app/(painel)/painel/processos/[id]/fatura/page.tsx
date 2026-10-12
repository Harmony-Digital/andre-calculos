import { InvoiceView } from "@/components/invoice-view";
export default async function Invoice({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pedido?: string; aviso?: string }>;
}) {
  const { id } = await params,
    search = await searchParams;
  return (
    <InvoiceView
      processId={id}
      orderId={search.pedido ?? ""}
      panel
      openingChanged={search.aviso === "atualizada"}
    />
  );
}
