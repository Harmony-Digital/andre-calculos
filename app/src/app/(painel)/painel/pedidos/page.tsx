import Link from "next/link";
import { requireRole } from "@/modules/auth/session";
import { getPanelOrders } from "@/modules/dashboard/lists";
import {
  orderStateLabels,
  type OrderState,
} from "@/modules/orders/state-machine";
import { queueMoney } from "@/modules/queue/queue";
export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{ selecao?: string; depois?: string }>;
}) {
  await requireRole(["calculator"]);
  const search = await searchParams,
    data = await getPanelOrders(search.selecao, search.depois),
    filter =
      search.selecao && search.selecao !== "todos"
        ? `&selecao=${search.selecao}`
        : "";
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {search.selecao === "propostas" ? "Propostas abertas" : "Pedidos"}
          </h1>
          <p>
            {search.selecao === "propostas"
              ? "Ofertas válidas sem aceite, de pedidos orçados."
              : "Acompanhe os pedidos em cada etapa."}
          </p>
        </div>
        <Link className="text-link" href="/painel">
          Voltar à visão geral
        </Link>
      </div>
      <section className="panel dashboard-panel">
        <form method="get" action="/painel/pedidos" className="timeline-filter">
          <label htmlFor="order-selection">Selecionar pedidos</label>
          <select
            id="order-selection"
            name="selecao"
            defaultValue={search.selecao ?? "todos"}
          >
            <option value="todos">Todos os pedidos</option>
            <option value="propostas">Propostas abertas</option>
            <option value="pagamento">Aguardando pagamento</option>
          </select>
          <button className="button button-secondary" type="submit">
            Aplicar filtro
          </button>
        </form>
        {!data.rows.length ? (
          <p className="form-body">Nenhum registro nesta seleção.</p>
        ) : (
          <ul className="dashboard-list">
            {data.rows.map((row) => (
              <li key={row.id} data-panel-record={row.id}>
                <Link
                  className="text-link"
                  href={`/painel/processos/${row.processId}?aba=resumo`}
                >
                  {row.code} · {row.client}
                </Link>
                <p>
                  {row.orderCode} · {orderStateLabels[row.status as OrderState]}{" "}
                  · {queueMoney(row.total)}
                </p>
                {row.validUntil && (
                  <p>
                    Válida até{" "}
                    <time dateTime={row.validUntil}>
                      {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "America/Sao_Paulo",
                      }).format(new Date(row.validUntil))}
                    </time>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <nav className="folder-pagination" aria-label="Paginação de pedidos">
          {data.before && (
            <Link
              className="text-link"
              href={`/painel/pedidos?${filter.slice(1)}`}
            >
              Registros recentes
            </Link>
          )}
          {data.next && (
            <Link
              className="text-link"
              href={`/painel/pedidos?depois=${encodeURIComponent(data.next)}${filter}`}
            >
              Próximos registros
            </Link>
          )}
        </nav>
      </section>
    </>
  );
}
