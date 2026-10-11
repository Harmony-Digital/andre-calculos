"use client";
import { useActionState, useState, useId } from "react";
import { saveIndexEntry, type IndexState } from "@/modules/page-index/actions";
import { indexPieces } from "@/modules/page-index/forms";
type SourceFile = { id: string; name: string; version: number };
type Entry = {
  id: string;
  file_id: string;
  piece: string;
  pages: string;
  note: string | null;
  revision: number;
};
export function PageIndexEditor({
  processId,
  requestId,
  entryId,
  files = [],
  entry,
}: {
  processId: string;
  requestId: string;
  entryId: string;
  files?: SourceFile[];
  entry?: Entry;
}) {
  const [initialKey] = useState(requestId),
    [initialEntry] = useState(entryId),
    [values, setValues] = useState({
      fileId: entry?.file_id ?? files[0]?.id ?? "",
      piece: entry?.piece ?? "initial",
      pages: entry?.pages ?? "",
      note: entry?.note ?? "",
    });
  const [state, action, pending] = useActionState<IndexState, FormData>(
    async (previous, form) => {
      try {
        const result = await saveIndexEntry(previous, form);
        if (result.success && !entry)
          setValues((prior) => ({ ...prior, pages: "", note: "" }));
        return result;
      } catch {
        return {
          ...previous,
          success: false,
          message:
            "Não foi possível salvar. Os campos foram preservados; tente novamente.",
        };
      }
    },
    {},
  );
  const change = (field: keyof typeof values, value: string) =>
    setValues((prior) => ({ ...prior, [field]: value }));
  const prefix = useId();
  const error = (field: string) =>
    state.errors?.[field] ? (
      <p id={`${prefix}-${field}-error`} className="field-error">
        {state.errors[field].join(" ")}
      </p>
    ) : null;
  const attrs = (field: string) => ({
    "aria-invalid": !!state.errors?.[field],
    "aria-describedby": state.errors?.[field]
      ? `${prefix}-${field}-error`
      : undefined,
  });
  return (
    <details className="page-index-editor">
      <summary>{entry ? "Editar entrada" : "Adicionar peça ao índice"}</summary>
      <form
        action={action}
        className="settings-form"
        noValidate
        onReset={(event) => event.preventDefault()}
        aria-label={
          entry ? "Editar entrada do índice" : "Adicionar peça ao índice"
        }
      >
        <input type="hidden" name="processId" value={processId} />
        <input
          type="hidden"
          name="requestId"
          value={state.nextRequestId ?? initialKey}
        />
        <input
          type="hidden"
          name="entryId"
          value={entry?.id ?? state.nextEntryId ?? initialEntry}
        />
        <input
          type="hidden"
          name="operation"
          value={entry ? "update" : "create"}
        />
        <input type="hidden" name="revision" value={entry?.revision ?? 0} />
        {entry && <input type="hidden" name="fileId" value={entry.file_id} />}
        <fieldset disabled={pending}>
          <legend className="sr-only">Localização da peça</legend>
          <div className="form-grid">
            {!entry && (
              <div className="form-field form-wide">
                <label htmlFor={`${prefix}-fileId`}>PDF e versão</label>
                <select
                  id={`${prefix}-fileId`}
                  name="fileId"
                  value={values.fileId}
                  onChange={(e) => change("fileId", e.target.value)}
                  {...attrs("fileId")}
                >
                  <option value="">Escolha um PDF</option>
                  {files.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name} · Versão {file.version}
                    </option>
                  ))}
                </select>
                {error("fileId")}
              </div>
            )}
            <div className="form-field">
              <label htmlFor={`${prefix}-piece`}>Tipo de peça</label>
              <select
                id={`${prefix}-piece`}
                name="piece"
                value={values.piece}
                onChange={(e) => change("piece", e.target.value)}
                {...attrs("piece")}
              >
                {Object.entries(indexPieces).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              {error("piece")}
            </div>
            <div className="form-field">
              <label htmlFor={`${prefix}-pages`}>Páginas</label>
              <input
                id={`${prefix}-pages`}
                name="pages"
                maxLength={1000}
                value={values.pages}
                onChange={(e) => change("pages", e.target.value)}
                placeholder="120-135, 140"
                required
                {...attrs("pages")}
              />
              {error("pages")}
            </div>
            <p className="field-help form-wide">
              Use as posições das páginas no PDF, começando em 1. A numeração
              impressa na peça pode ser diferente. A quantidade de páginas do
              arquivo não é conferida por este formulário.
            </p>
            <div className="form-field form-wide">
              <label htmlFor={`${prefix}-note`}>Observação (opcional)</label>
              <textarea
                id={`${prefix}-note`}
                name="note"
                maxLength={2000}
                rows={3}
                value={values.note}
                onChange={(e) => change("note", e.target.value)}
                {...attrs("note")}
              />
              {error("note")}
            </div>
          </div>
        </fieldset>
        <button type="submit" className="button" disabled={pending}>
          {pending
            ? "Salvando…"
            : entry
              ? "Salvar alteração"
              : "Adicionar peça"}
        </button>
        <p role="status" aria-live="polite">
          {state.message}
        </p>
      </form>
      {entry && (
        <RemoveIndexEntry
          processId={processId}
          entry={entry}
          requestId={requestId}
        />
      )}
    </details>
  );
}
function RemoveIndexEntry({
  processId,
  entry,
  requestId,
}: {
  processId: string;
  entry: Entry;
  requestId: string;
}) {
  const [key] = useState(requestId),
    [agreed, setAgreed] = useState(false);
  const [state, action, pending] = useActionState<IndexState, FormData>(
    async (previous, form) => {
      try {
        return await saveIndexEntry(previous, form);
      } catch {
        return {
          ...previous,
          success: false,
          message: "Não foi possível remover. Tente novamente.",
        };
      }
    },
    {},
  );
  return (
    <form
      action={action}
      className="index-removal"
      aria-label="Remover entrada do índice"
      noValidate
    >
      {Object.entries({
        processId,
        entryId: entry.id,
        fileId: entry.file_id,
        revision: String(entry.revision),
        requestId: key,
        operation: "delete",
      }).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label>
        <input
          type="checkbox"
          name="agreed"
          value="yes"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={pending}
        />
        Remover esta entrada do índice.
      </label>
      <button
        className="button button-secondary"
        type="submit"
        disabled={pending || !agreed}
      >
        {pending ? "Removendo…" : "Remover entrada"}
      </button>
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
