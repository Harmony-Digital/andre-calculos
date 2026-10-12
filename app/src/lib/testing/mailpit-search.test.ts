import { describe, expect, it } from "vitest";
import { mailpitSearchIds } from "./mailpit-search";

const email = "destinatario-ficticio@exemplo.com";
const message = (ID = "mensagem_1", Address = email) => ({
  ID,
  To: [{ Address }],
});
const search = (messages: unknown[] = []) => ({
  total: 251,
  messages_count: messages.length,
  count: messages.length,
  start: 0,
  messages,
});

describe("busca local do Mailpit", () => {
  it("aceita busca vazia numa caixa com mais de cem mensagens", () => {
    expect(mailpitSearchIds(search(), email)).toEqual([]);
  });
  it("usa a contagem da busca e retorna somente o destinatário exato", () => {
    const value = search([
      message("alvo-1"),
      message("outro-2", "outro-ficticio@exemplo.com"),
      message("alvo-3"),
    ]);
    expect(mailpitSearchIds(value, email)).toEqual(["alvo-1", "alvo-3"]);
  });
  it("preserva a mensagem com vários destinatários quando o alvo está presente", () => {
    const value = search([
      {
        ID: "alvo",
        To: [{ Address: "outro@exemplo.com" }, { Address: email }],
      },
    ]);
    expect(mailpitSearchIds(value, email)).toEqual(["alvo"]);
  });
  it("aceita cem resultados completos e não exige o campo count não documentado", () => {
    const messages = Array.from({ length: 100 }, (_, i) =>
      message(`alvo-${i}`),
    );
    expect(
      mailpitSearchIds({ messages_count: 100, start: 0, messages }, email),
    ).toHaveLength(100);
  });
  it("recusa resultados acima do limite sem devolver uma lista parcial", () => {
    expect(() =>
      mailpitSearchIds({ ...search([message()]), messages_count: 101 }, email),
    ).toThrow("formato inválido");
    const messages = Array.from({ length: 101 }, (_, i) =>
      message(`alvo-${i}`),
    );
    expect(() => mailpitSearchIds(search(messages), email)).toThrow();
  });
  it("recusa página incompleta, deslocada ou com contagem contraditória", () => {
    for (const patch of [
      { messages_count: 2 },
      { messages_count: 0 },
      { count: 0 },
      { count: 2 },
      { start: 1 },
    ]) {
      expect(() =>
        mailpitSearchIds({ ...search([message()]), ...patch }, email),
      ).toThrow();
    }
  });
  it("recusa contagens ausentes, fracionárias, negativas e não numéricas", () => {
    for (const messages_count of [undefined, -1, 0.5, "1", NaN, Infinity]) {
      expect(() =>
        mailpitSearchIds({ ...search([message()]), messages_count }, email),
      ).toThrow("formato inválido");
    }
  });
  it("recusa IDs inseguros ou repetidos", () => {
    for (const ID of ["", "../outro", "com espaço", "alvo?query", "alvo\n"]) {
      expect(() => mailpitSearchIds(search([message(ID)]), email)).toThrow();
    }
    expect(() =>
      mailpitSearchIds(search([message(), message()]), email),
    ).toThrow("inconsistente");
  });
  it("não inclui mensagens sem alvo e recusa destinatários malformados", () => {
    expect(
      mailpitSearchIds(search([{ ID: "sem-destinatario", To: [] }]), email),
    ).toEqual([]);
    for (const To of [undefined, null, "incorreto", [{}], [{ Address: 123 }]]) {
      expect(() =>
        mailpitSearchIds(search([{ ID: "alvo", To }]), email),
      ).toThrow("formato inválido");
    }
  });
  it("recusa payload inválido sem incluir dados da resposta no erro", () => {
    for (const value of [null, {}, [], { ...search(), messages: null }]) {
      expect(() => mailpitSearchIds(value, email)).toThrow(
        "A busca fictícia local tem formato inválido.",
      );
    }
    expect(() =>
      mailpitSearchIds(
        { ...search(), HTML: "corpo-ficticio", start: 3 },
        email,
      ),
    ).toThrow("A busca fictícia local tem formato inválido.");
  });
});
