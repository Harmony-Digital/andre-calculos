import { expect, it } from "vitest";
import { parseDelivery } from "./forms";
import {
  deliveryAccess,
  deliveryFilesComplete,
  type DeliveryFile,
} from "./delivery";
const ids = Array.from(
  { length: 5 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const selection = {
  calculationFile: ids[0],
  pjcFile: ids[1],
  reportFile: ids[2],
  attachments: [] as string[],
};
function form() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    ...selection,
    processId: ids[3],
    orderId: ids[4],
    requestId: ids[0],
    pjeVersion: " 2.13.1 ",
    indexMonth: "10/2026",
    liquidated: "on",
    taxIdPresent: "on",
    reviewed: "on",
  }))
    if (k !== "attachments") f.set(k, String(v));
  return f;
}
it("checklist exige confirmação explícita, versão/mês válidos e arquivos distintos", () => {
  const f = form();
  expect(parseDelivery(f).success).toBe(true);
  expect(parseDelivery(f).data?.indexMonth).toBe("2026-10");
  f.set("reviewed", "true");
  expect(parseDelivery(f).success).toBe(false);
  f.set("reviewed", "on");
  f.set("indexMonth", "13/2026");
  expect(parseDelivery(f).success).toBe(false);
  f.set("indexMonth", "10/2026");
  f.set("reportFile", ids[0]);
  expect(parseDelivery(f).success).toBe(false);
  f.set("reportFile", ids[2]);
  f.set("pjeVersion", "<script>");
  expect(parseDelivery(f).success).toBe(false);
});
it("liberação desconhecida bloqueia; sinal/triagem/contrato não substituem o saldo", () => {
  const p = (amount_cents: number, kind = "deposit", status = "confirmed") => ({
    amount_cents,
    kind,
    status,
  });
  for (const policy of [null, "unknown"])
    expect(deliveryAccess(policy, "delivered", 1000, [p(1000)])).toBe(
      "policy_pending",
    );
  expect(deliveryAccess("before_balance", "in_review", 1000, [])).toBe(
    "review_pending",
  );
  expect(deliveryAccess("before_balance", "delivered", 1000, [])).toBe("ready");
  expect(
    deliveryAccess("after_balance", "delivered", 1000, [
      p(500),
      p(1000, "triage"),
      p(500, "balance", "refunded"),
    ]),
  ).toBe("balance_pending");
  expect(
    deliveryAccess("after_balance", "delivered", 1000, [
      p(500),
      p(500, "balance"),
    ]),
  ).toBe("ready");
});
it("integridade, vínculo e tipos vêm dos metadados conferidos pelo servidor", () => {
  const files: DeliveryFile[] = ids.slice(0, 3).map((id, i) => ({
    id,
    process_id: ids[3],
    order_id: null,
    folder: "deliverables",
    upload_status: "uploaded",
    sha256: "0".repeat(64),
    expected_sha256: "0".repeat(64),
    mime: i === 1 ? "application/octet-stream" : "application/pdf",
    name: i === 1 ? "calc.pjc" : "ficticio.pdf",
    size_bytes: 10,
  }));
  expect(deliveryFilesComplete(ids[3], ids[4], selection, files)).toBe(true);
  for (const patch of [
    { upload_status: "pending" },
    { process_id: ids[0] },
    { order_id: ids[0] },
    { sha256: "1".repeat(64) },
    { folder: "case" },
    { mime: "text/plain" },
  ]) {
    expect(
      deliveryFilesComplete(ids[3], ids[4], selection, [
        { ...files[0], ...patch },
        ...files.slice(1),
      ]),
    ).toBe(false);
  }
});
