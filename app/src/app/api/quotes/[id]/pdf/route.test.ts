import { beforeEach, expect, it, vi } from "vitest";
const { exportQuote, render } = vi.hoisted(() => ({
  exportQuote: vi.fn(),
  render: vi.fn(),
}));
vi.mock("@/modules/quotes/queries", () => ({ getQuotePdfExport: exportQuote }));
vi.mock("@/modules/quotes/pdf", () => ({ renderQuotePdf: render }));
import { GET } from "./route";
const request = () =>
  new Request("http://127.0.0.1:3000/api/quotes/ficticio/pdf");
const context = { params: Promise.resolve({ id: "ficticio" }) };
beforeEach(() => vi.clearAllMocks());
it("nega acesso antes de renderizar sem revelar a proposta", async () => {
  exportQuote.mockResolvedValue({
    error: "Proposta não encontrada.",
    status: 404,
  });
  const response = await GET(request(), context);
  expect(response.status).toBe(404);
  expect(render).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("falha de renderização é recuperável e não expõe detalhes", async () => {
  exportQuote.mockResolvedValue({ data: { number: "ORC-2026-0001" } });
  render.mockRejectedValue(new Error("segredo que não pode sair"));
  const response = await GET(request(), context);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("segredo");
});
it("entrega PDF como arquivo privado sem nome fornecido pela requisição", async () => {
  exportQuote.mockResolvedValue({ data: { number: "ORC-2026-0001" } });
  render.mockResolvedValue(Buffer.from("%PDF-ficticio"));
  const response = await GET(request(), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toBe(
    'attachment; filename="proposta-ORC-2026-0001.pdf"',
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});
