import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { rpc, client } = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: vi.fn(() => ({ rpc })) };
});
vi.mock("@/lib/supabase/admin", () => ({ createSystemClient: client }));
import {
  createFixtureLegacyOrigin,
  bindFixtureLegacyPayment,
  fixtureLegacyOriginReceiptSchema,
  fixtureLegacyBindingReceiptSchema,
} from "./legacy-binding";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const originInput = { observationId: id(1), requestId: id(2) };
const bindingInput = {
  originRequestId: id(2),
  applicationRequestId: id(3),
  requestId: id(4),
};
const origin = () => ({
  schemaVersion: 1,
  semantics: "legacy_origin_receipt",
  mode: "fixture",
  identityProof: "fixture_explicit_source",
  requestId: id(2),
  observationId: id(1),
  paymentId: id(5),
  chargeId: id(6),
  scopeId: id(7),
  intentId: id(8),
  orderId: id(9),
  clientId: id(10),
  phase: "deposit",
  executionOriginId: id(11),
  receiptId: id(12),
  amountCents: 12501,
  snapshot: {
    orderId: id(9),
    method: "asaas",
    kind: "deposit",
    status: "confirmed",
    amountCents: 12501,
    providerReference: "pay_fixture",
  },
  recordedAt: "2026-10-12T10:00:00-03:00",
});
const binding = () => ({
  schemaVersion: 1,
  semantics: "legacy_binding_receipt",
  mode: "fixture",
  identityProof: "fixture_explicit_source",
  ...bindingInput,
  observationId: id(1),
  paymentId: id(5),
  chargeId: id(6),
  scopeId: id(7),
  intentId: id(8),
  orderId: id(9),
  phase: "deposit",
  basisObservationId: id(13),
  positionRevision: 1,
  chargeRevision: 2,
  journalFingerprint: "a".repeat(64),
  boundAt: "2026-10-12T10:00:00-03:00",
  orderStatus: "awaiting_payment",
  projection: {
    schemaVersion: 1,
    semantics: "credit_projection",
    orderId: id(9),
    effects: "none",
    requiredDepositCents: 12501,
    totalCents: 25002,
    manualDepositCents: 0,
    manualTotalCents: 0,
    providerObservedDepositCents: 12501,
    providerObservedTotalCents: 12501,
    depositCreditCents: null,
    totalCreditCents: null,
    depositUncertain: true,
    uncertain: true,
    unsafeAmount: false,
    partial: null,
    remainingDepositCents: null,
    remainingTotalCents: null,
    depositExcessCents: null,
    totalExcessCents: null,
    unlinkedLegacyCount: 0,
    missingPositionCount: 0,
    pendingChargeCount: 1,
    conflictedChargeCount: 0,
  },
});
const cases = [
  {
    name: "origem",
    execute: createFixtureLegacyOrigin,
    input: originInput,
    receipt: origin,
    getter: "get_fixture_legacy_origin_receipt",
    writer: "create_fixture_legacy_origin",
    args: { target_observation: id(1), request_id: id(2) },
  },
  {
    name: "vínculo",
    execute: bindFixtureLegacyPayment,
    input: bindingInput,
    receipt: binding,
    getter: "get_fixture_legacy_binding_receipt",
    writer: "bind_fixture_legacy_payment",
    args: {
      target_origin: id(2),
      target_application: id(3),
      request_id: id(4),
    },
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  client.mockReturnValue({ rpc });
  vi.stubEnv("ANDRE_LOCAL_TESTS", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => vi.unstubAllEnvs());
for (const c of cases) {
  it.each([
    ["ANDRE_LOCAL_TESTS", "0"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"],
    ["VERCEL", "1"],
    ["VERCEL_ENV", "preview"],
    ["NODE_ENV", "production"],
  ])(`${c.name} recusa ambiente %s antes do cliente`, async (key, value) => {
    vi.stubEnv(key, value);
    await expect(c.execute(c.input)).rejects.toThrow(
      "Vínculo fictício do legado indisponível.",
    );
    expect(client).not.toHaveBeenCalled();
  });
  it.each(["scopeId", "amountCents", "position", "proof", "recipient"])(
    `${c.name} não aceita autoridade injetada em %s`,
    async (key) => {
      await expect(
        c.execute({ ...c.input, [key]: "injetado" }),
      ).rejects.toThrow();
      expect(client).not.toHaveBeenCalled();
    },
  );
  it(`${c.name} recupera replay sem nova escrita`, async () => {
    const receipt = c.receipt();
    rpc.mockResolvedValue({ data: receipt, error: null });
    expect(await c.execute(c.input)).toEqual(receipt);
    expect(rpc.mock.calls).toEqual([[c.getter, c.args]]);
  });
  it(`${c.name} envia somente IDs ao escritor`, async () => {
    const receipt = c.receipt();
    rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: receipt, error: null });
    expect(await c.execute(c.input)).toEqual(receipt);
    expect(rpc.mock.calls).toEqual([
      [c.getter, c.args],
      [c.writer, c.args],
    ]);
  });
  it(`${c.name} interrompe escrita após erro de leitura`, async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "segredo privado" },
    });
    await expect(c.execute(c.input)).rejects.toThrow(
      "Vínculo fictício do legado indisponível.",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it(`${c.name} confere ambiente novamente antes de escrever`, async () => {
    rpc.mockImplementationOnce(() => {
      vi.stubEnv("VERCEL", "1");
      return { data: null, error: null };
    });
    await expect(c.execute(c.input)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    `${c.name} recusa request divergente em replay=%s`,
    async (replay) => {
      const receipt = { ...c.receipt(), requestId: id(99) };
      if (!replay) rpc.mockResolvedValueOnce({ data: null, error: null });
      rpc.mockResolvedValueOnce({ data: receipt, error: null });
      await expect(c.execute(c.input)).rejects.toThrow();
    },
  );
}
it("origem confere observação e vínculo confere ambos os IDs da fonte", async () => {
  rpc.mockResolvedValueOnce({ data: { ...origin(), observationId: id(99) } });
  await expect(createFixtureLegacyOrigin(originInput)).rejects.toThrow();
  for (const key of ["originRequestId", "applicationRequestId"]) {
    rpc.mockResolvedValueOnce({ data: { ...binding(), [key]: id(99) } });
    await expect(bindFixtureLegacyPayment(bindingInput)).rejects.toThrow();
  }
});
it.each(["orderId", "kind", "amountCents", "providerReference"])(
  "snapshot de origem recusa %s incoerente",
  (key) => {
    const r = origin();
    expect(
      fixtureLegacyOriginReceiptSchema.safeParse({
        ...r,
        snapshot: {
          ...r.snapshot,
          [key]: {
            orderId: id(99),
            kind: "balance",
            amountCents: 1,
            providerReference: "https://privado",
          }[key],
        },
      }).success,
    ).toBe(false);
  },
);
it.each([0, -1, 1.01, Number.MAX_SAFE_INTEGER + 1])(
  "origem recusa bruto inseguro %s",
  (amountCents) => {
    const r = origin();
    expect(
      fixtureLegacyOriginReceiptSchema.safeParse({
        ...r,
        amountCents,
        snapshot: { ...r.snapshot, amountCents },
      }).success,
    ).toBe(false);
  },
);
it("vínculo conserva crédito UNKNOWN e recusa zero inventado", () => {
  const r = binding();
  expect(
    fixtureLegacyBindingReceiptSchema.parse(r).projection.depositCreditCents,
  ).toBeNull();
  expect(
    fixtureLegacyBindingReceiptSchema.safeParse({
      ...r,
      projection: { ...r.projection, depositCreditCents: 0 },
    }).success,
  ).toBe(false);
});
it.each([
  { positionRevision: 0 },
  { chargeRevision: -1 },
  { journalFingerprint: "invalid" },
  { projection: { ...binding().projection, orderId: id(99) } },
])("vínculo rejeita fence/projeção divergente %j", (patch) => {
  expect(
    fixtureLegacyBindingReceiptSchema.safeParse({ ...binding(), ...patch })
      .success,
  ).toBe(false);
});
it("recibos de origem/vínculo são distintos e não admitem dados brutos", () => {
  expect(fixtureLegacyOriginReceiptSchema.safeParse(binding()).success).toBe(
    false,
  );
  expect(fixtureLegacyBindingReceiptSchema.safeParse(origin()).success).toBe(
    false,
  );
  expect(
    fixtureLegacyOriginReceiptSchema.safeParse({
      ...origin(),
      bodyText: "privado",
    }).success,
  ).toBe(false);
  expect(
    fixtureLegacyBindingReceiptSchema.safeParse({
      ...binding(),
      invoiceUrl: "https://privado",
    }).success,
  ).toBe(false);
});
