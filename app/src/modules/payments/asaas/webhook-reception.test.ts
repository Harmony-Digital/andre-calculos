import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  ASAAS_WEBHOOK_MAX_BYTES,
  AsaasWebhookReceptionError,
  readAuthenticatedAsaasWebhook,
  type AsaasWebhookConfiguration,
} from "./webhook-reception";
import { JsonNumber, parseAsaasJson } from "./json";
import { scopeSchema } from "./scope-data";
import { normalizeAsaasFinancialEvent } from "./financial";
const token = "ficticio-webhook-token-somente-teste-2026";
const config = {
  authToken: token,
  scope: scopeSchema.parse({
    provider: "asaas",
    environment: "sandbox",
    accountId: "acc_fixture",
  }),
} as const satisfies AsaasWebhookConfiguration;
const sample = {
  id: "evt_fixture&123",
  event: "PAYMENT_RECEIVED",
  dateCreated: "2026-10-12 10:00:00",
  account: { id: "acc_fixture" },
  payment: {
    id: "pay_fixture",
    customer: "cus_fixture",
    externalReference: "00000000-0000-4000-8000-000000000901",
    value: 125.01,
    netValue: 124.01,
    status: "RECEIVED",
    billingType: "PIX",
    dueDate: "2026-10-13",
    deleted: false,
    refunds: [],
  },
};
function request(body = JSON.stringify(sample), headers: HeadersInit = {}) {
  return new Request("https://example.test/api/webhooks/asaas", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "asaas-access-token": token,
      ...headers,
    },
    body,
  });
}
function streamed(chunks: Uint8Array[], headers: HeadersInit = {}) {
  return new Request("https://example.test/api/webhooks/asaas", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "asaas-access-token": token,
      ...headers,
    },
    body: new ReadableStream({
      pull(controller) {
        const next = chunks.shift();
        if (next) controller.enqueue(next);
        else controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
}
afterEach(() => vi.useRealTimers());
it("autentica pela configuração do servidor e conserva identidade sem confirmar dinheiro", async () => {
  const result = await readAuthenticatedAsaasWebhook(request(), config);
  expect(result).toMatchObject({
    eventId: sample.id,
    eventType: "PAYMENT_RECEIVED",
    paymentId: "pay_fixture",
    scope: config.scope,
    providerCreatedAt: sample.dateCreated,
  });
  expect(result.minimalBodyHash).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.scope)).toBe(true);
  expect(result).not.toHaveProperty("creditCents");
});
it.each([
  undefined,
  "outro-token-ficticio-com-tamanho-valido",
  token + "," + token,
])(
  "credencial ausente/incorreta/duplicada recusa antes de ler o corpo",
  async (actual) => {
    const incoming = request("corpo que não deve ser lido");
    if (actual === undefined) incoming.headers.delete("asaas-access-token");
    else incoming.headers.set("asaas-access-token", actual);
    const read = vi.spyOn(incoming.body!, "getReader");
    await expect(
      readAuthenticatedAsaasWebhook(incoming, config),
    ).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
      message: "Notificação financeira indisponível.",
    });
    expect(read).not.toHaveBeenCalled();
  },
);
it.each([
  null,
  { ...config, authToken: "curto" },
  { ...config, authToken: "x".repeat(256) },
  { ...config, authToken: token + " " },
])(
  "configuração inválida falha fechada sem ler dados",
  async (configuration) => {
    const incoming = request();
    const read = vi.spyOn(incoming.body!, "getReader");
    await expect(
      readAuthenticatedAsaasWebhook(incoming, configuration),
    ).rejects.toMatchObject({ code: "unavailable", status: 503 });
    expect(read).not.toHaveBeenCalled();
  },
);
it("outra conta é recusada mesmo com o token esperado", async () => {
  await expect(
    readAuthenticatedAsaasWebhook(
      request(JSON.stringify({ ...sample, account: { id: "outra_conta" } })),
      config,
    ),
  ).rejects.toMatchObject({ code: "identity_mismatch", status: 403 });
});
it("payload e URL não escolhem ambiente ou carteira", async () => {
  const incoming = request(
    JSON.stringify({
      ...sample,
      environment: "production",
      walletId: "outra_carteira",
    }),
  );
  const redirected = new Request(
    incoming.url + "?environment=production&accountId=outra_conta",
    incoming,
  );
  const result = await readAuthenticatedAsaasWebhook(redirected, config);
  expect(result.scope).toEqual(config.scope);
  expect(result.minimalBody).not.toContain("production");
  expect(result.minimalBody).not.toContain("outra_carteira");
});
it("descarta cartão, tokens, contatos e URLs em todos os níveis permitidos", async () => {
  const privateValue = "DADO_PRIVADO_FICTICIO";
  const incoming = request(
    JSON.stringify({
      ...sample,
      authToken: privateValue,
      account: { ...sample.account, ownerId: privateValue },
      payment: {
        ...sample.payment,
        creditCard: {
          creditCardToken: privateValue,
          creditCardNumber: privateValue,
        },
        invoiceUrl: privateValue,
        bankSlipUrl: privateValue,
        transactionReceiptUrl: privateValue,
        description: privateValue,
        email: privateValue,
        cpfCnpj: privateValue,
        refunds: [
          {
            value: 1.01,
            status: "DONE",
            dateCreated: "2026-10-12 10:01:00",
            transactionReceiptUrl: privateValue,
          },
        ],
        chargeback: {
          status: "IN_DISPUTE",
          reason: privateValue,
          fixtureProof: privateValue,
        },
      },
    }),
  );
  const result = await readAuthenticatedAsaasWebhook(incoming, config);
  expect(JSON.stringify(result)).not.toContain(privateValue);
  expect(JSON.stringify(result)).not.toContain(token);
  const body = parseAsaasJson(result.minimalBody) as typeof sample;
  expect(body.payment.refunds).toHaveLength(1);
  expect(result.sourceBodyHash).not.toBe(result.minimalBodyHash);
});
it("preserva decimal impossível de representar exatamente e presença missing/null/empty", async () => {
  const body = JSON.stringify(sample).replace(
    '"value":125.01',
    '"value":0.10000000000000001',
  );
  const result = await readAuthenticatedAsaasWebhook(request(body), config);
  const parsed = parseAsaasJson(result.minimalBody) as {
    payment: { value: JsonNumber };
  };
  expect(parsed.payment.value.source).toBe("0.10000000000000001");
  for (const extra of [{}, { refunds: null }, { refunds: [] }]) {
    const minimal = { ...sample, payment: { id: "pay_fixture", ...extra } };
    const received = await readAuthenticatedAsaasWebhook(
      request(JSON.stringify(minimal)),
      config,
    );
    const preserved = parseAsaasJson(received.minimalBody) as {
      payment: object;
    };
    expect(Object.hasOwn(preserved.payment, "refunds")).toBe(
      Object.hasOwn(extra, "refunds"),
    );
    if (Object.hasOwn(extra, "refunds"))
      expect(preserved.payment).toHaveProperty("refunds", extra.refunds);
  }
});
it("atributo e evento futuros são preservados somente no envelope financeiro necessário", async () => {
  const result = await readAuthenticatedAsaasWebhook(
    request(
      JSON.stringify({
        ...sample,
        event: "PAYMENT_FUTURE_EVENT",
        futureAttribute: { anything: true },
      }),
    ),
    config,
  );
  expect(result.eventType).toBe("PAYMENT_FUTURE_EVENT");
  expect(result.minimalBody).not.toContain("futureAttribute");
});
it.each([
  "{",
  '{"id":"primeiro","id":"segundo"}',
  JSON.stringify({ ...sample, dateCreated: "2026-02-30 10:00:00" }),
  JSON.stringify({
    ...sample,
    payment: { id: "pay_fixture", value: "segredo_ficticio" },
  }),
])(
  "JSON inválido, ambíguo ou campos incompatíveis não ecoam entrada",
  async (body) => {
    try {
      await readAuthenticatedAsaasWebhook(request(body), config);
      throw new Error("Entrada inválida foi aceita");
    } catch (error) {
      expect(error).toBeInstanceOf(AsaasWebhookReceptionError);
      expect(error).toMatchObject({ code: "invalid_body", status: 400 });
      expect((error as Error).message).not.toContain(body);
    }
  },
);
const unsupportedHeaders: Record<string, string>[] = [
  { "content-type": "text/plain" },
  { "content-type": "application/json; charset=latin1" },
  { "content-encoding": "gzip" },
];
it.each(unsupportedHeaders)(
  "conteúdo ou codificação não suportados não são lidos",
  async (headers) => {
    const incoming = request("corpo fictício", headers);
    const read = vi.spyOn(incoming.body!, "getReader");
    await expect(
      readAuthenticatedAsaasWebhook(incoming, config),
    ).rejects.toMatchObject({ code: "unsupported_media", status: 415 });
    expect(read).not.toHaveBeenCalled();
  },
);
it("limite é aplicado no stream sem confiar no tamanho declarado", async () => {
  const chunks = [new Uint8Array(ASAAS_WEBHOOK_MAX_BYTES), new Uint8Array(1)];
  await expect(
    readAuthenticatedAsaasWebhook(streamed(chunks), config),
  ).rejects.toMatchObject({ code: "too_large", status: 413 });
  const incoming = request("{}", {
    "content-length": String(ASAAS_WEBHOOK_MAX_BYTES + 1),
  });
  const read = vi.spyOn(incoming.body!, "getReader");
  await expect(
    readAuthenticatedAsaasWebhook(incoming, config),
  ).rejects.toMatchObject({ code: "too_large" });
  expect(read).not.toHaveBeenCalled();
});
it("UTF-8 fragmentado é decodificado sem perda e bytes inválidos são recusados", async () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ ...sample, ignored: "á" }),
  );
  const split = bytes.indexOf(0xc3) + 1;
  expect(
    (
      await readAuthenticatedAsaasWebhook(
        streamed([bytes.slice(0, split), bytes.slice(split)]),
        config,
      )
    ).eventId,
  ).toBe(sample.id);
  await expect(
    readAuthenticatedAsaasWebhook(streamed([new Uint8Array([0xff])]), config),
  ).rejects.toMatchObject({ code: "invalid_body" });
});
it.each(["-1", "abc", "01", "1"])(
  "content-length inválido ou divergente impede aceitação (%s)",
  async (length) => {
    await expect(
      readAuthenticatedAsaasWebhook(
        request(JSON.stringify(sample), { "content-length": length }),
        config,
      ),
    ).rejects.toMatchObject({ code: "invalid_body" });
  },
);
it("stream que não termina tem prazo limitado sem ecoar token ou corpo", async () => {
  vi.useFakeTimers();
  const incoming = new Request("https://example.test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "asaas-access-token": token,
    },
    body: new ReadableStream({ pull() {} }),
    duplex: "half",
  } as RequestInit);
  const result = expect(
    readAuthenticatedAsaasWebhook(incoming, config),
  ).rejects.toMatchObject({ code: "read_timeout", status: 408 });
  await vi.advanceTimersByTimeAsync(5001);
  await result;
});

it("corpo já ocupado ou falha do stream produz somente o erro sanitizado", async () => {
  const occupied = request();
  const reader = occupied.body!.getReader();
  await expect(
    readAuthenticatedAsaasWebhook(occupied, config),
  ).rejects.toMatchObject({
    code: "invalid_body",
    message: "Notificação financeira indisponível.",
  });
  reader.releaseLock();
  const incoming = request();
  vi.spyOn(incoming.body!, "getReader").mockImplementation(() => {
    throw new Error(token);
  });
  await expect(
    readAuthenticatedAsaasWebhook(incoming, config),
  ).rejects.toMatchObject({
    code: "invalid_body",
    message: "Notificação financeira indisponível.",
  });
});

it.each([
  {
    event: "PAYMENT_RECEIVED",
    status: "RECEIVED",
    refunds: [],
    chargeback: null,
  },
  {
    event: "PAYMENT_PARTIALLY_REFUNDED",
    status: "RECEIVED",
    refunds: [
      { value: 1.01, status: "DONE", dateCreated: "2026-10-12 10:01:00" },
    ],
    chargeback: null,
  },
  {
    event: "PAYMENT_REFUND_IN_PROGRESS",
    status: "REFUND_IN_PROGRESS",
    refunds: [
      { value: 1.01, status: "PENDING", dateCreated: "2026-10-12 10:01:00" },
    ],
    chargeback: null,
  },
  {
    event: "PAYMENT_CHARGEBACK_DISPUTE",
    status: "CHARGEBACK_DISPUTE",
    refunds: [],
    chargeback: { status: "IN_DISPUTE" },
  },
  {
    event: "PAYMENT_FUTURE_EVENT",
    status: "FUTURE_STATUS",
    refunds: null,
    chargeback: null,
  },
])(
  "projeção mínima conserva a interpretação financeira de $event",
  async (change) => {
    const body = JSON.stringify({
      ...sample,
      event: change.event,
      payment: {
        ...sample.payment,
        ...change,
        invoiceUrl: "https://sandbox.asaas.com/i/ficticio",
        description: "Descrição fictícia a descartar",
      },
    });
    const received = await readAuthenticatedAsaasWebhook(request(body), config);
    const expected = {
      scope: config.scope,
      phase: "observation",
      paymentId: "pay_fixture",
      customerId: "cus_fixture",
      reference: sample.payment.externalReference,
      contractedCents: 12501,
      billingType: "PIX",
      dueDate: sample.payment.dueDate,
    };
    expect(
      normalizeAsaasFinancialEvent(
        received.minimalBody,
        config.scope,
        expected,
      ),
    ).toEqual(normalizeAsaasFinancialEvent(body, config.scope, expected));
  },
);

it("moeda no limite seguro mantém o último centavo depois da sanitização", async () => {
  const body = JSON.stringify(sample)
    .replace('"value":125.01', '"value":90071992547409.91')
    .replace('"netValue":124.01', '"netValue":90071992547409.90');
  const received = await readAuthenticatedAsaasWebhook(request(body), config);
  const result = normalizeAsaasFinancialEvent(
    received.minimalBody,
    config.scope,
    {
      scope: config.scope,
      phase: "observation",
      paymentId: "pay_fixture",
      customerId: "cus_fixture",
      reference: sample.payment.externalReference,
      contractedCents: Number.MAX_SAFE_INTEGER,
      billingType: "PIX",
      dueDate: sample.payment.dueDate,
    },
  );
  expect(result.snapshot.amounts).toMatchObject({
    currentValueCents: Number.MAX_SAFE_INTEGER,
    netCents: Number.MAX_SAFE_INTEGER - 1,
    feeCents: 1,
  });
});

it("aceita o limite exato em bytes e charset UTF-8 entre aspas", async () => {
  const base = JSON.stringify({ ...sample, padding: "" });
  const body = base.replace(
    '"padding":""',
    '"padding":"' +
      "a".repeat(
        ASAAS_WEBHOOK_MAX_BYTES - new TextEncoder().encode(base).byteLength,
      ) +
      '"',
  );
  const result = await readAuthenticatedAsaasWebhook(
    request(body, {
      "content-type": 'application/json; charset="UTF-8"',
      "content-length": String(ASAAS_WEBHOOK_MAX_BYTES),
    }),
    config,
  );
  expect(result.eventId).toBe(sample.id);
  expect(result.minimalBody).not.toContain("padding");
});
