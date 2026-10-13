import { authConfirmationVariable } from "../../src/modules/notifications/auth-email-templates";

const escapeAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

// Prévia do subconjunto fixo; não implementa nem testa o parser Go real.
export function renderAuthTemplateFixture(
  html: string,
  confirmationUrl: string,
) {
  const url = new URL(confirmationUrl);
  if (
    url.origin !== "https://auth.example.test" ||
    url.username ||
    url.password
  )
    throw new Error("A prévia aceita somente URL sintética.");
  const variables = html.match(/\{\{[\s\S]*?\}\}/g) ?? [];
  if (
    variables.length !== 2 ||
    variables.some((variable) => variable !== authConfirmationVariable)
  )
    throw new Error("Interpoladores inesperados na prévia.");
  return html.replaceAll(
    authConfirmationVariable,
    escapeAttribute(confirmationUrl),
  );
}

export function fictionalConfirmationUrl(next: string) {
  const redirect = new URL("https://portal.example.test/auth/callback");
  redirect.searchParams.set("next", next);
  return `https://auth.example.test/auth/v1/verify?token=DEMO_FICTICIO&type=email&redirect_to=${encodeURIComponent(redirect.href)}&label="teste"&extra=${"a".repeat(1200)}`;
}
