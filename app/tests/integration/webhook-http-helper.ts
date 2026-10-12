import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

/** Servidor próprio em porta efêmera; não reutiliza apps abertos de outros projetos. */
export async function withWebhookHttpServer(
  configuration: { scopeId: string; accountId: string; token: string },
  verify: (url: string) => Promise<void>,
) {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  if (!address || typeof address === "string")
    throw new Error("Porta local indisponível.");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        NODE_ENV: "development",
        VERCEL: "",
        VERCEL_ENV: "",
        ANDRE_WEBHOOK_FIXTURE_SCOPE_ID: configuration.scopeId,
        ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID: configuration.accountId,
        ANDRE_WEBHOOK_FIXTURE_TOKEN: configuration.token,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let startup = "";
  let failed = false;
  child.stdout.on("data", (chunk) => {
    startup += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    startup += String(chunk);
  });
  child.on("error", () => {
    failed = true;
  });
  const exited = once(child, "exit").catch(() => []);
  const deadline = Date.now() + 60000;
  try {
    while (!/Ready in/.test(startup)) {
      if (failed || child.exitCode !== null || Date.now() >= deadline)
        throw new Error("Servidor HTTP local não ficou disponível.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const base = `http://127.0.0.1:${port}`;
    const health = await fetch(base + "/api/health");
    if (health.status !== 200 || (await health.json()).version !== "0.1.0")
      throw new Error("Destino HTTP local inesperado.");
    await verify(base + "/api/webhooks/asaas");
    if (startup.includes(configuration.token))
      throw new Error("Token fictício exposto no log do servidor.");
  } finally {
    if (child.pid && child.exitCode === null) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* Processo próprio já encerrado. */
      }
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          /* Processo próprio já encerrado. */
        }
      }, 5000);
      await exited;
      clearTimeout(timer);
    }
  }
}
