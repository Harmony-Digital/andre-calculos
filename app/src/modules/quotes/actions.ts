"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authorize } from "@/modules/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import { createSystemClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { priceParameterSchema } from "@/modules/settings/forms";
import { evaluateProposal, quoteBlockMessages } from "./proposal";
import { quoteFixtureInputs, quoteFixturesEnabled } from "./local-fixtures";
const intentSchema = z.strictObject({
  orderId: z.uuid(),
  revision: z.number().int().positive(),
  requestId: z.uuid(),
  reviewConfirmed: z.boolean().optional(),
});
export async function createChecklistQuote(
  input: unknown,
): Promise<
  | { quoteId: string; error?: never; reasons?: never }
  | { quoteId?: never; error: string; reasons?: string[] }
> {
  const session = await authorize(["client"]);
  const intent = intentSchema.safeParse(input);
  if (!intent.success)
    return { error: "Confira o pedido antes de gerar a proposta." };
  const db = await createSessionClient();
  const order = await db
    .from("orders")
    .select("id,process_id,status")
    .eq("id", intent.data.orderId)
    .single();
  if (order.error || !order.data) return { error: "Pedido indisponível." };
  try {
    const system = createSystemClient();
    const args = {
      actor: session.user.id,
      target_order: order.data.id,
      expected_checklist_revision: intent.data.revision,
      request_id: intent.data.requestId,
    };
    // Reautorização e replay antes de exigir preço/configurações atuais.
    const replay = await system.rpc("create_checklist_quote_system", args);
    if (replay.error)
      return {
        error: "A solicitação precisa ser conferida. Recarregue o pedido.",
      };
    if (replay.data) return { quoteId: replay.data };
    const update = await db.rpc("get_calculation_update", {
      target_order: order.data.id,
    });
    if (update.error)
      return { error: "Não foi possível conferir a origem do pedido." };
    if (update.data !== null) {
      if (!intent.data.reviewConfirmed)
        return {
          error:
            "Confirme a revisão das respostas herdadas e da nova data-base.",
        };
      const reviewed = await db.rpc("complete_calculation_update", {
        target_order: order.data.id,
        expected_revision: intent.data.revision,
        confirm_review: true,
      });
      if (reviewed.error)
        return {
          error:
            "Revise as etapas, confirme o PJC e informe uma data-base posterior à do cálculo anterior.",
        };
    }
    const [checklist, settings, prices] = await Promise.all([
      db
        .from("checklists")
        .select("answers,revision,completed_step")
        .eq("order_id", order.data.id)
        .single(),
      system.from("settings").select("*").eq("singleton", true).single(),
      system
        .from("price_tables")
        .select("id,version,parameters,is_example,active,activated_at")
        .eq("active", true)
        .maybeSingle(),
    ]);
    if (
      checklist.error ||
      !checklist.data ||
      checklist.data.revision !== intent.data.revision ||
      checklist.data.completed_step !== 8 ||
      order.data.status !== "draft"
    )
      return {
        error:
          "Este checklist mudou. Recarregue para conferir as respostas salvas.",
      };
    if (settings.error || !settings.data || prices.error)
      return {
        error: "Não foi possível conferir as configurações. Tente novamente.",
      };
    const cfg = settings.data;
    const params = priceParameterSchema.safeParse(prices.data?.parameters);
    const limits = cfg.complexity_limits as {
      wages: number;
      pages: number;
      claimants: number;
    };
    const texts = cfg.default_texts as { conditions?: string };
    const now = new Date(),
      fixture = quoteFixturesEnabled(process.env);
    // Não existem ainda registros confirmados de calendário, agenda ou regra
    // de período. O carregador comercial não inventa essas aprovações.
    const sources = fixture
      ? quoteFixtureInputs(now, checklist.data.answers)
      : { calendar: null, capacity: null, period: null };
    const result = evaluateProposal({
      now,
      mode: fixture ? "fixture" : "commercial",
      orderId: order.data.id,
      processId: order.data.process_id,
      checklistRevision: checklist.data.revision,
      answers: checklist.data.answers,
      settingsRevision: cfg.revision,
      validityDays: cfg.quote_valid_days,
      slackDays: cfg.slack_days,
      professional: {
        name: cfg.technical_name,
        crcNumber: cfg.crc_number,
        crcState: cfg.crc_state,
        category: cfg.crc_category,
        email: cfg.contact_email,
        phone: cfg.contact_phone,
      },
      conditions: typeof texts.conditions === "string" ? texts.conditions : "",
      prices:
        params.success && prices.data
          ? {
              id: prices.data.id,
              active: prices.data.active,
              activatedAt: prices.data.activated_at,
              table: {
                ...params.data,
                version: String(prices.data.version),
                isExample: prices.data.is_example,
                complexitySettings: {
                  wageThreshold: limits.wages,
                  pageThreshold: limits.pages,
                  claimantThreshold: limits.claimants,
                },
              },
            }
          : null,
      ...sources,
    });
    if (result.status === "blocked")
      return {
        error: "Ainda não é possível emitir a proposta.",
        reasons: result.reasons.map((reason) => quoteBlockMessages[reason]),
      };
    if (result.status !== "fixture_ready" || !fixture)
      return {
        error:
          "A emissão comercial aguarda a configuração de disponibilidade e calendário.",
      };
    const saved = await system.rpc("create_checklist_quote_system", {
      ...args,
      expected_settings_revision: cfg.revision,
      expected_price_table: result.proposal.priceTableId,
      proposal: result.proposal as unknown as Json,
    });
    if (saved.error || !saved.data)
      return {
        error:
          "As informações podem ter mudado. Confira o pedido e tente novamente; suas respostas estão salvas.",
      };
    revalidatePath("/app");
    revalidatePath(`/app/processos/${order.data.process_id}`);
    return { quoteId: saved.data };
  } catch {
    return {
      error:
        "Não foi possível gerar agora. Suas respostas estão salvas; tente novamente.",
    };
  }
}
