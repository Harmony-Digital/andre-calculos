"use client";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";
import type { Database } from "./database.types";

// Cliente público sem sessão: login/renovação são no servidor, com cookies HttpOnly.
// Uploads usam tokens assinados para um caminho; dados de negócio passam pelo servidor.
export function createAuthBrowserClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Acesso indisponível.");
  return createBrowserClient<Database>(config.url, config.key);
}
