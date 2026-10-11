import Link from "next/link";
import { requireRole } from "@/modules/auth/session";
import { getWorkQueue } from "@/modules/queue/queries";
import {
  queueStates,
  todayInSaoPaulo,
  deadlineBadge,
  queueMoney,
} from "@/modules/queue/queue";
import {
  orderStateLabels,
  type OrderState,
} from "@/modules/orders/state-machine";
import { calculationLabels } from "@/modules/checklist/v1";
const complexityLabels: Record<string, string> = {
  simple: "Simples",
  medium: "Média",
  high: "Alta",
};
const date = (value: string | null) =>
  value ? value.split("-").reverse().join("/") : "A definir";
export default async function WorkQueue({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string; depois?: string }>;
}) {
  await requireRole(["calculator"]);
  const search = await searchParams,
    data = await getWorkQueue(search.situacao, search.depois),
    today = todayInSaoPaulo();
  const fields = (row: (typeof data.rows)[number]) => {
    const badge = deadlineBadge(row.internal_due_date, today);
    return {
      badge,
      type:
        calculationLabels[row.calc_type as keyof typeof calculationLabels] ??
        "Cálculo",
      complexity: complexityLabels[row.complexity ?? ""] ?? "A classificar",
      status: orderStateLabels[row.status as OrderState],
    };
  };
  const filter = data.status ? `&situacao=${data.status}` : "";
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Fila de trabalho</h1>
          <p>Pedidos em andamento, organizados pelo prazo interno.</p>
        </div>
      </div>
      <section className="panel work-queue">
        <form method="get" action="/painel/fila" className="timeline-filter">
          <label htmlFor="queue-status">Filtrar situação</label>
          <select
            id="queue-status"
            name="situacao"
            defaultValue={data.status ?? "todos"}
          >
            <option value="todos">Todas em andamento</option>
            {queueStates.map((state) => (
              <option key={state} value={state}>
                {orderStateLabels[state]}
              </option>
            ))}
          </select>
          <button className="button button-secondary" type="submit">
            Aplicar filtro
          </button>
        </form>
        <p className="field-help">
          Os destaques de dois dias úteis usam o calendário provisório. Confira
          feriados e suspensões locais do TRT antes de fechar os prazos.
        </p>
        {!data.rows.length ? (
          <p>Nenhum pedido nesta seleção.</p>
        ) : (
          <>
            <div className="queue-desktop">
              <table className="queue-table">
                <caption className="sr-only">
                  Pedidos ordenados por prazo interno, com situação financeira.
                </caption>
                <thead>
                  <tr>
                    {[
                      "Pedido",
                      "Cliente",
                      "Tipo",
                      "Complexidade",
                      "Valor",
                      "Pagamento",
                      "Situação",
                      "Prazo interno",
                    ].map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const v = fields(row);
                    return (
                      <tr key={row.id} data-order-id={row.id}>
                        <td>
                          <Link
                            className="text-link"
                            href={`/painel/processos/${row.process_id}?aba=resumo`}
                          >
                            {row.code}
                          </Link>
                        </td>
                        <td>{row.clientName}</td>
                        <td>{v.type}</td>
                        <td>{v.complexity}</td>
                        <td className="queue-money">
                          {queueMoney(row.total_cents)}
                        </td>
                        <td>{row.payment}</td>
                        <td>{v.status}</td>
                        <td>
                          <time dateTime={row.internal_due_date ?? undefined}>
                            {date(row.internal_due_date)}
                          </time>
                          <span
                            className={`deadline-badge deadline-${v.badge.kind}`}
                          >
                            {v.badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="queue-mobile">
              {data.rows.map((row) => {
                const v = fields(row);
                return (
                  <li
                    className="queue-card"
                    key={row.id}
                    data-order-id={row.id}
                  >
                    <div className="queue-card-heading">
                      <Link
                        className="text-link"
                        href={`/painel/processos/${row.process_id}?aba=resumo`}
                      >
                        {row.code}
                      </Link>
                      <span
                        className={`deadline-badge deadline-${v.badge.kind}`}
                      >
                        {v.badge.label}
                      </span>
                    </div>
                    <p>{row.clientName}</p>
                    <dl>
                      {[
                        ["Tipo", v.type],
                        ["Complexidade", v.complexity],
                        ["Valor", queueMoney(row.total_cents)],
                        ["Pagamento", row.payment],
                        ["Situação", v.status],
                        ["Prazo interno", date(row.internal_due_date)],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {(data.after || data.next) && (
          <nav className="folder-pagination" aria-label="Paginação da fila">
            {data.after && (
              <Link
                className="text-link"
                href={`/painel/fila?${filter.slice(1)}`}
              >
                Primeiros pedidos
              </Link>
            )}
            {data.next && (
              <Link
                className="text-link"
                href={`/painel/fila?depois=${encodeURIComponent(data.next)}${filter}`}
              >
                Próximos pedidos
              </Link>
            )}
          </nav>
        )}
      </section>
    </>
  );
}
