type Payment = { amount_cents: number; status: string; kind: string };
export function deliveryAccess(
  policy: string | null,
  status: string,
  total: number,
  payments: Payment[],
) {
  if (!["delivered", "completed"].includes(status)) return "review_pending";
  if (!["before_balance", "after_balance"].includes(policy ?? ""))
    return "policy_pending";
  if (policy === "before_balance") return "ready";
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("Valor do pedido inválido.");
  let paid = 0;
  for (const payment of payments)
    if (
      payment.status === "confirmed" &&
      ["deposit", "balance"].includes(payment.kind)
    ) {
      if (
        !Number.isSafeInteger(payment.amount_cents) ||
        payment.amount_cents < 1
      )
        throw new Error("Pagamento inválido.");
      paid += payment.amount_cents;
      if (!Number.isSafeInteger(paid)) throw new Error("Pagamento inválido.");
    }
  return paid >= total ? "ready" : "balance_pending";
}
export const deliveryAccessLabels = {
  ready: "Arquivos liberados para download.",
  policy_pending:
    "Entrega confirmada. A liberação dos arquivos aguarda a definição da regra de pagamento.",
  balance_pending:
    "Entrega confirmada. O download aguarda a confirmação do saldo.",
  review_pending: "Arquivos em revisão. O download do cliente está bloqueado.",
} as const;
export type DeliveryFile = {
  id: string;
  process_id: string;
  order_id: string | null;
  folder: string;
  upload_status: string;
  sha256: string | null;
  expected_sha256: string | null;
  mime: string;
  name: string;
  size_bytes: number;
};
export function deliveryFilesComplete(
  processId: string,
  orderId: string,
  selection: {
    calculationFile: string;
    pjcFile: string;
    reportFile: string;
    attachments: string[];
  },
  files: DeliveryFile[],
) {
  const ids = [
    selection.calculationFile,
    selection.pjcFile,
    selection.reportFile,
    ...selection.attachments,
  ];
  if (new Set(ids).size !== ids.length || files.length !== ids.length)
    return false;
  return ids.every((id) => {
    const f = files.find((file) => file.id === id);
    if (
      !f ||
      f.process_id !== processId ||
      (f.order_id !== null && f.order_id !== orderId) ||
      f.folder !== "deliverables" ||
      f.upload_status !== "uploaded" ||
      f.size_bytes < 1 ||
      !f.sha256 ||
      f.sha256 !== f.expected_sha256
    )
      return false;
    const name = f.name.toLowerCase();
    if (id === selection.pjcFile)
      return f.mime === "application/octet-stream" && name.endsWith(".pjc");
    if (id === selection.calculationFile || id === selection.reportFile)
      return f.mime === "application/pdf" && name.endsWith(".pdf");
    return (
      (f.mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
        name.endsWith(".docx")) ||
      (f.mime ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" &&
        name.endsWith(".xlsx"))
    );
  });
}
