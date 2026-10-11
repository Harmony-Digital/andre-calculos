import { z } from "zod";
import Link from "next/link";
import {
  deliveryAccess,
  deliveryAccessLabels,
} from "@/modules/delivery/delivery";
import { deliveryKinds } from "@/modules/delivery/forms";
import type { getProcess } from "@/modules/processes/queries";
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
}: {
  records: Awaited<ReturnType<typeof getProcess>>["deliveries"];
  calculator: boolean;
  base: string;
  before?: string;
  older: string | null;
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
          const professional = professionalSchema.parse(record.professional),
            access = deliveryAccess(
              record.release?.policy ?? null,
              record.order.status,
              record.order.total_cents,
              record.order.payments,
            ),
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
              <p className="field-help">{deliveryAccessLabels[access]}</p>
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
