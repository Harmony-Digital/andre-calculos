import Link from "next/link";
import { getProcess } from "@/modules/processes/queries";
import { FileUploader } from "./file-uploader";
export async function ProcessFolder({
  id,
  panel = false,
}: {
  id: string;
  panel?: boolean;
}) {
  const { process, files } = await getProcess(id);
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
      <FileUploader processId={id} />
      <section className="panel">
        <div className="panel-header">
          <h2>Documentos</h2>
          <span>{files.length} arquivo(s)</span>
        </div>
        {files.length === 0 ? (
          <p className="document-row">Nenhum documento enviado.</p>
        ) : (
          <ul className="document-list">
            {files.map((file) => (
              <li key={file.id} className="document-row">
                <div>
                  <strong>{file.name}</strong>
                  <p>
                    {(file.size_bytes / 1024 / 1024).toFixed(1)} MB ·
                    integridade confirmada
                  </p>
                </div>
                <a
                  className="text-link"
                  href={`/api/files/${file.id}/download`}
                >
                  Baixar arquivo
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
