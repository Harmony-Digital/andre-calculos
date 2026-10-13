import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { store, createStore } = vi.hoisted(() => {
  const store = {
    beginRun: vi.fn(),
    claim: vi.fn(),
    getReceipt: vi.fn(),
    getTransportResult: vi.fn(),
    simulate: vi.fn(),
    complete: vi.fn(),
  };
  return { store, createStore: vi.fn(() => store) };
});
vi.mock("server-only", () => ({}));
vi.mock("./notification-store", () => ({
  createLocalNotificationStore: createStore,
}));
import { processPending } from "./process-pending";
const runId = "00000000-0000-4000-8000-000000000001",
  requestId = "00000000-0000-4000-8000-000000000002",
  notificationId = "00000000-0000-4000-8000-000000000003";
const options = {
  runId,
  channel: "email" as const,
  limit: 1,
  targets: [notificationId],
  mode: "simulation" as const,
};
const base = { requestId, notificationId, mode: "simulation", attempt: 1 };
function receipt(status = "sent") {
  return { ...base, status, code: null };
}
function transport(outcome = "accepted") {
  return { ...base, status: "result", outcome };
}
beforeEach(() => {
  vi.resetAllMocks();
  createStore.mockReturnValue(store);
  store.beginRun.mockResolvedValue({
    ...options,
    requestIds: [requestId],
    schemaVersion: 1,
  });
  store.claim.mockResolvedValue({
    ...base,
    status: "reserved",
    message: {
      recipient: "destinatario-ficticio@exemplo.invalid",
      data: { sentinel: "conteudo-ficticio-sigiloso" },
    },
  });
  store.getReceipt.mockResolvedValue(null);
  store.getTransportResult.mockResolvedValue(null);
  store.simulate.mockResolvedValue(transport());
  store.complete.mockResolvedValue(receipt());
});
afterEach(() => vi.restoreAllMocks());
it("adaptador ausente ou desconhecido não cria cliente nem reserva", async () => {
  for (const mode of [undefined, "provider"])
    expect(
      await processPending({ ...options, mode: mode as "simulation" }),
    ).toMatchObject({ configured: false, paused: true, accepted: 0 });
  expect(createStore).not.toHaveBeenCalled();
});
it("reusa recibo efetivo sem simular, validar ou concluir novamente", async () => {
  store.getReceipt.mockResolvedValue(receipt());
  expect(await processPending(options)).toMatchObject({
    accepted: 1,
    paused: false,
  });
  expect(store.simulate).not.toHaveBeenCalled();
  expect(store.complete).not.toHaveBeenCalled();
  expect(store.getTransportResult).not.toHaveBeenCalled();
});
it("resposta perdida do transporte consulta prova persistida sem novo efeito", async () => {
  store.simulate.mockRejectedValue(new Error("sentinela privada fictícia"));
  store.getTransportResult
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(transport());
  expect(await processPending(options)).toMatchObject({
    accepted: 1,
    paused: false,
  });
  expect(store.simulate).toHaveBeenCalledTimes(1);
  expect(store.complete).toHaveBeenCalledWith(requestId, "accepted");
});
it("exceção sem resultado comprovado conclui unknown e interrompe", async () => {
  store.simulate.mockRejectedValue(new Error("sentinela privada fictícia"));
  store.complete.mockResolvedValue(receipt("held"));
  expect(await processPending(options)).toMatchObject({
    held: 1,
    accepted: 0,
    retryable: 0,
    paused: true,
  });
  expect(store.complete).toHaveBeenCalledWith(requestId, "unknown");
});
it("consulta indisponível interrompe sem inventar sucesso ou outro resultado", async () => {
  store.getTransportResult.mockRejectedValue(
    new Error("sentinela privada fictícia"),
  );
  expect(await processPending(options)).toMatchObject({
    accepted: 0,
    paused: true,
  });
  expect(store.simulate).not.toHaveBeenCalled();
  expect(store.complete).not.toHaveBeenCalled();
});
it.each(["retryable", "rejected", "unknown"])(
  "resultado %s persistido recupera a intenção original",
  async (outcome) => {
    store.getTransportResult.mockResolvedValue(transport(outcome));
    store.complete.mockResolvedValue(
      receipt(
        outcome === "retryable"
          ? "pending"
          : outcome === "rejected"
            ? "failed"
            : "held",
      ),
    );
    const result = await processPending(options);
    expect(
      result[
        outcome === "unknown" ? "held" : (outcome as "retryable" | "rejected")
      ],
    ).toBe(1);
    expect(store.complete).toHaveBeenCalledWith(requestId, outcome);
    expect(store.simulate).not.toHaveBeenCalled();
  },
);
it.each(["held", "cancelled"])(
  "aceitação convertida em %s conta o recibo efetivo",
  async (status) => {
    store.complete.mockResolvedValue(receipt(status));
    expect(await processPending(options)).toMatchObject({
      [status]: 1,
      accepted: 0,
    });
  },
);
it("transporte bloqueado relê recibo automático sem desfazer cancelamento", async () => {
  store.simulate.mockResolvedValue({
    status: "blocked",
    requestId,
    mode: "simulation",
  });
  store.getReceipt
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(receipt("cancelled"));
  expect(await processPending(options)).toMatchObject({
    cancelled: 1,
    accepted: 0,
    paused: false,
  });
  expect(store.complete).not.toHaveBeenCalled();
});
it("bloqueio sem recibo para o lote e deixa o mesmo request para retomada", async () => {
  store.simulate.mockResolvedValue({
    status: "blocked",
    requestId,
    mode: "simulation",
  });
  expect(await processPending(options)).toMatchObject({
    paused: true,
    accepted: 0,
    held: 0,
  });
  expect(store.complete).not.toHaveBeenCalled();
});
it("resposta perdida da conclusão para e retomada lê o recibo sem novo transporte", async () => {
  store.complete.mockRejectedValueOnce(new Error("sentinela privada fictícia"));
  expect(await processPending(options)).toMatchObject({
    accepted: 0,
    paused: true,
  });
  store.getReceipt.mockResolvedValue(receipt());
  expect(await processPending(options)).toMatchObject({
    accepted: 1,
    paused: false,
  });
  expect(store.simulate).toHaveBeenCalledTimes(1);
  expect(store.complete).toHaveBeenCalledTimes(1);
});
it.each(["receipt", "transport"])(
  "identidade %s divergente interrompe sem contar sucesso",
  async (kind) => {
    if (kind === "receipt")
      store.getReceipt.mockResolvedValue({
        ...receipt(),
        notificationId: runId,
      });
    else
      store.simulate.mockResolvedValue({
        ...transport(),
        notificationId: runId,
      });
    expect(await processPending(options)).toMatchObject({
      accepted: 0,
      paused: true,
    });
    expect(store.complete).not.toHaveBeenCalled();
  },
);
it("unknown para antes do segundo slot e só retorna contagens sem rede/logs", async () => {
  store.beginRun.mockResolvedValue({
    ...options,
    limit: 2,
    targets: [notificationId, runId],
    requestIds: [requestId, runId],
  });
  store.complete.mockResolvedValue(receipt("held"));
  const fetch = vi.spyOn(globalThis, "fetch"),
    log = vi.spyOn(console, "log"),
    error = vi.spyOn(console, "error"),
    warn = vi.spyOn(console, "warn");
  const result = await processPending({
    ...options,
    limit: 2,
    targets: [notificationId, runId],
  });
  expect(result).toMatchObject({ held: 1, paused: true });
  expect(store.claim).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toMatch(
    /sentinela|ficticio|notificationId|requestId|runId/,
  );
});
it("seleção global vazia termina o lote sem reclamar outro slot", async () => {
  store.beginRun.mockResolvedValue({
    ...options,
    targets: null,
    requestIds: [requestId, runId],
  });
  store.claim.mockResolvedValue({
    status: "empty",
    requestId,
    mode: "simulation",
  });
  expect(
    await processPending({ ...options, targets: undefined, limit: 2 }),
  ).toMatchObject({ empty: 1, paused: false });
  expect(store.claim).toHaveBeenCalledTimes(1);
  expect(store.simulate).not.toHaveBeenCalled();
});
