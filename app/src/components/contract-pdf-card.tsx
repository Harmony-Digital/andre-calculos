"use client";
import { useEffect, useId, useState, useTransition } from "react";
import { requestContractPdf } from "@/modules/quotes/contract-actions";
import {
  contractPdfStateSchema,
  type ContractPdfState,
} from "@/modules/quotes/contract-generation";
export function ContractPdfCard({
  quoteId,
  initialState = "pending",
}: {
  quoteId: string;
  initialState?: ContractPdfState;
}) {
  const title = useId(),
    [state, setState] = useState(initialState),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition(),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (state === "ready" || state === "failed") return;
    let stopped = false,
      attempts = 0;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      if (++attempts > 10) {
        clearInterval(timer);
        return;
      }
      try {
        const response = await fetch(`/api/quotes/${quoteId}/contract/status`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = contractPdfStateSchema.safeParse(await response.json());
        if (!stopped && result.success && result.data.quoteId === quoteId) {
          setState(result.data.state);
          if (result.data.state === "ready") setMessage("");
        }
      } catch {
        /* A pessoa pode consultar novamente sem perder a contratação. */
      }
    }, 2500);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [quoteId, state, refresh]);
  return (
    <section className="panel form-body" aria-labelledby={title}>
      <h3 id={title}>Contrato da contratação</h3>
      <p>
        {state === "ready"
          ? "Seu contrato reúne os serviços, valores e os termos que você aceitou."
          : state === "failed"
            ? "Não foi possível concluir o arquivo. Sua contratação está registrada; você pode tentar novamente."
            : "Estamos preparando o PDF com os dados registrados no aceite. Sua contratação já está confirmada."}
      </p>
      <div className="form-actions">
        {state === "ready" ? (
          <a className="button" href={`/api/quotes/${quoteId}/contract`}>
            Baixar contrato em PDF
          </a>
        ) : (
          <button
            className="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  const result = await requestContractPdf(quoteId);
                  setMessage(
                    result.error ??
                      "Preparação retomada. O arquivo aparecerá aqui quando estiver disponível.",
                  );
                  if (!result.error) {
                    setState("pending");
                    setRefresh((v) => v + 1);
                  }
                } catch {
                  setMessage(
                    "Não foi possível retomar agora. Tente novamente; sua contratação foi preservada.",
                  );
                }
              })
            }
          >
            {pending
              ? "Solicitando…"
              : state === "failed"
                ? "Tentar preparar novamente"
                : "Atualizar contrato"}
          </button>
        )}
      </div>
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}
