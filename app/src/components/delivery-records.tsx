import { z } from "zod";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { DeliveryPolicyForm } from "./delivery-policy-form";
import {
  deriveDeliveryCreditAccess,
  deliveryCreditAccessLabels,
} from "@/modules/delivery/credit-access";
import { deliveryKinds } from "@/modules/delivery/forms";
import type { getProcess } from "@/modules/processes/queries";
import {
  creditStateMessage,
  observedCredit,
} from "@/modules/payments/order-credit";
import { formatMoney } from "@/lib/utils";
const professionalSchema = z.object({
  name: z.string(),
  crcNumber: z.string(),
  crcState: z.string(),
  crcCategory: z.string(),
});
const snapshotSchema = z.object({
  name: z.string(),
  version: z.number().int().positive(),
});
export function DeliveryRecords({
  records,
  calculator,
  base,
  before,
  older,
  processId,
  payments,
  accessContexts,
}: {
  records: Awaited<ReturnType<typeof getProcess>>["deliveries"];
  calculator: boolean;
  base: string;
  before?: string;
  older: string | null;
  processId: string;
  payments: Awaited<ReturnType<typeof getProcess>>["deliveryPayments"];
  accessContexts: Awaited<ReturnType<typeof getProcess>>["deliveryAccess"];
}) {
  if (!records.length && !before) return null;
  return (
    <section className="delivery-records" aria-label="Entregas confirmadas">
      <h3>Entregas confirmadas</h3>
      <div className="message-history-links">
        {before && (
          <Link className="text-link" href={`${base}?aba=resumo`}>
            Voltar às entregas recentes
          </Link>
        )}
        {older && (
          <Link
            className="text-link"
            href={`${base}?aba=resumo&antes=${encodeURIComponent(older)}`}
          >
            Entregas anteriores
          </Link>
        )}
      </div>
      {!records.length && <p>Nenhuma entrega anterior neste processo.</p>}
      <ul className="process-records">
        {records.map((record) => {
          if (!record.order) throw new Error("Pedido da entrega indisponível.");
          const context = accessContexts.get(record.id);
          if (!context) throw new Error("Contexto da entrega indisponível.");
          const professional = professionalSchema.parse(record.professional),
            payment = payments.get(record.id),
            access = deriveDeliveryCreditAccess(context),
            date = new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "America/Sao_Paulo",
            }).format(new Date(record.created_at));
          return (
            <li key={record.id} data-delivery-id={record.id}>
              <strong>{record.order.code} · Entrega confirmada</strong>
              <p>
                {date} · {professional.name} · CRC {professional.crcState}{" "}
                {professional.crcNumber} · {professional.crcCategory}
              </p>
              <p>
                PJe-Calc {record.pje_version} · Tabela de índices{" "}
                {record.index_month.split("-").reverse().join("/")}
              </p>
              <p className="field-help">{deliveryCreditAccessLabels[access]}</p>
              {!calculator &&
                payment &&
                (payment.remainingCents === null ||
                  payment.remainingCents > 0 ||
                  payment.credit.collectionState !== "clear") && (
                  <div className="delivery-payment">
                    <p>
                      <strong>
                        {payment.remainingCents === null
                          ? "Saldo em conciliação"
                          : (payment.credit.projection.totalExcessCents ?? 0) >
                              0
                            ? `Crédito excedente: ${formatMoney(payment.credit.projection.totalExcessCents!)}`
                            : `Saldo pendente: ${formatMoney(payment.remainingCents)}`}
                      </strong>
                    </p>
                    {creditStateMessage(payment.credit) && (
                      <p>{creditStateMessage(payment.credit)}</p>
                    )}
                    {payment.remainingCents === null &&
                      observedCredit(payment.credit.projection, "total") !==
                        null && (
                        <p>
                          Subtotal observado:{" "}
                          {formatMoney(
                            observedCredit(payment.credit.projection, "total")!,
                          )}
                          . Esse valor aguarda conciliação.
                        </p>
                      )}
                    {(payment.credit.projection.totalExcessCents ?? 0) > 0 && (
                      <p>
                        Excesso no pedido:{" "}
                        {formatMoney(
                          payment.credit.projection.totalExcessCents!,
                        )}
                        .
                      </p>
                    )}
                    {payment.pixKey ? (
                      <>
                        <p>
                          Chave Pix: <span>{payment.pixKey}</span>
                        </p>
                        <p>
                          Confira o destinatário no seu banco e informe o código{" "}
                          {payment.orderCode} na descrição. Os arquivos serão
                          liberados depois da confirmação do pagamento.
                        </p>
                      </>
                    ) : payment.credit.collectionState === "clear" &&
                      payment.remainingCents !== null &&
                      payment.remainingCents > 0 ? (
                      <p>Peça os dados de pagamento na conversa do processo.</p>
                    ) : null}
                    <Link className="text-link" href={`${base}?aba=mensagens`}>
                      Abrir conversa do processo
                    </Link>
                  </div>
                )}
              {calculator &&
                context.releasePolicy === null &&
                ["delivered", "completed"].includes(context.orderStatus) && (
                  <details className="delivery-form">
                    <summary>Definir regra desta entrega</summary>
                    <DeliveryPolicyForm
                      processId={processId}
                      deliveryId={record.id}
                      requestId={randomUUID()}
                    />
                  </details>
                )}
              <ul className="delivery-file-list">
                {record.files.map((f) => {
                  const snapshot = snapshotSchema.parse(f.snapshot);
                  return (
                    <li key={f.file_id}>
                      <span>
                        {deliveryKinds[f.kind as keyof typeof deliveryKinds]}:{" "}
                        {snapshot.name} · Versão {snapshot.version}
                      </span>
                      {(calculator || access === "ready") && (
                        <a
                          className="text-link"
                          href={`/api/files/${f.file_id}/download`}
                        >
                          Baixar {snapshot.name}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
