import "server-only";
import { createHash } from "node:crypto";
import { getContractArchive } from "./contract-queries";
import { createSessionClient } from "@/lib/supabase/server";
import { createSystemClient } from "@/lib/supabase/admin";
import { contractPdfDownloadSchema } from "./contract-generation";
import { authorize } from "@/modules/auth/session";
export async function downloadContractPdf(id: string) {
  const visible = await getContractArchive(id);
  if (!visible.data) return { error: visible.error, status: visible.status };
  try {
    const actor = await authorize(["client", "calculator"]);
    const db = await createSessionClient(),
      authorized = await db.rpc("authorize_quote_contract_download", {
        target_quote: id,
      });
    if (authorized.error)
      return {
        error: "Contrato ainda não disponível.",
        status: authorized.error.code === "PT409" ? 409 : 503,
      };
    const file = contractPdfDownloadSchema.parse(authorized.data);
    if (file.quoteId !== id) throw new Error("Contrato divergente.");
    const expectedPath = `contracts/${id}/${visible.data.snapshotHash}/contract-pdf-v1.pdf`;
    if (file.objectPath !== expectedPath)
      throw new Error("Destino divergente.");
    const stored = await createSystemClient()
      .storage.from(file.bucket)
      .download(file.objectPath);
    if (stored.error || !stored.data) throw new Error("Arquivo indisponível.");
    const bytes = Buffer.from(await stored.data.arrayBuffer());
    if (
      bytes.length !== file.sizeBytes ||
      createHash("sha256").update(bytes).digest("hex") !== file.sha256
    )
      throw new Error("Integridade não conferida.");
    const recorded = await createSystemClient().rpc(
      "record_quote_contract_download_system",
      {
        target_quote: id,
        actor: actor.user.id,
        expected_sha256: file.sha256,
      },
    );
    if (recorded.error || recorded.data !== true)
      throw new Error("Auditoria não concluída.");
    return { bytes, number: file.number };
  } catch {
    return {
      error: "Não foi possível conferir o contrato. Tente novamente.",
      status: 503,
    };
  }
}
