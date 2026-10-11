import { randomUUID } from "node:crypto";
import { mkdir, rmdir } from "node:fs/promises";
import { resolve } from "node:path";
import { localSystem } from "./local-helper";
import { createMessageProcess, removeMessageProcess } from "./messages-helper";

export async function leaseQueue() {
  localSystem();
  const root = resolve(process.cwd(), ".data"),
    lock = resolve(root, "queue-fixture-lock");
  await mkdir(root, { recursive: true });
  for (let attempt = 0; attempt < 1200; attempt++) {
    try {
      await mkdir(lock);
      return async () => {
        await rmdir(lock);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new Error("Outro ensaio está usando a fila fictícia.");
}
export async function queueFixture(
  rows: { status: string; due: string | null }[],
) {
  const process = await createMessageProcess(),
    db = localSystem();
  const orders = rows.map((row, i) => ({
    id: randomUUID(),
    process_id: process.id,
    client_id: process.clientId,
    status: row.status,
    internal_due_date: row.due,
    calc_type: ["initial", "liquidation", "challenge", "update"][i % 4],
    complexity: ["simple", "medium", "high"][i % 3],
    total_cents: 123456,
    deposit_cents: 61728,
  }));
  const inserted = await db
    .from("orders")
    .insert(orders)
    .select("id,code,status,internal_due_date");
  if (inserted.error) {
    await removeMessageProcess(process.id);
    throw new Error("Falha ao criar pedidos fictícios da fila.");
  }
  return {
    process,
    orders: inserted.data,
    cleanup: async () => {
      const check = await db
        .from("processes")
        .select("chamber")
        .eq("id", process.id)
        .single();
      if (check.error || check.data.chamber !== "Ensaio fictício de mensagens")
        throw new Error("Limpeza da fila limitada ao processo fictício.");
      await removeMessageProcess(process.id);
    },
  };
}
