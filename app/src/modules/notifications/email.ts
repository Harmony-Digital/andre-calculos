import "server-only";
import { createElement } from "react";
import { render, toPlainText } from "react-email";
import { emailContent } from "./email-content";
import { emailBrandSchema } from "./email-identity";
import { TransactionalEmail } from "./email-view";

/** Gera somente HTML/texto; envio e aprovação de identidade são do adaptador. */
export async function renderTransactionalEmail(
  input: unknown,
  identity: unknown,
) {
  const parsed = emailBrandSchema.safeParse(identity);
  if (!parsed.success) throw new Error("Identificação do e-mail indisponível.");
  const content = emailContent(input);
  const html = await render(
    createElement(TransactionalEmail, { content, brand: parsed.data }),
  );
  return { subject: content.subject, html, text: toPlainText(html) };
}
