import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
const sections: Record<string, { title: string; description: string }> = {
  fila: {
    title: "Fila de trabalho",
    description: "Os pedidos são organizados pelo prazo interno.",
  },
  pedidos: {
    title: "Pedidos",
    description: "Acompanhe os pedidos em cada etapa.",
  },
  clientes: {
    title: "Clientes",
    description: "Cadastros e histórico de solicitações.",
  },
  configuracoes: {
    title: "Configurações",
    description:
      "Dados do responsável, tabela de preços e condições do serviço.",
  },
};
export default async function PanelSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const entry = sections[section];
  if (!entry) notFound();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{entry.title}</h1>
          <p>{entry.description}</p>
        </div>
      </div>
      <section className="panel">
        <EmptyState
          title="Nenhum registro disponível."
          description="Os dados do serviço aparecerão aqui quando o ambiente estiver configurado."
        />
      </section>
    </>
  );
}
