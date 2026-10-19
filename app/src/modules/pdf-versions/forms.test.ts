import { expect, it } from "vitest";
import { parseCorrespondences, parsePdfVersion } from "./forms";
const id = "a0000000-0000-4000-8000-000000000201";
function form(patch: Record<string, string | undefined> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    processId: id,
    requestId: id,
    fileId: id,
    revision: "0",
    operation: "register",
    pageCount: "4",
    previousFileId: "",
    confirmed: "yes",
    ...patch,
  }))
    if (v !== undefined) f.set(k, v);
  return f;
}
it("normaliza pares sem inferir correspondência por número, permitindo retirar confirmação", () => {
  expect(parseCorrespondences("3:1, 1:3, 0:2")).toEqual([
    { source: 3, target: 1 },
    { source: null, target: 2 },
    { source: 1, target: 3 },
  ]);
});
it.each(["1:1,1:2", "1:1,2:1", "-1:1", "1:0", "100001:1", "1:1;2:2", "1:1,"])(
  "recusa correspondência inválida %s",
  (v) => {
    expect(() => parseCorrespondences(v)).toThrow();
  },
);
it("registro exige conferência expressa e contagem válida; primeira versão tem predecessor nulo", () => {
  const result = parsePdfVersion(form());
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.payload).toEqual({
      operation: "register",
      fileId: id,
      revision: 0,
      pageCount: 4,
      previousFileId: null,
      confirmed: true,
    });
  for (const patch of [
    { confirmed: "" },
    { pageCount: "0" },
    { pageCount: "100001" },
    { revision: "1" },
  ])
    expect(parsePdfVersion(form(patch)).ok).toBe(false);
});
it("leitura limita expansão e mantém números canônicos", () => {
  const result = parsePdfVersion(
    form({
      operation: "read",
      revision: "2",
      pages: " 1 - 3 , 5 ",
      read: "no",
    }),
  );
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.payload).toEqual({
      operation: "read",
      fileId: id,
      revision: 2,
      pages: "1-3, 5",
      read: false,
    });
  expect(
    parsePdfVersion(
      form({ operation: "read", revision: "2", pages: "1-501", read: "yes" }),
    ).ok,
  ).toBe(false);
});
it("cópia exige a revisão explícita da referência e não aceita revisão inicial", () => {
  expect(
    parsePdfVersion(
      form({
        operation: "copy",
        revision: "1",
        entryId: id,
        entryRevision: "1",
      }),
    ).ok,
  ).toBe(true);
  expect(
    parsePdfVersion(
      form({
        operation: "copy",
        revision: "0",
        entryId: id,
        entryRevision: "1",
      }),
    ).ok,
  ).toBe(false);
});
