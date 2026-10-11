import { execFileSync } from "node:child_process";
import { projectRoot } from "./local-env.mjs";
console.info(
  "Iniciando Supabase local do André; credenciais não serão impressas.",
);
try {
  execFileSync("supabase", ["start", "--workdir", projectRoot], {
    // Pulls frios podem produzir mais de 1 MiB; a saída inclui chaves locais.
    stdio: "ignore",
    timeout: 900000,
  });
  console.info("Supabase local iniciado.");
} catch {
  console.error(
    "Supabase local não iniciou. Confira Docker e a configuração do projeto.",
  );
  process.exitCode = 1;
}
