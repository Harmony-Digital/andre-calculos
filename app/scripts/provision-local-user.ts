import { createClient, type AdminUserAttributes } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

// Apenas fixtures locais. O banco de produção não reconhece ambiente ou e-mail
// como autoridade; a concessão exige escrita administrativa na tabela privada.
export async function provisionLocalUser(
  attributes: Omit<AdminUserAttributes, "id">,
  env: NodeJS.ProcessEnv = process.env,
) {
  const dockerHost =
    process.platform === "darwin"
      ? `unix://${homedir()}/.colima/andre-calculos/docker.sock`
      : "unix:///var/run/docker.sock";
  if (
    env.ANDRE_LOCAL_TESTS !== "1" ||
    env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321" ||
    env.DOCKER_HOST !== dockerHost ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  )
    throw new Error(
      "Provisionamento permitido somente no banco local do André.",
    );

  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const id = randomUUID();
  const sql = (statement: string) => {
    try {
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "supabase_db_andre-calculos",
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { env, input: statement, stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch {
      throw new Error("Autorização local de provisionamento não concluída.");
    }
  };
  sql(`insert into private.user_provisioning_grants(user_id,purpose)
values('${id}'::uuid,'Fixture fictícia local');`);
  let consumed = false;
  try {
    // Esta criação só pode usar o grant, nunca o caminho de aceite público.
    const created = await admin.auth.admin.createUser({
      ...attributes,
      id,
      user_metadata: { ...attributes.user_metadata, accepted_legal: false },
    });
    if (created.error || created.data.user?.id !== id)
      throw new Error("Usuário fictício local não provisionado.");
    // Sucesso prova o consumo na mesma transação. Não há cleanup SQL posterior
    // que possa esconder o UUID de uma conta já criada ao lançar uma exceção.
    consumed = true;
    return created;
  } finally {
    if (!consumed)
      sql(
        `delete from private.user_provisioning_grants where user_id='${id}'::uuid;`,
      );
  }
}
