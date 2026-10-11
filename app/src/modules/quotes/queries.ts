import "server-only";
import { z } from "zod";
import { notFound } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";
import { authorize, getSessionProfile } from "@/modules/auth/session";
import { proposalSchema } from "./proposal";
import { contractContextSchema, type ContractContext } from "./acceptance";
export const quoteExportSchema = z.strictObject({
  id: z.uuid(),
  number: z.string().regex(/^ORC-\d{4}-\d{4,}$/),
  proposal: proposalSchema,
});
export type QuoteExport = z.infer<typeof quoteExportSchema>;
export type QuoteDetailData = QuoteExport & {
  contract: ContractContext | null;
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
  return { ...parsed.data, contract: contract?.success ? contract.data : null };
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
  const visible = await db.from("quotes").select("id").eq("id", id).single();
  if (visible.error || !visible.data)
    return { error: "Proposta não encontrada.", status: 404 };
  const result = await db.rpc("get_quote_pdf_export", { target_quote: id });
  if (result.error)
    return { error: "Não foi possível preparar a proposta.", status: 503 };
  const parsed = quoteExportSchema.safeParse(result.data);
  return parsed.success
    ? { data: parsed.data }
    : { error: "A proposta precisa de revisão.", status: 503 };
}
