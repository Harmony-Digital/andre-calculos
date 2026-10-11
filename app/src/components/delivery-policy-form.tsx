"use client";
import { useActionState, useId, useState, useSyncExternalStore } from "react";
import {
  approveFuturePolicy,
  approveExistingPolicy,
  type ApprovalState,
} from "@/modules/delivery/approval-actions";
import { releasePolicies } from "@/modules/delivery/approval-forms";
type Props = {
  requestId: string;
  current?: string | null;
} & (
  | { revision: number; processId?: never; deliveryId?: never }
  | { revision?: never; processId: string; deliveryId: string }
);
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function DeliveryPolicyForm(props: Props) {
  const future = props.revision !== undefined,
    ready = useSyncExternalStore(subscribeReady, clientReady, serverReady),
    prefix = useId(),
    [policy, setPolicy] = useState(""),
    [approved, setApproved] = useState(false),
    [initialKey] = useState(props.requestId);
  const [state, action, pending] = useActionState<ApprovalState, FormData>(
    async (previous, form) => {
      try {
        const result = await (
          future ? approveFuturePolicy : approveExistingPolicy
        )(previous, form);
        if (result.success) {
          setPolicy("");
          setApproved(false);
        }
        return result;
      } catch {
        return {
          ...previous,
          success: false,
          message:
            "Não foi possível aprovar. Os campos foram preservados; tente novamente.",
        };
      }
    },
    {},
  );
  return (
    <form
      className={`settings-form delivery-policy-form ${future ? "form-body" : ""}`}
      aria-label={
        future ? "Regra das próximas entregas" : "Regra desta entrega"
      }
      action={action}
      noValidate
      onReset={(e) => e.preventDefault()}
    >
      <input
        type="hidden"
        name="requestId"
        value={state.nextRequestId ?? initialKey}
      />
      {future ? (
        <input type="hidden" name="revision" value={props.revision} />
      ) : (
        <>
          <input type="hidden" name="processId" value={props.processId} />
          <input type="hidden" name="deliveryId" value={props.deliveryId} />
        </>
      )}
      {future && (
        <p>
          Regra atual:{" "}
          {props.current && Object.hasOwn(releasePolicies, props.current)
            ? releasePolicies[props.current as keyof typeof releasePolicies]
            : "aguarda aprovação do responsável técnico"}
          .
        </p>
      )}
      <p className="field-help">
        {future
          ? "A regra será aplicada às entregas confirmadas depois desta aprovação. Entregas anteriores mantêm a regra registrada nelas e são aprovadas individualmente na pasta do processo."
          : "Esta aprovação vale para os arquivos e versões desta entrega. Se exigir saldo, o acesso depende dos pagamentos confirmados do pedido."}
      </p>
      <fieldset disabled={!ready || pending}>
        <legend className="sr-only">Aprovação da liberação dos arquivos</legend>
        <div className="form-field">
          <label htmlFor={`${prefix}-policy`}>
            Quando liberar os arquivos?
          </label>
          <select
            id={`${prefix}-policy`}
            name="policy"
            value={policy}
            onChange={(e) => {
              setPolicy(e.target.value);
              setApproved(false);
            }}
            aria-invalid={!!state.errors?.policy}
            aria-describedby={
              state.errors?.policy ? `${prefix}-policy-error` : undefined
            }
          >
            <option value="">Escolha a regra aprovada</option>
            {Object.entries(releasePolicies).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {state.errors?.policy && (
            <p className="field-error" id={`${prefix}-policy-error`}>
              {state.errors.policy.join(" ")}
            </p>
          )}
        </div>
        <label className="delivery-check">
          <input
            type="checkbox"
            name="approved"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
            aria-invalid={!approved && !!state.errors?.approved}
            aria-describedby={
              !approved && state.errors?.approved
                ? `${prefix}-approved-error`
                : undefined
            }
          />
          Confirmei a regra com o responsável técnico e aprovo sua aplicação.
        </label>
        {!approved && state.errors?.approved && (
          <p className="field-error" id={`${prefix}-approved-error`}>
            {state.errors.approved.join(" ")}
          </p>
        )}
        <button className="button button-primary" type="submit">
          {pending
            ? "Aprovando…"
            : future
              ? "Aprovar regra das próximas entregas"
              : "Aprovar regra desta entrega"}
        </button>
      </fieldset>
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
