import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";
import {
  claimFixturePaymentWebhook,
  queryFixturePaymentWebhook,
  webhookRunSchema,
} from "./webhook-worker";
import { finalizeFixturePaymentWebhook } from "./webhook-finalization";

const unavailable = "Fila de webhook indisponível.";
const batchLimit = 20;
const batchSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal("fixture"),
  scopeId: z.uuid(),
  accountId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  events: z
    .array(
      z.strictObject({
        eventId: z.uuid(),
        paymentId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
      }),
    )
    .max(batchLimit),
});

function configuration() {
  if (
    process.env.ANDRE_LOCAL_TESTS !== "1" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321" ||
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV === "production"
  )
    throw new Error(unavailable);
  return {
    scopeId: z.uuid().parse(process.env.ANDRE_WEBHOOK_FIXTURE_SCOPE_ID),
    accountId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,100}$/)
      .parse(process.env.ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID),
  };
}

/** O destino e o relógio vêm do servidor e do banco; visitantes não escolhem o lote. */
export async function runFixturePaymentWebhookQueue() {
  try {
    const config = configuration();
    const selected = await createSystemClient().rpc(
      "select_fixture_payment_webhooks",
      {
        target_scope: config.scopeId,
        expected_account: config.accountId,
        batch_limit: batchLimit,
      },
    );
    if (selected.error) throw new Error(unavailable);
    const batch = batchSchema.parse(selected.data);
    if (
      batch.scopeId !== config.scopeId ||
      batch.accountId !== config.accountId ||
      new Set(batch.events.map((e) => e.paymentId)).size !==
        batch.events.length ||
      new Set(batch.events.map((e) => e.eventId)).size !== batch.events.length
    )
      throw new Error(unavailable);
    const report = {
      selected: batch.events.length,
      complete: 0,
      quarantined: 0,
      busy: 0,
      failed: 0,
    };
    for (const event of batch.events) {
      try {
        configuration();
        const claim = await claimFixturePaymentWebhook(
          event.eventId,
          randomUUID(),
        );
        if (claim.state === "busy" || claim.state === "already_processed") {
          report.busy++;
          continue;
        }
        const run = webhookRunSchema.parse(claim);
        if (run.scopeId !== config.scopeId || run.paymentId !== event.paymentId)
          throw new Error(unavailable);
        if (run.state === "unmatched" || run.state === "identity_mismatch") {
          report.quarantined++;
          continue;
        }
        if (run.state !== "claimed" && run.state !== "queried")
          throw new Error(unavailable);
        const current =
          run.state === "queried"
            ? run
            : (await queryFixturePaymentWebhook(run)).run;
        await finalizeFixturePaymentWebhook(current);
        report.complete++;
      } catch {
        // A recepção e T permanecem duráveis. Os demais pagamentos continuam.
        report.failed++;
      }
    }
    return report;
  } catch {
    throw new Error(unavailable);
  }
}

const reply = (body: object, status: number) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

/** Cron local: credencial própria, nenhum identificador financeiro na resposta. */
export async function fixturePaymentWebhookCronResponse(request: Request) {
  let secret: string;
  try {
    configuration();
    secret = z
      .string()
      .min(32)
      .max(255)
      .parse(process.env.ANDRE_WEBHOOK_FIXTURE_CRON_SECRET);
    const incomingToken = z
      .string()
      .min(32)
      .max(255)
      .parse(process.env.ANDRE_WEBHOOK_FIXTURE_TOKEN);
    if (secret === incomingToken) throw new Error(unavailable);
  } catch {
    return reply({ error: "webhook_queue_not_configured" }, 503);
  }
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return reply({ error: "unauthorized" }, 401);
  if (new URL(request.url).search)
    return reply({ error: "unsupported_parameters" }, 400);
  try {
    const report = await runFixturePaymentWebhookQueue();
    return reply(report, report.failed ? 503 : 200);
  } catch {
    return reply({ error: "webhook_queue_failed" }, 503);
  }
}
