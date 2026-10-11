"use client";
import { useEffect, useRef, useState, useId } from "react";
import { useRouter } from "next/navigation";
import Uppy from "@uppy/core";
import Tus from "@uppy/tus";
import { prepareUpload, completeUpload } from "@/modules/files/actions";
import { fileMime, maxFileBytes } from "@/modules/files/validation";
import { hashFile } from "@/modules/files/hash";
export function FileUploader({
  processId,
  allowTriage = false,
  allowDeliverables = false,
  fixedFolder,
}: {
  processId: string;
  allowTriage?: boolean;
  allowDeliverables?: boolean;
  fixedFolder?: "client";
}) {
  const router = useRouter();
  const uploader = useRef<Uppy | null>(null);
  const titleId = useId();
  const [folder, setFolder] = useState<
    "case" | "client" | "triage" | "deliverables"
  >("case");
  const [busy, setBusy] = useState(false),
    [paused, setPaused] = useState(false),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState("");
  useEffect(() => {
    const offline = () => {
      uploader.current?.pauseAll();
      setPaused(true);
      setMessage("Conexão interrompida. Quando voltar, retome o envio.");
    };
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("offline", offline);
      uploader.current?.destroy();
    };
  }, []);
  async function send(file: File) {
    if (file.size < 1 || file.size > maxFileBytes) {
      setMessage("Escolha um arquivo de até 500 MB.");
      return;
    }
    setBusy(true);
    setProgress(0);
    setMessage("Preparando envio…");
    try {
      const sha256 = await hashFile(file, (value) =>
        setMessage(`Preparando arquivo: ${value}%.`),
      );
      const mime = fileMime(file);
      const prepared = await prepareUpload({
        processId,
        name: file.name,
        mime,
        size: file.size,
        sha256,
        folder: fixedFolder ?? folder,
      });
      if (prepared.error || !prepared.fileId) {
        setMessage(prepared.error ?? "Envio indisponível.");
        setBusy(false);
        return;
      }
      uploader.current?.destroy();
      const uppy = new Uppy({
        autoProceed: false,
        restrictions: { maxNumberOfFiles: 1, maxFileSize: maxFileBytes },
      });
      uploader.current = uppy;
      uppy.use(Tus, {
        endpoint: prepared.endpoint,
        chunkSize: 6 * 1024 * 1024,
        headers: {
          "x-signature": prepared.token,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        uploadDataDuringCreation: true,
        retryDelays: [0, 1000, 3000, 5000],
        allowedMetaFields: [
          "bucketName",
          "objectName",
          "contentType",
          "cacheControl",
        ],
        removeFingerprintOnSuccess: true,
      });
      uppy.on("progress", (value) => setProgress(value));
      uppy.on("upload-error", () => {
        setPaused(true);
        setMessage("O envio foi interrompido. Retome para continuar.");
      });
      uppy.on("upload-success", async () => {
        try {
          setMessage("Conferindo a integridade do arquivo…");
          const completed = await completeUpload(prepared.fileId);
          setBusy(false);
          setPaused(false);
          if (completed.error) {
            setMessage(completed.error);
            return;
          }
          setMessage("Arquivo enviado e integridade confirmada.");
          router.refresh();
        } catch {
          setBusy(false);
          setPaused(false);
          setMessage("Não foi possível conferir o envio. Tente novamente.");
        }
      });
      uppy.addFile({
        name: file.name,
        type: mime,
        data: file,
        meta: {
          bucketName: "processos",
          objectName: prepared.path,
          contentType: mime,
          cacheControl: "120",
        },
      });
      setMessage("Enviando arquivo…");
      await uppy.upload();
    } catch {
      setBusy(false);
      setMessage("Não foi possível enviar o arquivo. Tente novamente.");
    }
  }
  return (
    <section className="upload-box" aria-labelledby={titleId}>
      <h2 id={titleId}>
        {fixedFolder
          ? "Enviar anexo da mensagem"
          : "Enviar documento do processo"}
      </h2>
      <p>
        PDF, imagens, XLSX, CSV, DOCX ou PJC, até 500 MB. O arquivo fica privado
        nesta pasta.
      </p>
      {fixedFolder ? (
        <p>
          Destino: Documentos do cliente. Depois do envio, selecione o arquivo
          na mensagem.
        </p>
      ) : (
        <label className="upload-folder">
          Pasta de destino
          <select
            value={folder}
            disabled={busy}
            onChange={(event) => setFolder(event.target.value as typeof folder)}
          >
            <option value="case">Processo</option>
            <option value="client">Documentos do cliente</option>
            {allowTriage && <option value="triage">Triagem</option>}
            {allowDeliverables && (
              <option value="deliverables">Entregas</option>
            )}
          </select>
        </label>
      )}
      <label className="button button-secondary">
        Escolher arquivo
        <input
          aria-label="Escolher arquivo do processo"
          className="upload-input"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx,.pjc"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
            event.target.value = "";
          }}
        />
      </label>
      {busy && (
        <>
          <progress
            aria-label="Progresso do envio"
            value={progress}
            max={100}
          />
          <span>{progress}%</span>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              if (paused) {
                uploader.current?.resumeAll();
                void uploader.current?.retryAll();
                setPaused(false);
                setMessage("Retomando envio…");
              } else {
                uploader.current?.pauseAll();
                setPaused(true);
                setMessage("Envio pausado. Retome quando quiser.");
              }
            }}
          >
            {paused ? "Retomar envio" : "Pausar envio"}
          </button>
        </>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
