import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { createSessionClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import type { Database, Json } from "@/lib/supabase/database.types";
import { authorize } from "@/modules/auth/session";
import { z } from "zod";
export async function getComplexitySettings() {
  await authorize(["client", "calculator", "admin"]);
  const db = await createSessionClient(),
    result = await db.rpc("get_complexity_limits");
  const parsed = z
    .object({
      wageThreshold: z.number().int().min(1).max(1000),
      pageThreshold: z.number().int().min(0).max(100000),
      claimantThreshold: z.number().int().min(1).max(1000),
    })
    .safeParse(result.data);
  if (result.error || !parsed.success)
    throw new Error("Os limites de complexidade precisam de revisão.");
  return parsed.data;
}
import { examplePriceTable } from "@/modules/quotes/example-table";
import {
  centsInput,
  priceParameterSchema,
  type SettingsValues,
  type PriceValues,
} from "./forms";
const record = (value: Json) =>
  value && !Array.isArray(value) && typeof value === "object" ? value : {};
export async function getConfiguration() {
  const session = await authorize(["calculator", "admin"]);
  const db = await createSessionClient();
  const [settings, prices] = await Promise.all([
    db.from("settings").select("*").eq("singleton", true).single(),
    db
      .from("price_tables")
      .select("id,version,active,is_example,parameters,created_at,activated_at")
      .order("version", { ascending: false }),
  ]);
  if (settings.error || !settings.data || prices.error)
    throw new Error("Não foi possível consultar as configurações.");
  const cfg = settings.data,
    limits = record(cfg.complexity_limits),
    texts = record(cfg.default_texts),
    times = Array.isArray(cfg.notification_times) ? cfg.notification_times : [];
  const values: SettingsValues = {
    technicalName: cfg.technical_name ?? "",
    crcNumber: cfg.crc_number ?? "",
    crcState: (cfg.crc_state ?? "") as SettingsValues["crcState"],
    crcCategory: (cfg.crc_category ?? "") as SettingsValues["crcCategory"],
    contactEmail: cfg.contact_email ?? "",
    contactPhone: cfg.contact_phone ?? "",
    pixKey: cfg.pix_key ?? "",
    slackDays: String(cfg.slack_days),
    quoteValidDays: String(cfg.quote_valid_days),
    wageThreshold: String(limits.wages ?? 6),
    pageThreshold: String(limits.pages ?? 1000),
    claimantThreshold: String(limits.claimants ?? 1),
    morningTime: typeof times[0] === "string" ? times[0] : "09:00",
    eveningTime: typeof times[1] === "string" ? times[1] : "17:00",
    deadlineWindowStart: cfg.deadline_window_start.slice(0, 5),
    deadlineWindowEnd: cfg.deadline_window_end.slice(0, 5),
    conditions: typeof texts.conditions === "string" ? texts.conditions : "",
    guarantee: typeof texts.guarantee === "string" ? texts.guarantee : "",
    revision: String(cfg.revision),
  };
  const history = prices.data ?? [],
    source =
      history.find((item) => item.active) ??
      history.find(
        (item) => priceParameterSchema.safeParse(item.parameters).success,
      );
  const params = priceParameterSchema.safeParse(source?.parameters),
    table = params.success ? params.data : examplePriceTable;
  const priceValues: PriceValues = {
    initial: centsInput(table.base.initial!),
    liquidation: centsInput(table.base.liquidation!),
    challenge: centsInput(table.base.challenge!),
    update: centsInput(table.base.update!),
    perWage: centsInput(table.perWage),
    includedWages: String(table.includedWages),
    perContractMonth: centsInput(table.perContractMonth),
    includedContractMonths: String(table.includedContractMonths),
    perTimecardUnit: centsInput(table.perTimecardUnit),
    timecardUnit: table.timecardUnit,
    perExtraClaimant: centsInput(table.perExtraClaimant),
    urgency: centsInput(table.urgencyBasisPoints),
    simpleDays: String(table.businessDays.simple),
    mediumDays: String(table.businessDays.medium),
    highDays: String(table.businessDays.high),
    expectedVersion: String(history[0]?.version ?? 0),
    isExample: true,
    approved: false,
  };
  return {
    values,
    priceValues,
    history,
    deliveryPolicy: cfg.delivery_release_policy,
    role: session.profile.role,
  };
}
export const getPublicServiceInfo = cache(async () => {
  const config = supabaseConfig();
  if (!config) return null;
  const db = createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await db.rpc("get_public_service_info");
  return result.error ? null : (result.data?.[0] ?? null);
});
