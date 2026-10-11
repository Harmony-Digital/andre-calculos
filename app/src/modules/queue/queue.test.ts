import { expect, it } from "vitest";
import {
  deadlineBadge,
  todayInSaoPaulo,
  queueFilter,
  queueCursor,
  encodeQueueCursor,
  queuePaymentStatus,
  queueMoney,
} from "./queue";
it("usa a data de São Paulo sem mudar a data civil interna", () => {
  expect(todayInSaoPaulo(new Date("2026-10-11T01:30:00Z"))).toBe("2026-10-10");
  expect(todayInSaoPaulo(new Date("2026-10-11T03:00:00Z"))).toBe("2026-10-11");
  expect(deadlineBadge("2026-10-09", "2026-10-10").label).toBe("Atrasado");
  expect(deadlineBadge("2026-10-10", "2026-10-10").label).toBe("Vence hoje");
  expect(deadlineBadge(null, "2026-10-10").label).toBe("Prazo a definir");
});
it("fronteira de dois dias úteis inclui feriado, fim de semana e recesso", () => {
  expect(deadlineBadge("2026-10-14", "2026-10-09").label).toBe(
    "Próximo do prazo",
  );
  expect(deadlineBadge("2026-10-15", "2026-10-09").label).toBe("No prazo");
  expect(deadlineBadge("2027-01-22", "2026-12-18").label).toBe(
    "Próximo do prazo",
  );
  expect(deadlineBadge("2027-01-25", "2026-12-18").label).toBe("No prazo");
  expect(() => deadlineBadge("2026-02-30", "2026-10-09")).toThrow();
});
it("filtro e cursor não aceitam estados fora da fila nem interpolação", () => {
  expect(queueFilter("todos")).toBeNull();
  expect(queueFilter("in_review")).toBe("in_review");
  for (const value of [
    "draft",
    "awaiting_payment",
    "__proto__",
    "in_analysis),id.gt.0",
  ])
    expect(() => queueFilter(value)).toThrow();
  const id = "00000000-0000-4000-8000-000000000101";
  expect(
    queueCursor(encodeQueueCursor({ id, internal_due_date: null })),
  ).toEqual({ id, due: null });
  expect(
    queueCursor(encodeQueueCursor({ id, internal_due_date: "2026-10-14" })),
  ).toEqual({ id, due: "2026-10-14" });
  for (const value of ["invalid", `2026-02-30~${id}`, `sem-data~${id}~extra`])
    expect(() => queueCursor(value)).toThrow();
});
it("só pagamentos confirmados de sinal/saldo contam; contrato não é quitação", () => {
  const p = (amount_cents: number, kind = "deposit", status = "confirmed") => ({
    amount_cents,
    kind,
    status,
  });
  expect(
    queuePaymentStatus(1000, 500, false, [
      p(1000, "triage"),
      p(500, "deposit", "pending"),
      p(500, "deposit", "refunded"),
    ]),
  ).toBe("Sinal pendente");
  expect(queuePaymentStatus(1000, 500, false, [p(200)])).toBe("Sinal parcial");
  expect(queuePaymentStatus(1000, 500, false, [p(200), p(300)])).toBe(
    "Sinal confirmado",
  );
  expect(
    queuePaymentStatus(1000, 500, false, [p(500), p(500, "balance")]),
  ).toBe("Quitado");
  expect(queuePaymentStatus(1000, 500, true, [])).toBe("Contrato");
  expect(queuePaymentStatus(0, 0, false, [])).toBe("Sinal a conferir");
  expect(queueMoney(199)).toContain("1,99");
  for (const value of [-1, 1.1, Number.MAX_SAFE_INTEGER + 1])
    expect(() => queueMoney(value)).toThrow();
});
