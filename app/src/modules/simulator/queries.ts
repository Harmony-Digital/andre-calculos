import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";
import { publicPriceSchema } from "./model";
export const getPublicPriceTable = cache(async () => {
  const config = supabaseConfig();
  if (!config) return null;
  const db = createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await db.rpc("get_public_price_table");
  const parsed = publicPriceSchema.safeParse(result.data);
  return result.error || !parsed.success ? null : parsed.data;
});
