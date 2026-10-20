import { expect, it } from "vitest";
import {
  fileAuditHref,
  fileAuditIdentity,
  fileAuditPageSchema,
  parseFileAuditFilters,
} from "./audit";
const id = "a0000000-0000-4000-8000-000000000201";
it("normaliza nomes, identifica UUID e conserva o cursor com microssegundos", () => {
  const cursor = `2026-10-18T03:00:00.123456+00:00~${id}`;
  const result = parseFileAuditFilters({
    arquivo: "  PDF %_ fictício  ",
    autor: id,
    inicio: "2026-10-18",
    fim: "2026-10-18",
    depois: cursor,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error();
  expect(result.filters.arquivo).toBe("PDF %_ fictício");
  expect(result.before).toEqual({
    date: "2026-10-18T03:00:00.123456+00:00",
    id,
  });
  expect(fileAuditIdentity(id.toUpperCase())).toEqual({
    id,
    search: undefined,
  });
  expect(fileAuditIdentity(result.filters.arquivo).search).toBe(
    "PDF %_ fictício",
  );
});
it.each([
  { inicio: "2026-02-30" },
  { inicio: "2026-10-19", fim: "2026-10-18" },
  { acao: "upload_authorized" },
  { arquivo: "a".repeat(256) },
  { autor: [id, id] },
  { inicio: "1899-01-01" },
  { depois: "cursor-inválido" },
])("recusa filtro inválido: %j", (search) => {
  expect(parseFileAuditFilters(search).ok).toBe(false);
});
it("mantém os filtros em próxima página e reinicia o cursor ao mudar seleção", () => {
  const parsed = parseFileAuditFilters({
    arquivo: "Nome & versão.pdf",
    autor: id,
    inicio: "2026-10-18",
    fim: "2026-10-19",
    acao: "file_download",
    depois: `2026-10-18T03:00:00Z~${id}`,
  });
  if (!parsed.ok) throw new Error();
  const href = new URL(
    fileAuditHref(parsed.filters, "novo-cursor"),
    "http://localhost",
  );
  expect(Object.fromEntries(href.searchParams)).toEqual({
    arquivo: "Nome & versão.pdf",
    autor: id,
    inicio: "2026-10-18",
    fim: "2026-10-19",
    acao: "file_download",
    depois: "novo-cursor",
  });
  expect(fileAuditHref(parsed.filters)).not.toContain("depois");
});
it("nega DTO com caminho, IP, URL ou página incompleta", () => {
  const row = {
    id,
    created_at: "2026-10-18T03:00:00.123456+00:00",
    action: "file_view",
    actor_id: null,
    actor_name: null,
    file_id: id,
    file_name: null,
    file_version: null,
  };
  expect(
    fileAuditPageSchema.safeParse({ rows: [row], has_more: false }).success,
  ).toBe(true);
  for (const extra of [
    { path: "privado" },
    { ip: "127.0.0.1" },
    { signedUrl: "segredo" },
  ])
    expect(
      fileAuditPageSchema.safeParse({
        rows: [{ ...row, ...extra }],
        has_more: false,
      }).success,
    ).toBe(false);
  expect(
    fileAuditPageSchema.safeParse({ rows: [row], has_more: true }).success,
  ).toBe(false);
});
