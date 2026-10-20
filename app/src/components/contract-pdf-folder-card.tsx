import { getContractPdfState } from "@/modules/quotes/contract-queries";
import { ContractPdfCard } from "./contract-pdf-card";
export async function ContractPdfFolderCard({ quoteId }: { quoteId: string }) {
  const result = await getContractPdfState(quoteId);
  return result.data ? (
    <ContractPdfCard quoteId={quoteId} initialState={result.data.state} />
  ) : null;
}
