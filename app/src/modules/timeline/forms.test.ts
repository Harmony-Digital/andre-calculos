import { expect, it } from "vitest";
import { parseNote, noteSchema } from "./forms";
import { eventFilter, eventLabel, noteText } from "./types";
const ids = {
  processId: "00000000-0000-4000-8000-000000000101",
  requestId: "00000000-0000-4000-8000-000000000102",
};
it("nota normaliza o texto e recusa vazio, excesso ou identificador inválido", () => {
  expect(
    noteSchema.parse({ ...ids, body: " \tNota\r\nFictícia\u00a0" }).body,
  ).toBe("Nota\nFictícia");
  for (const body of ["\t\u2003", "x".repeat(2001)])
    expect(noteSchema.safeParse({ ...ids, body }).success).toBe(false);
  expect(
    noteSchema.safeParse({ ...ids, requestId: "inválido", body: "Nota" })
      .success,
  ).toBe(false);
  const form = new FormData();
  Object.entries({ ...ids, body: "Nota" }).forEach(([key, value]) =>
    form.set(key, value),
  );
  expect(parseNote(form).success).toBe(true);
  form.set("body", new Blob(["Arquivo"]));
  expect(parseNote(form).success).toBe(false);
});
it("filtro aceita só os tipos declarados e não interpreta HTML das notas", () => {
  expect(eventFilter(undefined)).toBeNull();
  expect(eventFilter("todos")).toBeNull();
  expect(eventFilter("note_added")).toBe("note_added");
  for (const value of ["kind.eq.1", "__proto__", "constructor"])
    expect(() => eventFilter(value)).toThrow();
  expect(eventLabel("checklist_draft_saved")).toBe("Checklist salvo");
  expect(eventLabel("desconhecido")).toBe("Atividade registrada");
  expect(noteText({ note: "<script>texto</script>" })).toBe(
    "<script>texto</script>",
  );
  expect(noteText({ note: 1 })).toBeNull();
  expect(noteText(null)).toBeNull();
});
