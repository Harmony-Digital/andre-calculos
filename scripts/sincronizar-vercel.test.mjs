import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertPersonalAccount,
  coreNames,
  execute,
  parseSettings,
  preparePlan,
  synchronize,
} from "./sincronizar-vercel.mjs";

// Todos os valores são fictícios; nenhuma CLI, rede ou conta é usada.
const config = {
  PROJETO: "andre-calculos",
  GITHUB_REPO: "Harmony-Digital/andre-calculos",
  VERCEL_TEAM: "projeto-andre1",
  VERCEL_TEAM_ID: "team_Ficticio",
  VERCEL_PROJECT_ID: "prj_Ficticio",
  VERCEL_PROJETO: "portal-ficticio",
  VERCEL_USUARIO: "cliente-ficticio",
  VERCEL_REPOSITORIO: "Harmony-Digital/andre-calculos",
  VERCEL_PRODUCTION_BRANCH: "main",
  OP_EMAIL_FABIO: "operador@exemplo.com",
  OP_COFRE: "proj-andre-calculos",
  OP_COFRE_PRODUCAO: "cofre-producao-ficticio",
  SUPABASE_PROJECT_REF: "qtofwbxujshroaafxowr",
  SUPABASE_PREVIEW_PROJECT_REF: "abcdefghijklmnopqrst",
  APP_ORIGIN_PRODUCAO: "https://portal.exemplo.com",
  APP_ORIGIN_PREVIEW: "https://preview.exemplo.com",
};
const plan = () => preparePlan(config, "production");
const values = () => ({
  VERCEL_TOKEN: "token-ficticio",
  APP_BASE_URL: config.APP_ORIGIN_PRODUCAO,
  NEXT_PUBLIC_SUPABASE_URL: `https://${config.SUPABASE_PROJECT_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-publica-ficticia",
  SUPABASE_SERVICE_ROLE_KEY: "chave-sistema-ficticia",
  RESEND_API_KEY: "resend-ficticio",
});
function mockRun({ teams, project, envs = [], failAt } = {}) {
  const calls = [];
  const run = (command, args, input, token, targetPlan) => {
    calls.push({ command, args, input, token, targetPlan });
    if (args[0] === "whoami") return `${config.VERCEL_USUARIO}\n`;
    if (args[0] === "teams")
      return JSON.stringify(
        teams ?? {
          teams: [{ id: config.VERCEL_TEAM_ID, slug: config.VERCEL_TEAM }],
          pagination: { next: null },
        },
      );
    if (args[0] === "project")
      return JSON.stringify(
        project ?? {
          id: config.VERCEL_PROJECT_ID,
          name: config.VERCEL_PROJETO,
          owner: { slug: config.VERCEL_TEAM },
          rootDirectory: "app",
        },
      );
    if (args[1] === "ls") return JSON.stringify({ envs });
    if (args[2] === failAt)
      throw new Error("erro bruto com valor-ficticio-nao-divulgar");
    return "saída da CLI que não deve ser exibida";
  };
  return {
    run,
    calls,
    writes: () => calls.filter(({ args }) => args[1] === "add"),
  };
}

test("metadados são dados; linhas executáveis e campos duplicados são recusados", () => {
  assert.deepEqual(
    parseSettings('# comentário\nPROJETO="andre-calculos" # nota\n'),
    { PROJETO: "andre-calculos" },
  );
  assert.throws(() => parseSettings('PROJETO="x"\nPROJETO="y"'), /duplicado/);
  assert.throws(() => parseSettings("$(comando)\n"), /Formato inválido/);
});

test("destinos ausentes ou divergentes bloqueiam a preparação", () => {
  for (const key of [
    "VERCEL_TEAM_ID",
    "VERCEL_PROJECT_ID",
    "OP_COFRE_PRODUCAO",
    "OP_EMAIL_FABIO",
  ]) {
    assert.throws(
      () => preparePlan({ ...config, [key]: "" }, "production"),
      /não registrado/,
    );
  }
  for (const change of [
    { GITHUB_REPO: "outro/andre-calculos" },
    { VERCEL_TEAM: "outro" },
    { VERCEL_PRODUCTION_BRANCH: "outra" },
    { OP_COFRE_PRODUCAO: config.OP_COFRE },
  ])
    assert.throws(() => preparePlan({ ...config, ...change }, "production"));
  assert.throws(() => preparePlan(config, "development"));
});

test("preview exige banco e origem próprios; cofre de produção não é presumido", () => {
  const preview = preparePlan(config, "preview");
  assert.equal(preview.vault, config.OP_COFRE);
  assert.equal(preview.projectRef, config.SUPABASE_PREVIEW_PROJECT_REF);
  assert.throws(() =>
    preparePlan(
      { ...config, SUPABASE_PREVIEW_PROJECT_REF: config.SUPABASE_PROJECT_REF },
      "preview",
    ),
  );
  assert.throws(() =>
    preparePlan(
      { ...config, APP_ORIGIN_PREVIEW: config.APP_ORIGIN_PRODUCAO },
      "preview",
    ),
  );
  for (const origin of [
    "http://portal.exemplo.com",
    "https://usuario:senha@portal.exemplo.com",
    "https://portal.exemplo.com/callback",
    "https://portal.exemplo.com?x=1",
  ]) {
    assert.throws(() =>
      preparePlan({ ...config, APP_ORIGIN_PRODUCAO: origin }, "production"),
    );
  }
});

test("contas de serviço/Connect e nomes reservados/futuros são recusados", () => {
  for (const key of [
    "OP_SERVICE_ACCOUNT_TOKEN",
    "OP_CONNECT_TOKEN",
    "OP_CONNECT_HOST",
  ])
    assert.throws(() => assertPersonalAccount({ [key]: "ficticio" }));
  for (const names of [
    ["HUB_API_KEY"],
    ["OP_SERVICE_ACCOUNT_TOKEN"],
    ["DATABASE_URL"],
    ["APP_BASE_URL", "APP_BASE_URL"],
    [],
  ])
    assert.throws(() => preparePlan(config, "production", names));
});

test("origem ou Supabase errados não iniciam conexão nem escrita", () => {
  for (const change of [
    { APP_BASE_URL: config.APP_ORIGIN_PREVIEW },
    {
      NEXT_PUBLIC_SUPABASE_URL: `https://${config.SUPABASE_PREVIEW_PROJECT_REF}.supabase.co`,
    },
    { SUPABASE_SERVICE_ROLE_KEY: "op://cofre/item/campo" },
  ]) {
    const mock = mockRun();
    assert.throws(() =>
      synchronize(plan(), { ...values(), ...change }, mock.run),
    );
    assert.equal(mock.calls.length, 0);
  }
});

test("equipe diferente, token com outras equipes ou inventário incompleto bloqueiam escrita", () => {
  for (const teams of [
    { teams: [{ id: "team_Outro", slug: config.VERCEL_TEAM }] },
    {
      teams: [
        { id: config.VERCEL_TEAM_ID, slug: config.VERCEL_TEAM },
        { id: "team_Outro", slug: "outro" },
      ],
    },
    {
      teams: [{ id: config.VERCEL_TEAM_ID, slug: config.VERCEL_TEAM }],
      pagination: { next: 123 },
    },
  ]) {
    const mock = mockRun({ teams });
    assert.throws(() => synchronize(plan(), values(), mock.run), /equipe/);
    assert.equal(mock.writes().length, 0);
  }
});

test("projeto, proprietário ou diretório divergentes bloqueiam toda escrita", () => {
  for (const change of [
    { id: "prj_Outro" },
    { owner: { slug: "outro" } },
    { rootDirectory: null },
  ]) {
    const mock = mockRun({
      project: {
        id: config.VERCEL_PROJECT_ID,
        name: config.VERCEL_PROJETO,
        owner: { slug: config.VERCEL_TEAM },
        rootDirectory: "app",
        ...change,
      },
    });
    assert.throws(
      () => synchronize(plan(), values(), mock.run),
      /Projeto Vercel/,
    );
    assert.equal(mock.writes().length, 0);
  }
});

test("existentes, inclusive em branch de preview, bloqueiam antes da primeira escrita", () => {
  for (const target of ["production", ["production", "preview"]]) {
    const mock = mockRun({
      envs: [
        {
          key: coreNames[2],
          target,
          gitBranch: "feat/teste",
          value: "valor-ficticio-nao-divulgar",
        },
      ],
    });
    assert.throws(
      () => synchronize(plan(), values(), mock.run),
      /já existentes/,
    );
    assert.equal(mock.writes().length, 0);
  }
  const malformed = mockRun({ envs: [{ key: coreNames[0] }] });
  assert.throws(
    () => synchronize(plan(), values(), malformed.run),
    /Metadados/,
  );
  assert.equal(malformed.writes().length, 0);
});

test("cadastro usa stdin, destino explícito e nunca valores em argv ou log", () => {
  const mock = mockRun(),
    messages = [];
  assert.deepEqual(
    synchronize(plan(), values(), mock.run, (message) =>
      messages.push(message),
    ),
    coreNames,
  );
  assert.equal(mock.writes().length, 4);
  for (const call of mock.writes()) {
    assert.equal(call.input, values()[call.args[2]]);
    assert.equal(call.args[3], "production");
    assert.equal(
      call.args[call.args.indexOf("--project") + 1],
      config.VERCEL_PROJECT_ID,
    );
    assert.equal(
      call.args[call.args.indexOf("--scope") + 1],
      config.VERCEL_TEAM,
    );
    for (const forbidden of [
      "--token",
      "--value",
      "--yes",
      "--force",
      "--debug",
    ])
      assert.ok(!call.args.includes(forbidden));
    const visibility = call.args[2].startsWith("NEXT_PUBLIC_")
      ? "--no-sensitive"
      : "--sensitive";
    assert.ok(call.args.includes(visibility));
    assert.ok(
      !call.args.includes(
        visibility === "--sensitive" ? "--no-sensitive" : "--sensitive",
      ),
    );
    assert.ok(!call.args.includes(call.input));
  }
  assert.ok(!messages.join("\n").includes(values().SUPABASE_SERVICE_ROLE_KEY));
  assert.ok(!messages.join("\n").includes("saída da CLI"));
});

test("falha parcial relata apenas nomes; não sobrescreve nem tenta rollback", () => {
  const mock = mockRun({ failAt: coreNames[2] });
  assert.throws(
    () => synchronize(plan(), values(), mock.run),
    (error) =>
      error.message.includes(coreNames[0]) &&
      error.message.includes("Não houve rollback") &&
      !error.message.includes("valor-ficticio-nao-divulgar"),
  );
  assert.equal(mock.writes().length, 3);
  const resume = mockRun({
    envs: [{ key: coreNames[0], target: ["production"] }],
  });
  assert.deepEqual(
    synchronize(
      preparePlan(config, "production", [coreNames[2]]),
      values(),
      resume.run,
    ),
    [coreNames[2]],
  );
});

test("CLI recebe somente token/IDs e infraestrutura; outras chaves não são herdadas", () => {
  let captured;
  execute(
    "vercel",
    ["env", "add", "RESEND_API_KEY"],
    "valor-stdin-ficticio",
    "token-ficticio",
    plan(),
    {
      PATH: "/bin",
      HOME: "/pasta-ficticia",
      RESEND_API_KEY: "nao-herdar",
      OP_SESSION_ficticia: "nao-herdar",
    },
    (command, args, options) => {
      captured = { command, args, options };
      return { status: 0, stdout: "" };
    },
  );
  assert.equal(captured.options.env.VERCEL_TOKEN, "token-ficticio");
  assert.equal(
    captured.options.env.VERCEL_PROJECT_ID,
    config.VERCEL_PROJECT_ID,
  );
  assert.equal(captured.options.input, "valor-stdin-ficticio");
  assert.equal(captured.options.env.RESEND_API_KEY, undefined);
  assert.equal(captured.options.env.OP_SESSION_ficticia, undefined);
  assert.ok(!captured.args.includes("token-ficticio"));
});

test("erros brutos da CLI não entram em mensagens", () => {
  assert.throws(
    () =>
      execute("vercel", [], undefined, undefined, undefined, {}, () => ({
        status: 1,
        stderr: "valor-ficticio-nao-divulgar",
        error: new Error("valor-ficticio-nao-divulgar"),
      })),
    (error) =>
      !error.message.includes("valor-ficticio-nao-divulgar") &&
      error.message.includes("omitidos"),
  );
});
