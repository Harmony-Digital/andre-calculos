import Link from "next/link";
import { Plus, Clock3, FolderOpen, FileCheck2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { listDrafts } from "@/modules/checklist/queries";
import { calculationLabels } from "@/modules/checklist/v1";
import { listProcesses } from "@/modules/processes/queries";
const stats = [
  { label: "Em andamento", icon: FolderOpen },
  { label: "Aguardando você", icon: Clock3 },
  { label: "Entregues", icon: FileCheck2 },
];
export default async function Processes() {
  const [processes, drafts] = await Promise.all([
    listProcesses(),
    listDrafts(),
  ]);
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
      {drafts.length > 0 && (
        <section className="panel">
          <div className="panel-header">
            <h2>Rascunhos</h2>
            <span>{drafts.length} rascunho(s)</span>
          </div>
          <ul className="document-list">
            {drafts.map((draft) => (
              <li key={draft.id} className="document-row">
                <div>
                  <strong>{draft.code}</strong>
                  <p>
                    {
                      calculationLabels[
                        draft.calc_type as keyof typeof calculationLabels
                      ]
                    }
                  </p>
                </div>
                <Link
                  className="text-link"
                  href={`/app/novo-pedido?rascunho=${draft.id}`}
                >
                  Continuar rascunho
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel">
        <div className="panel-header">
          <h2>Meus processos</h2>
          <span>{processes.length} processo(s)</span>
        </div>
        {processes.length ? (
          <ul className="document-list">
            {processes.map((process) => (
              <li className="document-row" key={process.id}>
                <div>
                  <strong>
                    {process.cnj_number.replace(
                      /^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/,
                      "$1-$2.$3.$4.$5.$6",
                    )}
                  </strong>
                  <p>
                    {process.court} · {process.chamber}
                  </p>
                </div>
                <Link
                  className="text-link"
                  href={`/app/processos/${process.id}`}
                >
                  Abrir pasta
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Tudo começa com o primeiro pedido."
            description="Conte sobre o processo para receber uma proposta com os serviços e o prazo de entrega."
            href="/app/novo-pedido"
            label="Solicitar orçamento"
          />
        )}
      </section>
    </>
  );
}
