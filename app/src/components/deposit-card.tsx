"use client";
import Link from "next/link";
import { useActionState, useId, useState, useSyncExternalStore } from "react";
import { confirmDeposit } from "@/modules/payments/actions";
import type { DepositInfo, DepositReceipt } from "@/modules/payments/deposit";
import { formatMoney } from "@/lib/utils";
import {
  creditStateMessage,
  observedCredit,
} from "@/modules/payments/order-credit";
const subscribe = () => () => {};
const ready = () => true;
const waiting = () => false;
const instant = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
export function DepositCard({
  info,
  requestId,
  panel,
}: {
  info: DepositInfo;
  requestId: string;
  panel: boolean;
}) {
  const id = useId(),
    hydrated = useSyncExternalStore(subscribe, ready, waiting),
    [intent] = useState(() => ({
      quoteId: info.quoteId,
      contextHash: info.contextHash,
      remainingCents: info.remainingCents,
      requestId,
      confirmed: true as const,
    }));
  const [state, action, pending] = useActionState<
    { receipt?: DepositReceipt; error?: string },
    FormData
  >(async () => {
    try {
      return await confirmDeposit(intent);
    } catch {
      return {
        error:
          "Não foi possível registrar. O valor foi preservado; tente novamente.",
      };
    }
  }, {});
  const receipt = info.receipt ?? state.receipt;
  const active = ["awaiting_payment", "awaiting_documents"].includes(
    info.status,
  );
  const path = `${panel ? "/painel" : "/app"}/processos/${info.processId}`;
  const message = creditStateMessage(info.credit);
  const observed = observedCredit(info.credit.projection, "deposit");
  const excess = info.credit.projection.depositExcessCents;
  return (
    <section className="form-body deposit-card" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`}>Sinal · {info.code}</h4>
      {info.hasContract ? (
        <p>Sinal dispensado. Pagamento no final, conforme contrato.</p>
      ) : info.requiredCents === 0 ? (
        <p>
          Não há sinal positivo definido. Os valores precisam ser conferidos com
          André.
        </p>
      ) : (
        <dl className="process-summary">
          <div>
            <dt>Sinal previsto</dt>
            <dd>{formatMoney(info.requiredCents)}</dd>
          </div>
          <div>
            <dt>Crédito atual do sinal</dt>
            <dd>
              {info.confirmedCents === null
                ? "Em conciliação"
                : formatMoney(info.confirmedCents)}
            </dd>
          </div>
          <div>
            <dt>Falta para o sinal</dt>
            <dd>
              {info.remainingCents === null
                ? "A conferir"
                : formatMoney(info.remainingCents)}
            </dd>
          </div>
        </dl>
      )}
      {message && (
        <div className="notice" role="status">
          <p>{message}</p>
          {info.confirmedCents === null && observed !== null && (
            <p>
              Subtotal observado: {formatMoney(observed)}. Esse valor aguarda
              conciliação.
            </p>
          )}
          {excess !== null && excess > 0 && (
            <p>Excesso no sinal: {formatMoney(excess)}.</p>
          )}
        </div>
      )}
      {receipt && (
        <div className="notice" role="status">
          <p>
            {receipt.amountCents > 0
              ? `Recebimento de ${formatMoney(receipt.amountCents)}`
              : "Sinal já recebido conferido"}{" "}
            registrado em {instant(receipt.confirmedAt)} (Brasília)
            {info.confirmedName ? ` por ${info.confirmedName}` : ""}.
          </p>
          {info.paymentStatus === "refunded" && (
            <p>
              Pagamento devolvido. O valor está excluído do sinal atualmente
              confirmado.
            </p>
          )}
        </div>
      )}
      {!info.hasContract &&
        info.requiredCents > 0 &&
        info.remainingCents === 0 &&
        info.credit.collectionState !== "reconcile" &&
        info.credit.collectionState !== "excess" && (
          <p>
            {!receipt && info.status === "awaiting_payment"
              ? "Montante do sinal já registrado; André precisa conferir a entrada na fila."
              : "Sinal confirmado."}{" "}
            {info.status === "awaiting_documents"
              ? "Envie um documento do processo para liberar a entrada na fila."
              : "Acompanhe o andamento nesta pasta."}
          </p>
        )}
      {!panel &&
        active &&
        !info.hasContract &&
        info.requiredCents > 0 &&
        info.remainingCents !== null &&
        info.remainingCents > 0 &&
        info.credit.collectionState === "clear" && (
          <>
            {info.pixKey ? (
              <>
                <p>
                  Transfira {formatMoney(info.remainingCents)} para a chave Pix:
                </p>
                <p
                  className="preserve-lines"
                  style={{ overflowWrap: "anywhere" }}
                >
                  {info.pixKey}
                </p>
                <p>
                  Inclua o código {info.code} na descrição do Pix. André
                  confirma o recebimento nesta pasta.
                </p>
              </>
            ) : (
              <p>Peça os dados para pagamento na conversa do processo.</p>
            )}
            <Link className="text-link" href={`${path}?aba=mensagens`}>
              Conversar com André
            </Link>
          </>
        )}
      {panel && info.canConfirm && !state.receipt && (
        <form
          action={action}
          aria-label={`Confirmar sinal ${info.code}`}
          onReset={(event) => event.preventDefault()}
        >
          <p>
            Confirme após conferir o recebimento
            {intent.remainingCents !== null && intent.remainingCents > 0
              ? ` de ${formatMoney(intent.remainingCents)}`
              : " já registrado"}
            . Esta confirmação libera a fila quando houver documento do
            processo.
          </p>
          <button
            className="button"
            type="submit"
            disabled={!hydrated || pending}
          >
            {pending ? "Registrando…" : "Confirmar sinal recebido"}
          </button>
          {state.error && (
            <p className="field-error" role="alert">
              {state.error}
            </p>
          )}
        </form>
      )}
      {info.status === "awaiting_documents" && (
        <Link className="text-link" href={`${path}?aba=documentos`}>
          {panel ? "Ver documentos" : "Enviar documentos"}
        </Link>
      )}
    </section>
  );
}
