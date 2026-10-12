"use client";
import {
  useActionState,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { rejectQuote } from "@/modules/quotes/rejection-actions";
import {
  rejectionIntentSchema,
  type RejectionIntent,
  type RejectionReceipt,
} from "@/modules/quotes/rejection";
import type { ContractContext } from "@/modules/quotes/acceptance";
const subscribe = () => () => {};
const ready = () => true;
const waiting = () => false;
type State = { receipt?: RejectionReceipt; error?: string; conflict?: boolean };
export function QuoteRejection({
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
    router = useRouter(),
    hydrated = useSyncExternalStore(subscribe, ready, waiting);
  const [confirmed, setConfirmed] = useState(false),
    [reason, setReason] = useState(""),
    [locked, setLocked] = useState(false);
  const intent = useRef<RejectionIntent | null>(null);
  const [state, action, pending] = useActionState<State, FormData>(async () => {
    if (!intent.current) {
      const parsed = rejectionIntentSchema.safeParse({
        quoteId,
        contextHash: context.contextHash,
        revision: context.statusRevision,
        requestId,
        confirmed,
        reason,
      });
      if (!parsed.success)
        return {
          error:
            "Confirme a recusa e confira o motivo, com até 500 caracteres.",
        };
      intent.current = parsed.data;
      setLocked(true);
    }
    try {
      const result = await rejectQuote(intent.current);
      if (result.receipt) router.refresh();
      return result;
    } catch {
      return {
        error:
          "Não foi possível registrar a recusa. Sua escolha foi preservada; tente novamente.",
      };
    }
  }, {});
  const receipt = state.receipt ?? context.rejectionReceipt;
  if (receipt)
    return (
      <section className="panel form-body" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>Proposta recusada</h2>
        <div role="status" aria-label="Recusa da proposta" className="notice">
          <p>
            Proposta {receipt.number} recusada em{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              timeZone: "America/Sao_Paulo",
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(receipt.rejectedAt))}{" "}
            (Brasília).
          </p>
          {receipt.reason && (
            <p className="preserve-lines">Motivo: {receipt.reason}</p>
          )}
          <p>
            A proposta em PDF e o histórico continuam disponíveis na pasta do
            processo.
          </p>
        </div>
      </section>
    );
  if (panel || !context.canReject) return null;
  return (
    <section className="panel form-body">
      <details className="quote-legal">
        <summary>Recusar proposta</summary>
        <p>
          Confirme se deseja encerrar esta proposta. Você poderá consultar o PDF
          e o histórico do processo.
        </p>
        <form
          action={action}
          className="quote-rejection-form"
          aria-label="Recusa da proposta"
          noValidate
          onReset={(event) => event.preventDefault()}
        >
          <fieldset
            className="plain-fieldset"
            disabled={!hydrated || pending || locked || state.conflict}
          >
            <legend className="sr-only">Confirmação da recusa</legend>
            <label htmlFor={`${id}-reason`}>Motivo (opcional)</label>
            <textarea
              id={`${id}-reason`}
              name="reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={`${id}-limit`}
            />
            <p id={`${id}-limit`} className="muted">
              Até 500 caracteres. Evite incluir dados sigilosos do processo.
            </p>
            <label className="check-option" htmlFor={`${id}-confirm`}>
              <input
                id={`${id}-confirm`}
                type="checkbox"
                name="confirmed"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>Confirmo que desejo recusar esta proposta.</span>
            </label>
          </fieldset>
          {locked && !state.conflict && !pending && (
            <p className="muted">
              Sua decisão foi preservada. O reenvio usa os mesmos dados para
              conferir o registro.
            </p>
          )}
          <button
            className="button"
            type="submit"
            disabled={!hydrated || pending || !confirmed || state.conflict}
          >
            {pending
              ? "Registrando…"
              : locked
                ? "Tentar novamente"
                : "Confirmar recusa"}
          </button>
          {state.error && (
            <p
              role="alert"
              aria-label="Recusa da proposta"
              className="field-error"
            >
              {state.error}
            </p>
          )}
          {state.conflict && (
            <a className="text-link" href={`/app/orcamentos/${quoteId}`}>
              Recarregar proposta
            </a>
          )}
        </form>
      </details>
    </section>
  );
}
