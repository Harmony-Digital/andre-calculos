import { localSystem, leaseLocalSettings } from "./local-helper";
import {
  fictionalServiceSettings as cfg,
  fictionalPriceParameters,
} from "../settings-fixture";
import { localNotificationSql } from "./notification-helper";
import { removeLocalDraft } from "./draft-helper";
import { fictionalCnj } from "./draft-helper";
import { fictionalChecklist } from "@/modules/checklist/fixtures";
import type { ChecklistLaborV1 } from "@/modules/checklist/v1";
import { todayInSaoPaulo } from "@/modules/quotes/proposal";
import { createClient } from "@supabase/supabase-js";
export async function quoteSession(
  role: "client" | "clientB" | "calculator" | "admin" = "client",
) {
  localSystem();
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const email =
    role === "client"
      ? "clientea@exemplo.com"
      : role === "clientB"
        ? "clienteb@exemplo.com"
        : role === "calculator"
          ? "calculista@exemplo.com"
          : "admin@exemplo.com";
  if (
    (
      await db.auth.signInWithPassword({
        email,
        password: process.env.ANDRE_TEST_PASSWORD!,
      })
    ).error
  )
    throw new Error("Login fictício indisponível.");
  return db;
}
export async function createQuoteDraft(patch: Partial<ChecklistLaborV1> = {}) {
  const db = await quoteSession();
  try {
    const answers: ChecklistLaborV1 = {
      ...fictionalChecklist,
      processNumber: fictionalCnj(),
      noticeDate: todayInSaoPaulo(new Date()),
      actType: "other",
      deadlineDays: 30,
      instructions: "Ensaio fictício de proposta, sem cobrança.",
      ...patch,
    };
    const saved = await db.rpc("save_checklist_draft", {
      payload: answers,
      completed_step: 8,
    });
    if (saved.error || !saved.data?.[0])
      throw new Error("Rascunho fictício não criado.");
    return { ...saved.data[0], answers };
  } finally {
    await db.auth.signOut({ scope: "local" });
  }
}
export async function quoteFixture(
  conditions = cfg.conditions,
  parameters = fictionalPriceParameters,
) {
  const release = await leaseLocalSettings(),
    db = localSystem();
  const prior = (
    await db.from("settings").select("*").eq("singleton", true).single()
  ).data!;
  const history = (
    await db
      .from("price_tables")
      .select("id,version,active")
      .order("version", { ascending: false })
  ).data!;
  const oldActive = history.find((row) => row.active)?.id;
  const calculator = (
    await db.from("profiles").select("id").eq("role", "calculator").single()
  ).data!;
  const result = await db
    .from("settings")
    .update({
      technical_name: cfg.technicalName,
      crc_number: cfg.crcNumber,
      crc_state: cfg.crcState,
      crc_category: cfg.crcCategory,
      contact_email: cfg.contactEmail,
      contact_phone: cfg.contactPhone,
      default_texts: { conditions, guarantee: cfg.guarantee },
      revision: prior.revision + 1,
    })
    .eq("singleton", true);
  if (result.error) {
    await release();
    throw new Error("Dados fictícios não configurados.");
  }
  await db.from("price_tables").update({ active: false }).eq("active", true);
  const price = await db
    .from("price_tables")
    .insert({
      version: (history[0]?.version ?? 0) + 1,
      active: true,
      is_example: false,
      activated_at: new Date().toISOString(),
      created_by: calculator.id,
      parameters: {
        ...parameters,
        base: { ...parameters.base, liquidation: 25001 },
      },
    })
    .select("*")
    .single();
  if (price.error) {
    try {
      await db
        .from("price_tables")
        .update({ active: false })
        .eq("version", (history[0]?.version ?? 0) + 1);
      if (oldActive)
        await db
          .from("price_tables")
          .update({ active: true })
          .eq("id", oldActive);
      await db.from("settings").update(prior).eq("singleton", true);
    } finally {
      await release();
    }
    throw new Error("Tabela fictícia não configurada.");
  }
  return {
    db,
    price: price.data!,
    settings: (
      await db.from("settings").select("*").eq("singleton", true).single()
    ).data!,
    cleanup: async () => {
      try {
        if (
          (
            await db
              .from("price_tables")
              .update({ active: false })
              .eq("id", price.data!.id)
          ).error
        )
          throw new Error("Fixture de preço não restaurada.");
        if (
          oldActive &&
          (
            await db
              .from("price_tables")
              .update({ active: true })
              .eq("id", oldActive)
          ).error
        )
          throw new Error("Tabela anterior não restaurada.");
        if (
          (await db.from("settings").update(prior).eq("singleton", true)).error
        )
          throw new Error("Configurações não restauradas.");
      } finally {
        await release();
      }
    },
  };
}
export async function removeQuoteFixture(orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error("Fixture inválida.");
  const db = localSystem();
  const quotes = await db
    .from("quotes")
    .select("id,is_simulation")
    .eq("order_id", orderId);
  if (quotes.error || quotes.data.some((q) => !q.is_simulation))
    throw new Error("Limpeza limitada a propostas fictícias.");
  localNotificationSql(
    `delete from private.quote_requests where order_id='${orderId}'::uuid;`,
  );
  for (const quote of quotes.data)
    await db.from("audit_log").delete().eq("target_id", quote.id);
  if ((await db.from("quotes").delete().eq("order_id", orderId)).error)
    throw new Error("Proposta fictícia não removida.");
  if (
    (
      await db
        .from("orders")
        .update({
          status: "draft",
          total_cents: 0,
          deposit_cents: 0,
          delivery_date: null,
          internal_due_date: null,
          price_table_id: null,
          complexity: null,
        })
        .eq("id", orderId)
    ).error
  )
    throw new Error("Pedido fictício não restaurado.");
  await removeLocalDraft(orderId);
}
