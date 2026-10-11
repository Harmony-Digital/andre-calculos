import { timingSafeEqual } from "node:crypto";
import { createSystemClient } from "@/lib/supabase/admin";
import { runDeadlineReminders } from "@/modules/notifications/deadline-runner";

export const runtime = "nodejs";
const reply = (body: object, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16)
    return reply({ error: "cron_not_configured" }, 503);
  const expected = Buffer.from(`Bearer ${secret}`),
    actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return reply({ error: "unauthorized" }, 401);
  // Nenhuma flag enviada pelo visitante libera calendário provisório em produção.
  if (
    process.env.ANDRE_LOCAL_TESTS !== "1" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321" ||
    process.env.VERCEL_ENV
  )
    return reply({ error: "calendar_review_required" }, 503);
  if (new URL(request.url).search)
    return reply({ error: "unsupported_parameters" }, 400);
  try {
    return reply(await runDeadlineReminders(createSystemClient()), 200);
  } catch {
    return reply({ error: "deadline_run_failed" }, 503);
  }
}
