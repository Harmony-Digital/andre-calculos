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
