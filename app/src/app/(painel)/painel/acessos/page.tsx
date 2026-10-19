import Link from "next/link";
import { requireRole } from "@/modules/auth/session";
import { getFileAccessAudit } from "@/modules/files/audit-queries";
import {
  fileAccessLabels,
  fileAuditHref,
  parseFileAuditFilters,
  type FileAuditSearch,
} from "@/modules/files/audit";

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
});
export default async function FileAccessAudit({
  searchParams,
}: {
  searchParams: Promise<FileAuditSearch>;
}) {
  await requireRole(["calculator"]);
  const search = await searchParams,
    data = await getFileAccessAudit(search);
  const parsed = parseFileAuditFilters(search);
  const filters = parsed.ok ? parsed.filters : undefined;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Acessos a arquivos</h1>
          <p>
            Consulte quem recebeu autorização para visualizar ou baixar um
            arquivo.
          </p>
        </div>
        <Link className="text-link" href="/painel">
          Voltar à visão geral
        </Link>
      </div>
      <section className="panel file-audit" aria-labelledby="audit-title">
        <h2 id="audit-title">Registro de autorizações</h2>
        <p className="file-audit-note" id="audit-explanation">
          Autorizações de visualização ou download, sem confirmação de leitura.
          Horários de São Paulo.
        </p>
        <details className="file-audit-help">
          <summary>Como interpretar os registros</summary>
          <p>
            O carregamento de partes do PDF pode gerar várias autorizações. Um
            registro não confirma o recebimento completo do arquivo. Nomes e
            versões correspondem ao cadastro atual.
          </p>
        </details>
        <form
          method="get"
          action="/painel/acessos"
          className="file-audit-filters"
          aria-describedby="audit-explanation"
        >
          <div className="form-field">
            <label htmlFor="audit-file">Arquivo</label>
            <input
              id="audit-file"
              name="arquivo"
              maxLength={255}
              defaultValue={filters?.arquivo}
              placeholder="Nome ou identificação"
            />
            <small>Parte do nome ou identificação completa do arquivo.</small>
          </div>
          <div className="form-field">
            <label htmlFor="audit-actor">Autor do acesso</label>
            <input
              id="audit-actor"
              name="autor"
              maxLength={255}
              defaultValue={filters?.autor}
              placeholder="Nome ou identificação"
            />
            <small>Parte do nome ou identificação completa da pessoa.</small>
          </div>
          <div className="form-field">
            <label htmlFor="audit-start">Data inicial</label>
            <input
              id="audit-start"
              name="inicio"
              type="date"
              min="1900-01-01"
              max="9999-12-31"
              defaultValue={filters?.inicio}
            />
          </div>
          <div className="form-field">
            <label htmlFor="audit-end">Data final</label>
            <input
              id="audit-end"
              name="fim"
              type="date"
              min="1900-01-01"
              max="9999-12-31"
              defaultValue={filters?.fim}
            />
            <small>Inclui todo o dia selecionado.</small>
          </div>
          <div className="form-field">
            <label htmlFor="audit-action">Ação</label>
            <select
              id="audit-action"
              name="acao"
              defaultValue={filters?.acao ?? ""}
            >
              <option value="">Todas as ações</option>
              <option value="file_view">Visualização autorizada</option>
              <option value="file_download">Download autorizado</option>
            </select>
          </div>
          <div className="file-audit-buttons">
            <button type="submit" className="button button-secondary">
              Consultar acessos
            </button>
            <Link href="/painel/acessos" className="text-link">
              Limpar filtros
            </Link>
          </div>
        </form>
        {!data.ok ? (
          <p role="alert" className="field-error">
            {data.error}
          </p>
        ) : (
          <>
            <p className="file-audit-note">
              {data.rows.length
                ? `${data.rows.length} registros nesta página, do mais recente ao mais antigo.`
                : "Nenhum acesso encontrado para estes filtros."}
            </p>
            <ol className="file-audit-list" aria-label="Autorizações de acesso">
              {data.rows.map((row) => (
                <li key={row.id} data-audit-record={row.id}>
                  <div>
                    <time dateTime={row.created_at}>
                      {dateFormat.format(new Date(row.created_at))}
                    </time>
                    <p className="file-audit-action">
                      {fileAccessLabels[row.action]}
                    </p>
                  </div>
                  <div>
                    <span className="file-audit-label">Autor</span>
                    {row.actor_id ? (
                      <Link
                        className="text-link"
                        title="Filtrar por este autor"
                        href={fileAuditHref({
                          ...data.filters,
                          autor: row.actor_id,
                        })}
                      >
                        {row.actor_name || "Autor indisponível"}
                      </Link>
                    ) : (
                      <span>Autor indisponível</span>
                    )}
                  </div>
                  <div>
                    <span className="file-audit-label">Arquivo</span>
                    <Link
                      className="text-link"
                      title="Filtrar por este arquivo"
                      href={fileAuditHref({
                        ...data.filters,
                        arquivo: row.file_id,
                      })}
                    >
                      {row.file_name || "Arquivo indisponível"}
                      {row.file_version ? ` · versão ${row.file_version}` : ""}
                    </Link>
                    <small>Referência: {row.file_id}</small>
                  </div>
                </li>
              ))}
            </ol>
            <nav
              className="folder-pagination"
              aria-label="Paginação dos acessos"
            >
              {data.before && (
                <Link className="text-link" href={fileAuditHref(data.filters)}>
                  Registros recentes
                </Link>
              )}
              {data.next && (
                <Link
                  className="text-link"
                  href={fileAuditHref(data.filters, data.next)}
                >
                  Próximos registros
                </Link>
              )}
            </nav>
          </>
        )}
      </section>
    </>
  );
}
