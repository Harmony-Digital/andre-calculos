import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const coreNames = [
  "APP_BASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const items = {
  APP_BASE_URL: "App",
  NEXT_PUBLIC_SUPABASE_URL: "Supabase",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "Supabase",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase",
  CRON_SECRET: "Vercel",
  RESEND_API_KEY: "Resend",
  EMAIL_FROM: "Resend",
};

export class SyncError extends Error {}
const fail = (message) => {
  throw new SyncError(message);
};
const required = (config, key) => {
  if (!config[key]?.trim())
    fail(`Metadado obrigatório não registrado: ${key}.`);
  return config[key];
};

// Este arquivo de metadados não é executado como shell nem contém segredos.
export function parseSettings(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)="([^"\r\n]*)"\s*(?:#.*)?$/);
    if (!match || Object.hasOwn(result, match[1])) {
      fail("Formato inválido ou campo duplicado em contas-esperadas.env.");
    }
    result[match[1]] = match[2];
  }
  return result;
}

function httpsOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("Origem HTTPS inválida.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    fail("Origem HTTPS inválida.");
  return url.origin;
}

export function preparePlan(config, target, names = coreNames) {
  if (!["production", "preview"].includes(target))
    fail("Ambiente deve ser production ou preview.");
  if (
    config.PROJETO !== "andre-calculos" ||
    config.GITHUB_REPO !== "Harmony-Digital/andre-calculos" ||
    required(config, "VERCEL_TEAM") !== "projeto-andre1" ||
    required(config, "VERCEL_REPOSITORIO") !== config.GITHUB_REPO ||
    required(config, "VERCEL_PRODUCTION_BRANCH") !== "main"
  )
    fail("Destino registrado não corresponde ao projeto.");
  const teamId = required(config, "VERCEL_TEAM_ID");
  const projectId = required(config, "VERCEL_PROJECT_ID");
  if (
    !/^team_[A-Za-z0-9]+$/.test(teamId) ||
    !/^prj_[A-Za-z0-9]+$/.test(projectId)
  )
    fail("IDs da Vercel inválidos.");
  const suffix = target === "production" ? "PRODUCAO" : "PREVIEW";
  const vault =
    target === "production"
      ? required(config, "OP_COFRE_PRODUCAO")
      : required(config, "OP_COFRE");
  if (
    !/^[a-z0-9-]+$/.test(vault) ||
    config.OP_COFRE !== "proj-andre-calculos" ||
    (target === "production" && vault === config.OP_COFRE)
  )
    fail("Cofre do ambiente não corresponde à separação registrada.");
  const projectRef = required(
    config,
    target === "production"
      ? "SUPABASE_PROJECT_REF"
      : "SUPABASE_PREVIEW_PROJECT_REF",
  );
  if (
    !/^[a-z]{20}$/.test(projectRef) ||
    config.SUPABASE_PROJECT_REF !== "qtofwbxujshroaafxowr" ||
    (target === "preview" && projectRef === config.SUPABASE_PROJECT_REF)
  )
    fail("Destino Supabase do ambiente inválido.");
  const origin = httpsOrigin(required(config, `APP_ORIGIN_${suffix}`));
  if (
    target === "preview" &&
    origin === httpsOrigin(required(config, "APP_ORIGIN_PRODUCAO"))
  )
    fail("Preview não pode usar a origem de produção.");
  if (
    !names.length ||
    new Set(names).size !== names.length ||
    names.some((name) => !Object.hasOwn(items, name))
  )
    fail("Lista de variáveis inválida; use os nomes documentados do M1/M2.");
  return {
    target,
    names,
    vault,
    origin,
    projectRef,
    teamId,
    projectId,
    team: config.VERCEL_TEAM,
    project: required(config, "VERCEL_PROJETO"),
    user: required(config, "VERCEL_USUARIO"),
    opEmail: required(config, "OP_EMAIL_FABIO"),
  };
}

export function assertPersonalAccount(env) {
  if (
    env.OP_SERVICE_ACCOUNT_TOKEN ||
    env.OP_CONNECT_TOKEN ||
    env.OP_CONNECT_HOST
  )
    fail(
      "Use a conta pessoal do Fábio; conta de serviço/Connect não é permitida.",
    );
}

function readJson(result) {
  try {
    return JSON.parse(result);
  } catch {
    fail(
      "Resposta da CLI não reconhecida; nenhuma nova escrita será iniciada.",
    );
  }
}

export function synchronize(plan, values, run, announce = () => {}) {
  for (const name of new Set([...coreNames, "VERCEL_TOKEN", ...plan.names])) {
    if (!values[name] || values[name].startsWith("op://"))
      fail(`Valor não carregado pelo 1Password: ${name}.`);
  }
  if (httpsOrigin(values.APP_BASE_URL) !== plan.origin)
    fail("APP_BASE_URL diverge da origem aprovada.");
  if (
    values.NEXT_PUBLIC_SUPABASE_URL !== `https://${plan.projectRef}.supabase.co`
  )
    fail("URL Supabase diverge do ambiente aprovado.");

  const common = [
    "--scope",
    plan.team,
    "--cwd",
    resolve(root, "app"),
    "--no-color",
    "--non-interactive",
  ];
  const read = (args) =>
    run("vercel", [...args, ...common], undefined, values.VERCEL_TOKEN, plan);
  if (read(["whoami"]).trim() !== plan.user)
    fail("Conta Vercel diverge da conta do cliente registrada.");
  const teams = readJson(read(["teams", "list", "--json", "--limit", "100"]));
  if (
    teams.pagination?.next ||
    !Array.isArray(teams.teams) ||
    teams.teams.length !== 1 ||
    teams.teams[0].id !== plan.teamId ||
    teams.teams[0].slug !== plan.team
  )
    fail("Token Vercel não está restrito à equipe registrada do cliente.");
  const project = readJson(
    read(["project", "inspect", plan.projectId, "--json"]),
  );
  if (
    project.id !== plan.projectId ||
    project.name !== plan.project ||
    project.owner?.slug !== plan.team ||
    project.rootDirectory !== "app"
  )
    fail("Projeto Vercel diverge do destino registrado.");

  const records = readJson(
    read(["env", "ls", plan.target, "--project", plan.projectId, "--json"]),
  );
  if (
    !Array.isArray(records.envs) ||
    records.envs.some(
      (entry) =>
        typeof entry.key !== "string" ||
        !(
          typeof entry.target === "string" ||
          (Array.isArray(entry.target) &&
            entry.target.every((target) => typeof target === "string"))
        ),
    )
  ) {
    fail("Metadados das variáveis não reconhecidos.");
  }
  const existing = records.envs.filter(
    (entry) =>
      plan.names.includes(entry.key) &&
      (Array.isArray(entry.target)
        ? entry.target.includes(plan.target)
        : entry.target === plan.target),
  );
  if (existing.length)
    fail(
      `Variáveis já existentes no ambiente: ${[...new Set(existing.map((entry) => entry.key))].join(", ")}. Selecione apenas ausentes; valores existentes exigem revisão humana.`,
    );

  const completed = [];
  for (const name of plan.names) {
    try {
      run(
        "vercel",
        [
          "env",
          "add",
          name,
          plan.target,
          "--project",
          plan.projectId,
          name.startsWith("NEXT_PUBLIC_") ? "--no-sensitive" : "--sensitive",
          ...common,
        ],
        values[name],
        values.VERCEL_TOKEN,
        plan,
      );
    } catch {
      fail(
        `Cadastro interrompido em ${name}. Concluídas: ${completed.join(", ") || "nenhuma"}. Não houve rollback; revise antes de repetir.`,
      );
    }
    completed.push(name);
    announce(`Cadastrada: ${name} (${plan.target}).`);
  }
  return completed;
}

// Nunca propagar stderr/erros de spawn, que podem conter valores ou argumentos.
export function execute(
  command,
  args,
  input,
  token,
  plan,
  inherited = process.env,
  spawn = spawnSync,
) {
  const env = {};
  for (const key of ["PATH", "HOME", "USER", "TMPDIR", "LANG"]) {
    if (inherited[key]) env[key] = inherited[key];
  }
  Object.assign(env, { NO_COLOR: "1", VERCEL_TELEMETRY_DISABLED: "1" });
  if (token)
    Object.assign(env, {
      VERCEL_TOKEN: token,
      VERCEL_ORG_ID: plan.teamId,
      VERCEL_PROJECT_ID: plan.projectId,
    });
  const result = spawn(command, args, {
    env,
    input,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    fail(
      `A CLI ${command} recusou a operação. Detalhes brutos foram omitidos para preservar os valores.`,
    );
  return result.stdout;
}

function main() {
  const [mode, target, ...selected] = process.argv.slice(2);
  if (!mode || ["--help", "--ajuda"].includes(mode)) {
    console.log(
      "Uso exclusivo do Fábio: bash scripts/sincronizar-vercel.sh --conferir|--aplicar production|preview [NOME ...]\nSem nomes, usa as quatro variáveis básicas. --conferir é apenas local. --aplicar usa op run e env add, sem sobrescrever ou publicar.",
    );
    return;
  }
  if (!["--conferir", "--aplicar", "--valores-carregados"].includes(mode))
    fail("Modo inválido.");
  assertPersonalAccount(process.env);
  let config;
  try {
    config = parseSettings(
      readFileSync(resolve(root, "scripts/contas-esperadas.env"), "utf8"),
    );
  } catch (error) {
    if (error instanceof SyncError) throw error;
    fail("Arquivo de metadados indisponível.");
  }
  const plan = preparePlan(
    config,
    target,
    selected.length ? selected : coreNames,
  );
  const remote = execute("git", [
    "-C",
    root,
    "remote",
    "get-url",
    "origin",
  ]).trim();
  if (
    ![
      "https://github.com/Harmony-Digital/andre-calculos.git",
      "git@github.com:Harmony-Digital/andre-calculos.git",
    ].includes(remote)
  )
    fail("Remoto Git divergente.");
  if (mode === "--conferir") {
    console.log(
      `Destino preparado: ${plan.team}/${plan.project}, ${plan.target}; variáveis: ${plan.names.join(", ")}. Nenhuma conexão efetuada.`,
    );
    return;
  }
  const version = execute("vercel", ["--version"])
    .trim()
    .match(/(?:Vercel CLI\s+)?(\d+)\.(\d+)\.(\d+)/);
  if (
    !version ||
    Number(version[1]) < 59 ||
    (Number(version[1]) === 59 && Number(version[2]) < 16)
  )
    fail(
      "Use a Vercel CLI 59.16.0 ou posterior, com suporte a VERCEL_TOKEN em ambiente.",
    );
  // Não usar o preflight do agente: ele confere o cofre de desenvolvimento.
  const personal = spawnSync(
    "op",
    ["whoami", "--account", plan.opEmail, "--format=json"],
    { encoding: "utf8", timeout: 60_000 },
  );
  if (
    personal.error ||
    personal.status !== 0 ||
    readJson(personal.stdout).email !== plan.opEmail
  )
    fail("Conta pessoal do Fábio não conferida no 1Password.");
  if (mode === "--valores-carregados") {
    synchronize(plan, process.env, execute, (message) => console.log(message));
    console.log(
      "Cadastro concluído. Validar os fluxos do ambiente antes de considerar M1.23 pronta.",
    );
    return;
  }

  const env = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (
      value.startsWith("op://") ||
      Object.hasOwn(items, key) ||
      key === "VERCEL_TOKEN"
    )
      delete env[key];
  }
  env.VERCEL_TOKEN = `op://${plan.vault}/Vercel/VERCEL_TOKEN`;
  for (const name of new Set([...coreNames, ...plan.names]))
    env[name] = `op://${plan.vault}/${items[name]}/${name}`;
  const result = spawnSync(
    "op",
    [
      "run",
      "--account",
      plan.opEmail,
      "--",
      process.execPath,
      fileURLToPath(import.meta.url),
      "--valores-carregados",
      plan.target,
      ...plan.names,
    ],
    { env, stdio: ["ignore", "inherit", "pipe"] },
  );
  if (result.error || result.status !== 0)
    fail(
      "Sincronização não concluída. Revise os nomes reportados; saída bruta do 1Password omitida.",
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof SyncError
        ? error.message
        : "Sincronização interrompida; nenhum detalhe sensível será exibido.",
    );
    process.exitCode = 1;
  }
}
