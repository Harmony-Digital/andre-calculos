import { createClient } from "@supabase/supabase-js";
import type { BrowserContext, APIRequestContext } from "@playwright/test";
export function localSystem() {
  if (
    process.env.ANDRE_LOCAL_TESTS !== "1" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321"
  )
    throw new Error("Fixtures somente no banco local do André.");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
export async function removeLocalUser(id: string) {
  const db = localSystem();
  await db
    .from("notifications")
    .delete()
    .in("dedup_key", [
      "signup:" + id + ":email",
      "signup:" + id + ":whatsapp",
      "deletion:" + id + ":email",
      "deletion:" + id + ":whatsapp",
    ]);
  for (const [table, key] of [
    ["audit_log", "actor_id"],
    ["consents", "profile_id"],
    ["notification_preferences", "profile_id"],
    ["clients", "owner_id"],
  ]) {
    const result = await db.from(table).delete().eq(key, id);
    if (result.error)
      throw new Error("Não foi possível limpar a fixture local.");
  }
  const result = await db.auth.admin.deleteUser(id);
  if (result.error)
    throw new Error("Não foi possível limpar o usuário fictício.");
}
export async function confirmMailpit(
  email: string,
  context: BrowserContext,
  request: APIRequestContext,
) {
  let id: string | undefined;
  for (let attempt = 0; attempt < 50; attempt++) {
    const query = encodeURIComponent(`to:"${email}"`);
    const response = await request.get(
      `http://127.0.0.1:54324/api/v1/search?query=${query}&limit=20`,
    );
    const list = await response.json();
    id = list.messages?.find(
      (message: { ID: string; To: { Address: string }[] }) =>
        message.To.some((to) => to.Address === email),
    )?.ID;
    if (id) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!id) throw new Error("E-mail local de confirmação não recebido.");
  const message = await (
    await request.get(`http://127.0.0.1:54324/api/v1/message/${id}`)
  ).json();
  const link = message.HTML?.match(
    /href="([^"]*\/auth\/v1\/verify[^"]*)"/,
  )?.[1]?.replaceAll("&amp;", "&");
  if (!link) throw new Error("Link de confirmação local indisponível.");
  const url = new URL(link);
  if (
    url.origin !== "http://127.0.0.1:54321" ||
    url.pathname !== "/auth/v1/verify"
  )
    throw new Error("Destino de confirmação inesperado.");
  // Cookie verifier e cookies de resposta pertencem ao mesmo contexto do cadastro.
  // Não imprimir o HTML, a URL de uso único ou as respostas que contêm tokens.
  try {
    const result = await context.request.get(url.toString());
    if (!result.ok()) throw new Error();
  } catch {
    throw new Error("A confirmação local não foi concluída.");
  }
}
