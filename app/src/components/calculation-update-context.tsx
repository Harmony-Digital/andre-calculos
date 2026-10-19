import Link from "next/link";
import type { UpdateContext } from "@/modules/calculation-updates/schemas";
import { createSessionClient } from "@/lib/supabase/server";
import { FileUploader } from "./file-uploader";
import { UpdatePjcPicker } from "./update-pjc-picker";
export async function CalculationUpdateContext({
  context,
  revision,
  panel = false,
  allowUpload = false,
}: {
  context: UpdateContext;
  revision?: number;
  panel?: boolean;
  allowUpload?: boolean;
}) {
  const c = context,
    base = panel ? "/painel" : "/app";
  const db = allowUpload && !c.file ? await createSessionClient() : null;
  const files = db
    ? await db
        .from("files")
        .select("id,name")
        .eq("process_id", c.processId)
        .eq("folder", "client")
        .eq("upload_status", "uploaded")
        .eq("mime", "application/octet-stream")
        .is("order_id", null)
        .gte("created_at", c.createdAt)
        .order("created_at", { ascending: false })
    : null;
  if (files?.error)
    throw new Error("Não foi possível consultar os PJC enviados.");
  return (
    <section
      className="panel process-section"
      aria-label="Origem da atualização"
      id="origem-atualizacao"
    >
      <span className="eyebrow">Atualização do cálculo</span>
      <h2>Origem: {c.sourceCode}</h2>
      <p>
        Checklist herdado da revisão {c.sourceRevision}, com data-base anterior{" "}
        {c.sourceBaseDate.split("-").reverse().join("/")}. Revise todas as
        etapas e informe uma data-base posterior.
      </p>
      <p>
        {c.indexCount} referências do índice e {c.decisionCount} decisões na
        abertura. Permanecem no histórico da pasta com seus responsáveis e
        fontes; concordâncias anteriores não são uma nova aprovação.
      </p>
      {c.file ? (
        <p>
          PJC de origem:{" "}
          <Link
            className="text-link"
            prefetch={false}
            href={`/api/files/${c.file.id}/download`}
          >
            {c.file.name}
          </Link>
          {c.file.origin === "client_upload"
            ? " · Enviado para esta atualização"
            : " · Entrega anterior preservada"}
        </p>
      ) : (
        <p className="notice">
          PJC ausente. Solicitação de envio registrada para o André. A proposta
          aguarda o arquivo confirmado.
        </p>
      )}
      <p>
        <Link
          className="text-link"
          href={`${base}/processos/${c.processId}?aba=resumo`}
        >
          Consultar pedido original e histórico da pasta
        </Link>
      </p>
      {allowUpload && !c.file && revision && (
        <>
          <FileUploader
            processId={c.processId}
            fixedFolder="client"
            title="Enviar o PJC da atualização"
          />
          <UpdatePjcPicker
            key={`${c.orderId}:${revision}`}
            orderId={c.orderId}
            revision={revision}
            files={(files?.data ?? []).filter((f) =>
              f.name.toLowerCase().endsWith(".pjc"),
            )}
          />
        </>
      )}
    </section>
  );
}
