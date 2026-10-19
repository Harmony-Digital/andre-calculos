import { notFound } from "next/navigation";
import { getUpdateStart } from "@/modules/calculation-updates/queries";
import { CalculationUpdateStart } from "@/components/calculation-update-start";
export default async function UpdatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ origem?: string }>;
}) {
  const { id } = await params,
    { origem } = await searchParams;
  if (!origem) notFound();
  const data = await getUpdateStart(id, origem);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Pedido original preservado</span>
          <h1>Solicitar atualização</h1>
          <p>Cálculo anterior: {data.order.code}</p>
        </div>
      </div>
      <CalculationUpdateStart
        key={origem}
        processId={id}
        sourceOrderId={origem}
        files={data.files}
      />
    </>
  );
}
