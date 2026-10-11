import Link from "next/link";
import { Plus, Clock3, FolderOpen, FileCheck2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
const stats = [
  { label: "Em andamento", icon: FolderOpen },
  { label: "Aguardando você", icon: Clock3 },
  { label: "Entregues", icon: FileCheck2 },
];
export default function Processes() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Área do advogado</span>
          <h1>Seus processos, em um só lugar.</h1>
          <p>Acompanhe pedidos, documentos e entregas sem perder o contexto.</p>
        </div>
        <Link href="/app/novo-pedido" className="button">
          <Plus size={18} aria-hidden="true" />
          Novo pedido
        </Link>
      </div>
      <div className="stat-grid">
        {stats.map(({ label, icon: Icon }) => (
          <div className="stat" key={label}>
            <div className="stat-label">
              {label}
              <Icon size={18} aria-hidden="true" />
            </div>
            <div className="stat-value">0</div>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-header">
          <h2>Meus processos</h2>
          <span>0 processos</span>
        </div>
        <EmptyState
          title="Tudo começa com o primeiro pedido."
          description="Conte sobre o processo para receber uma proposta com os serviços e o prazo de entrega."
          href="/app/novo-pedido"
          label="Solicitar orçamento"
        />
      </section>
    </>
  );
}
