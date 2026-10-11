"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";

const assetRoot = `/pdfjs/${pdfjs.version}/`;
pdfjs.GlobalWorkerOptions.workerSrc = `${assetRoot}pdf.worker.min.mjs`;
const options = {
  enableXfa: false,
  verbosity: 0,
  cMapUrl: `${assetRoot}cmaps/`,
  standardFontDataUrl: `${assetRoot}standard_fonts/`,
  wasmUrl: `${assetRoot}wasm/`,
  disableAutoFetch: true,
  disableStream: true,
  rangeChunkSize: 1024 * 1024,
};
export default function PdfPreview({
  id,
  name,
  close,
}: {
  id: string;
  name: string;
  close: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320),
    [pages, setPages] = useState(0),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState(""),
    [challenge, setChallenge] = useState<{
      update: (value: string | null) => void;
      incorrect: boolean;
    } | null>(null);
  const onPassword = useCallback(
    (update: (value: string | null) => void, reason: number) => {
      setPassword("");
      setChallenge({ update, incorrect: reason === 2 });
    },
    [],
  );
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.floor(entries[0].contentRect.width)),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return (
    <section className="pdf-preview" aria-label={`Visualização de ${name}`}>
      <div className="pdf-controls">
        <button
          className="button button-secondary"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Página anterior
        </button>
        <span role="status">
          {pages ? `Página ${page} de ${pages}` : "Carregando PDF…"}
        </span>
        <button
          className="button button-secondary"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Próxima página
        </button>
        <label>
          Zoom
          <select
            aria-label="Zoom do PDF"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
          </select>
        </label>
      </div>
      {challenge && (
        <form
          className="pdf-password"
          onSubmit={(event) => {
            event.preventDefault();
            challenge.update(password);
            setPassword("");
            setChallenge(null);
          }}
        >
          <p>
            {challenge.incorrect
              ? "Senha incorreta. Tente novamente."
              : "Este PDF está protegido por senha."}
          </p>
          <label>
            Senha do PDF
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="button" type="submit">
            Abrir PDF
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={close}
          >
            Cancelar visualização
          </button>
        </form>
      )}
      <div
        className="pdf-canvas"
        ref={root}
        tabIndex={0}
        role="region"
        aria-label="Página do PDF"
      >
        <Document
          key={attempt}
          file={`/api/files/${id}/content`}
          options={options}
          suspense={false}
          onPassword={onPassword}
          onLoadSuccess={({ numPages }) => {
            setPages(numPages);
            setPage(1);
          }}
          loading={<p role="status">Carregando documento…</p>}
          error={
            <div role="alert">
              <p>
                Não foi possível abrir este PDF. Confira o arquivo ou tente
                novamente.
              </p>
              <button
                className="button button-secondary"
                onClick={() => {
                  setPages(0);
                  setAttempt(attempt + 1);
                }}
              >
                Tentar novamente
              </button>
            </div>
          }
        >
          <Page
            pageNumber={page}
            width={Math.min(width, 900) * zoom}
            renderAnnotationLayer={false}
            renderForms={false}
            loading={<p role="status">Preparando página…</p>}
            error={<p role="alert">Não foi possível exibir esta página.</p>}
          />
        </Document>
      </div>
    </section>
  );
}
