import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  localSystem,
  leaseLocalSettings,
  removeLocalUser,
} from "../e2e/local-helper";
import { localNotificationSql } from "../e2e/notification-helper";
import { provisionLocalUser } from "../../scripts/provision-local-user";

const db = localSystem(),
  url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
  key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  password = process.env.ANDRE_TEST_PASSWORD!;
const terms = "fixture-termos-juridico-v1",
  privacy = "fixture-privacidade-juridico-v1";
const literal = (v: string) => `'${v.replaceAll("'", "''")}'`;
const grants = new Set<string>();
let release: (() => Promise<void>) | undefined;
let prior: {
  id: string;
  approved_terms_version: string | null;
  approved_privacy_version: string | null;
  contact_email: string | null;
};
const anon = () =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const legal = () => ({
  accepted_legal: true,
  terms_version: terms,
  privacy_version: privacy,
});
const fields = (name: string) => ({
  full_name: name,
  legal_name: name,
  phone: "+5561999999999",
  kind: "person",
  document: "00000000191",
});
const identity = () => {
  const token = randomUUID();
  return {
    email: `juridico-${token}@exemplo.com`,
    name: `Cadastro fictício ${token}`,
  };
};
const authorize = (id: string, timestamps = "") => {
  grants.add(id);
  localNotificationSql(`insert into private.user_provisioning_grants(user_id,purpose${timestamps ? ",created_at,expires_at" : ""})
values('${id}'::uuid,'Teste fictício de provisionamento'${timestamps ? "," + timestamps : ""});`);
};
async function restoreVersions() {
  const saved = await db
    .from("settings")
    .update({
      approved_terms_version: terms,
      approved_privacy_version: privacy,
      contact_email: "calculista@exemplo.com",
    })
    .eq("id", prior.id);
  if (saved.error) throw new Error("Versões sintéticas não preparadas.");
}
function assertNoPersistence(email: string, name: string) {
  expect(
    JSON.parse(
      localNotificationSql(`select json_build_object(
 'auth',(select count(*) from auth.users where email=${literal(email)}),
 'profiles',(select count(*) from public.profiles where full_name=${literal(name)}),
 'clients',(select count(*) from public.clients where legal_name=${literal(name)}),
 'consents',(select count(*) from public.consents c join public.profiles p on p.id=c.profile_id where p.full_name=${literal(name)}),
 'audits',(select count(*) from public.audit_log a join public.profiles p on p.id=a.actor_id where p.full_name=${literal(name)}),
 'notifications',(select count(*) from public.notifications where data->>'name'=${literal(name)}));`),
    ),
  ).toEqual({
    auth: 0,
    profiles: 0,
    clients: 0,
    consents: 0,
    audits: 0,
    notifications: 0,
  });
}
async function denied(metadata?: Record<string, unknown>) {
  const { email, name } = identity();
  const result = await anon().auth.signUp({
    email,
    password,
    options: metadata ? { data: { ...fields(name), ...metadata } } : undefined,
  });
  try {
    expect(result.error).not.toBeNull();
    expect(result.error?.status).toBe(500);
    assertNoPersistence(email, name);
  } finally {
    if (result.data.user?.id) await removeLocalUser(result.data.user.id);
  }
}

beforeAll(async () => {
  release = await leaseLocalSettings();
  const settings = await db
    .from("settings")
    .select("id,approved_terms_version,approved_privacy_version,contact_email")
    .single();
  if (settings.error) throw new Error("Configuração fictícia não encontrada.");
  prior = settings.data;
});
beforeEach(restoreVersions);
afterAll(async () => {
  try {
    for (const id of grants)
      localNotificationSql(
        `delete from private.user_provisioning_grants where user_id='${id}'::uuid;`,
      );
    if (prior) {
      const result = await db
        .from("settings")
        .update({
          approved_terms_version: prior.approved_terms_version,
          approved_privacy_version: prior.approved_privacy_version,
          contact_email: prior.contact_email,
        })
        .eq("id", prior.id);
      if (result.error)
        throw new Error("Configuração sintética não restaurada.");
    }
  } finally {
    await release?.();
  }
});

it.each([
  ["sem metadata", undefined],
  ["sem aceite", { terms_version: terms, privacy_version: privacy }],
  ["aceite falso", { ...legal(), accepted_legal: false }],
  ["aceite nulo", { ...legal(), accepted_legal: null }],
  ["string true", { ...legal(), accepted_legal: "true" }],
  ["aceite numérico", { ...legal(), accepted_legal: 1 }],
  ["sem termos", { accepted_legal: true, privacy_version: privacy }],
  ["termos divergentes", { ...legal(), terms_version: "outra-versao" }],
  ["versão numérica", { ...legal(), privacy_version: 123 }],
  ["versão objeto", { ...legal(), terms_version: { version: terms } }],
] as const)(
  "Auth direto recusa %s sem persistir conta",
  async (_label, metadata) => {
    await denied(metadata);
  },
);

it.each([
  { approved_terms_version: null },
  { approved_privacy_version: null },
  { approved_terms_version: "" },
  { approved_privacy_version: "   " },
])("documento revogado/vazio recusa o cadastro: %j", async (versions) => {
  expect(
    (await db.from("settings").update(versions).eq("id", prior.id)).error,
  ).toBeNull();
  await denied(legal());
});

it("configuração ausente recusa o hook e a transação preserva settings", () => {
  // O ensaio transacional não remove a configuração de outras fixtures.
  expect(
    localNotificationSql(
      "begin; delete from public.settings; select count(*) from public.settings; rollback;",
    ),
  ).toContain("\n0\n");
  const { email, name } = identity(),
    id = randomUUID();
  expect(() =>
    localNotificationSql(`begin; delete from public.settings;
insert into auth.users(id,email,raw_user_meta_data) values('${id}'::uuid,${literal(email)},${literal(JSON.stringify({ full_name: name, ...legal() }))}::jsonb); rollback;`),
  ).toThrow();
  expect(localNotificationSql("select count(*) from public.settings;")).toBe(
    "1",
  );
  assertNoPersistence(email, name);
});

it("cadastro válido grava dois aceites e não aceita papel ou contrato dos metadados", async () => {
  const { email, name } = identity();
  const result = await anon().auth.signUp({
    email,
    password,
    options: {
      data: {
        ...fields(name),
        ...legal(),
        role: "admin",
        has_contract: true,
        bootstrap: true,
      },
    },
  });
  expect(result.error).toBeNull();
  const id = result.data.user!.id;
  try {
    expect(result.data.session).toBeNull();
    expect(result.data.user?.email_confirmed_at).toBeFalsy();
    expect(
      (await db.from("profiles").select("role").eq("id", id).single()).data
        ?.role,
    ).toBe("client");
    expect(
      (
        await db
          .from("clients")
          .select("has_contract")
          .eq("owner_id", id)
          .single()
      ).data?.has_contract,
    ).toBe(false);
    const consents = await db
      .from("consents")
      .select("document,version,accepted_at")
      .eq("profile_id", id)
      .order("document");
    expect(consents.error).toBeNull();
    expect(
      consents.data?.map(({ document, version }) => ({ document, version })),
    ).toEqual([
      { document: "privacy", version: privacy },
      { document: "terms", version: terms },
    ]);
    expect(new Set(consents.data?.map((c) => c.accepted_at)).size).toBe(1);
    expect(
      (await db.from("audit_log").select("action").eq("actor_id", id)).data,
    ).toEqual([{ action: "signup" }]);
    expect(
      (
        await db
          .from("notifications")
          .select("id")
          .eq("dedup_key", `signup:${id}:email`)
      ).data,
    ).toHaveLength(1);
  } finally {
    await removeLocalUser(id);
  }
});

it("bootstrap privado usa o UUID exato uma vez, sem consentimento ou aviso inventado", async () => {
  const id = randomUUID(),
    { email, name } = identity();
  authorize(id);
  const created = await db.auth.admin.createUser({
    id,
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, role: "calculator" },
  });
  expect(created.error).toBeNull();
  expect(created.data.user?.id).toBe(id);
  try {
    expect(
      localNotificationSql(
        `select count(*) from private.user_provisioning_grants where user_id='${id}'::uuid;`,
      ),
    ).toBe("0");
    expect(
      (await db.from("profiles").select("role").eq("id", id).single()).data
        ?.role,
    ).toBe("client");
    expect(
      (await db.from("consents").select("id").eq("profile_id", id)).data,
    ).toEqual([]);
    expect(
      (
        await db
          .from("notifications")
          .select("id")
          .eq("dedup_key", `signup:${id}:email`)
      ).data,
    ).toEqual([]);
    expect(
      (await db.from("audit_log").select("action").eq("actor_id", id)).data,
    ).toEqual([{ action: "admin_user_provisioned" }]);
  } finally {
    await removeLocalUser(id);
  }
  const repeated = await db.auth.admin.createUser({
    id,
    email,
    password,
    user_metadata: { full_name: name },
  });
  try {
    expect(repeated.error).not.toBeNull();
    assertNoPersistence(email, name);
  } finally {
    if (repeated.data.user) await removeLocalUser(repeated.data.user.id);
  }
});

it("marcadores/id/app_metadata públicos não escolhem o UUID autorizado", async () => {
  const id = randomUUID(),
    { email, name } = identity();
  authorize(id);
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      id,
      app_metadata: { bootstrap: true },
      data: {
        id,
        full_name: name,
        bootstrap: true,
        accepted_legal: false,
        role: "admin",
      },
    }),
  });
  expect(response.ok).toBe(false);
  expect(response.status).toBe(500);
  assertNoPersistence(email, name);
  expect(
    localNotificationSql(
      `select count(*) from private.user_provisioning_grants where user_id='${id}'::uuid;`,
    ),
  ).toBe("1");
});

it("grant expirado ou de outro UUID não dispensa os termos", async () => {
  for (const expired of [true, false]) {
    const reserved = randomUUID(),
      id = expired ? reserved : randomUUID(),
      { email, name } = identity();
    authorize(
      reserved,
      expired
        ? "clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute'"
        : "",
    );
    const result = await db.auth.admin.createUser({
      id,
      email,
      password,
      user_metadata: { full_name: name },
    });
    try {
      expect(result.error).not.toBeNull();
      assertNoPersistence(email, name);
    } finally {
      if (result.data.user) await removeLocalUser(result.data.user.id);
    }
    expect(
      localNotificationSql(
        `select count(*) from private.user_provisioning_grants where user_id='${reserved}'::uuid;`,
      ),
    ).toBe("1");
  }
});

it("a espera pelo lock não prolonga a validade do grant", async () => {
  const id = randomUUID(),
    { email, name } = identity();
  authorize(id, "clock_timestamp(),clock_timestamp()+interval '1 second'");
  const child = spawn(
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
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { env: process.env, stdio: ["pipe", "pipe", "pipe"] },
  );
  let output = "";
  const locked = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("LOCKED")) resolve();
    });
    child.on("error", () => reject(new Error("Lock de fixture não iniciado.")));
    child.on("close", () => {
      if (!output.includes("LOCKED"))
        reject(new Error("Lock de fixture não obtido."));
    });
  });
  const finished = new Promise<void>((resolve, reject) =>
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Lock de fixture não encerrado.")),
    ),
  );
  child.stdin.end(
    `begin; select user_id from private.user_provisioning_grants where user_id='${id}'::uuid for update; select 'LOCKED'; select pg_sleep(1.8); commit;`,
  );
  await locked;
  const result = await db.auth.admin.createUser({
    id,
    email,
    password,
    user_metadata: { full_name: name },
  });
  await finished;
  try {
    expect(result.error).not.toBeNull();
    assertNoPersistence(email, name);
  } finally {
    if (result.data.user) await removeLocalUser(result.data.user.id);
  }
});

it("duas criações disputam uma concessão sem duplicar perfil", async () => {
  const id = randomUUID();
  authorize(id);
  const results = await Promise.all(
    [0, 1].map(() => {
      const { email, name } = identity();
      return db.auth.admin.createUser({
        id,
        email,
        password,
        user_metadata: { full_name: name },
      });
    }),
  );
  try {
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error)).toHaveLength(1);
    expect(
      (await db.from("profiles").select("id").eq("id", id)).data,
    ).toHaveLength(1);
    expect(
      (await db.from("audit_log").select("action").eq("actor_id", id)).data,
    ).toEqual([{ action: "admin_user_provisioned" }]);
  } finally {
    if (results.some((r) => r.data.user)) await removeLocalUser(id);
  }
});

it("falha posterior reverte cadastro/consents e consumo do grant", async () => {
  const id = randomUUID(),
    { email, name } = identity();
  authorize(id);
  localNotificationSql(`create function private.signup_rollback_test() returns trigger language plpgsql set search_path='' as $$begin if new.action in('signup','admin_user_provisioned') then raise exception 'Falha fictícia'; end if; return new; end$$;
create trigger signup_rollback_test before insert on public.audit_log for each row execute function private.signup_rollback_test();`);
  try {
    await denied(legal());
    const result = await db.auth.admin.createUser({
      id,
      email,
      password,
      user_metadata: { full_name: name },
    });
    expect(result.error).not.toBeNull();
    assertNoPersistence(email, name);
    expect(
      localNotificationSql(
        `select count(*) from private.user_provisioning_grants where user_id='${id}'::uuid;`,
      ),
    ).toBe("1");
  } finally {
    localNotificationSql(
      "drop trigger signup_rollback_test on public.audit_log; drop function private.signup_rollback_test();",
    );
  }
  const retried = await db.auth.admin.createUser({
    id,
    email,
    password,
    user_metadata: { full_name: name },
  });
  expect(retried.error).toBeNull();
  await removeLocalUser(id);
});

it("helper recusa destino diferente e limpa autorização após falha do Auth", async () => {
  const attributes = {
    email: "clientea@exemplo.com",
    password,
    email_confirm: true,
  };
  await expect(
    provisionLocalUser(attributes, {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "https://destino-invalido.exemplo",
    }),
  ).rejects.toThrow("somente no banco local");
  const before = localNotificationSql(
    "select count(*) from private.user_provisioning_grants;",
  );
  await expect(provisionLocalUser(attributes)).rejects.toThrow(
    "não provisionado",
  );
  expect(
    localNotificationSql(
      "select count(*) from private.user_provisioning_grants;",
    ),
  ).toBe(before);
});

it("grants têm RLS, nenhum acesso pelos papéis da aplicação e TTL limitado", () => {
  expect(
    localNotificationSql(
      "select relrowsecurity from pg_class where oid='private.user_provisioning_grants'::regclass;",
    ),
  ).toBe("t");
  for (const role of ["anon", "authenticated", "service_role"])
    expect(
      localNotificationSql(
        `select has_table_privilege('${role}','private.user_provisioning_grants','SELECT,INSERT,UPDATE,DELETE');`,
      ),
    ).toBe("f");
  const id = randomUUID();
  expect(() =>
    authorize(id, "clock_timestamp(),clock_timestamp()+interval '1 hour'"),
  ).toThrow();
  const valid = randomUUID();
  authorize(valid);
  expect(() =>
    localNotificationSql(
      `update private.user_provisioning_grants set expires_at=expires_at+interval '1 second' where user_id='${valid}'::uuid;`,
    ),
  ).toThrow();
});
