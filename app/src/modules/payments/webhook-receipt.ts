import "server-only";
import { z } from "zod";
import { createSystemClient } from "@/lib/supabase/admin";
import { scopeSchema } from "./asaas/scope-data";
import {
  AsaasWebhookReceptionError,
  readAuthenticatedAsaasWebhook,
} from "./asaas/webhook-reception";

export const webhookReceiptSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    kind: z.enum(["recorded", "replay", "conflict"]),
    eventId: z.uuid(),
    conflictId: z.uuid().nullable(),
    queueState: z.enum([
      "pending",
      "processing",
      "needs_reconciliation",
      "done",
    ]),
  })
  .superRefine((v, ctx) => {
    if (
      (v.kind === "conflict") !== (v.conflictId !== null) ||
      (v.kind === "recorded" && v.queueState !== "pending")
    )
      ctx.addIssue({ code: "custom", message: "Recibo indisponível." });
  });

function fixtureConfiguration() {
  if (
    process.env.ANDRE_LOCAL_TESTS !== "1" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321" ||
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV === "production"
  )
    throw new AsaasWebhookReceptionError("unavailable");
  try {
    return {
      scopeId: z.uuid().parse(process.env.ANDRE_WEBHOOK_FIXTURE_SCOPE_ID),
      scope: scopeSchema.parse({
        provider: "asaas",
        environment: "sandbox",
        accountId: process.env.ANDRE_WEBHOOK_FIXTURE_ACCOUNT_ID,
      }),
      authToken: z
        .string()
        .min(32)
        .max(255)
        .parse(process.env.ANDRE_WEBHOOK_FIXTURE_TOKEN),
    };
  } catch {
    throw new AsaasWebhookReceptionError("unavailable");
  }
}

/** Entrada somente Request: o caller não fornece envelope já autenticado ou destino. */
export async function receiveFixtureAsaasWebhook(request: Request) {
  const configuration = fixtureConfiguration();
  const event = await readAuthenticatedAsaasWebhook(request, configuration);
  const received = await createSystemClient().rpc(
    "receive_fixture_payment_webhook",
    {
      target_scope: configuration.scopeId,
      body_text: event.minimalBody,
      source_hash: event.sourceBodyHash,
    },
  );
  if (received.error) throw new AsaasWebhookReceptionError("unavailable");
  try {
    return webhookReceiptSchema.parse(received.data);
  } catch {
    throw new AsaasWebhookReceptionError("unavailable");
  }
}

/** Não confirmar ao provedor antes da persistência; não executar regra financeira aqui. */
export async function fixtureAsaasWebhookResponse(
  request: Request,
): Promise<Response> {
  let status = 200;
  try {
    await receiveFixtureAsaasWebhook(request);
  } catch (error) {
    status = error instanceof AsaasWebhookReceptionError ? error.status : 503;
  }
  return Response.json(
    { received: status === 200 },
    {
      status,
      headers: {
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
