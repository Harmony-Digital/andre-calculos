import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
  revalidate: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/modules/auth/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { attachUpdatePjc } from "./actions";
const orderId = "00000000-0000-4000-8000-000000000201",
  fileId = "00000000-0000-4000-8000-000000000501";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({
    select: () => ({ eq: () => ({ single: mocks.single }) }),
  });
  mocks.single.mockResolvedValue({ data: { revision: 10 }, error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});
it("vincula o PJC depois de revisar o checklist sem depender da revisão antiga da tela", async () => {
  expect(await attachUpdatePjc({ orderId, fileId })).toEqual({ success: true });
  expect(mocks.authorize).toHaveBeenCalledWith(["client"]);
  expect(mocks.rpc).toHaveBeenCalledWith("complete_calculation_update", {
    target_order: orderId,
    expected_revision: 10,
    source_file: fileId,
  });
});
it("pedido indisponível não é enviado à mutação", async () => {
  mocks.single.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
  expect(await attachUpdatePjc({ orderId, fileId })).toHaveProperty("error");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("alteração concorrente preserva o erro e não afirma vínculo confirmado", async () => {
  mocks.rpc.mockResolvedValue({ error: { code: "PT409" } });
  expect(await attachUpdatePjc({ orderId, fileId })).toHaveProperty("error");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
