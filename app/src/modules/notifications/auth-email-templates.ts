import { createElement } from "react";
import { render } from "react-email";
import { TransactionalEmail } from "./email-view";
import { fictionalEmailBrand } from "./email-fixtures";
import { emailBrandSchema } from "./email-identity";

// Artefatos de preparo; não configura Auth, consulta banco ou envia mensagens.
export const authConfirmationVariable = "{{ .ConfirmationURL }}";
export const authTemplateDefinitions = [
  {
    name: "confirmation",
    subject: "Confirme seu cadastro no portal Marco",
    heading: "Confirme seu cadastro",
    message:
      "Confirme seu endereço de e-mail para concluir a criação da sua conta no portal.",
    action: "Confirmar cadastro",
    next: "/app",
  },
  {
    name: "magic_link",
    subject: "Seu link de acesso ao portal Marco",
    heading: "Acesse sua conta",
    message:
      "Você solicitou um link para entrar no portal. Use o botão para continuar o acesso.",
    action: "Acessar minha conta",
    next: "/app",
  },
  {
    name: "recovery",
    subject: "Redefina sua senha no portal Marco",
    heading: "Escolha uma nova senha",
    message:
      "Você solicitou a recuperação do acesso. Use o botão para escolher uma nova senha. Sua senha ainda não foi alterada.",
    action: "Escolher nova senha",
    next: "/nova-senha",
  },
] as const;

export async function prepareAuthEmailTemplates() {
  const brand = emailBrandSchema.parse(fictionalEmailBrand);
  return Promise.all(
    authTemplateDefinitions.map(async (definition) => ({
      ...definition,
      htmlFile: `${definition.name}.html`,
      html: `${await render(
        createElement(TransactionalEmail, {
          brand,
          content: {
            subject: definition.subject,
            label: "Acesso à sua conta",
            heading: definition.heading,
            message: definition.message,
            references: [],
            href: authConfirmationVariable,
          },
          actionLabel: definition.action,
          guidance:
            "Abra o link no mesmo navegador e dispositivo em que fez a solicitação. Se não foi você, ignore esta mensagem.",
          alternativeLinkLabel: "Continuar pelo link alternativo",
        }),
      )}\n`,
    })),
  );
}

export function authEmailManifest(
  templates: Awaited<ReturnType<typeof prepareAuthEmailTemplates>>,
) {
  return {
    schemaVersion: 1,
    demonstration: true,
    templates: templates.map(({ name, subject, htmlFile, action, next }) => ({
      name,
      subject,
      htmlFile,
      action,
      expectedDestination: next,
    })),
  };
}
