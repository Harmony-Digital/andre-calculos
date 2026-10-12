import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvoicePage } from "@/modules/payments/invoice-page-data";
import { fixtureInvoiceEnabled } from "@/modules/payments/invoice-mode";
import {
  invoiceReasonLabels,
  invoiceStateLabels,
} from "@/modules/payments/invoice-presentation";
import { formatMoney } from "@/lib/utils";

const methods = {
  PIX: "Pix",
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão de crédito",
  UNDEFINED: "Escolha na fatura",
} as const;
export async function InvoiceView({
  processId,
  orderId,
  panel = false,
  openingChanged = false,
}: {
  processId: string;
  orderId: string;
  panel?: boolean;
  openingChanged?: boolean;
}) {
  if (!fixtureInvoiceEnabled()) notFound();
  const data = await getInvoicePage(orderId, processId).catch(() => null);
  if (!data) notFound();
  const { invoice, orderCode } = data;
  const base = `${panel ? "/painel" : "/app"}/processos/${invoice.processId}`;
  const current = `${base}/fatura?pedido=${invoice.orderId}`;
  return (
    <div className="invoice-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{orderCode} · Pagamento do sinal</span>
          <h1>Fatura do pedido</h1>
          <p>Consulte a cobrança e acompanhe a confirmação do recebimento.</p>
        </div>
        <Link
          className="text-link"
          href={`${base}?aba=resumo`}
          prefetch={false}
        >
          Voltar à pasta do processo
        </Link>
      </div>
      <p className="notice">
        Demonstração com dados fictícios, sem cobrança real.
      </p>
      {openingChanged && (
        <p role="status" className="notice">
          A abertura não foi concluída porque a fatura mudou ou precisa de
          conferência. Veja a situação atual abaixo.
        </p>
      )}
      <section
        className={`panel form-body invoice-state invoice-state-${invoice.state}`}
        aria-labelledby="invoice-state"
      >
        <span className="eyebrow">Situação atual</span>
        <h2 id="invoice-state">
          {invoice.reason === "client_contract"
            ? "Pagamento conforme contrato."
            : invoice.reason === "no_deposit"
              ? "Sem sinal para este pedido."
              : invoiceStateLabels[invoice.state]}
        </h2>
        <p>{invoiceReasonLabels[invoice.reason]}</p>
        {invoice.state !== "active" && (
          <dl className="process-summary invoice-financial">
            <div>
              <dt>Falta para o sinal</dt>
              <dd>
                {invoice.remainingCents === null
                  ? "A conferir"
                  : formatMoney(invoice.remainingCents)}
              </dd>
            </div>
          </dl>
        )}
        {invoice.state === "active" && (
          <>
            <dl className="process-summary invoice-summary">
              <div>
                <dt>Valor da fatura</dt>
                <dd className="invoice-amount">
                  {formatMoney(invoice.invoiceAmountCents!)}
                </dd>
              </div>
              <div>
                <dt>Vencimento</dt>
                <dd>{invoice.dueDate!.split("-").reverse().join("/")}</dd>
              </div>
              <div>
                <dt>Forma de pagamento</dt>
                <dd>{methods[invoice.billingType!]}</dd>
              </div>
              <div>
                <dt>Recebimento do sinal</dt>
                <dd>
                  {invoice.remainingCents === null
                    ? "A confirmar"
                    : `${formatMoney(invoice.remainingCents)} ainda pendentes`}
                </dd>
              </div>
            </dl>
            <p>
              A abertura da fatura será conferida novamente. Dados de cartão são
              informados na página de pagamento.
            </p>
            <a
              className="button"
              href={`/api/processes/${invoice.processId}/orders/${invoice.orderId}/invoice`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir fatura conferida
            </a>
          </>
        )}
        <div className="invoice-actions">
          <a className="text-link" href={current}>
            Atualizar situação da fatura
          </a>
          <Link
            className="text-link"
            href={`${base}?aba=mensagens`}
            prefetch={false}
          >
            Conversar na pasta do processo
          </Link>
        </div>
      </section>
    </div>
  );
}
