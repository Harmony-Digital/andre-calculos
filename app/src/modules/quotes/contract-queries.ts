import "server-only";
import { z } from "zod";
import { authorize, getSessionProfile } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import {
  contractArchiveSchema,
  type ContractArchive,
} from "./contract-snapshot";
import { contractPdfStateSchema } from "./contract-generation";

export async function getContractPdfState(id: string) {
  const session = await getSessionProfile();
  if (
    !session ||
    !["client", "calculator"].includes(session.profile.role) ||
    !z.uuid().safeParse(id).success
  )
    return { error: "Contrato indisponível.", status: 404 };
  await authorize(["client", "calculator"]);
  const result = await (
    await createSessionClient()
  ).rpc("get_quote_contract_pdf_state", { target_quote: id });
  if (result.error)
    return {
      error: "Contrato indisponível.",
      status: result.error.code === "PT404" ? 404 : 503,
    };
  const parsed = contractPdfStateSchema.safeParse(result.data);
  return parsed.success && parsed.data.quoteId === id
    ? { data: parsed.data }
    : { error: "Não foi possível consultar o contrato.", status: 503 };
}

export async function getContractArchive(
  id: string,
): Promise<
  | { data: ContractArchive; error?: never; status?: never }
  | { error: string; status: number; data?: never }
> {
  const session = await getSessionProfile();
  if (
    !session ||
    !["client", "calculator"].includes(session.profile.role) ||
    !z.uuid().safeParse(id).success
  )
    return { error: "Contrato indisponível.", status: 404 };
  await authorize(["client", "calculator"]);
  const db = await createSessionClient();
  const result = await db.rpc("get_quote_contract_snapshot", {
    target_quote: id,
  });
  if (result.error)
    return {
      error: "Contrato indisponível.",
      status: result.error.code === "PT404" ? 404 : 503,
    };
  const parsed = contractArchiveSchema.safeParse(result.data);
  return parsed.success && parsed.data.snapshot.quoteId === id
    ? { data: parsed.data }
    : { error: "Não foi possível conferir o contrato.", status: 503 };
}
