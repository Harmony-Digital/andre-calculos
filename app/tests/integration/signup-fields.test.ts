import { beforeAll, afterAll, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  localSystem,
  leaseLocalSettings,
  removeLocalUser,
} from "../e2e/local-helper";
import { localNotificationSql } from "../e2e/notification-helper";
import { parseSignup } from "@/modules/signup/forms";
import { signupMetadata } from "@/modules/signup/metadata";
import { validCpf, validCnpj } from "@/lib/documents";

const db = localSystem();
const terms = "fixture-campos-termos-v1",
  privacy = "fixture-campos-privacidade-v1";
const password = process.env.ANDRE_TEST_PASSWORD!;
const literal = (v: string) => `'${v.replaceAll("'", "''")}'`;
const json = (v: unknown) => `${literal(JSON.stringify(v))}::jsonb`;
const legal = { termsVersion: terms, privacyVersion: privacy };
let release: (() => Promise<void>) | undefined;
let prior: {
  id: string;
  approved_terms_version: string | null;
  approved_privacy_version: string | null;
  contact_email: string | null;
};
function transport(fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    fullName: "Cadastro inteiramente fictício",
    legalName: "Escritório fictício",
    phone: "(61) 99999-9999",
    oabNumber: "",
    oabState: "",
    city: "",
    email: "campos@exemplo.com",
    password,
    confirmation: password,
    kind: "person",
    document: "000.000.001-91",
    accepted: "yes",
    ...legal,
    ...fields,
  }))
    form.set(key, value);
  const parsed = parseSignup(form);
  if (!parsed.success) throw new Error("Formulário fictício inválido.");
  return signupMetadata(parsed.data, legal);
}
function counts() {
  return JSON.parse(
    localNotificationSql(`select json_build_object(
    'auth',(select count(*) from auth.users),
    'profiles',(select count(*) from public.profiles),
    'clients',(select count(*) from public.clients),
    'consents',(select count(*) from public.consents),
    'audits',(select count(*) from public.audit_log),
    'notifications',(select count(*) from public.notifications));`),
  );
}
async function denied(patch: Record<string, unknown>, omit?: string) {
  const token = randomUUID(),
    email = `campos-${token}@exemplo.com`;
  const data: Record<string, unknown> = {
    ...transport(),
    full_name: `Nome fictício ${token}`,
    ...patch,
  };
  if (omit) delete data[omit];
  const before = counts();
  const result = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  ).auth.signUp({ email, password, options: { data } });
  try {
    expect(result.error?.status).toBe(500);
    expect(counts()).toEqual(before);
    expect(
      localNotificationSql(
        `select count(*) from auth.users where email=${literal(email)};`,
      ),
    ).toBe("0");
  } finally {
    if (result.data.user) await removeLocalUser(result.data.user.id);
  }
}
beforeAll(async () => {
  release = await leaseLocalSettings();
  const cfg = await db
    .from("settings")
    .select("id,approved_terms_version,approved_privacy_version,contact_email")
    .single();
  if (cfg.error) throw new Error("Configuração fictícia indisponível.");
  prior = cfg.data;
  const changed = await db
    .from("settings")
    .update({
      approved_terms_version: terms,
      approved_privacy_version: privacy,
      contact_email: "calculista@exemplo.com",
    })
    .eq("id", prior.id);
  if (changed.error) throw new Error("Versões sintéticas não preparadas.");
});
afterAll(async () => {
  try {
    if (prior) {
      const restored = await db
        .from("settings")
        .update({
          approved_terms_version: prior.approved_terms_version,
          approved_privacy_version: prior.approved_privacy_version,
          contact_email: prior.contact_email,
        })
        .eq("id", prior.id);
      if (restored.error)
        throw new Error("Configuração fictícia não restaurada.");
    }
  } finally {
    await release?.();
  }
});
const required = ["full_name", "legal_name", "phone", "kind", "document"];
it.each(required)("Auth recusa obrigatório ausente: %s", async (key) => {
  await denied({}, key);
});
const invalidTypes = [null, 123, true, [], {}];
it.each(
  [...required, "oab_number", "oab_state", "city"].flatMap((key) =>
    invalidTypes.map((value) => ({ key, value })),
  ),
)("Auth recusa tipo JSON do campo $key: $value", async ({ key, value }) => {
  await denied({ [key]: value });
});
it.each([
  { kind: "unknown" },
  { kind: "company", document: "00000000191" },
  { document: "00000000190" },
  { document: "00000000000" },
  { document: "000.000.001-91" },
  { document: "0000000019" },
  { document: "000000001910" },
  { kind: "company", document: "12ABC34501DE34" },
  { kind: "company", document: "12abc34501de35" },
  { kind: "company", document: "12.ABC.345/01DE-35" },
  { kind: "company", document: "12ABC34501DE3A" },
  { kind: "company", document: "12ABC345ßDE05" },
  { kind: "company", document: "12ABC345ÉDE05" },
  { kind: "company", document: "12ABC34501DÉ35" },
  { kind: "company", document: "00000000000000" },
  { phone: "+5520999999999" },
  { phone: "+5561899999999" },
  { phone: "+61999999999" },
  { phone: "61999999999" },
  { phone: "61+99999-9999" },
  { phone: "++5561999999999" },
  { phone: "+556199999999" },
  { phone: "+55619999999999" },
  { oab_number: "123a" },
  { oab_state: "DF" },
  { oab_number: "123a", oab_state: "df" },
  { oab_number: "123a", oab_state: "XX" },
  { oab_number: "123 a", oab_state: "DF" },
  { oab_number: "123É", oab_state: "DF" },
  { oab_number: "A".repeat(31), oab_state: "DF" },
  { city: "C".repeat(121) },
  { full_name: "AB" },
  { legal_name: "AB" },
  { full_name: "A".repeat(201) },
  { legal_name: "A".repeat(201) },
  { full_name: "A".repeat(200) + "𐐀" },
  { legal_name: "A".repeat(200) + "𐐀" },
  { city: "C".repeat(120) + "𐐀" },
  { full_name: "A𐐀" },
  { legal_name: "A𐐀" },
  { full_name: " Nome fictício" },
  { legal_name: "Nome fictício\u00a0" },
  { city: "\tCidade fictícia" },
  { oab_number: "123a ", oab_state: "DF" },
])("Auth recusa formato/limite sem truncar: %j", async (patch) => {
  await denied(patch);
});

const validFields: Record<string, string>[] = [
  { document: "000.000.001-91" },
  { kind: "company", document: "00.000.000/0001-91" },
  {
    kind: "company",
    document: "12.abc.345/01de-35",
    oabNumber: "123a",
    oabState: "DF",
    city: "\tCidade fictícia\u00a0",
  },
  { kind: "company", document: "12ABC345SSDE05" },
  { fullName: "AA𐐀", legalName: "AA𐐀" },
  {
    fullName: "A".repeat(199) + "𐐀",
    legalName: "A".repeat(199) + "𐐀",
    city: "C".repeat(119) + "𐐀",
    oabNumber: "A".repeat(30),
    oabState: "DF",
  },
];
it.each(validFields)(
  "transporte real do formulário chega sem perda: %j",
  async (fields) => {
    const data = transport(fields),
      email = `campos-${randomUUID()}@exemplo.com`;
    const created = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    ).auth.signUp({
      email,
      password,
      options: { data: { ...data, role: "admin", has_contract: true } },
    });
    expect(created.error).toBeNull();
    const id = created.data.user!.id;
    try {
      const profile = await db
        .from("profiles")
        .select("full_name,phone,oab_number,oab_state,city,role")
        .eq("id", id)
        .single();
      expect(profile.error).toBeNull();
      expect(profile.data).toEqual({
        full_name: data.full_name,
        phone: data.phone,
        oab_number: data.oab_number || null,
        oab_state: data.oab_state || null,
        city: data.city,
        role: "client",
      });
      const client = await db
        .from("clients")
        .select("kind,document,legal_name,has_contract")
        .eq("owner_id", id)
        .single();
      expect(client.error).toBeNull();
      expect(client.data).toEqual({
        kind: data.kind,
        document: data.document,
        legal_name: data.legal_name,
        has_contract: false,
      });
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
      const updated = await db.auth.admin.updateUserById(id, {
        user_metadata: {
          full_name: "Outro nome fictício",
          phone: "+5511999999999",
          document: "00000000000",
          legal_name: "Outra empresa fictícia",
          accepted_legal: false,
          terms_version: "outra",
          privacy_version: "outra",
          role: "admin",
          has_contract: true,
        },
      });
      expect(updated.error).toBeNull();
      expect(
        (
          await db
            .from("profiles")
            .select("full_name,phone,oab_number,oab_state,city,role")
            .eq("id", id)
            .single()
        ).data,
      ).toEqual(profile.data);
      expect(
        (
          await db
            .from("clients")
            .select("kind,document,legal_name,has_contract")
            .eq("owner_id", id)
            .single()
        ).data,
      ).toEqual(client.data);
      expect(
        (
          await db
            .from("consents")
            .select("document,version,accepted_at")
            .eq("profile_id", id)
            .order("document")
        ).data,
      ).toEqual(consents.data);
    } finally {
      await removeLocalUser(id);
    }
  },
);

it("opcionais ausentes ficam vazios/nulos sem impedir o formulário público", async () => {
  const data: Record<string, unknown> = transport();
  for (const key of ["oab_number", "oab_state", "city"]) delete data[key];
  const created = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  ).auth.signUp({
    email: `campos-${randomUUID()}@exemplo.com`,
    password,
    options: { data },
  });
  expect(created.error).toBeNull();
  try {
    expect(
      (
        await db
          .from("profiles")
          .select("oab_number,oab_state,city")
          .eq("id", created.data.user!.id)
          .single()
      ).data,
    ).toEqual({ oab_number: null, oab_state: null, city: null });
  } finally {
    await removeLocalUser(created.data.user!.id);
  }
});

it("validadores SQL e TypeScript concordam em documentos canônicos, sem acesso de aplicação", () => {
  const cpfs = [
    "00000000191",
    "00000000190",
    "00000000000",
    "11111111111",
    "0000000019",
    "000000001910",
  ];
  const cnpjs = [
    "00000000000191",
    "00000000000190",
    "12ABC34501DE35",
    "12ABC34501DE34",
    "12ABC345SSDE05",
    "12ABC345SSDE04",
    "AAAAAAAAAAAA45",
    "00000000000000",
    "12ABC345ßDE05",
    "12ABC345ÉDE05",
    "12ABC34501DÉ35",
    "12ABC34501DE3A",
  ];
  for (const [name, values, valid] of [
    ["cpf", cpfs, validCpf],
    ["cnpj", cnpjs, validCnpj],
  ] as const) {
    const rows = JSON.parse(
      localNotificationSql(
        `select json_agg(json_build_object('value',v,'valid',private.valid_signup_${name}(v))) from jsonb_array_elements_text(${json(values)}) as t(v);`,
      ),
    ) as { value: string; valid: boolean }[];
    for (const row of rows) expect(row.valid, row.value).toBe(valid(row.value));
  }
  for (const role of ["anon", "authenticated", "service_role"]) {
    expect(
      localNotificationSql(
        `select has_function_privilege('${role}','private.valid_signup_payload(jsonb)','EXECUTE') or has_function_privilege('${role}','private.valid_signup_cpf(text)','EXECUTE') or has_function_privilege('${role}','private.valid_signup_cnpj(text)','EXECUTE');`,
      ),
    ).toBe("f");
  }
  expect(
    localNotificationSql(
      "select private.valid_signup_payload(null),private.valid_signup_payload('null'::jsonb),private.valid_signup_payload('[]'::jsonb);",
    ),
  ).toBe("f|f|f");
});

it("limites Unicode e trim acompanham o parser instalado", () => {
  const cases = [
    { full_name: "A𐐀" },
    { full_name: "AA𐐀" },
    { full_name: "A".repeat(199) + "𐐀" },
    { full_name: "A".repeat(200) + "𐐀" },
    { legal_name: "A𐐀" },
    { legal_name: "AA𐐀" },
    { legal_name: "A".repeat(199) + "𐐀" },
    { legal_name: "A".repeat(200) + "𐐀" },
    { city: "C".repeat(119) + "𐐀" },
    { city: "C".repeat(120) + "𐐀" },
  ];
  for (const patch of cases) {
    let parsed = true;
    try {
      transport({
        fullName: patch.full_name ?? "Cadastro fictício",
        legalName: patch.legal_name ?? "Escritório fictício",
        city: patch.city ?? "",
      });
    } catch {
      parsed = false;
    }
    expect(
      localNotificationSql(
        `select private.valid_signup_payload(${json({ ...transport(), ...patch })});`,
      ),
    ).toBe(parsed ? "t" : "f");
  }
  const spaces = [
    " ",
    "\t",
    "\n",
    "\r",
    "\f",
    "\v",
    "\u00a0",
    "\u1680",
    "\u2000",
    "\u2001",
    "\u2002",
    "\u2003",
    "\u2004",
    "\u2005",
    "\u2006",
    "\u2007",
    "\u2008",
    "\u2009",
    "\u200a",
    "\u2028",
    "\u2029",
    "\u202f",
    "\u205f",
    "\u3000",
    "\ufeff",
  ];
  const payloads = spaces.flatMap((space) => [
    { ...transport(), full_name: `${space}Nome fictício${space}` },
    transport({ fullName: `${space}Nome fictício${space}` }),
  ]);
  const results = JSON.parse(
    localNotificationSql(
      `select json_agg(private.valid_signup_payload(v) order by position) from jsonb_array_elements(${json(payloads)}) with ordinality as t(v,position);`,
    ),
  );
  expect(results).toEqual(spaces.flatMap(() => [false, true]));
});
