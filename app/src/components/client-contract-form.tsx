"use client";
import { useActionState, useId, useState, useSyncExternalStore } from "react";
import {
  saveClientContract,
  type ContractState,
} from "@/modules/clients/actions";
import type { ClientContractContext } from "@/modules/clients/contract";
const subscribe = () => () => {};
const readyClient = () => true;
const readyServer = () => false;
export function ClientContractForm({
  context,
  requestId,
  name,
}: {
  context: ClientContractContext;
  requestId: string;
  name: string;
}) {
  const id = useId();
  const ready = useSyncExternalStore(subscribe, readyClient, readyServer);
  const [selected, setSelected] = useState(context.hasContract ? "yes" : "no");
  const [reason, setReason] = useState("");
  const [initialRequest] = useState(requestId);
  const [initialRevision] = useState(context.revision);
  const [state, action, pending] = useActionState<ContractState, FormData>(
    async (previous, form) => {
      try {
        const result = await saveClientContract(previous, form);
        if (result.success) setReason("");
        return result;
      } catch {
        return {
          ...previous,
          success: false,
          message:
            "Não foi possível conferir a gravação. Sua escolha e motivo foram preservados; tente novamente.",
        };
      }
    },
    {},
  );
  const hasContract = context.hasContract;
  const receipt = context.receipt;
  const removingBlocked =
    hasContract && selected === "no" && !context.canRemove;
  const sameChoice = (selected === "yes") === hasContract;
  const showSuccess =
    state.success &&
    state.receipt &&
    (selected === "yes") === state.receipt.hasContract &&
    reason === "";
  return (
    <div className="client-contract">
      <p className="contract-condition">
        <strong>
          {hasContract
            ? "Com contrato — pagamento no final"
            : "Sem contrato — sinal de 50%"}
        </strong>
      </p>
      {receipt && (
        <div className="contract-receipt">
          <p>
            Última alteração por {receipt.changedName || "Calculista"}, em{" "}
            <time dateTime={receipt.changedAt}>
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "America/Sao_Paulo",
              }).format(new Date(receipt.changedAt))}
              .
            </time>
          </p>
          <p>Motivo: {receipt.reason}</p>
        </div>
      )}
      <details>
        <summary>Alterar condição de contrato</summary>
        <p className="form-body">
          O contrato dispensa o sinal. Cada pedido ainda precisa de aceite e
          documento do processo para entrar na fila. Pagamentos e aceites
          anteriores ficam preservados.
        </p>
        <form
          action={action}
          aria-label={`Condição de contrato de ${name}`}
          noValidate
          onReset={(event) => event.preventDefault()}
        >
          <input type="hidden" name="clientId" value={context.clientId} />
          <input
            type="hidden"
            name="revision"
            value={state.revision ?? initialRevision}
          />
          <input
            type="hidden"
            name="requestId"
            value={state.nextRequestId ?? initialRequest}
          />
          <fieldset disabled={!ready || pending}>
            <legend className="sr-only">Condição de contrato</legend>
            <label htmlFor={`${id}-condition`}>Pagamento do cliente</label>
            <select
              id={`${id}-condition`}
              name="hasContract"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="no">Sem contrato — sinal de 50%</option>
              <option value="yes">Com contrato — pagamento no final</option>
            </select>
            <label htmlFor={`${id}-reason`}>Motivo da alteração</label>
            <textarea
              id={`${id}-reason`}
              name="reason"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={!!state.errors?.reason}
              aria-describedby={
                state.errors?.reason ? `${id}-reason-error` : `${id}-help`
              }
            />
            <p id={`${id}-help`} className="field-help">
              Obrigatório. Até mil caracteres. Visível apenas no painel do
              André.
            </p>
            {state.errors?.reason && (
              <p id={`${id}-reason-error`} className="field-error">
                {state.errors.reason.join(" ")}
              </p>
            )}
            {removingBlocked && (
              <p className="field-help">
                Há pedidos na fila ou em andamento. A condição de contrato
                precisa ser mantida durante esses trabalhos.
              </p>
            )}
            <button
              type="submit"
              className="button button-secondary"
              disabled={
                sameChoice || removingBlocked || reason.trim().length < 3
              }
            >
              {pending ? "Salvando…" : "Salvar condição"}
            </button>
          </fieldset>
          {(!state.success || showSuccess) && (
            <p role={state.success ? "status" : "alert"} aria-live="polite">
              {state.message}
            </p>
          )}
          {showSuccess && state.receipt?.effects.length ? (
            <p className="form-body">
              Pedidos atualizados:{" "}
              {
                state.receipt.effects.filter((effect) => effect.to === "queued")
                  .length
              }{" "}
              na fila;{" "}
              {
                state.receipt.effects.filter(
                  (effect) => effect.to === "awaiting_documents",
                ).length
              }{" "}
              aguardando documentos;{" "}
              {
                state.receipt.effects.filter(
                  (effect) => effect.to === "awaiting_payment",
                ).length
              }{" "}
              aguardando sinal.
            </p>
          ) : null}
        </form>
      </details>
    </div>
  );
}
