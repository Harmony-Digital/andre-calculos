import { it, expect } from "vitest";
import {
  effectivePreferences,
  parsePreference,
  notificationEvents,
} from "./preferences";
it("expõe todos os eventos com e-mail ligado e WhatsApp desligado, respeitando a escolha explícita", () => {
  const defaults = effectivePreferences([]);
  expect(defaults).toHaveLength(Object.keys(notificationEvents).length * 2);
  expect(
    defaults
      .filter((p) => p.channel === "email")
      .every((p) => p.enabled && p.revision === 0),
  ).toBe(true);
  expect(
    defaults
      .filter((p) => p.channel === "whatsapp")
      .every((p) => !p.enabled && p.revision === 0),
  ).toBe(true);
  expect(
    effectivePreferences([
      { event: "new_message", channel: "email", enabled: false, revision: 3 },
      { event: "new_message", channel: "whatsapp", enabled: true, revision: 2 },
      {
        event: "delivery_ready",
        channel: "email",
        enabled: false,
        revision: 7,
      },
    ]).filter((p) => p.event === "new_message"),
  ).toEqual([
    { event: "new_message", channel: "email", enabled: false, revision: 3 },
    { event: "new_message", channel: "whatsapp", enabled: true, revision: 2 },
  ]);
});
it("o parser exige evento/canal/valor explícitos, revisão inteira e identificador de tentativa", () => {
  const base = {
    event: "new_message",
    channel: "email",
    enabled: "no",
    revision: "0",
    requestId: "00000000-0000-4000-8000-000000000001",
  };
  const form = (data: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(data)) f.set(k, v);
    return f;
  };
  expect(parsePreference(form(base)).data?.enabled).toBe(false);
  expect(
    parsePreference(form({ ...base, enabled: "yes", revision: "2147483646" }))
      .data?.enabled,
  ).toBe(true);
  for (const patch of [
    { event: "delivery_ready" },
    { channel: "sms" },
    { enabled: "true" },
    { revision: "" },
    { revision: "1.5" },
    { revision: "-1" },
    { revision: "2147483647" },
    { requestId: "" },
  ])
    expect(parsePreference(form({ ...base, ...patch })).success).toBe(false);
});
