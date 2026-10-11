import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { renderTransactionalEmail } from "./email";
import { emailTemplates } from "./email-content";
import { fictionalEmailBrand, fictionalEmailNotice } from "./email-fixtures";

it.each(emailTemplates)(
  "gera HTML e texto privados para %s sem transporte",
  async (template) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const result = await renderTransactionalEmail(
      {
        ...fictionalEmailNotice(template),
        data: {
          ...fictionalEmailNotice(template).data,
          message: "MENSAGEM_PRIVADA_SINTETICA",
          path: "https://example.invalid?token=privado",
        },
      },
      fictionalEmailBrand,
    );
    expect(result.html).toContain('lang="pt-BR"');
    expect(result.html).toContain("Abrir portal");
    expect(result.html).not.toMatch(
      /<img|<iframe|<script|@import|example\.invalid|token=|MENSAGEM_PRIVADA_SINTETICA/,
    );
    expect(result.text).toContain("André Modelo");
    expect(result.text).toContain("CRC DEMO-000000/O");
    expect(result.text).toContain("Contador");
    expect(result.text).toContain("dados fictícios");
    expect(result.text).not.toContain("MENSAGEM_PRIVADA_SINTETICA");
    expect(result.subject).not.toMatch(/[\r\n]/);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  },
);

it("renderiza a mesma entrada sem tempo, aleatoriedade ou efeito externo", async () => {
  const args = [
    fictionalEmailNotice("quote_accepted_client"),
    fictionalEmailBrand,
  ] as const;
  expect(await renderTransactionalEmail(...args)).toEqual(
    await renderTransactionalEmail(...args),
  );
});

it("identidade incompleta ou com injeção falha sem revelar campos", async () => {
  for (const identity of [
    {},
    { ...fictionalEmailBrand, technicalName: "" },
    { ...fictionalEmailBrand, name: "Marca\r\nBcc: segredo" },
    { ...fictionalEmailBrand, category: "<script>privado</script>" },
    { ...fictionalEmailBrand, crc: "DEMO-000000/O\nsegredo" },
    { ...fictionalEmailBrand, demonstration: "yes" },
  ])
    await expect(
      renderTransactionalEmail(fictionalEmailNotice("welcome"), identity),
    ).rejects.toThrow("Identificação do e-mail indisponível.");
});
