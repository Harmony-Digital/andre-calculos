"use client";
import { useActionState, useId, useRef, useState } from "react";
import { operateOrder, type OperationState } from "@/modules/orders/actions";
import {
  availableOperations,
  operationLabels,
  parseOperation,
  type OperationIntent,
  type OperationalEvent,
} from "@/modules/orders/operations";
import type { OrderState } from "@/modules/orders/state-machine";
export function OrderOperations({
  processId,
  orderId,
  code,
  status,
  revision,
  resumeStatus,
  requestId,
}: {
  processId: string;
  orderId: string;
  code: string;
  status: OrderState;
  revision: number;
  resumeStatus: string | null;
  requestId: string;
}) {
  const prefix = useId(),
    operations = availableOperations(status, resumeStatus);
  const [event, setEvent] = useState<OperationalEvent>(
      operations[0] ?? "start_analysis",
    ),
    [reason, setReason] = useState(""),
    [key, setKey] = useState(requestId);
  const attempt = useRef<OperationIntent | null>(null);
  const [state, action, pending] = useActionState<OperationState, FormData>(
    async (previous, form) => {
      const parsed = parseOperation(form);
      if (!attempt.current && parsed.success) attempt.current = parsed.data;
      const intent = attempt.current;
      const frozen = intent ? new FormData() : form;
      if (intent)
        for (const [name, value] of Object.entries(intent))
          frozen.set(name, String(value));
      try {
        const result = await operateOrder(previous, frozen);
        if (result.success) {
          attempt.current = null;
          setReason("");
          setKey(crypto.randomUUID());
        } else if (!result.intent) attempt.current = null;
        return result;
      } catch {
        return {
          success: false,
          intent: intent ?? undefined,
          message:
            "Não foi possível confirmar. A tentativa foi preservada; tente novamente.",
        };
      }
    },
    {},
  );
  if (!operations.length && !state.intent) return null;
  const selected =
    state.intent?.event ?? (operations.includes(event) ? event : operations[0]);
  const locked = pending || !!state.intent;
  return (
    <form
      action={action}
      className="settings-form"
      aria-label={`Etapas do pedido ${code}`}
      noValidate
    >
      <h4>Andamento do pedido</h4>
      <input type="hidden" name="processId" value={processId} />
      <input type="hidden" name="orderId" value={orderId} />
      <input
        type="hidden"
        name="requestId"
        value={state.intent?.requestId ?? key}
      />
      <input
        type="hidden"
        name="expectedState"
        value={state.intent?.expectedState ?? status}
      />
      <input
        type="hidden"
        name="revision"
        value={state.intent?.revision ?? revision}
      />
      <div className="form-field">
        <label htmlFor={`${prefix}-event`}>Próxima etapa</label>
        <select
          id={`${prefix}-event`}
          name="event"
          value={selected}
          disabled={locked}
          onChange={(e) => setEvent(e.target.value as OperationalEvent)}
        >
          {(state.intent ? [state.intent.event] : operations).map((value) => (
            <option key={value} value={value}>
              {operationLabels[value]}
            </option>
          ))}
        </select>
        {locked && <input type="hidden" name="event" value={selected} />}
      </div>
      <div className="form-field">
        <label htmlFor={`${prefix}-reason`}>
          Motivo ou informação para o cliente
        </label>
        <textarea
          id={`${prefix}-reason`}
          name="reason"
          value={state.intent?.reason ?? reason}
          readOnly={locked}
          maxLength={1000}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={!!state.errors?.reason}
          aria-describedby={`${prefix}-help${state.errors?.reason ? ` ${prefix}-error` : ""}`}
        />
        <p id={`${prefix}-help`} className="field-help">
          O texto aparece no histórico do cliente. Obrigatório ao aguardar
          informações ou devolver ao cálculo. Os prazos permanecem os mesmos.
        </p>
        {state.errors?.reason && (
          <p id={`${prefix}-error`} className="field-error">
            {state.errors.reason.join(" ")}
          </p>
        )}
      </div>
      <button
        className="button button-primary"
        disabled={pending || state.conflict}
        type="submit"
      >
        {pending
          ? "Registrando…"
          : state.intent
            ? "Repetir a mesma tentativa"
            : "Registrar etapa"}
      </button>
      {state.message && (
        <p
          role="status"
          className={state.success ? "success-message" : "field-error"}
        >
          {state.message}
        </p>
      )}
      {state.intent && (
        <a
          className="text-link"
          href={`/painel/processos/${processId}?aba=resumo`}
        >
          Conferir situação atual
        </a>
      )}
    </form>
  );
}
