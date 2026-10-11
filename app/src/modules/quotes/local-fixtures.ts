import type { EvaluationInput } from "./proposal";
import { todayInSaoPaulo } from "./proposal";
import { checklistLaborV1 } from "@/modules/checklist/v1";
export function quoteFixturesEnabled(env: Record<string, string | undefined>) {
  return (
    env.ANDRE_QUOTE_FIXTURES === "1" &&
    env.ANDRE_LOCAL_TESTS === "1" &&
    env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:54321" &&
    !env.VERCEL_ENV
  );
}
/** Dados de agenda e calendário inventados, exclusivamente para ensaio local. */
export function quoteFixtureInputs(
  now: Date,
  answers: unknown,
): Pick<EvaluationInput, "calendar" | "capacity" | "period"> {
  const parsed = checklistLaborV1.safeParse(answers);
  const a = parsed.success ? parsed.data : null;
  return {
    calendar: a
      ? {
          version: "fixture-calendar-v1",
          basis: "fixture",
          tribunal: a.tribunal,
          suspensions: [],
        }
      : null,
    capacity: {
      version: "fixture-capacity-v1",
      basis: "fixture",
      asOf: now.toISOString(),
      validUntil: new Date(now.getTime() + 300000).toISOString(),
      startDate: todayInSaoPaulo(now),
      availableBusinessDays: 365,
      urgencyAvailable: true,
    },
    period: a?.dismissalDate
      ? {
          version: "fixture-months-touched-v1",
          basis: "fixture",
          startDate: a.admissionDate,
          endDate: a.dismissalDate,
          months:
            (Number(a.dismissalDate.slice(0, 4)) -
              Number(a.admissionDate.slice(0, 4))) *
              12 +
            Number(a.dismissalDate.slice(5, 7)) -
            Number(a.admissionDate.slice(5, 7)) +
            1,
        }
      : null,
  };
}
