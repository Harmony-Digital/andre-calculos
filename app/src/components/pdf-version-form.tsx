"use client";
import { useActionState, useId, useState } from "react";
import {
  savePdfVersion,
  type PdfVersionState,
} from "@/modules/pdf-versions/actions";
type Head = { fileId: string; name: string; sequence: number };
export function PdfVersionForm({
  processId,
  fileId,
  revision,
  requestId,
  operation,
  heads = [],
  entry,
  disabled = false,
}: {
  processId: string;
  fileId: string;
  revision: number;
  requestId: string;
  operation: "register" | "read" | "map" | "copy";
  heads?: Head[];
  entry?: { id: string; revision: number };
  disabled?: boolean;
}) {
  const prefix = useId(),
    [initialKey] = useState(requestId);
  const [values, setValues] = useState({
    pageCount: "",
    previousFileId: "",
    pages: "",
    read: "yes",
    pairs: "",
    confirmed: false,
  });
  const [state, action, pending] = useActionState<PdfVersionState, FormData>(
    async (previous, form) => {
      try {
        return await savePdfVersion(previous, form);
      } catch {
        return {
          ...previous,
          success: false,
          message:
            "Não foi possível confirmar a resposta. Preserve os campos e tente novamente para recuperar o recibo.",
        };
      }
    },
    {},
  );
  const error = (field: string) =>
    state.errors?.[field] ? (
      <p className="field-error" id={`${prefix}-${field}-error`}>
        {state.errors[field]?.join(" ")}
      </p>
    ) : null;
  const attrs = (field: string) => ({
    "aria-invalid": !!state.errors?.[field],
    "aria-describedby": state.errors?.[field]
      ? `${prefix}-${field}-error`
      : undefined,
  });
  const label =
    operation === "register"
      ? "Registrar versão"
      : operation === "read"
        ? "Salvar marcação"
        : operation === "map"
          ? "Confirmar correspondências"
          : "Reaproveitar referência";
  return (
    <form
      action={action}
      className="pdf-review-form"
      noValidate
      onReset={(event) => event.preventDefault()}
      aria-label={
        operation === "copy" ? `Reaproveitar referência ${entry?.id}` : label
      }
    >
      {Object.entries({
        processId,
        fileId,
        revision: String(revision),
        requestId: state.nextRequestId ?? initialKey,
        operation,
        ...(entry
          ? { entryId: entry.id, entryRevision: String(entry.revision) }
          : {}),
      }).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <fieldset disabled={pending || disabled} className="plain-fieldset">
        <legend className="sr-only">{label}</legend>
        {operation === "register" && (
          <>
            <div className="form-field">
              <label htmlFor={`${prefix}-count`}>
                Quantidade de páginas conferida
              </label>
              <input
                id={`${prefix}-count`}
                name="pageCount"
                inputMode="numeric"
                value={values.pageCount}
                onChange={(e) =>
                  setValues({ ...values, pageCount: e.target.value })
                }
                {...attrs("pageCount")}
              />
              <small>
                Confira no visualizador. A contagem é declarada por você; o
                sistema não a extrai do PDF.
              </small>
              {error("pageCount")}
            </div>
            <div className="form-field">
              <label htmlFor={`${prefix}-previous`}>Versão anterior</label>
              <select
                id={`${prefix}-previous`}
                name="previousFileId"
                value={values.previousFileId}
                onChange={(e) =>
                  setValues({ ...values, previousFileId: e.target.value })
                }
                {...attrs("previousFileId")}
              >
                <option value="">Primeiro PDF desta sequência</option>
                {heads
                  .filter((h) => h.fileId !== fileId)
                  .map((head) => (
                    <option key={head.fileId} value={head.fileId}>
                      {head.name} · versão conferida {head.sequence} · ref.{" "}
                      {head.fileId.slice(0, 8)}
                    </option>
                  ))}
              </select>
              <small>
                Escolha explicitamente a última versão conferida. Nomes iguais
                não comprovam vínculo.
              </small>
              {error("previousFileId")}
            </div>
          </>
        )}
        {operation === "read" && (
          <>
            <div className="form-field">
              <label htmlFor={`${prefix}-pages`}>Páginas conferidas</label>
              <input
                id={`${prefix}-pages`}
                name="pages"
                value={values.pages}
                maxLength={1000}
                placeholder="1-4, 8"
                onChange={(e) =>
                  setValues({ ...values, pages: e.target.value })
                }
                {...attrs("pages")}
              />
              <small>
                Posições no PDF, começando em 1; até 500 páginas por vez.
              </small>
              {error("pages")}
            </div>
            <div className="form-field">
              <label htmlFor={`${prefix}-read`}>Marcação de leitura</label>
              <select
                id={`${prefix}-read`}
                name="read"
                value={values.read}
                onChange={(e) => setValues({ ...values, read: e.target.value })}
              >
                <option value="yes">Lida</option>
                <option value="no">Leitura pendente</option>
              </select>
            </div>
          </>
        )}
        {operation === "map" && (
          <div className="form-field">
            <label htmlFor={`${prefix}-pairs`}>
              Correspondências anterior:atual
            </label>
            <textarea
              id={`${prefix}-pairs`}
              name="pairs"
              rows={3}
              maxLength={2000}
              value={values.pairs}
              placeholder="3:1, 1:3, 4:4"
              onChange={(e) => setValues({ ...values, pairs: e.target.value })}
              {...attrs("pairs")}
            />
            <small>
              Exemplo: 3:1 confirma que a página 3 anterior corresponde à atual
              1, sem alteração. Até 100 pares. Para retirar uma confirmação, use
              0:2 para a página atual 2. Páginas novas ou alteradas permanecem
              sem correspondência.
            </small>
            {error("pairs")}
          </div>
        )}
        {(operation === "register" || operation === "map") && (
          <>
            <label className="pdf-review-confirm">
              <input
                type="checkbox"
                name="confirmed"
                value="yes"
                checked={values.confirmed}
                onChange={(e) =>
                  setValues({ ...values, confirmed: e.target.checked })
                }
              />
              {operation === "register"
                ? "Conferi a quantidade de páginas e o vínculo indicado."
                : "Conferi manualmente que os pares indicados têm o mesmo conteúdo. Ao corrigir, vou reconferir as referências reaproveitadas."}
            </label>
            {error("confirmed")}
          </>
        )}
        <button
          className={`button${operation === "copy" ? " button-secondary" : ""}`}
          type="submit"
        >
          {pending ? "Salvando…" : label}
        </button>
      </fieldset>
      {error("revision")}
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
