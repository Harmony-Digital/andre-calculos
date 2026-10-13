"use server";
import { after } from "next/server";
import { getContractArchive } from "./contract-queries";
import {
  localContractWorkerEnabled,
  processContractPdf,
} from "./contract-worker";
export async function requestContractPdf(id: string) {
  const authorized = await getContractArchive(id);
  if (authorized.error) return { error: authorized.error };
  if (!localContractWorkerEnabled())
    return {
      error:
        "A geração de contratos ainda aguarda validação para este ambiente.",
    };
  after(async () => {
    await processContractPdf(id).catch(() => undefined);
  });
  return { scheduled: true };
}
