import { afterEach, beforeEach, it, expect, vi } from "vitest";
const { rpc, client } = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: vi.fn(() => ({ rpc })) };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSystemClient: client }));
import { createLocalNotificationStore } from "./notification-store";
const requestId = "00000000-0000-4000-8000-000000000001";
const notificationId = "00000000-0000-4000-8000-000000000002";
const reservation = () => ({
  status: "reserved",
  requestId,
  notificationId,
  mode: "simulation",
  attempt: 1,
  expiresAt: "2026-10-11T21:00:00+00:00",
  message: {
    id: notificationId,
    channel: "email",
    recipient: "ficticio@exemplo.invalid",
    template: "order_queued",
    data: {},
    schemaVersion: 1,
    idempotencyKey: `notification:${notificationId}`,
    snapshotHash: "a".repeat(64),
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANDRE_LOCAL_TESTS", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VERCEL_ENV", "");
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  ["ANDRE_LOCAL_TESTS", ""],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://qtofwbxujshroaafxowr.supabase.co"],
  ["NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54322"],
  ["VERCEL_ENV", "preview"],
  ["VERCEL_ENV", "production"],
])("recusa %s=%s antes de criar qualquer cliente", (key, value) => {
  vi.stubEnv(key, value);
  expect(() => createLocalNotificationStore()).toThrow(
    "somente no banco local",
  );
  expect(client).not.toHaveBeenCalled();
});
it("não aceita UUID, canal ou resultado inválido e não consulta o banco", async () => {
  const store = createLocalNotificationStore();
  await expect(store.claim("invalid", "email")).rejects.toThrow("inválida");
  await expect(store.claim(requestId, "invalid" as "email")).rejects.toThrow(
    "inválida",
  );
  await expect(store.claim(requestId, "email", "invalid")).rejects.toThrow(
    "inválida",
  );
  await expect(store.validate("invalid")).rejects.toThrow("inválida");
  await expect(
    store.complete(requestId, "invalid" as "accepted"),
  ).rejects.toThrow("inválido");
  expect(rpc).not.toHaveBeenCalled();
});
it("reserva validada mantém identidade e não aceita modo de provedor", async () => {
  const store = createLocalNotificationStore();
  rpc.mockResolvedValueOnce({ data: reservation(), error: null });
  expect(await store.claim(requestId, "email", notificationId)).toEqual(
    reservation(),
  );
  expect(rpc).toHaveBeenLastCalledWith("claim_notification_local_system", {
    request_id: requestId,
    channel: "email",
    target_notification: notificationId,
  });
  rpc.mockResolvedValueOnce({
    data: { ...reservation(), mode: "provider" },
    error: null,
  });
  await expect(store.claim(requestId, "email")).rejects.toThrow(
    "Reserva não confirmada",
  );
});
it.each(["request", "message", "channel", "key", "target"])(
  "recusa identidade divergente: %s",
  async (field) => {
    const data = reservation();
    if (field === "request") data.requestId = notificationId;
    if (field === "message") data.message.id = requestId;
    if (field === "channel") data.message.channel = "whatsapp";
    if (field === "key")
      data.message.idempotencyKey = `notification:${requestId}`;
    rpc.mockResolvedValue({ data, error: null });
    await expect(
      createLocalNotificationStore().claim(
        requestId,
        "email",
        field === "target" ? requestId : notificationId,
      ),
    ).rejects.toThrow();
  },
);
it("resultado bloqueado também exige identidade do alvo solicitado", async () => {
  const store = createLocalNotificationStore();
  const held = {
    status: "held",
    requestId,
    notificationId,
    mode: "simulation",
  };
  rpc.mockResolvedValue({ data: held, error: null });
  expect(await store.claim(requestId, "email", notificationId)).toEqual(held);
  await expect(store.claim(requestId, "email", requestId)).rejects.toThrow(
    "Reserva com identidade indisponível",
  );
});
it("resultado e validação usam recibos da simulação e não recebem relógio externo", async () => {
  const store = createLocalNotificationStore();
  rpc.mockResolvedValueOnce({ data: true, error: null });
  expect(await store.validate(requestId)).toBe(true);
  expect(rpc).toHaveBeenLastCalledWith("validate_notification_local_claim", {
    request_id: requestId,
  });
  const receipt = {
    status: "held",
    requestId,
    notificationId,
    attempt: 1,
    mode: "simulation",
    code: "dispatch_outcome_unknown",
  };
  rpc.mockResolvedValueOnce({ data: receipt, error: null });
  expect(await store.complete(requestId, "accepted")).toEqual(receipt);
  expect(rpc).toHaveBeenLastCalledWith("complete_notification_local_system", {
    request_id: requestId,
    outcome: "accepted",
  });
  rpc.mockResolvedValueOnce({
    data: { ...receipt, requestId: notificationId },
    error: null,
  });
  await expect(store.complete(requestId, "accepted")).rejects.toThrow(
    "Resultado não confirmado",
  );
  rpc.mockResolvedValueOnce({ data: "true", error: null });
  await expect(store.validate(requestId)).rejects.toThrow(
    "Reserva não confirmada",
  );
});
it.each(["returned", "thrown"])(
  "%s não expõe conteúdo de erros e orienta repetir o mesmo nonce",
  async (kind) => {
    const store = createLocalNotificationStore();
    const raw =
      "erro sintético com destinatario-ficticio@exemplo.invalid e conteúdo privado fictício";
    if (kind === "returned")
      rpc.mockResolvedValue({ data: null, error: { message: raw } });
    else rpc.mockRejectedValue(new Error(raw));
    const calls = [
      store.claim(requestId, "email"),
      store.validate(requestId),
      store.complete(requestId, "accepted"),
    ];
    for (const call of calls) {
      await expect(call).rejects.toThrow("não confirmad");
      await expect(call).rejects.not.toThrow(raw);
    }
  },
);
