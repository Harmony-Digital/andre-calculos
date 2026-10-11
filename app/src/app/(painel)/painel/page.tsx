import { EmptyState } from "@/components/empty-state";
import { ListOrdered, Clock3, FileCheck2 } from "lucide-react";
const stats = [
  { label: "Na fila", icon: ListOrdered },
  { label: "Vencendo em breve", icon: Clock3 },
  { label: "Entregues", icon: FileCheck2 },
];
export default function Panel() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Painel do André</span>
          <h1>Uma visão clara do trabalho.</h1>
          <p>Os pedidos e os prazos que precisam da sua atenção.</p>
        </div>
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
          <h2>Próximos trabalhos</h2>
        </div>
        <EmptyState
          title="A fila está vazia."
          description="Pedidos aceitos com sinal confirmado entram aqui, ordenados pelo prazo interno."
        />
      </section>
    </>
  );
}
