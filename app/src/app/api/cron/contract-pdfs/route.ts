import { timingSafeEqual } from "node:crypto";
import {
  localContractWorkerEnabled,
  runContractPdfBatch,
} from "@/modules/quotes/contract-worker";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" },
    secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !localContractWorkerEnabled())
    return Response.json({ error: "not_configured" }, { status: 503, headers });
  const expected = Buffer.from(`Bearer ${secret}`),
    actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  if (new URL(request.url).search)
    return Response.json(
      { error: "unsupported_parameters" },
      { status: 400, headers },
    );
  try {
    return Response.json(await runContractPdfBatch(), { headers });
  } catch {
    return Response.json(
      { error: "contract_run_failed" },
      { status: 503, headers },
    );
  }
}
