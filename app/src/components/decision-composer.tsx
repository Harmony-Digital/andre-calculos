"use client";
import { useActionState, useState } from "react";
import {
  recordDecision,
  type DecisionState,
} from "@/modules/decisions/actions";
import { decisionParameters, decisionSources } from "@/modules/decisions/types";
const blank = {
  parameter: "correction_index",
  value: "",
  source: "judgment",
  page: "",
  rationale: "",
};
export function DecisionComposer({
  processId,
  requestId,
}: {
  processId: string;
  requestId: string;
}) {
  const [initialRequestId] = useState(requestId),
    [values, setValues] = useState(blank);
  const [state, action, pending] = useActionState<DecisionState, FormData>(
    async (previous, form) => {
      try {
        const result = await recordDecision(previous, form);
        if (result.success) setValues(blank);
        return result;
      } catch {
        return {
          ...previous,
          success: false,
          message:
            "Não foi possível registrar. Os campos foram preservados; tente novamente.",
        };
      }
    },
    {},
  );
  const change = (field: keyof typeof blank, value: string) =>
    setValues((prior) => ({ ...prior, [field]: value }));
  return (
    <details className="decision-composer">
      <summary>Registrar decisão técnica</summary>
      <form
        className="settings-form"
        action={action}
        noValidate
        onReset={(event) => event.preventDefault()}
        aria-label="Registrar decisão técnica"
      >
        <input type="hidden" name="processId" value={processId} />
        <input
          type="hidden"
          name="requestId"
          value={state.nextRequestId ?? initialRequestId}
        />
        <p className="field-help">
          Informe a escolha e sua origem. Sem página nem concordância do
          cliente, o registro aparece como premissa. Depois de registrado, o
          conteúdo é preservado.
        </p>
        <fieldset disabled={pending}>
          <legend className="sr-only">Dados da decisão</legend>
          <div className="form-grid">
            {(
              [
                ["parameter", "Parâmetro"],
                ["source", "Origem"],
              ] as const
            ).map(([field, label]) => (
              <div className="form-field" key={field}>
                <label htmlFor={`decision-${field}`}>{label}</label>
                <select
                  id={`decision-${field}`}
                  name={field}
                  value={values[field]}
                  onChange={(event) => change(field, event.target.value)}
                  aria-invalid={!!state.errors?.[field]}
                  aria-describedby={
                    state.errors?.[field]
                      ? `decision-${field}-error`
                      : undefined
                  }
                >
                  {Object.entries(
                    field === "parameter"
                      ? decisionParameters
                      : decisionSources,
                  ).map(([key, title]) => (
                    <option key={key} value={key}>
                      {title}
                    </option>
                  ))}
                </select>
                {state.errors?.[field] && (
                  <p id={`decision-${field}-error`} className="field-error">
                    {state.errors[field].join(" ")}
                  </p>
                )}
              </div>
            ))}
            {(
              [
                ["value", "Valor escolhido", 1000],
                ["page", "Página de origem (opcional)", 6],
                ["rationale", "Justificativa", 2000],
              ] as const
            ).map(([field, label, max]) => (
              <div
                className={`form-field ${field === "page" ? "" : "form-wide"}`}
                key={field}
              >
                <label htmlFor={`decision-${field}`}>{label}</label>
                {field === "page" ? (
                  <input
                    id={`decision-${field}`}
                    name={field}
                    inputMode="numeric"
                    value={values[field]}
                    onChange={(event) => change(field, event.target.value)}
                    maxLength={max}
                    aria-invalid={!!state.errors?.[field]}
                    aria-describedby={
                      state.errors?.[field]
                        ? `decision-${field}-error`
                        : undefined
                    }
                  />
                ) : (
                  <textarea
                    id={`decision-${field}`}
                    name={field}
                    value={values[field]}
                    onChange={(event) => change(field, event.target.value)}
                    rows={field === "rationale" ? 3 : 2}
                    maxLength={max}
                    required
                    aria-invalid={!!state.errors?.[field]}
                    aria-describedby={
                      state.errors?.[field]
                        ? `decision-${field}-error`
                        : undefined
                    }
                  />
                )}
                {state.errors?.[field] && (
                  <p id={`decision-${field}-error`} className="field-error">
                    {state.errors[field].join(" ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </fieldset>
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Registrando…" : "Registrar decisão"}
        </button>
        <p role="status" aria-live="polite">
          {state.message}
        </p>
      </form>
    </details>
  );
}
