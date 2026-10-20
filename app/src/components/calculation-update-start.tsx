"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startCalculationUpdate } from "@/modules/calculation-updates/actions";
import { Button } from "./ui/button";
export function CalculationUpdateStart({
  processId,
  sourceOrderId,
  files,
}: {
  processId: string;
  sourceOrderId: string;
  files: { id: string; name: string }[];
}) {
  const router = useRouter(),
    intent = useRef<{ fileId: string; requestId: string } | null>(null);
  const [selected, setSelected] = useState(files[0]?.id ?? "missing"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="panel"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        if (intent.current?.fileId !== selected)
          intent.current = { fileId: selected, requestId: crypto.randomUUID() };
        setBusy(true);
        setError("");
        try {
          const result = await startCalculationUpdate({
            processId,
            sourceOrderId,
            requestId: intent.current.requestId,
            fileId: selected === "missing" ? null : selected,
          });
          if (result.orderId)
            router.push(`/app/novo-pedido?rascunho=${result.orderId}`);
          else setError(result.error ?? "Não foi possível iniciar.");
        } catch {
          setError(
            "Não foi possível confirmar. Tente novamente para recuperar esta solicitação.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-body">
        <h2>Arquivo de origem</h2>
        <div className="form-field">
          <label htmlFor="update-pjc">PJC do cálculo anterior</label>
          <select
            id="update-pjc"
            value={selected}
            disabled={busy}
            onChange={(e) => setSelected(e.target.value)}
          >
            {files.map((file) => (
              <option key={file.id} value={file.id}>
                {file.name}
              </option>
            ))}
            <option value="missing">PJC ausente — solicitar envio</option>
          </select>
        </div>
        <p>
          Será criado outro pedido nesta mesma pasta. O checklist anterior será
          um rascunho para revisar, com nova data-base e proposta própria. O
          cálculo original e seus pagamentos ficam preservados.
        </p>
        <p>
          O índice e as decisões permanecem como histórico com sua origem. O
          André revisará o novo trabalho no PJe-Calc antes da entrega.
        </p>
        {selected === "missing" && (
          <p className="notice">
            A ausência será registrada para o André. Envie o PJC nesta
            atualização antes de gerar a proposta.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="form-actions">
        <Button type="submit" disabled={busy}>
          {busy ? "Criando atualização…" : "Criar pedido de atualização"}
        </Button>
        <Link
          className="text-link"
          href={`/app/processos/${processId}?aba=resumo`}
        >
          Voltar à pasta
        </Link>
      </div>
    </form>
  );
}
