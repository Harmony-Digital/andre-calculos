import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localEnvironment, projectRoot } from "./local-env.mjs";
import { provisionLocalUser } from "./provision-local-user";

export const devUsers = [
  { email: "clientea@exemplo.com", name: "Cliente A de teste", role: "client" },
  { email: "clienteb@exemplo.com", name: "Cliente B de teste", role: "client" },
  {
    email: "calculista@exemplo.com",
    name: "Calculista de teste",
    role: "calculator",
  },
  { email: "admin@exemplo.com", name: "Administrador de teste", role: "admin" },
] as const;

export async function seedDev() {
  const env = localEnvironment();
  const password =
    process.env.ANDRE_TEST_PASSWORD ?? randomBytes(32).toString("base64url");
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const { data, error: listError } = await admin.auth.admin.listUsers();
  let calculatorId: string | undefined;
  if (listError)
    throw new Error("Não foi possível conferir os usuários locais.");
  for (const fixture of devUsers) {
    const existing = data.users.find((u) => u.email === fixture.email);
    const response = existing
      ? await admin.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
        })
      : await provisionLocalUser(
          {
            email: fixture.email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fixture.name },
          },
          env,
        );
    if (response.error || !response.data.user)
      throw new Error("Falha ao criar usuário fictício local.");
    const id = response.data.user.id;
    if (!/^[0-9a-f-]{36}$/.test(id))
      throw new Error("Identificador de usuário inesperado.");
    if (fixture.role === "calculator") calculatorId = id;
    // Papéis privilegiados são atribuídos exclusivamente no banco local de fixtures.
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
      {
        env,
        input: `update public.profiles set role='${fixture.role}',full_name='${fixture.name.replaceAll("'", "''")}' where id='${id}';`,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  }
  if (!calculatorId) throw new Error("Calculista fictício indisponível.");
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
    {
      env,
      input: `do $$ begin
      update private.calculator_notification_recipient set profile_id='${calculatorId}' where singleton and profile_id is null and (select count(*) from public.profiles where role='calculator')=1;
      if not exists(select 1 from private.calculator_notification_recipient where singleton and profile_id='${calculatorId}') then raise exception 'Responsável fictício pelos avisos inesperado'; end if;
    end $$;`,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
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
    {
      env,
      input: readFileSync(resolve(projectRoot, "supabase/seed.sql")),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  console.info(
    "Seed local: quatro usuários fictícios e um processo criados. Senhas somente em memória.",
  );
}
