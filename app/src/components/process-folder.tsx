import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Clock3, FileText, ClipboardList } from "lucide-react";
import { getProcess } from "@/modules/processes/queries";
import { processTabs, type ProcessTab } from "@/modules/processes/tabs";
import {
  orderStateLabels,
  type OrderState,
} from "@/modules/orders/state-machine";
import { calculationLabels } from "@/modules/checklist/v1";
import { FileUploader } from "./file-uploader";
import { PdfViewer } from "./pdf-viewer";
import { MessageComposer } from "./message-composer";
import { NoteComposer } from "./note-composer";
import { eventLabel, eventLabels, noteText } from "@/modules/timeline/types";
import { DecisionComposer } from "./decision-composer";
import { DecisionConfirmation } from "./decision-confirmation";
import { PageIndexEditor } from "./page-index-editor";
import { DeliveryForm } from "./delivery-form";
import { OrderOperations } from "./order-operations";
import { DepositCard } from "./deposit-card";
import { fixtureInvoiceEnabled } from "@/modules/payments/invoice-mode";
import { DeliveryRecords } from "./delivery-records";
import { pieceLabel } from "@/modules/page-index/forms";
import { ContractPdfFolderCard } from "./contract-pdf-folder-card";
import {
  parameterLabel,
  sourceLabel,
  isPremise,
} from "@/modules/decisions/types";
const folders = {
  case: "Processo",
  client: "Documentos do cliente",
  deliverables: "Entregas",
  triage: "Triagem",
} as const;
const dateTime = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(date));
const civilDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(`${date}T12:00:00-03:00`));
export async function ProcessFolder({
  id,
  panel = false,
  tab = "documentos",
  before,
  eventType,
}: {
  id: string;
  panel?: boolean;
  tab?: ProcessTab;
  before?: string;
  eventType?: string;
}) {
  const data = await getProcess(id, tab, before, eventType),
    { process, files } = data;
  const base = `${panel ? "/painel" : "/app"}/processos/${id}`;
  const cnj = process.cnj_number.replace(
    /^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/,
    "$1-$2.$3.$4.$5.$6",
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Pasta do processo</span>
          <h1>{cnj}</h1>
          <p>
            {process.court} · {process.chamber}
          </p>
        </div>
        <Link className="text-link" href={panel ? "/painel/pedidos" : "/app"}>
          Voltar aos processos
        </Link>
      </div>
      <nav className="process-tabs" aria-label="Abas da pasta do processo">
        {Object.entries(processTabs).map(([key, label]) => (
          <Link
            key={key}
            href={`${base}?aba=${key}`}
            aria-current={tab === key ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "resumo" && (
        <section className="panel process-section">
          <h2>Resumo do processo</h2>
          <dl className="process-summary">
            <div>
              <dt>Tribunal e vara</dt>
              <dd>
                {process.court} · {process.chamber}
              </dd>
            </div>
            <div>
              <dt>Polo representado</dt>
              <dd>
                {process.side === "claimant" ? "Reclamante" : "Reclamada"}
              </dd>
            </div>
            <div>
              <dt>Reclamantes</dt>
              <dd>{process.claimants_count}</dd>
            </div>
            <div>
              <dt>Documentos disponíveis</dt>
              <dd>{files.length}</dd>
            </div>
          </dl>
          <h3>Pedidos deste processo</h3>
          {!data.orders.length ? (
            <p>Nenhum pedido registrado.</p>
          ) : (
            <ul className="process-records">
              {data.orders.map((order) => (
                <li key={order.id}>
                  <strong>
                    {order.code} ·{" "}
                    {
                      calculationLabels[
                        order.calc_type as keyof typeof calculationLabels
                      ]
                    }
                  </strong>
                  <p>
                    {orderStateLabels[order.status as OrderState]}
                    {order.delivery_date
                      ? ` · Entrega prevista: ${civilDate(order.delivery_date)}`
                      : ""}
                  </p>
                  {order.status === "draft" && !panel && (
                    <Link
                      className="text-link"
                      href={`/app/novo-pedido?rascunho=${order.id}`}
                    >
                      Continuar checklist
                    </Link>
                  )}
                  {[...order.quotes]
                    .sort((a, b) => b.version - a.version)
                    .filter(
                      (quote) =>
                        quote.proposal_snapshot ||
                        data.contractQuoteIds.has(quote.id),
                    )
                    .map((quote) => (
                      <div key={quote.id}>
                        <Link
                          className="text-link"
                          href={`${panel ? "/painel" : "/app"}/orcamentos/${quote.id}`}
                        >
                          {quote.number} · Versão {quote.version}
                          {order.quotes.some(
                            (other) => other.supersedes_id === quote.id,
                          )
                            ? " · Substituída"
                            : " · Vigente"}
                          {quote.is_simulation ? " · Ensaio fictício" : ""}
                        </Link>
                        <ContractPdfFolderCard quoteId={quote.id} />
                      </div>
                    ))}
                  {data.deposits.has(order.id) && (
                    <DepositCard
                      key={`${order.id}:${data.deposits.get(order.id)!.receipt?.id ?? "none"}:${data.deposits.get(order.id)!.paymentStatus ?? "none"}:${data.deposits.get(order.id)!.remainingCents}`}
                      info={data.deposits.get(order.id)!}
                      requestId={randomUUID()}
                      panel={panel}
                      invoiceEnabled={fixtureInvoiceEnabled()}
                    />
                  )}
                  {fixtureInvoiceEnabled() &&
                    ["delivered", "completed"].includes(order.status) && (
                      <section className="form-body">
                        <h4>Saldo · {order.code}</h4>
                        <p>
                          Consulte o pagamento previsto após a entrega técnica.
                        </p>
                        <Link
                          className="text-link"
                          prefetch={false}
                          href={`${panel ? "/painel" : "/app"}/processos/${id}/fatura?pedido=${order.id}&fase=balance`}
                        >
                          Consultar fatura do saldo
                        </Link>
                      </section>
                    )}
                  {data.role === "calculator" && (
                    <OrderOperations
                      processId={id}
                      orderId={order.id}
                      code={order.code}
                      status={order.status as OrderState}
                      revision={order.status_revision}
                      resumeStatus={order.resume_status}
                      requestId={randomUUID()}
                    />
                  )}
                  {data.role === "calculator" &&
                    order.status === "in_review" && (
                      <DeliveryForm
                        processId={id}
                        orderId={order.id}
                        code={order.code}
                        requestId={randomUUID()}
                        files={files.filter(
                          (file) => file.folder === "deliverables",
                        )}
                      />
                    )}
                </li>
              ))}
            </ul>
          )}
          <DeliveryRecords
            records={data.deliveries}
            calculator={data.role === "calculator"}
            base={base}
            before={before}
            older={data.olderDeliveries}
            processId={id}
            payments={data.deliveryPayments}
            accessContexts={data.deliveryAccess}
          />
        </section>
      )}
      {tab === "documentos" && (
        <>
          <FileUploader
            processId={id}
            allowTriage={data.role === "calculator"}
            allowDeliverables={data.role === "calculator"}
          />
          {Object.entries(folders).map(([folder, title]) => {
            const rows = files.filter((file) => file.folder === folder);
            return (
              <section
                className="panel file-folder"
                key={folder}
                aria-label={`Pasta ${title}`}
              >
                <div className="panel-header">
                  <h2>{title}</h2>
                  <span>{rows.length} arquivo(s)</span>
                </div>
                {!rows.length ? (
                  <p className="document-row">Nenhum documento nesta pasta.</p>
                ) : (
                  <ul className="document-list">
                    {rows.map((file) => (
                      <li key={file.id} className="document-item">
                        <div className="document-row">
                          <div>
                            <strong>{file.name}</strong>
                            <p>
                              {(file.size_bytes / 1024 / 1024).toLocaleString(
                                "pt-BR",
                                { maximumFractionDigits: 1 },
                              )}{" "}
                              MB · Versão {file.version} · Integridade
                              confirmada
                            </p>
                          </div>
                          <a
                            className="text-link"
                            href={`/api/files/${file.id}/download`}
                          >
                            Baixar arquivo
                          </a>
                        </div>
                        {file.mime === "application/pdf" && (
                          <PdfViewer id={file.id} name={file.name} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
      {tab === "mensagens" && (
        <section className="panel process-section">
          <h2>Mensagens</h2>
          <p>A conversa deste processo fica nesta pasta.</p>
          {!before && (
            <>
              <details className="message-upload">
                <summary>Adicionar novo anexo</summary>
                <FileUploader processId={id} fixedFolder="client" />
              </details>
              <MessageComposer
                processId={id}
                requestId={randomUUID()}
                files={files.filter((file) => file.folder === "client")}
              />
            </>
          )}
          <div className="message-history-links">
            {before && (
              <Link className="text-link" href={`${base}?aba=mensagens`}>
                Voltar às mensagens recentes
              </Link>
            )}
            {data.olderMessages && (
              <Link
                className="text-link"
                href={`${base}?aba=mensagens&antes=${encodeURIComponent(data.olderMessages)}`}
              >
                Ver mensagens anteriores
              </Link>
            )}
          </div>
          {!data.messages.length ? (
            <p>Nenhuma mensagem enviada.</p>
          ) : (
            <ul className="process-records">
              {data.messages.map((message) => (
                <li key={message.id}>
                  <strong>
                    {data.authors.get(message.author_id) || "Responsável"}
                  </strong>
                  <time dateTime={message.created_at}>
                    {dateTime(message.created_at)}
                  </time>
                  <p className="preserve-lines">{message.body}</p>
                  {message.attachment_ids.map((fileId) => {
                    const file = files.find((row) => row.id === fileId);
                    return file ? (
                      <a
                        key={fileId}
                        className="text-link attachment-link"
                        href={`/api/files/${fileId}/download`}
                      >
                        {file.name}
                      </a>
                    ) : null;
                  })}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {tab === "decisoes" && (
        <section className="panel process-section">
          <h2>Decisões técnicas</h2>
          <p>Escolhas, fontes informadas e concordâncias deste processo.</p>
          <a className="text-link" href={`/api/processes/${id}/decisions/pdf`}>
            Exportar decisões em PDF
          </a>
          {data.role === "calculator" && (
            <DecisionComposer processId={id} requestId={randomUUID()} />
          )}
          <p>
            Os critérios adotados ficam registrados com sua origem e
            justificativa.
          </p>
          {!data.decisions.length ? (
            <p>Nenhuma decisão registrada.</p>
          ) : (
            <ul className="process-records">
              {data.decisions.map((decision) => (
                <li key={decision.id}>
                  <strong>
                    {parameterLabel(decision.parameter)}: {decision.value}
                  </strong>
                  <p>
                    Origem informada: {sourceLabel(decision.source)}
                    {decision.page ? ` · Página ${decision.page}` : ""}
                    {isPremise(decision.page, decision.client_confirmed_at)
                      ? " · Premissa"
                      : ""}
                  </p>
                  <p className="preserve-lines">{decision.rationale}</p>
                  <p>
                    {data.authors.get(decision.recorded_by) || "Responsável"} ·{" "}
                    {dateTime(decision.created_at)}
                  </p>
                  {decision.client_confirmed_at ? (
                    <p>
                      Concordância de{" "}
                      {data.authors.get(decision.client_confirmed_by!) ||
                        "Cliente"}{" "}
                      em {dateTime(decision.client_confirmed_at)}.
                    </p>
                  ) : (
                    <>
                      <p>Concordância do cliente ainda não registrada.</p>
                      {data.role === "client" && (
                        <DecisionConfirmation
                          processId={id}
                          decisionId={decision.id}
                        />
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {tab === "indice" && (
        <section className="panel process-section">
          <h2>Índice de páginas</h2>
          <p>Localização das peças em cada versão do processo.</p>
          {data.role === "calculator" && (
            <Link className="text-link" href={`${base}/versoes`}>
              Conferir versões e páginas lidas
            </Link>
          )}
          {data.role === "calculator" &&
            !before &&
            (files.some(
              (f) =>
                f.mime === "application/pdf" &&
                ["case", "client"].includes(f.folder),
            ) ? (
              <PageIndexEditor
                processId={id}
                requestId={randomUUID()}
                entryId={randomUUID()}
                files={files.filter(
                  (f) =>
                    f.mime === "application/pdf" &&
                    ["case", "client"].includes(f.folder),
                )}
              />
            ) : (
              <p>
                Envie um PDF para a pasta Processo ou Documentos do cliente
                antes de indexar.
              </p>
            ))}
          {!data.index.length ? (
            <p>Nenhuma peça indexada.</p>
          ) : (
            <ul className="process-records">
              {data.index.map((piece) => {
                const file = piece.source;
                const origin = data.indexOrigins.get(piece.id);
                return (
                  <li key={piece.id}>
                    <strong>
                      {pieceLabel(piece.piece)} · Páginas {piece.pages}
                    </strong>
                    <p>
                      {file
                        ? `${file.name} · Versão ${file.version}${file.upload_status !== "uploaded" ? " · Documento indisponível" : ""}`
                        : "Documento indisponível"}
                    </p>
                    {origin && (
                      <div className="pdf-origin" data-pdf-origin={piece.id}>
                        <p>
                          Reaproveitada de {origin.sourceName ?? "PDF anterior"}{" "}
                          · páginas {origin.sourcePages} · revisão{" "}
                          {origin.sourceRevision} da referência.
                        </p>
                        <p>
                          Conferência: {origin.copiedName} ·{" "}
                          {new Intl.DateTimeFormat("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                            timeZone: "America/Sao_Paulo",
                          }).format(new Date(origin.copiedAt))}
                          .
                        </p>
                        {origin.edited && (
                          <p>
                            Entrada editada após o reaproveitamento; a prova de
                            origem foi preservada.
                          </p>
                        )}
                        {origin.requiresReview && (
                          <p className="field-error">
                            A correspondência mudou. Reconfira esta referência
                            antes de usar.
                          </p>
                        )}
                      </div>
                    )}
                    {piece.note && (
                      <p className="preserve-lines">{piece.note}</p>
                    )}
                    {data.role === "calculator" &&
                      file?.upload_status === "uploaded" && (
                        <PageIndexEditor
                          key={`${piece.id}:${piece.revision}`}
                          processId={id}
                          requestId={randomUUID()}
                          entryId={piece.id}
                          entry={piece}
                        />
                      )}
                  </li>
                );
              })}
            </ul>
          )}
          {(before || data.olderIndex) && (
            <nav className="folder-pagination" aria-label="Paginação do índice">
              {before && (
                <Link className="text-link" href={`${base}?aba=indice`}>
                  Peças mais recentes
                </Link>
              )}
              {data.olderIndex && (
                <Link
                  className="text-link"
                  href={`${base}?aba=indice&antes=${encodeURIComponent(data.olderIndex)}`}
                >
                  Peças anteriores
                </Link>
              )}
            </nav>
          )}
        </section>
      )}
      {tab === "historico" && (
        <section className="panel process-section">
          <h2>Linha do tempo</h2>
          <p>Atividades mais recentes deste processo.</p>
          <form method="get" action={base} className="timeline-filter">
            <input type="hidden" name="aba" value="historico" />
            <label htmlFor="event-type">Filtrar atividade</label>
            <select
              id="event-type"
              name="tipo"
              defaultValue={data.selectedEvent ?? "todos"}
            >
              <option value="todos">Todas as atividades</option>
              {Object.entries(eventLabels).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
            <button type="submit" className="button button-secondary">
              Filtrar
            </button>
          </form>
          {data.role === "calculator" && !before && (
            <NoteComposer processId={id} requestId={randomUUID()} />
          )}
          <div className="message-history-links">
            {before && (
              <Link
                className="text-link"
                href={`${base}?aba=historico${data.selectedEvent ? `&tipo=${data.selectedEvent}` : ""}`}
              >
                Voltar às atividades recentes
              </Link>
            )}
            {data.olderEvents && (
              <Link
                className="text-link"
                href={`${base}?aba=historico${data.selectedEvent ? `&tipo=${data.selectedEvent}` : ""}&antes=${encodeURIComponent(data.olderEvents)}`}
              >
                Ver atividades anteriores
              </Link>
            )}
          </div>
          {!data.events.length ? (
            <p>Nenhuma atividade registrada.</p>
          ) : (
            <ol className="process-timeline">
              {data.events.map((event) => {
                const Icon =
                  event.kind === "file_uploaded"
                    ? FileText
                    : event.kind.startsWith("draft_") ||
                        event.kind === "checklist_draft_saved" ||
                        event.kind === "note_added"
                      ? ClipboardList
                      : Clock3;
                return (
                  <li key={event.id}>
                    <Icon size={20} aria-hidden="true" />
                    <div>
                      <strong>{eventLabel(event.kind, event.data)}</strong>
                      <p>
                        {event.actor_id
                          ? data.authors.get(event.actor_id) || "Responsável"
                          : "Sistema"}
                      </p>
                      <time dateTime={event.created_at}>
                        {dateTime(event.created_at)}
                      </time>
                      {["note_added", "status_changed"].includes(event.kind) &&
                        noteText(event.data) && (
                          <p className="preserve-lines">
                            {noteText(event.data)}
                          </p>
                        )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </>
  );
}
