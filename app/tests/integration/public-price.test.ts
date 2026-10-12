import { beforeAll, afterAll, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { localSystem, leaseLocalSettings } from "../e2e/local-helper";
import { localNotificationSql as sql } from "../e2e/notification-helper";
import { fictionalPriceParameters } from "../settings-fixture";
import { publicPriceSchema } from "../../src/modules/simulator/model";
localSystem();
let release: () => Promise<void>;
beforeAll(async () => {
  release = await leaseLocalSettings();
});
afterAll(async () => {
  await release();
});
const literal = (v: unknown) =>
  "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
function transaction(body: string) {
  const result = sql(`begin;\n${body}\nrollback;`);
  return result
    .split(/\r?\n/)
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
}
function fixture(parameters: unknown, active = true) {
  return `update public.price_tables set active=false where active;
insert into public.price_tables(version,active,is_example,activated_at,parameters)
select coalesce(max(version),0)+1,${active},false,${active ? "clock_timestamp()" : "null"},${literal(parameters)} from public.price_tables;`;
}
it("anônimo recebe projeção vazia sem tabela ativa, sem fabricar orçamento", () => {
  const [value] = transaction(
    "update public.price_tables set active=false where active;set local role anon;select jsonb_build_object('price',public.get_public_price_table());",
  );
  expect(value.price).toBeNull();
});
it("preços ativos têm somente campos públicos mesmo quando parâmetros contêm dados extras", () => {
  const privateMarker = "FICTICIO_PRIVADO_NAO_PUBLICAR";
  const parameters = {
    ...fictionalPriceParameters,
    base: { ...fictionalPriceParameters.base, privateField: privateMarker },
    pixKey: privateMarker,
    conditions: privateMarker,
  };
  const [value] = transaction(
    fixture(parameters) +
      "set local role anon;select jsonb_build_object('price',public.get_public_price_table());",
  );
  expect(publicPriceSchema.safeParse(value.price).success).toBe(true);
  expect(JSON.stringify(value)).not.toContain(privateMarker);
  expect(Object.keys(value.price).sort()).toEqual(
    Object.keys(publicPriceSchema.parse(value.price)).sort(),
  );
  expect(value.price.base).toEqual(fictionalPriceParameters.base);
  expect(value.price).not.toHaveProperty("businessDays");
  expect(value.price).not.toHaveProperty("id");
});
it("papel autenticado vê a mesma tabela pública sem receber contexto privado", () => {
  const rows = transaction(
    fixture(fictionalPriceParameters) +
      "set local role anon;select jsonb_build_object('price',public.get_public_price_table());reset role;set local role authenticated;select jsonb_build_object('price',public.get_public_price_table());",
  );
  expect(rows).toHaveLength(2);
  expect(rows[0]).toEqual(rows[1]);
});
it("tabela inativa e parâmetros malformados não são divulgados", () => {
  for (const parameters of [
    null,
    {},
    { ...fictionalPriceParameters, perWage: { privateValue: "FICTICIO" } },
    { ...fictionalPriceParameters, timecardUnit: "FICTICIO" },
  ]) {
    const [value] = transaction(
      fixture(parameters) +
        "set local role anon;select jsonb_build_object('price',public.get_public_price_table());",
    );
    expect(value.price).toBeNull();
  }
  const [value] = transaction(
    fixture(fictionalPriceParameters, false) +
      "set local role anon;select jsonb_build_object('price',public.get_public_price_table());",
  );
  expect(value.price).toBeNull();
});
it("consulta anônima não amplia SELECT ou escrita de configurações privadas", async () => {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  expect((await db.rpc("get_public_price_table")).error).toBeNull();
  expect((await db.from("price_tables").select("*")).error).not.toBeNull();
  expect(
    (
      await db.rpc("save_price_version", {
        payload: fictionalPriceParameters,
        example: false,
        expected_version: 0,
        approved: true,
      })
    ).error,
  ).not.toBeNull();
  const [grants] = transaction(
    "select jsonb_build_object('stable',(select provolatile='s' from pg_proc where oid='public.get_public_price_table()'::regprocedure),'definer',(select prosecdef from pg_proc where oid='public.get_public_price_table()'::regprocedure),'anonExecute',has_function_privilege('anon','public.get_public_price_table()','execute'),'anonSelect',has_table_privilege('anon','public.price_tables','select')); ",
  );
  expect(grants).toEqual({
    stable: true,
    definer: true,
    anonExecute: true,
    anonSelect: false,
  });
});
