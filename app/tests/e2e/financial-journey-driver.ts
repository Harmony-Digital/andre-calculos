import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { FinancialScenario } from "./financial-journey-helper";

export type JourneyMetadata = {
  processId: string;
  orderId: string;
  quoteId: string;
  code: string;
  clientId: string;
  calculatorId: string;
  chargeId: string;
  intentId: string;
  contracted: number;
};
type JourneyFixture = Awaited<
  ReturnType<
    typeof import("./financial-journey-helper").financialJourneyFixture
  >
>;
type Actions = {
  observe: string;
  apply: Awaited<ReturnType<JourneyFixture["apply"]>>;
  origin: Awaited<ReturnType<JourneyFixture["createOrigin"]>>;
  bind: Awaited<ReturnType<JourneyFixture["bind"]>>;
  resolve: Awaited<ReturnType<JourneyFixture["resolve"]>>;
  view: ReturnType<JourneyFixture["view"]>;
  receipts: ReturnType<JourneyFixture["receipts"]>;
  replay: Awaited<ReturnType<JourneyFixture["replay"]>>;
  prepareDelivery: string;
  createZeroOrder: { orderId: string; processId: string };
  close: string;
};
/** Servidor-only via Node/TSX, sem endpoint HTTP de teste na aplicação. */
export async function financialJourneyDriver(billingType = "PIX") {
  if (!["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"].includes(billingType))
    throw new Error("Meio fictício inválido.");
  const child = spawn(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/e2e/financial-journey-runner.ts",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, ANDRE_INVOICE_METHOD: billingType },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const pending = new Map<
    string,
    { resolve: (data: unknown) => void; reject: (e: Error) => void }
  >();
  const lines = createInterface({ input: child.stdout });
  let sequence = 0;
  const ended = new Promise<number | null>((resolve) => {
    child.on("error", () => resolve(1));
    child.on("exit", resolve);
  });
  child.stderr.resume(); // Não encaminhar objetos internos/credenciais para logs.
  child.stdin.on("error", () => {
    for (const p of pending.values())
      p.reject(new Error("Entrada da jornada fictícia encerrada."));
    pending.clear();
  });
  const receive = (id: string) =>
    new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Jornada fictícia excedeu o prazo."));
      }, 45000);
      pending.set(id, {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  const ready = receive("ready");
  lines.on("line", (line) => {
    if (!line.startsWith("ANDRE_FINANCIAL_JOURNEY ")) return;
    let message;
    try {
      message = JSON.parse(line.slice("ANDRE_FINANCIAL_JOURNEY ".length));
    } catch {
      for (const p of pending.values())
        p.reject(new Error("Resposta fictícia inválida."));
      pending.clear();
      child.kill("SIGTERM");
      return;
    }
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.ok) waiting.resolve(message.data);
    else waiting.reject(new Error("Operação fictícia não concluída."));
  });
  void ended.then(() => {
    for (const p of pending.values())
      p.reject(new Error("Processo da jornada fictícia encerrado."));
    pending.clear();
    lines.close();
  });
  async function command<K extends keyof Actions>(
    action: K,
    scenario?: FinancialScenario,
  ): Promise<Actions[K]> {
    if (child.exitCode !== null || child.stdin.destroyed)
      throw new Error("Processo fictício indisponível.");
    const id = String(++sequence),
      result = receive(id);
    child.stdin.write(JSON.stringify({ id, action, scenario }) + "\n");
    return (await result) as Actions[K];
  }
  async function finish() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        ended,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(
              new Error(
                "Processo fictício interrompido; limpeza não confirmada.",
              ),
            );
          }, 15000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function close() {
    try {
      if (child.exitCode === null) await command("close");
    } finally {
      child.stdin.end();
      if (child.exitCode === null) child.kill("SIGTERM");
      const code = await finish();
      if (code !== 0) throw new Error("Jornada fictícia terminou com falha.");
    }
  }
  try {
    const metadata = (await ready) as JourneyMetadata;
    return { metadata, command, close };
  } catch (error) {
    child.stdin.end();
    if (child.exitCode === null) child.kill("SIGTERM");
    await finish();
    throw error;
  }
}
