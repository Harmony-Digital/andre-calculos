import { expect, it } from "vitest";
import { encodeMessageCursor, messageCursor } from "./cursor";
it("cursor usa data e UUID para ordenar mensagens empatadas", () => {
  const value = {
    created_at: "2026-10-11T09:00:00-03:00",
    id: "00000000-0000-4000-8000-000000000101",
  };
  expect(messageCursor(encodeMessageCursor(value))).toEqual({
    date: value.created_at,
    id: value.id,
  });
  expect(messageCursor(undefined)).toBeNull();
  for (const input of [
    "qualquer",
    "2026-10-11~x",
    "2026-10-11T12:00:00Z~x",
    "2026-10-11T12:00:00Z~00000000-0000-4000-8000-000000000101~mais",
    "created_at.gt.0~id",
    "2026-10-11T12:00:00.1234567Z~00000000-0000-4000-8000-000000000101",
    "2026-10-11T12:00:00Z,id.gt.0~00000000-0000-4000-8000-000000000101",
  ])
    expect(() => messageCursor(input)).toThrow();
});
it("preserva os microssegundos da fronteira entre páginas", () => {
  const value = {
    created_at: "2026-10-11T12:00:00.123456+00:00",
    id: "00000000-0000-4000-8000-000000000101",
  };
  expect(messageCursor(encodeMessageCursor(value))?.date).toBe(
    value.created_at,
  );
});
