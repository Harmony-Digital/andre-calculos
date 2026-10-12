import { expect, it } from "vitest";
import {
  emailContent,
  emailPortalOrigin,
  emailTemplates,
} from "./email-content";
import { fictionalEmailData, fictionalEmailNotice } from "./email-fixtures";
import { notificationEvents } from "./preferences";

it("cobre nomes da fila atual e as famílias previstas sem usar papéis do payload", () => {
  for (const template of [
    ...Object.keys(notificationEvents),
    "quote_accepted_client",
    "delivery_ready",
  ])
    expect(emailContent({ template }).message).toBeTruthy();
  expect(emailContent(fictionalEmailNotice("quote_created")).href).toBe(
    `${emailPortalOrigin}/painel/orcamentos/${fictionalEmailData.quote_id}`,
  );
  expect(emailContent(fictionalEmailNotice("quote_created_client")).href).toBe(
    `${emailPortalOrigin}/app/orcamentos/${fictionalEmailData.quote_id}`,
  );
  expect(emailContent(fictionalEmailNotice("quote_accepted_client")).href).toBe(
    `${emailPortalOrigin}/app/orcamentos/${fictionalEmailData.quote_id}`,
  );
  expect(emailContent(fictionalEmailNotice("quote_accepted")).href).toBe(
    `${emailPortalOrigin}/painel/processos/${fictionalEmailData.process_id}`,
  );
  expect(emailContent(fictionalEmailNotice("delivery_ready")).href).toBe(
    `${emailPortalOrigin}/app/processos/${fictionalEmailData.process_id}`,
  );
  expect(
    emailContent({
      template: "new_message",
      data: { ...fictionalEmailData, role: "calculator", path: "/painel" },
    }).href,
  ).toBe(`${emailPortalOrigin}/entrar`);
});

it("não propaga dado sensível, endereço, HTML ou caminho arbitrário em nenhuma variante", () => {
  const privateValue = "CONTEUDO_PRIVADO_SINTETICO";
  for (const template of emailTemplates) {
    const content = emailContent({
      template,
      recipient: privateValue,
      data: {
        ...fictionalEmailData,
        name: privateValue,
        oab: privateValue,
        city: privateValue,
        message: privateValue,
        file: privateValue,
        amount_cents: 9988776655,
        path: `https://example.invalid/${privateValue}?token=secreto`,
        role: "admin",
        html: `<script>${privateValue}</script>`,
      },
    });
    expect(JSON.stringify(content)).not.toMatch(
      /CONTEUDO_PRIVADO_SINTETICO|9988776655|example\.invalid|token=|script/,
    );
    expect(new URL(content.href).origin).toBe(emailPortalOrigin);
    expect(new URL(content.href).search).toBe("");
  }
});

it("identificador malformado não entra no texto ou no link; referência válida não usa dado bruto", () => {
  for (const value of [
    "<img src=x onerror=alert(1)>",
    "../api/files/signed?token=secreto",
    "P-0001\nCopia: destino@example.invalid",
    "ORC-2026-0001<br>texto",
    1234,
  ]) {
    const content = emailContent({
      template: "quote_created",
      data: { code: value, number: value, quote_id: value },
    });
    expect(content.references).toEqual([]);
    expect(content.href).toBe(`${emailPortalOrigin}/painel`);
  }
  expect(emailContent(fictionalEmailNotice("new_signup")).references).toEqual(
    [],
  );
  expect(
    emailContent(fictionalEmailNotice("quote_created")).references,
  ).toEqual([
    { label: "Pedido", value: "P-0001" },
    { label: "Proposta", value: "ORC-2026-0001" },
  ]);
});

it("preserva data civil e distingue entrega prometida de prazo interno sem usar relógio do aviso", () => {
  const content = emailContent(fictionalEmailNotice("order_queued"));
  expect(content.references).toContainEqual({
    label: "Entrega prevista",
    value: "22/10/2026",
  });
  const fallback = emailContent({
    template: "order_queued",
    data: { internal_due_date: "2028-02-29", created_at: "2000-01-01" },
  });
  expect(fallback.references).toEqual([
    { label: "Prazo interno", value: "29/02/2028" },
  ]);
  for (const value of [
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-00-01",
    "2026-10-22T00:00:00Z",
    "22/10/2026",
    "2026-10-22\nprivado",
    null,
  ])
    expect(
      emailContent({
        template: "deadline_one_day",
        data: { internal_due_date: value },
      }).references,
    ).toEqual([]);
});

it("aviso envelhecido mantém só a data e entrega não promete bytes liberados", () => {
  for (const template of [
    "deadline_two_days",
    "deadline_one_day",
    "deadline_overdue",
  ] as const) {
    const content = emailContent(fictionalEmailNotice(template));
    expect(content.href).toBe(`${emailPortalOrigin}/painel/fila`);
    expect(content.references).toContainEqual({
      label: "Prazo interno",
      value: "23/10/2026",
    });
    expect(
      `${content.subject} ${content.heading} ${content.message}`,
    ).not.toMatch(/amanhã|faltam|atrasado|dois dias|um dia/i);
  }
  expect(
    emailContent(fictionalEmailNotice("delivery_ready")).message,
  ).not.toMatch(/liberado|baixe|quitado/i);
});

it("payload incompleto conserva rota autenticada e modelo desconhecido falha sem revelar entrada", () => {
  for (const template of emailTemplates)
    for (const data of [undefined, null, [], "payload", false])
      expect(emailContent({ template, data }).href).toMatch(
        /^https:\/\/project-rucji\.vercel\.app\/(app|painel|entrar)/,
      );
  for (const input of [null, {}, { template: "SEGREDO_SINTETICO" }])
    expect(() => emailContent(input)).toThrow(
      "Modelo de e-mail não reconhecido.",
    );
});
