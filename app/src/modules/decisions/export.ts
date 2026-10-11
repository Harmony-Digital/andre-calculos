import "server-only";
import { z } from "zod";
import { getSessionProfile, authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
export const decisionExportSchema = z.object({
  process: z.object({
    id: z.uuid(),
    cnj: z.string().regex(/^\d{20}$/),
    court: z.string().min(1),
    chamber: z.string().min(1),
  }),
  professional: z.object({
    name: z.string().trim().min(1),
    crcNumber: z.string().trim().min(1),
    crcState: z.string().regex(/^[A-Z]{2}$/),
    category: z.string().trim().min(1),
  }),
  generatedAt: z.iso.datetime({ offset: true }),
  decisions: z.array(
    z.object({
      id: z.uuid(),
      parameter: z.string(),
      value: z.string().min(1),
      source: z.string(),
      page: z.number().int().positive().nullable(),
      rationale: z.string(),
      recordedBy: z.string().min(1),
      createdAt: z.iso.datetime({ offset: true }),
      confirmedAt: z.iso.datetime({ offset: true }).nullable(),
      confirmedBy: z.string().nullable(),
    }),
  ),
});
export type DecisionExport = z.infer<typeof decisionExportSchema>;
export async function getAuthorizedDecisionExport(
  id: string,
): Promise<
  | { data: DecisionExport; error?: never; status?: never }
  | { data?: never; error: string; status: number }
> {
  const session = await getSessionProfile();
  if (
    !session ||
    !["client", "calculator"].includes(session.profile.role) ||
    !z.uuid().safeParse(id).success
  )
    return { error: "Processo não encontrado.", status: 404 };
  await authorize(["client", "calculator"]);
  const db = await createSessionClient(),
    process = await db.from("processes").select("id").eq("id", id).single();
  if (process.error || !process.data)
    return { error: "Processo não encontrado.", status: 404 };
  const result = await db.rpc("get_process_decision_export", {
    target_process: id,
  });
  if (result.error)
    return result.error.message === "Identificação profissional pendente"
      ? {
          error:
            "Cadastre o nome, CRC e categoria do responsável antes de exportar.",
          status: 409,
        }
      : { error: "Não foi possível preparar o documento.", status: 503 };
  const parsed = decisionExportSchema.safeParse(result.data);
  return parsed.success
    ? { data: parsed.data }
    : {
        error: "Os registros precisam de revisão antes da exportação.",
        status: 503,
      };
}
