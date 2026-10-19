import type { Proposal } from "@/modules/quotes/proposal";
import { randomUUID } from "node:crypto";
import { rejectionFixture } from "./rejection-helper";
import { localNotificationSql as sql } from "./notification-helper";
export async function revisionFixture() {
  const f = await rejectionFixture(),
    orders: string[] = [];
  return {
    ...f,
    create: async (options: Parameters<typeof f.create>[0] = {}) => {
      const s = await f.create(options);
      orders.push(s.order_id);
      return {
        ...s,
        revisionArgs: (patch: Record<string, unknown> = {}) => ({
          actor: f.calculator.id,
          target_quote: s.id,
          expected_context: s.contextHash,
          expected_version: 1,
          expected_order_revision: s.statusRevision,
          request_id: randomUUID(),
          reason: "Ajuste fictício combinado com o advogado",
          unit_prices: s.proposal.items.map(
            (item: Proposal["items"][number], i: number) => ({
              code: item.code,
              unitCents: item.unitCents + (i === 0 ? 101 : 0),
            }),
          ),
          ...patch,
        }),
      };
    },
    cleanup: async () => {
      try {
        for (const order of orders) {
          const children = JSON.parse(
            sql(
              `select coalesce(jsonb_agg(id order by version desc),'[]') from public.quotes where order_id='${order}' and version>1;`,
            ),
          ) as string[];
          for (const id of children) {
            const until = Date.now() + 10000;
            while (
              sql(
                `select exists(select 1 from private.quote_contract_pdf_jobs where quote_id='${id}' and state in('processing','prepared') and lease_until>clock_timestamp())::text;`,
              ) === "true"
            ) {
              if (Date.now() > until)
                throw new Error("Contrato fictício ainda em geração.");
              await new Promise((r) => setTimeout(r, 100));
            }
            const path = sql(
              `select 'contracts/'||quote_id::text||'/'||snapshot_sha256||'/contract-pdf-v1.pdf' from private.quote_contract_snapshots where quote_id='${id}';`,
            );
            if (
              path &&
              (await f.db.storage.from("processos").remove([path])).error
            )
              throw new Error("Limpeza de contrato fictício falhou.");
            sql(
              `delete from public.payments where order_id='${order}'; delete from private.quote_acceptance_requests where quote_id='${id}'; delete from private.quote_acceptances where quote_id='${id}'; delete from private.quote_rejection_requests where quote_id='${id}'; delete from private.quote_rejections where quote_id='${id}'; delete from private.quote_adjustments where quote_id='${id}'; delete from private.quote_contract_contexts where quote_id='${id}'; delete from public.audit_log where target_id='${id}'; delete from public.notifications where data->>'quote_id'='${id}'; delete from public.quotes where id='${id}';`,
            );
          }
        }
      } finally {
        await f.cleanup();
      }
    },
  };
}
