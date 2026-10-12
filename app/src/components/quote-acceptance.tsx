"use client";
import Link from "next/link";
import { useActionState, useId, useState, useSyncExternalStore } from "react";
import { acceptQuote } from "@/modules/quotes/acceptance-actions";
import type {
  AcceptanceReceipt,
  ContractContext,
} from "@/modules/quotes/acceptance";
import { formatMoney } from "@/lib/utils";
const subscribe = () => () => {};
const ready = () => true;
const waiting = () => false;
const instant = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
type State = { receipt?: AcceptanceReceipt; error?: string };
export function QuoteAcceptance({
  quoteId,
  context,
  requestId,
  panel = false,
}: {
  quoteId: string;
  context: ContractContext;
  requestId: string;
  panel?: boolean;
}) {
  const id = useId(),
    hydrated = useSyncExternalStore(subscribe, ready, waiting),
    [key] = useState(requestId),
    [confirmed, setConfirmed] = useState(false);
  const [state, action, pending] = useActionState<State, FormData>(async () => {
    try {
      return await acceptQuote({
        quoteId,
        contextHash: context.contextHash,
        requestId: key,
        confirmed,
      });
    } catch {
      return {
        error:
          "Não foi possível confirmar. Sua escolha foi preservada; tente novamente.",
      };
    }
  }, {});
  const receipt = state.receipt ?? context.receipt;
  const status =
    context.status === "quoted" && receipt ? receipt.status : context.status;
  const processPath = `${panel ? "/painel" : "/app"}/processos/${context.proposal.processId}`;
  return (
    <section className="panel form-body" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        {receipt
          ? "Contratação registrada"
          : context.rejectionReceipt
            ? "Documentos da proposta"
            : "Confirmar contratação"}
      </h2>
      {receipt && (
        <div role="status" className="notice">
          <p>
            Proposta {receipt.number} aceita em {instant(receipt.acceptedAt)}{" "}
            (Brasília).
          </p>
          <p>
            {status === "awaiting_documents"
              ? "Confira a condição de pagamento e envie pelo menos um documento do processo para a entrada na fila."
              : status === "awaiting_payment"
                ? "Confira a situação do sinal e as instruções de pagamento na pasta do processo."
                : "Acompanhe o andamento na pasta do processo."}
          </p>
          {receipt.hasContract && (
            <p>
              Condição registrada no aceite: sinal dispensado e{" "}
              {formatMoney(context.proposal.totalCents)} para pagamento no
              final.
            </p>
          )}
          {(status === "awaiting_payment" ||
            status === "awaiting_documents") && (
            <Link className="text-link" href={`${processPath}?aba=resumo`}>
              Ver sinal e pagamento
            </Link>
          )}
          {status === "awaiting_documents" && (
            <Link className="text-link" href={`${processPath}?aba=documentos`}>
              {panel ? "Ver documentos" : "Enviar documentos"}
            </Link>
          )}
        </div>
      )}
      <details className="quote-legal">
        <summary>Termos de serviço · {context.termsVersion}</summary>
        <p className="preserve-lines">{context.termsText}</p>
      </details>
      <details className="quote-legal">
        <summary>Informação de privacidade · {context.privacyVersion}</summary>
        <p className="preserve-lines">{context.privacyText}</p>
      </details>
      {!receipt && context.blockMessage && (
        <p className="notice">{context.blockMessage}</p>
      )}
      {!receipt && !panel && !context.rejectionReceipt && (
        <form
          action={action}
          aria-label="Aceite da proposta"
          noValidate
          onReset={(event) => event.preventDefault()}
        >
          <fieldset
            className="plain-fieldset"
            disabled={!hydrated || pending || !context.canAccept}
          >
            <legend className="sr-only">Confirmação da contratação</legend>
            <label className="check-option" htmlFor={`${id}-confirm`}>
              <input
                id={`${id}-confirm`}
                type="checkbox"
                name="confirmed"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                Li a proposta e os termos de serviço e confirmo a contratação.
              </span>
            </label>
            <button className="button" type="submit" disabled={!confirmed}>
              {pending ? "Registrando…" : "Aceitar"}
            </button>
          </fieldset>
          {state.error && (
            <p
              role="alert"
              aria-label="Aceite da proposta"
              className="field-error"
            >
              {state.error}
            </p>
          )}
        </form>
      )}
      {!receipt && panel && !context.rejectionReceipt && (
        <p className="muted">
          O aceite deve ser registrado pelo cliente na área dele.
        </p>
      )}
    </section>
  );
}
