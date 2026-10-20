"use client";
import { useActionState, useId, useRef, useState } from "react";
import Link from "next/link";
import type { Proposal } from "@/modules/quotes/proposal";
import type {
  RevisionContext,
  RevisionIntent,
  RevisionReceipt,
} from "@/modules/quotes/revision";
import {
  parseRevisionForm,
  revisionTotals,
  revisionMoneyInput,
} from "@/modules/quotes/revision";
import { reviseQuote } from "@/modules/quotes/revision-actions";
import { formatMoney } from "@/lib/utils";
type State = { receipt?: RevisionReceipt; error?: string; conflict?: boolean };
export function QuoteRevision({
  quoteId,
  proposal,
  contextHash,
  orderRevision,
  revision,
  requestId,
}: {
  quoteId: string;
  proposal: Proposal;
  contextHash: string;
  orderRevision: number;
  revision: RevisionContext;
  requestId: string;
}) {
  const id = useId(),
    intent = useRef<RevisionIntent | null>(null),
    [locked, setLocked] = useState(false),
    [prices, setPrices] = useState(() =>
      proposal.items.map((item) => revisionMoneyInput(item.unitCents)),
    ),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState(() =>
      revisionTotals(proposal, proposal.items),
    );
  const [state, action, pending] = useActionState<State, FormData>(
    async (_previous, form) => {
      if (!intent.current) {
        try {
          const parsed = parseRevisionForm(form, proposal);
          if (
            parsed.items.every(
              (item, i) => item.unitCents === proposal.items[i].unitCents,
            )
          )
            return {
              error:
                "Valores: altere pelo menos um serviço para criar uma versão.",
            };
          intent.current = {
            quoteId,
            contextHash,
            orderRevision,
            version: revision.version,
            requestId,
            reason: parsed.reason,
            items: parsed.items,
          };
          setLocked(true);
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Confira os dados.",
          };
        }
      }
      try {
        return await reviseQuote(intent.current);
      } catch {
        return {
          error:
            "A resposta não chegou. Seus dados foram preservados; tente novamente para recuperar o ajuste.",
        };
      }
    },
    {},
  );
  if (state.receipt)
    return (
      <section
        className="panel form-body"
        role="status"
        aria-label="Ajuste do orçamento"
      >
        <h2>Nova versão criada</h2>
        <p>
          A versão {state.receipt.version} foi registrada. O histórico e o PDF
          anterior foram preservados.
        </p>
        <p className="preserve-lines">Motivo: {state.receipt.reason}</p>
        <Link
          className="button primary"
          href={`/painel/orcamentos/${state.receipt.quoteId}`}
        >
          Abrir nova proposta
        </Link>
      </section>
    );
  if (!revision.canRevise) return null;
  return (
    <section className="panel form-body">
      <details className="quote-legal">
        <summary>Ajustar orçamento</summary>
        <p>
          Altere os valores unitários e explique o motivo. Quantidades, serviços
          e tabela de origem serão preservados. O advogado precisará decidir
          sobre a nova versão.
        </p>
        <form
          action={action}
          aria-label="Ajuste do orçamento"
          className="quote-revision-form"
          noValidate
          onChange={(event) => {
            if (locked) return;
            const form = event.currentTarget;
            try {
              const data = new FormData(form);
              data.set("reason", "prévia");
              setPreview(parseRevisionForm(data, proposal));
            } catch {
              /* O envio apresenta o erro por campo. */
            }
          }}
        >
          <fieldset
            className="plain-fieldset"
            disabled={pending || locked || state.conflict}
          >
            <legend className="sr-only">Valores e motivo do ajuste</legend>
            {proposal.items.map((item, index) => (
              <div className="form-field" key={item.code}>
                <label htmlFor={`${id}-price-${index}`}>
                  {item.description} — valor unitário (R$)
                </label>
                <input
                  id={`${id}-price-${index}`}
                  name={`price:${item.code}`}
                  inputMode="decimal"
                  value={prices[index]}
                  onChange={(event) =>
                    setPrices((values) =>
                      values.map((value, i) =>
                        i === index ? event.target.value : value,
                      ),
                    )
                  }
                  aria-describedby={`${id}-format`}
                />
                <p className="muted">
                  Quantidade preservada: {item.quantity}. Antes:{" "}
                  {formatMoney(item.unitCents)} por unidade.
                </p>
              </div>
            ))}
            <p id={`${id}-format`} className="muted">
              Use reais sem separador de milhares, como 1234,56.
            </p>
            <div className="form-field">
              <label htmlFor={`${id}-reason`}>Motivo do ajuste</label>
              <textarea
                id={`${id}-reason`}
                name="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={1000}
                required
                aria-describedby={`${id}-reason-help`}
              />
              <p id={`${id}-reason-help`} className="muted">
                Obrigatório. Visível ao advogado no histórico e no PDF da nova
                versão. Não inclua dados sigilosos do processo.
              </p>
            </div>
          </fieldset>
          <dl className="summary-grid" aria-label="Prévia dos novos valores">
            <div>
              <dt>Novo total</dt>
              <dd>{formatMoney(preview.totalCents)}</dd>
            </div>
            <div>
              <dt>Sinal de 50%</dt>
              <dd>{formatMoney(preview.depositCents)}</dd>
            </div>
            <div>
              <dt>Saldo na entrega</dt>
              <dd>{formatMoney(preview.balanceCents)}</dd>
            </div>
          </dl>
          {locked && !pending && !state.conflict && (
            <p className="muted">
              Seus dados foram preservados. O reenvio recupera o mesmo ajuste,
              sem criar outra versão.
            </p>
          )}
          <button
            className="button primary"
            type="submit"
            disabled={pending || state.conflict}
          >
            {pending
              ? "Registrando…"
              : locked
                ? "Tentar novamente"
                : "Criar nova versão"}
          </button>
          {state.error && (
            <p role="alert" className="field-error">
              {state.error}
            </p>
          )}
          {state.conflict && (
            <a className="text-link" href={`/painel/orcamentos/${quoteId}`}>
              Recarregar proposta
            </a>
          )}
        </form>
      </details>
    </section>
  );
}
