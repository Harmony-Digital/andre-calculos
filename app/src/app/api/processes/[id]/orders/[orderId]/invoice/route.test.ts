import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), invoice: vi.fn() }));
vi.mock("@/modules/auth/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/modules/payments/invoice-page-data", () => ({
  getInvoicePage: async (...args: unknown[]) => ({
    invoice: await mocks.invoice(...args),
    orderCode: "PED-FICTICIO",
  }),
}));
vi.mock("@/modules/auth/origin", () => ({
  portalOrigin: () => "http://127.0.0.1:3000",
}));
import { GET } from "./route";
const id = "a0000000-0000-4000-8000-000000000001",
  orderId = "b0000000-0000-4000-8000-000000000002";
const request = () =>
  GET(
    new NextRequest(
      `http://127.0.0.1:3000/api/processes/${id}/orders/${orderId}/invoice?url=https%3A%2F%2Fexterno.example`,
    ),
    { params: Promise.resolve({ id, orderId }) },
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ profile: { role: "client" } });
  mocks.invoice.mockResolvedValue({
    processId: id,
    orderId,
    state: "active",
    invoiceUrl: "https://sandbox.asaas.com/i/ficticio",
  });
});
function privateResponse(r: Response) {
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
}
it("clique reconfere cobrança atual e ignora destino fornecido pelo navegador", async () => {
  const r = await request();
  expect(r.status).toBe(303);
  privateResponse(r);
  expect(r.headers.get("location")).toBe(
    "https://sandbox.asaas.com/i/ficticio",
  );
  expect(mocks.invoice).toHaveBeenCalledWith(orderId, id);
});
it.each(["paid", "blocked", "uncertain"])(
  "estado %s retorna à consulta sem URL antiga",
  async (state) => {
    mocks.invoice.mockResolvedValue({
      processId: id,
      orderId,
      state,
      invoiceUrl: null,
    });
    const r = await request();
    expect(r.status).toBe(303);
    privateResponse(r);
    expect(r.headers.get("location")).toBe(
      `http://127.0.0.1:3000/app/processos/${id}/fatura?pedido=${orderId}&aviso=atualizada`,
    );
  },
);
it("calculista volta à consulta do painel quando pagamento mudou", async () => {
  mocks.authorize.mockResolvedValue({ profile: { role: "calculator" } });
  mocks.invoice.mockResolvedValue({
    processId: id,
    orderId,
    state: "paid",
    invoiceUrl: null,
  });
  expect((await request()).headers.get("location")).toContain(
    `/painel/processos/${id}/fatura`,
  );
});
it("sessão negada não consulta nem revela fatura", async () => {
  mocks.authorize.mockRejectedValue(new Error("Não autorizado"));
  const r = await request();
  expect(r.status).toBe(404);
  privateResponse(r);
  expect(r.headers.get("location")).toBeNull();
  expect(mocks.invoice).not.toHaveBeenCalled();
});
it("mudança durante espera ou falha de auditoria não retorna URL", async () => {
  mocks.invoice.mockRejectedValue(new Error("Fatura atualizada"));
  const r = await request();
  expect(r.status).toBe(404);
  privateResponse(r);
  expect(r.headers.get("location")).toBeNull();
});
