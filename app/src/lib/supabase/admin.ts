import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config";
import type { Database } from "./database.types";

// Cada operação de sistema deve validar a própria autorização antes de chamar esta função.
export function createSystemClient() {
  const config = supabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) throw new Error("Operação de sistema indisponível.");
  return createClient<Database>(config.url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
