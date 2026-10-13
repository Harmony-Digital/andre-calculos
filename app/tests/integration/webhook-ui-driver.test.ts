import { expect, it } from "vitest";
import { webhookUiDriver } from "../e2e/webhook-ui-driver";

it.each(["PIX", "BOLETO", "CREDIT_CARD"])(
  "%s: driver recebe sinal e saldo pelo mesmo worker sem ledger paralelo",
  async (method) => {
    const driver = await webhookUiDriver(method, { smoke: true });
    try {
      const before = await driver.command("view");
      await expect(driver.command("prepareBalance")).rejects.toThrow(
        "Operação fictícia não concluída.",
      );
      expect((await driver.command("view")).totalPosts).toBe(1);
      expect((await driver.command("move", "received")).report.complete).toBe(
        1,
      );
      expect((await driver.command("view")).projection).toMatchObject({
        depositCreditCents: 12501,
        totalCreditCents: 12501,
        manualDepositCents: 0,
      });
      await driver.command("prepareSyntheticDelivery");
      const balance = await driver.command("prepareBalance");
      expect(balance.contracted).toBe(12500);
      expect(await driver.command("prepareBalance")).toEqual(balance);
      const state = await driver.command("view");
      expect(state).toMatchObject({
        phase: "balance",
        totalPosts: 2,
        posts: 1,
        publicPayments: 0,
        legacyOrigins: 0,
        legacyBindings: 0,
      });
      expect(state.target.chargeId).not.toBe(driver.metadata.signalChargeId);
      expect((await driver.command("move", "received")).report.complete).toBe(
        1,
      );
      const paid = await driver.command("view");
      expect(paid.projection).toMatchObject({
        depositCreditCents: 12501,
        totalCreditCents: 25001,
        remainingTotalCents: 0,
      });
      expect(paid.gets).toBe(before.gets + 2);
      const receipt = await driver.command("replay");
      expect(receipt?.chargeId).toBe(balance.chargeId);
      expect(await driver.command("view")).toEqual(paid);
      expect((await driver.command("signalReplay"))?.chargeId).toBe(
        driver.metadata.signalChargeId,
      );
      expect(await driver.command("view")).toEqual(paid);
      expect((await driver.command("receiveOnly", "unknown")).queueState).toBe(
        "pending",
      );
      expect(
        (await driver.command("view")).projection.totalCreditCents,
      ).toBeNull();
      expect((await driver.command("process")).complete).toBe(1);
      await driver.command("move", "current");
      expect((await driver.command("view")).projection.totalCreditCents).toBe(
        25001,
      );
    } finally {
      await driver.close();
    }
    await driver.close();
  },
  60000,
);

it("driver recusa preparo sintético no modo de telas e continua após comando inválido", async () => {
  const driver = await webhookUiDriver();
  try {
    await expect(driver.command("prepareSyntheticDelivery")).rejects.toThrow(
      "Operação fictícia não concluída.",
    );
    await expect(driver.command("invalid" as never)).rejects.toThrow(
      "Operação fictícia não concluída.",
    );
    await expect(driver.command("move", "invalid" as never)).rejects.toThrow(
      "Operação fictícia não concluída.",
    );
    expect((await driver.command("view")).totalPosts).toBe(1);
  } finally {
    await driver.close();
  }
}, 60000);

it("driver recusa meio fora da lista antes de abrir processo", async () => {
  await expect(webhookUiDriver("UNDEFINED")).rejects.toThrow(
    "Meio fictício inválido.",
  );
});

it.each(["simulation", "no_context"] as const)(
  "driver prepara proposta negativa %s e recusa referência incompatível",
  async (kind) => {
    const driver = await webhookUiDriver();
    try {
      const action =
        kind === "simulation" ? "prepareSimulation" : "prepareNoContext";
      const quote = await driver.command(action);
      expect(quote.simulation).toBe(kind === "simulation");
      expect(quote.orderId).not.toBe(driver.metadata.orderId);
      expect(await driver.command(action)).toEqual(quote);
      const before = await driver.command("view");
      const result = await driver.command(
        kind === "simulation" ? "mismatchSimulation" : "mismatchNoContext",
      );
      expect(result.report).toMatchObject({
        complete: 0,
        quarantined: 1,
        failed: 0,
      });
      const after = await driver.command("view");
      expect(after.projection).toEqual(before.projection);
      expect(after).toMatchObject({
        publicPayments: 0,
        legacyOrigins: 0,
        legacyBindings: 0,
        totalPosts: 1,
      });
    } finally {
      await driver.close();
    }
  },
  60000,
);
