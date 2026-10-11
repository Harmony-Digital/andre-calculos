"use client";
import { useActionState, useId, useState } from "react";
import {
  confirmDelivery,
  type DeliveryState,
} from "@/modules/delivery/actions";
type FileOption = {
  id: string;
  name: string;
  mime: string;
  version: number;
  order_id: string | null;
};
export function DeliveryForm({
  processId,
  orderId,
  code,
  requestId,
  files,
}: {
  processId: string;
  orderId: string;
  code: string;
  requestId: string;
  files: FileOption[];
}) {
  const prefix = useId(),
    [key] = useState(requestId),
    [values, setValues] = useState({
      calculationFile: "",
      pjcFile: "",
      reportFile: "",
      pjeVersion: "",
      indexMonth: "",
      liquidated: false,
      taxIdPresent: false,
      reviewed: false,
    }),
    [extras, setExtras] = useState<string[]>([]);
  const [state, action, pending] = useActionState<DeliveryState, FormData>(
    async (prev, form) => {
      try {
        return await confirmDelivery(prev, form);
      } catch {
        return {
          ...prev,
          success: false,
          message:
            "Não foi possível confirmar. Os campos foram preservados; tente novamente.",
        };
      }
    },
    {},
  );
  const available = files.filter(
      (f) => f.order_id === null || f.order_id === orderId,
    ),
    pdf = available.filter((f) => f.mime === "application/pdf"),
    pjc = available.filter(
      (f) =>
        f.mime === "application/octet-stream" &&
        f.name.toLowerCase().endsWith(".pjc"),
    ),
    optional = available.filter(
      (f) =>
        f.name.toLowerCase().endsWith(".docx") ||
        f.name.toLowerCase().endsWith(".xlsx"),
    );
  const error = (field: string) =>
    state.errors?.[field] && (
      <p className="field-error" id={`${prefix}-${field}-error`}>
        {state.errors[field].join(" ")}
      </p>
    );
  return (
    <details className="delivery-form">
      <summary>Confirmar entrega do pedido {code}</summary>
      <form
        className="settings-form"
        aria-label={`Confirmar entrega ${code}`}
        action={action}
        noValidate
        onReset={(e) => e.preventDefault()}
      >
        <input type="hidden" name="processId" value={processId} />
        <input type="hidden" name="orderId" value={orderId} />
        <input
          type="hidden"
          name="requestId"
          value={state.nextRequestId ?? key}
        />
        <p className="field-help">
          Envie os arquivos para a pasta Entregas na aba Documentos. Depois,
          escolha as versões conferidas. A confirmação preserva os arquivos e
          registra sua revisão; a liberação ao cliente segue a regra de
          pagamento.
        </p>
        <fieldset disabled={pending}>
          <legend className="sr-only">Checklist de pré-juntada</legend>
          <div className="form-grid">
            {(
              [
                ["calculationFile", "PDF do cálculo", pdf],
                ["pjcFile", "Arquivo PJC", pjc],
                ["reportFile", "Parecer assinado em PDF", pdf],
              ] as const
            ).map(([field, label, options]) => (
              <div className="form-field" key={field}>
                <label htmlFor={`${prefix}-${field}`}>{label}</label>
                <select
                  id={`${prefix}-${field}`}
                  name={field}
                  value={values[field]}
                  onChange={(e) =>
                    setValues({ ...values, [field]: e.target.value })
                  }
                  aria-invalid={!!state.errors?.[field]}
                  aria-describedby={
                    state.errors?.[field]
                      ? `${prefix}-${field}-error`
                      : undefined
                  }
                >
                  <option value="">Escolha um arquivo</option>
                  {options.map((f) => (
                    <option value={f.id} key={f.id}>
                      {f.name} · Versão {f.version}
                    </option>
                  ))}
                </select>
                {error(field)}
              </div>
            ))}
            {(
              [
                ["pjeVersion", "Versão do PJe-Calc", "text"],
                ["indexMonth", "Mês da tabela de índices", "text"],
              ] as const
            ).map(([field, label, type]) => (
              <div className="form-field" key={field}>
                <label htmlFor={`${prefix}-${field}`}>{label}</label>
                <input
                  id={`${prefix}-${field}`}
                  name={field}
                  type={type}
                  placeholder={field === "indexMonth" ? "MM/AAAA" : undefined}
                  maxLength={field === "indexMonth" ? 7 : 40}
                  value={values[field]}
                  onChange={(e) =>
                    setValues({ ...values, [field]: e.target.value })
                  }
                  aria-invalid={!!state.errors?.[field]}
                  aria-describedby={
                    state.errors?.[field]
                      ? `${prefix}-${field}-error`
                      : undefined
                  }
                />
                {error(field)}
              </div>
            ))}
          </div>
          {optional.length > 0 && (
            <fieldset className="delivery-attachments">
              <legend>Petição ou planilha (opcional)</legend>
              {optional.map((f) => (
                <label className="delivery-check" key={f.id}>
                  <input
                    type="checkbox"
                    name="attachments"
                    value={f.id}
                    checked={extras.includes(f.id)}
                    onChange={(e) =>
                      setExtras(
                        e.target.checked
                          ? [...extras, f.id]
                          : extras.filter((id) => id !== f.id),
                      )
                    }
                  />
                  {f.name} · Versão {f.version}
                </label>
              ))}
              {error("attachments")}
            </fieldset>
          )}
          {(
            [
              ["liquidated", "Confirmei que o cálculo está liquidado."],
              [
                "taxIdPresent",
                "Confirmei que o CPF ou CNPJ está cadastrado no PJC.",
              ],
              [
                "reviewed",
                "Revisei o cálculo e conferi a assinatura do parecer, o nome e o CRC nos arquivos.",
              ],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label className="delivery-check">
                <input
                  type="checkbox"
                  name={field}
                  checked={values[field]}
                  onChange={(e) =>
                    setValues({ ...values, [field]: e.target.checked })
                  }
                  aria-invalid={!!state.errors?.[field]}
                  aria-describedby={
                    state.errors?.[field]
                      ? `${prefix}-${field}-error`
                      : undefined
                  }
                />
                {label}
              </label>
              {error(field)}
            </div>
          ))}
          <p className="field-help">
            O envio e a integridade não validam o conteúdo do PJC nem a
            assinatura digital. Esta conferência é sua.
          </p>
          <button type="submit" className="button button-primary">
            {pending ? "Confirmando…" : "Confirmar entrega"}
          </button>
        </fieldset>
        <p role="status" aria-live="polite">
          {state.message}
        </p>
      </form>
    </details>
  );
}
