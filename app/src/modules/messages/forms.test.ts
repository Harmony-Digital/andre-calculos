import { expect, it } from "vitest";
import { messageSchema, parseMessage } from "./forms";
const input = {
  processId: "00000000-0000-4000-8000-000000000101",
  requestId: "00000000-0000-4000-8000-000000000102",
  body: "  Texto fictício\r\nSegunda linha.  ",
  attachments: [],
};
it("preserva linhas, normaliza CRLF e não interpreta HTML", () => {
  const parsed = messageSchema.parse(input);
  expect(parsed.body).toBe("Texto fictício\nSegunda linha.");
  expect(
    messageSchema.parse({ ...input, body: "<script>Texto fictício</script>" })
      .body,
  ).toContain("<script>");
});
it.each(["", " \n\r\t ", "x".repeat(10001)])(
  "recusa mensagem vazia ou grande",
  (body) => {
    expect(messageSchema.safeParse({ ...input, body }).success).toBe(false);
  },
);
it("recusa anexo duplicado, UUID inválido e quantidade excessiva", () => {
  for (const attachments of [
    [input.requestId, input.requestId],
    ["outro"],
    Array.from(
      { length: 11 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    ),
  ])
    expect(messageSchema.safeParse({ ...input, attachments }).success).toBe(
      false,
    );
});
it("lê anexos repetidos do FormData e recusa arquivo no lugar do texto", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries(input))
    if (typeof value === "string") form.set(key, value);
  form.append("attachments", input.requestId);
  expect(parseMessage(form).success).toBe(true);
  form.set("body", new Blob(["fictício"]), "teste.txt");
  expect(parseMessage(form).success).toBe(false);
});
