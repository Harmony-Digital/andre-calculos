import Link from "next/link";
import { requireRole } from "@/modules/auth/session";
import { getPanelClients } from "@/modules/dashboard/lists";
export default async function Clients({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; depois?: string }>;
}) {
  await requireRole(["calculator"]);
  const search = await searchParams,
    data = await getPanelClients(search.periodo, search.depois),
    filter = search.periodo === "7dias" ? "&periodo=7dias" : "";
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Clientes</h1>
          <p>Cadastros e identificação profissional.</p>
        </div>
        <Link className="text-link" href="/painel">
          Voltar à visão geral
        </Link>
      </div>
      <section className="panel dashboard-panel">
        <form
          method="get"
          action="/painel/clientes"
          className="timeline-filter"
        >
          <label htmlFor="client-period">Período de cadastro</label>
          <select
            id="client-period"
            name="periodo"
            defaultValue={search.periodo ?? "todos"}
          >
            <option value="todos">Todos os cadastros</option>
            <option value="7dias">Últimos sete dias corridos</option>
          </select>
          <button className="button button-secondary" type="submit">
            Aplicar filtro
          </button>
        </form>
        {!data.rows.length ? (
          <p className="form-body">Nenhum cliente nesta seleção.</p>
        ) : (
          <ul className="dashboard-list">
            {data.rows.map((row) => (
              <li key={row.id} data-client-id={row.id}>
                <strong>
                  {row.legal_name || row.profile?.full_name || "Cliente"}
                </strong>
                <p>
                  {row.profile?.full_name || "Nome a completar"}
                  {row.profile?.oab_number &&
                    ` · OAB ${row.profile.oab_state ?? ""} ${row.profile.oab_number}`}
                </p>
                <p>
                  Cadastro em{" "}
                  <time dateTime={row.created_at}>
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "America/Sao_Paulo",
                    }).format(new Date(row.created_at))}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        )}
        <nav className="folder-pagination" aria-label="Paginação de clientes">
          {data.before && (
            <Link
              className="text-link"
              href={`/painel/clientes?${filter.slice(1)}`}
            >
              Cadastros recentes
            </Link>
          )}
          {data.next && (
            <Link
              className="text-link"
              href={`/painel/clientes?depois=${encodeURIComponent(data.next)}${filter}`}
            >
              Próximos clientes
            </Link>
          )}
        </nav>
      </section>
    </>
  );
}
