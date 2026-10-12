import type { EmailBrand } from "./email-identity";
import type { EmailTemplate } from "./email-content";

export const fictionalEmailBrand: EmailBrand = {
  name: "Marco",
  technicalName: "André Modelo",
  crc: "DEMO-000000/O",
  category: "Contador",
  demonstration: true,
};
export const fictionalEmailData = {
  quote_id: "00000000-0000-4000-8000-000000000201",
  process_id: "00000000-0000-4000-8000-000000000202",
  code: "P-0001",
  number: "ORC-2026-0001",
  delivery_date: "2026-10-22",
  internal_due_date: "2026-10-23",
};
export function fictionalEmailNotice(template: EmailTemplate) {
  return { template, data: fictionalEmailData };
}
