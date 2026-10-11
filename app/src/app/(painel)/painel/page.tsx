import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { requireRole } from "@/modules/auth/session";
import { getDashboard } from "@/modules/dashboard/queries";
import { deadlineBadge } from "@/modules/queue/queue";
import {
  orderStateLabels,
  type OrderState,
} from "@/modules/orders/state-machine";
const cards = [
  {
    key: "registrations",
    label: "Cadastros nos últimos 7 dias",
    href: "/painel/clientes?periodo=7dias",
  },
  {
    key: "quotes",
    label: "Propostas abertas",
    href: "/painel/pedidos?selecao=propostas",
  },
  {
    key: "payments",
    label: "Aguardando pagamento",
    href: "/painel/pedidos?selecao=pagamento",
  },
  { key: "queued", label: "Na fila", href: "/painel/fila?situacao=queued" },
  {
    key: "soon",
    label: "Vencendo em até 2 dias úteis",
    href: "/painel/fila?prazo=vencendo",
  },
  { key: "overdue", label: "Atrasados", href: "/painel/fila?prazo=atrasados" },
] as const;
export default async function Panel() {
  const session = await requireRole(["calculator", "admin"]);
  if (session.profile.role === "admin")
    return (
      <>
        <div className="page-heading">
          <div>
            <h1>Administração do serviço</h1>
            <p>Dados do responsável técnico e configurações comerciais.</p>
          </div>
        </div>
        <section className="panel">
          <div className="form-body">
            <h2>Configurações</h2>
            <p>
              Confira os dados profissionais, contatos e versões da tabela de
              preços.
            </p>
            <Link className="text-link" href="/painel/configuracoes">
              Abrir configurações
            </Link>
          </div>
        </section>
      </>
    );
  const data = await getDashboard();
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
        {cards.map((card) => (
          <Link
            className="stat dashboard-stat"
            key={card.key}
            href={card.href}
            data-stat={card.key}
          >
            <span className="stat-label">{card.label}</span>
            <span className="stat-value">{data.counts[card.key]}</span>
            <span className="dashboard-stat-link">Ver lista</span>
          </Link>
        ))}
      </div>
      <p className="field-help">
        Propostas abertas são ofertas válidas sem aceite de pedidos orçados.
        Prazos em andamento incluem ajustes e usam o calendário provisório;
        confira feriados e suspensões locais do TRT. Cadastros consideram os
        últimos sete dias corridos.
      </p>
      <section className="panel">
        <div className="panel-header">
          <h2>Próximos trabalhos</h2>
          <Link className="text-link" href="/painel/fila">
            Abrir fila completa
          </Link>
        </div>
        {!data.next.length ? (
          <EmptyState
            title="A fila está vazia."
            description="Pedidos aceitos com sinal confirmado entram aqui, ordenados pelo prazo interno."
          />
        ) : (
          <ul className="dashboard-work">
            {data.next.map((row) => {
              const badge = deadlineBadge(
                row.internal_due_date,
                data.window.today,
              );
              return (
                <li key={row.id} data-next-order={row.id}>
                  <div>
                    <Link
                      className="text-link"
                      href={`/painel/processos/${row.process_id}?aba=resumo`}
                    >
                      {row.code} · {row.clientName}
                    </Link>
                    <p>{orderStateLabels[row.status as OrderState]}</p>
                  </div>
                  <div>
                    <time dateTime={row.internal_due_date ?? undefined}>
                      {row.internal_due_date
                        ? row.internal_due_date.split("-").reverse().join("/")
                        : "Prazo a definir"}
                    </time>
                    <span className={`deadline-badge deadline-${badge.kind}`}>
                      {badge.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
