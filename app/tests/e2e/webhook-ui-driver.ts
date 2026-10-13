import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { z } from "zod";
import type { FinancialScenario } from "./financial-scenario-helper";
import type { webhookFinancialJourneyFixture } from "./webhook-financial-journey-helper";
import { independentCleanup } from "../../src/lib/testing/independent-cleanup";

type Fixture = Awaited<ReturnType<typeof webhookFinancialJourneyFixture>>;
export type WebhookUiAction =
  | "move"
  | "signalMove"
  | "receiveOnly"
  | "process"
  | "view"
  | "replay"
  | "prepareBalance"
  | "prepareSyntheticDelivery"
  | "close";
const metadataSchema = z.strictObject({
  processId: z.uuid(),
  orderId: z.uuid(),
  quoteId: z.uuid(),
  code: z.string().min(1),
  clientId: z.uuid(),
  calculatorId: z.uuid(),
  scopeId: z.uuid(),
  signalChargeId: z.uuid(),
  signalPaymentId: z.string().min(1),
});
type Actions = {
  move: Awaited<ReturnType<Fixture["move"]>>;
  signalMove: Awaited<ReturnType<Fixture["signalMove"]>>;
  receiveOnly: Awaited<ReturnType<Fixture["receive"]>>;
  process: Awaited<ReturnType<Fixture["process"]>>;
  view: ReturnType<Fixture["view"]>;
  replay: Awaited<ReturnType<Fixture["replay"]>> | null;
  prepareBalance: {
    chargeId: string;
    paymentId: string;
    intentId: string;
    requestId: string;
    contracted: number;
  };
  prepareSyntheticDelivery: string;
  close: string;
};

/** IPC apenas entre processos de teste locais; nenhum endpoint ou segredo na página. */
export async function webhookUiDriver(
  method = "PIX",
  options: { smoke?: boolean } = {},
) {
  if (!["PIX", "BOLETO", "CREDIT_CARD"].includes(method))
    throw new Error("Meio fictício inválido.");
  const child = spawn(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/e2e/webhook-ui-runner.ts",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ANDRE_WEBHOOK_UI_METHOD: method,
        ANDRE_WEBHOOK_UI_SMOKE: options.smoke ? "1" : "0",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<
    string,
    { resolve: (data: unknown) => void; reject: (error: Error) => void }
  >();
  let sequence = 0,
    closing: Promise<void> | undefined,
    exitSignal: NodeJS.Signals | null = null;
  const ended = new Promise<number | null>((resolve) => {
    child.on("error", () => resolve(1));
    child.on("exit", (code, signal) => {
      exitSignal = signal;
      resolve(code);
    });
  });
  child.stderr.resume();
  const rejectPending = () => {
    for (const p of pending.values())
      p.reject(new Error("Processo fictício indisponível."));
    pending.clear();
  };
  child.stdin.on("error", rejectPending);
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
  const envelope = z.strictObject({
    id: z.string().regex(/^(ready|[0-9]+)$/),
    ok: z.boolean(),
    data: z.unknown(),
  });
  lines.on("line", (line) => {
    if (!line.startsWith("ANDRE_WEBHOOK_UI ")) return;
    try {
      const message = envelope.parse(
        JSON.parse(line.slice("ANDRE_WEBHOOK_UI ".length)),
      );
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      if (message.ok) waiting.resolve(message.data);
      else waiting.reject(new Error("Operação fictícia não concluída."));
    } catch {
      rejectPending();
      child.kill("SIGTERM");
    }
  });
  void ended.then(() => {
    rejectPending();
    lines.close();
  });
  const finish = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const code = await Promise.race([
        ended,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("Limpeza do processo fictício não confirmada."));
          }, 15000);
        }),
      ]);
      if (code !== 0) {
        console.info(
          JSON.stringify({
            diagnostic: "webhook_ui_exit",
            code,
            signal: exitSignal,
          }),
        );
        throw new Error("Jornada fictícia terminou com falha.");
      }
    } finally {
      clearTimeout(timer);
    }
  };
  async function command<K extends WebhookUiAction>(
    action: K,
    scenario?: FinancialScenario,
  ): Promise<Actions[K]> {
    if (child.exitCode !== null || child.stdin.destroyed)
      throw new Error("Processo fictício indisponível.");
    const id = String(++sequence),
      response = receive(id);
    child.stdin.write(
      JSON.stringify({ id, action, ...(scenario ? { scenario } : {}) }) + "\n",
    );
    return (await response) as Actions[K];
  }
  const stop = async (graceful = false) => {
    if (!child.stdin.destroyed) child.stdin.end();
    // Depois do ACK, esperar o encerramento natural evita matar o processo
    // que já confirmou a limpeza. Erros de partida ainda interrompem o filho.
    if (!graceful && child.exitCode === null) child.kill("SIGTERM");
    await finish();
  };
  const close = () =>
    (closing ??= (async () => {
      let failed = false;
      try {
        if (child.exitCode === null && (await command("close")) !== "closed")
          throw new Error("Limpeza do processo fictício não confirmada.");
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        await independentCleanup(
          [{ name: "runner", run: () => stop(!failed) }],
          failed,
          (resources) =>
            console.info(
              JSON.stringify({
                diagnostic: "webhook_ui_cleanup",
                failed: resources,
              }),
            ),
        );
      }
    })());
  try {
    const metadata = metadataSchema.parse(await ready);
    return { metadata, command, close };
  } catch (error) {
    await independentCleanup(
      [{ name: "runner", run: () => stop() }],
      true,
      (resources) =>
        console.info(
          JSON.stringify({
            diagnostic: "webhook_ui_startup_cleanup",
            failed: resources,
          }),
        ),
    );
    throw error;
  }
}
