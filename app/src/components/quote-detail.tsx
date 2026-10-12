import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { QuoteDetailData } from "@/modules/quotes/queries";
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
      {data.contract ? (
        <>
          <QuoteAcceptance
            quoteId={data.id}
            context={data.contract}
            requestId={randomUUID()}
            panel={panel}
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
