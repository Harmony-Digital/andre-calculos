import "server-only";
import { z } from "zod";
import { notFound } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { authorize, getSessionProfile } from "@/modules/auth/session";
import { proposalSchema } from "./proposal";
import { contractContextSchema, type ContractContext } from "./acceptance";
import { getContractPdfState } from "./contract-queries";
import type { ContractPdfState } from "./contract-generation";
import { revisionContextSchema, type RevisionContext } from "./revision";
export const quoteExportSchema = z.strictObject({
  id: z.uuid(),
  number: z.string().regex(/^ORC-\d{4}-\d{4,}$/),
  proposal: proposalSchema,
  revision: z
    .strictObject({
      version: z.number().int().min(2),
      reason: z.string().min(1).max(1000),
    })
    .optional(),
});
export type QuoteExport = z.infer<typeof quoteExportSchema>;
export type QuoteDetailData = QuoteExport & {
  contract: ContractContext | null;
  revisionContext?: RevisionContext;
  contractPdfState?: ContractPdfState;
};
export async function getQuote(id: string): Promise<QuoteDetailData> {
  const session = await getSessionProfile();
  if (
    !session ||
    !["client", "calculator"].includes(session.profile.role) ||
    !z.uuid().safeParse(id).success
  )
    notFound();
  await authorize(["client", "calculator"]);
  const db = await createSessionClient();
  const row = await db
    .from("quotes")
    .select("id,number,proposal_snapshot")
    .eq("id", id)
    .single();
  if (row.error || !row.data) notFound();
  const context = await db.rpc("get_quote_contract_context", {
    target_quote: id,
  });
  if (context.error) notFound();
  const contract =
    context.data === null
      ? null
      : contractContextSchema.safeParse(context.data);
  if (contract && !contract.success) notFound();
  const parsed = quoteExportSchema.safeParse({
    id: row.data.id,
    number: row.data.number,
    proposal:
      row.data.proposal_snapshot ??
      (contract?.success ? contract.data.proposal : null),
  });
  if (!parsed.success) notFound();
  const history = await db.rpc("get_quote_revision_context", {
    target_quote: id,
  });
  const revisions = revisionContextSchema.safeParse(history.data);
  if (history.error || !revisions.success) notFound();
  const pdfState =
    contract?.success && contract.data.receipt
      ? await getContractPdfState(id)
      : null;
  return {
    ...parsed.data,
    revisionContext: revisions.data,
    contract: contract?.success ? contract.data : null,
    contractPdfState: pdfState?.data?.state,
  };
}
export async function getQuotePdfExport(
  id: string,
): Promise<
  | { data: QuoteExport; error?: never; status?: never }
  | { data?: never; error: string; status: number }
> {
  const session = await getSessionProfile();
  if (
    !session ||
    !["client", "calculator"].includes(session.profile.role) ||
    !z.uuid().safeParse(id).success
  )
    return { error: "Proposta não encontrada.", status: 404 };
  await authorize(["client", "calculator"]);
  const db = await createSessionClient();
  // Leitura RLS antes da RPC não revela se o ID existe para outro cliente.
  const visible = await db
    .from("quotes")
    .select("id,version")
    .eq("id", id)
    .single();
  if (visible.error || !visible.data)
    return { error: "Proposta não encontrada.", status: 404 };
  const result = await db.rpc("get_quote_pdf_export", { target_quote: id });
  if (result.error)
    return { error: "Não foi possível preparar a proposta.", status: 503 };
  const parsed = quoteExportSchema.safeParse(result.data);
  if (parsed.success && visible.data.version > 1) {
    const context = await db.rpc("get_quote_revision_context", {
      target_quote: id,
    });
    const history = revisionContextSchema.safeParse(context.data);
    const own = history.success
      ? history.data.history.find((item) => item.id === id)
      : null;
    if (context.error || !own?.reason)
      return { error: "Histórico indisponível.", status: 503 };
    return {
      data: {
        ...parsed.data,
        revision: { version: own.version, reason: own.reason },
      },
    };
  }
  return parsed.success
    ? { data: parsed.data }
    : { error: "A proposta precisa de revisão.", status: 503 };
}
