import { randomUUID } from "node:crypto";
import { localSystem } from "./local-helper";
import { queueFixture } from "./queue-helper";
export async function createDeliveryFixture(seedFiles = true) {
  const fixture = await queueFixture([
      { status: "in_review", due: "2026-10-14" },
    ]),
    db = localSystem(),
    calculator = (
      await db.from("profiles").select("id").eq("role", "calculator").single()
    ).data!;
  const ids = Array.from({ length: 4 }, () => randomUUID());
  if (seedFiles) {
    const inserted = await db.from("files").insert(
      ids.map((id, i) => ({
        id,
        process_id: fixture.process.id,
        folder: "deliverables",
        uploaded_by: calculator.id,
        name: [
          "Calculo fictício.pdf",
          "Projeto fictício.pjc",
          "Parecer fictício.pdf",
          "Planilha fictícia.xlsx",
        ][i],
        mime:
          i === 1
            ? "application/octet-stream"
            : i === 3
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "application/pdf",
        path: `${calculator.id}/${fixture.process.id}/${id}/entrega-ficticia`,
        size_bytes: 100,
        sha256: "0".repeat(64),
        expected_sha256: "0".repeat(64),
        upload_status: "uploaded",
      })),
    );
    if (inserted.error) {
      await fixture.cleanup();
      throw new Error("Falha ao criar metadados fictícios de entrega.");
    }
  }
  return {
    ...fixture,
    ids,
    order: fixture.orders[0],
    input: (key = randomUUID(), patch: Record<string, unknown> = {}) => ({
      target_process: fixture.process.id,
      target_order: fixture.orders[0].id,
      request_id: key,
      payload: {
        calculationFile: ids[0],
        pjcFile: ids[1],
        reportFile: ids[2],
        attachments: [ids[3]],
        pjeVersion: " 2.13.1 ",
        indexMonth: "2026-10",
        liquidated: true,
        taxIdPresent: true,
        reviewed: true,
        ...patch,
      },
    }),
  };
}
export const deliveryProfessional = {
  technical_name: "Responsável fictício de entrega",
  crc_number: "000001/O-0",
  crc_state: "DF",
  crc_category: "Contador",
};
