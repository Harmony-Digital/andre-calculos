import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { QuoteDetailData } from "@/modules/quotes/queries";
import { QuoteRevision } from "./quote-revision";
import { QuoteAcceptance } from "./quote-acceptance";
import { QuoteRejection } from "./quote-rejection";
import { formatMoney } from "@/lib/utils";
const civil = (date: string) => date.split("-").reverse().join("/");
const instant = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
export function QuoteDetail({
  data,
  panel = false,
}: {
  data: QuoteDetailData;
  panel?: boolean;
}) {
  const p = data.proposal;
  return (
    <div className="quote-page">
      <span className="eyebrow">{data.number}</span>
      <h1>Proposta de serviço</h1>
      {data.revisionContext && !data.revisionContext.isCurrent && (
        <div className="notice" role="status">
          <strong>Versão substituída</strong>
          <p>
            Este conteúdo é histórico. O aceite e a recusa estão disponíveis
            apenas na proposta vigente.
          </p>
          {data.revisionContext.currentQuoteId && (
            <Link
              className="text-link"
              href={`${panel ? "/painel" : "/app"}/orcamentos/${data.revisionContext.currentQuoteId}`}
            >
              Abrir proposta vigente
            </Link>
          )}
        </div>
      )}
      {p.mode === "fixture" && (
        <p className="notice">
          Ensaio fictício - sem valor comercial. Não é uma cobrança e não
          reserva a agenda do André.
        </p>
      )}
      <section className="panel form-body" aria-labelledby="quote-items">
        <h2 id="quote-items">Serviços e valores</h2>
        <ul className="quote-items">
          {p.items.map((item) => (
            <li key={item.code}>
              <div>
                <strong>{item.description}</strong>
                <p>
                  {item.quantity} × {formatMoney(item.unitCents)}
                </p>
              </div>
              <strong>{formatMoney(item.amountCents)}</strong>
            </li>
          ))}
        </ul>
        <dl className="summary-grid">
          <div>
            <dt>Total</dt>
            <dd>{formatMoney(p.totalCents)}</dd>
          </div>
          <div>
            <dt>Sinal de 50%</dt>
            <dd>{formatMoney(p.depositCents)}</dd>
          </div>
          <div>
            <dt>Saldo na entrega</dt>
            <dd>{formatMoney(p.balanceCents)}</dd>
          </div>
          <div>
            <dt>Entrega proposta</dt>
            <dd>{civil(p.deliveryDate)}</dd>
          </div>
          <div>
            <dt>Validade</dt>
            <dd>{instant(p.validUntil)} (Brasília)</dd>
          </div>
        </dl>
      </section>
      <section className="panel form-body" aria-labelledby="quote-conditions">
        <h2 id="quote-conditions">Condições</h2>
        <p className="preserve-lines">{p.conditions}</p>
        <p>
          {p.professional.name} · CRC {p.professional.crcState}{" "}
          {p.professional.crcNumber} · {p.professional.category}
        </p>
        <p>
          {p.professional.email} · {p.professional.phone}
        </p>
        <p>
          Tabela {p.priceVersion} · Emitida em {instant(p.issuedAt)} (Brasília)
        </p>
      </section>
      {panel && data.revisionContext?.blockMessage && (
        <p className="notice">{data.revisionContext.blockMessage}</p>
      )}
      {panel && data.revisionContext && data.contract && (
        <QuoteRevision
          quoteId={data.id}
          proposal={p}
          contextHash={data.contract.contextHash}
          orderRevision={data.contract.statusRevision}
          revision={data.revisionContext}
          requestId={randomUUID()}
        />
      )}
      {data.revisionContext && (
        <section className="panel form-body" aria-labelledby="quote-history">
          <h2 id="quote-history">Histórico de versões</h2>
          <ol className="quote-items">
            {data.revisionContext.history.map((version) => (
              <li key={version.id}>
                <div>
                  <Link
                    className="text-link"
                    href={`${panel ? "/painel" : "/app"}/orcamentos/${version.id}`}
                  >
                    Versão {version.version} · {version.number}
                  </Link>
                  <p>
                    {instant(version.createdAt)} ·{" "}
                    {version.id === data.revisionContext?.currentQuoteId
                      ? "Vigente"
                      : "Substituída"}
                  </p>
                  {version.reason && (
                    <p className="preserve-lines">Motivo: {version.reason}</p>
                  )}
                </div>
                <strong>{formatMoney(version.totalCents)}</strong>
              </li>
            ))}
          </ol>
        </section>
      )}
      {data.contract ? (
        <>
          <QuoteAcceptance
            quoteId={data.id}
            context={data.contract}
            requestId={randomUUID()}
            panel={panel}
            contractPdfState={data.contractPdfState}
          />
          <QuoteRejection
            quoteId={data.id}
            context={data.contract}
            requestId={randomUUID()}
            panel={panel}
          />
        </>
      ) : (
        <p className="notice">
          Esta proposta ainda não permite contratação. O ensaio não permite
          pagamento ou entrada na fila.
        </p>
      )}
      <div className="form-actions">
        {!data.contract && (
          <button className="button" disabled>
            Aceitar
          </button>
        )}
        {!data.contract && (
          <button className="button" disabled>
            Recusar
          </button>
        )}
        <a className="button" href={`/api/quotes/${data.id}/pdf`}>
          Baixar proposta em PDF
        </a>
        <Link
          className="button"
          href={`${panel ? "/painel" : "/app"}/processos/${p.processId}`}
        >
          Abrir pasta do processo
        </Link>
      </div>
    </div>
  );
}
