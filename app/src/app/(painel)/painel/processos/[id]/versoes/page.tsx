import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/modules/auth/session";
import {
  getPdfVersionScreen,
  pdfVersionHref,
} from "@/modules/pdf-versions/queries";
import { PdfVersionForm } from "@/components/pdf-version-form";
import { PdfViewer } from "@/components/pdf-viewer";
import { pieceLabel } from "@/modules/page-index/forms";
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
export default async function PdfVersions({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    arquivo?: string;
    pagina?: string;
    referencias?: string;
  }>;
}) {
  await requireRole(["calculator"]);
  const { id } = await params,
    search = await searchParams,
    data = await getPdfVersionScreen(id, search),
    context = data.context,
    review = context?.review;
  const selected = data.files.find((file) => file.id === data.selected);
  const base = `/painel/processos/${id}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Pasta do processo</span>
          <h1>Versões e leitura do PDF</h1>
          <p>
            Conferência manual, preservando o documento e as referências
            anteriores.
          </p>
        </div>
        <Link className="text-link" href={`${base}?aba=indice`}>
          Voltar ao índice
        </Link>
      </div>
      <section
        className="panel pdf-review-panel"
        aria-labelledby="pdf-selection"
      >
        <h2 id="pdf-selection">Escolher o PDF</h2>
        {!data.files.length ? (
          <p>Envie um PDF em Documentos antes de iniciar a conferência.</p>
        ) : (
          <form
            key={data.selected ?? "empty"}
            method="get"
            className="pdf-review-select"
            action={`${base}/versoes`}
          >
            <div className="form-field">
              <label htmlFor="review-file">PDF para conferir</label>
              <select
                id="review-file"
                name="arquivo"
                defaultValue={data.selected ?? ""}
              >
                {data.files.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.name} · ref. {file.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="button button-secondary">
              Abrir conferência
            </button>
          </form>
        )}
        <Link className="text-link" href={`${base}?aba=documentos`}>
          Enviar novo PDF na pasta
        </Link>
        {selected && (
          <div className="pdf-review-viewer">
            <h3>{selected.name}</h3>
            <p className="field-help">Referência: {selected.id}</p>
            <PdfViewer
              key={selected.id}
              id={selected.id}
              name={selected.name}
            />
          </div>
        )}
        {data.error && (
          <p role="alert" className="field-error">
            {data.error}
          </p>
        )}
      </section>
      {selected && context && !review && (
        <section className="panel pdf-review-panel">
          <h2>Registrar este PDF</h2>
          <p>
            Primeiro confira a quantidade de páginas no visualizador e selecione
            a versão anterior, quando houver. Nenhuma página ou referência será
            herdada automaticamente.
          </p>
          <PdfVersionForm
            processId={id}
            fileId={selected.id}
            revision={0}
            requestId={randomUUID()}
            key={`${selected.id}:register`}
            operation="register"
            heads={data.heads}
          />
        </section>
      )}
      {selected && context && review && (
        <>
          <section
            className="panel pdf-review-panel"
            aria-labelledby="pdf-reading"
          >
            <h2 id="pdf-reading">Leitura da versão {review.sequence}</h2>
            <p>
              {review.pageCount} páginas declaradas · {context.readCount} lidas
              · {review.pageCount - context.readCount} com leitura pendente.
            </p>
            <p className="field-help">
              Contagem conferida por {review.registeredName ?? "Calculista"} em{" "}
              {dateFormat.format(new Date(review.registeredAt))}. Abrir ou
              avançar no visualizador não marca leitura.
            </p>
            {review.previousFileId && (
              <p>
                Versão anterior:{" "}
                <Link
                  className="text-link"
                  href={pdfVersionHref(id, review.previousFileId)}
                >
                  {review.previousName ?? "PDF anterior"}
                </Link>
                . {context.mappedCount} correspondências confirmadas;{" "}
                {context.unmappedPrevious} páginas anteriores ainda sem
                correspondência.
              </p>
            )}
            <details className="pdf-review-editor">
              <summary>Marcar ou desmarcar páginas lidas</summary>
              <PdfVersionForm
                processId={id}
                fileId={selected.id}
                revision={review.revision}
                requestId={randomUUID()}
                key={`${selected.id}:read`}
                operation="read"
              />
            </details>
            <ol className="pdf-pages" aria-label="Leitura das páginas">
              {context.pages.map((row) => (
                <li key={row.page} data-pdf-page={row.page}>
                  <strong>Página {row.page}</strong>
                  <span>
                    {row.read
                      ? row.inherited
                        ? "Lida na versão anterior, com correspondência confirmada"
                        : "Lida e conferida"
                      : "Leitura pendente"}
                  </span>
                  <small>
                    {row.sourcePage
                      ? `Corresponde à página ${row.sourcePage} anterior`
                      : review.previousFileId
                        ? "Nova, alterada ou ainda não conferida"
                        : "Sem marcação automática"}
                  </small>
                  {row.checkedAt && (
                    <small>
                      {row.checkedName ?? "Calculista"} ·{" "}
                      {dateFormat.format(new Date(row.checkedAt))}
                    </small>
                  )}
                </li>
              ))}
            </ol>
            <nav
              className="folder-pagination"
              aria-label="Paginação das páginas do PDF"
            >
              {data.start > 1 && (
                <Link
                  className="text-link"
                  href={pdfVersionHref(
                    id,
                    selected.id,
                    Math.max(1, data.start - 50),
                    search.referencias,
                  )}
                >
                  Páginas anteriores
                </Link>
              )}
              {data.start + 50 <= review.pageCount && (
                <Link
                  className="text-link"
                  href={pdfVersionHref(
                    id,
                    selected.id,
                    data.start + 50,
                    search.referencias,
                  )}
                >
                  Próximas páginas
                </Link>
              )}
            </nav>
          </section>
          {review.previousFileId && (
            <section
              className="panel pdf-review-panel"
              aria-labelledby="pdf-mapping"
            >
              <h2 id="pdf-mapping">Conferir correspondências</h2>
              <p>
                Compare os PDFs antes de confirmar. Mesmo número de página, nome
                ou aparência não comprova correspondência. A leitura herdada
                registra a situação conferida no momento da confirmação.
              </p>
              <Link
                className="text-link"
                href={pdfVersionHref(id, review.previousFileId)}
              >
                Abrir a versão anterior para comparar
              </Link>
              <PdfVersionForm
                processId={id}
                fileId={selected.id}
                revision={review.revision}
                requestId={randomUUID()}
                key={`${selected.id}:map`}
                operation="map"
              />
              <h3>Referências da versão anterior</h3>
              <p>
                Só reaproveite uma referência quando todas as suas páginas
                tiverem correspondência confirmada. A origem e o responsável
                ficam registrados no índice.
              </p>
              {!context.entries.length ? (
                <p>Nenhuma referência nesta seleção.</p>
              ) : (
                <ul className="process-records">
                  {context.entries.map((entry) => (
                    <li key={entry.id} data-source-entry={entry.id}>
                      <strong>
                        {pieceLabel(entry.piece)} · Páginas {entry.pages}
                      </strong>
                      {entry.note && (
                        <p className="preserve-lines">{entry.note}</p>
                      )}
                      <p>
                        {entry.already_copied
                          ? "Referência já reaproveitada; confira o índice."
                          : entry.ready
                            ? "Correspondência integral confirmada."
                            : "Faltam correspondências ou a referência excede o limite de 500 páginas."}
                      </p>
                      <PdfVersionForm
                        processId={id}
                        fileId={selected.id}
                        revision={review.revision}
                        requestId={randomUUID()}
                        key={`${selected.id}:copy:${entry.id}`}
                        operation="copy"
                        entry={entry}
                        disabled={!entry.ready || entry.already_copied}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <nav
                className="folder-pagination"
                aria-label="Paginação das referências anteriores"
              >
                {data.before && (
                  <Link
                    className="text-link"
                    href={pdfVersionHref(id, selected.id, data.start)}
                  >
                    Referências recentes
                  </Link>
                )}
                {data.nextRefs && (
                  <Link
                    className="text-link"
                    href={pdfVersionHref(
                      id,
                      selected.id,
                      data.start,
                      data.nextRefs,
                    )}
                  >
                    Mais referências
                  </Link>
                )}
              </nav>
            </section>
          )}
        </>
      )}
    </>
  );
}
