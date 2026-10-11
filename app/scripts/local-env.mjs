import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash, randomBytes } from "node:crypto";

export const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function localEnvironment() {
  const dockerHost =
    process.platform === "darwin"
      ? `unix://${homedir()}/.colima/andre-calculos/docker.sock`
      : "unix:///var/run/docker.sock";
  let state;
  try {
    state = JSON.parse(
      execFileSync(
        "supabase",
        ["status", "--workdir", projectRoot, "--output", "json"],
        {
          env: { ...process.env, DOCKER_HOST: dockerHost },
          stdio: ["ignore", "pipe", "pipe"],
          encoding: "utf8",
        },
      ),
    );
  } catch {
    throw new Error(
      "Supabase local indisponível. Inicie o perfil Colima andre-calculos e supabase start.",
    );
  }
  if (
    state.API_URL !== "http://127.0.0.1:54321" ||
    !state.SERVICE_ROLE_KEY ||
    !state.ANON_KEY
  ) {
    throw new Error(
      "Destino local inesperado. Nenhuma credencial foi utilizada.",
    );
  }
  return {
    ...process.env,
    DOCKER_HOST: dockerHost,
    NEXT_PUBLIC_SUPABASE_URL: state.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: state.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: state.SERVICE_ROLE_KEY,
    APP_BASE_URL: "http://127.0.0.1:3000",
    ANDRE_LOCAL_TESTS: "1",
    CRON_SECRET: createHash("sha256")
      .update(`andre-calculos-local-cron:${state.SERVICE_ROLE_KEY}`)
      .digest("base64url"),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (!command)
    throw new Error(
      "Informe o comando. Ex.: bash scripts/dev-env.sh npm run dev",
    );
  const env = localEnvironment();
  if (args.some((value) => ["test:e2e", "test:rls"].includes(value))) {
    env.ANDRE_TEST_PASSWORD = randomBytes(32).toString("base64url");
    execFileSync(
      resolve(projectRoot, "app/node_modules/.bin/tsx"),
      [resolve(projectRoot, "scripts/seed-dev.ts")],
      { env, cwd: resolve(projectRoot, "app"), stdio: "inherit" },
    );
  }
  const child = spawn(command, args, {
    cwd: resolve(projectRoot, "app"),
    env,
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => process.exit(code ?? 1));
}
