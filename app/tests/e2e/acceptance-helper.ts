import { randomUUID } from "node:crypto";
import { quoteFixture, createQuoteDraft } from "./quote-helper";
import { removeLocalDraft } from "./draft-helper";
import { localNotificationSql } from "./notification-helper";
import { quoteFixtureInputs } from "@/modules/quotes/local-fixtures";
import { evaluateProposal } from "@/modules/quotes/proposal";
import type { PriceTable } from "@/modules/quotes/pricing";
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
export async function acceptanceFixture(
  versions: { terms?: string; privacy?: string } = {},
) {
  const fixture = await quoteFixture(),
    db = fixture.db;
  try {
    const seed = (
      await db
        .from("processes")
        .select("client_id")
        .eq("id", "00000000-0000-4000-8000-000000000101")
        .single()
    ).data!;
    const owner = (
      await db
        .from("clients")
        .select("id,has_contract,contract_revision,owner_id")
        .eq("id", seed.client_id)
        .single()
    ).data!;
    const calculator = (
      await db.from("profiles").select("id").eq("role", "calculator").single()
    ).data!;
    if (!seed || !owner || !calculator)
      throw new Error("Identidades sintéticas indisponíveis.");
    const ids: { quote: string; order: string; process: string }[] = [];
    const terms = versions.terms ?? "teste-contratacao-termos-v1",
      privacy = versions.privacy ?? "teste-contratacao-privacidade-v1";
    if (
      (
        await db
          .from("settings")
          .update({
            approved_terms_version: terms,
            approved_privacy_version: privacy,
          })
          .eq("singleton", true)
      ).error
    )
      throw new Error("Versões sintéticas não preparadas.");
    return {
      ...fixture,
      owner,
      calculator,
      terms,
      privacy,
      create: async (
        options: {
          contract?: boolean;
          documents?: boolean;
          expired?: boolean;
          expiresInSeconds?: number;
          context?: boolean;
          zero?: boolean;
          simulation?: boolean;
        } = {},
      ) => {
        const draft = await createQuoteDraft(),
          id = randomUUID();
        ids.push({
          quote: id,
          order: draft.order_id,
          process: draft.process_id,
        });
        const cfg = fixture.settings,
          now = new Date(
            Date.now() -
              (options.expiresInSeconds !== undefined
                ? cfg.quote_valid_days * 86400000 -
                  options.expiresInSeconds * 1000
                : options.expired
                  ? 9 * 86400000
                  : 0),
          );
        const inputs = quoteFixtureInputs(now, draft.answers);
        if (!inputs.period || !inputs.calendar || !inputs.capacity)
          throw new Error("Insumos sintéticos indisponíveis.");
        const evaluated = evaluateProposal({
          now,
          mode: "commercial",
          orderId: draft.order_id,
          processId: draft.process_id,
          checklistRevision: draft.revision,
          settingsRevision: cfg.revision,
          answers: draft.answers,
          validityDays: cfg.quote_valid_days,
          slackDays: cfg.slack_days,
          professional: {
            name: cfg.technical_name,
            crcNumber: cfg.crc_number,
            crcState: cfg.crc_state,
            category: cfg.crc_category,
            email: cfg.contact_email,
            phone: cfg.contact_phone,
          },
          conditions: (cfg.default_texts as { conditions: string }).conditions,
          prices: {
            id: fixture.price.id,
            active: true,
            activatedAt: fixture.price.activated_at,
            table: {
              ...(fixture.price.parameters as object),
              version: String(fixture.price.version),
              isExample: false,
            } as PriceTable,
          },
          period: inputs.period && { ...inputs.period, basis: "reviewed" },
          calendar: { ...inputs.calendar, basis: "reviewed" },
          capacity: { ...inputs.capacity, basis: "reviewed" },
        });
        if (evaluated.status !== "commercial_ready")
          throw new Error("Snapshot contratual sintético indisponível.");
        const proposal = evaluated.proposal;
        if (options.zero) {
          proposal.items = proposal.items.map((item) => ({
            ...item,
            unitCents: 0,
            amountCents: 0,
          }));
          proposal.totalCents = 0;
          proposal.depositCents = 0;
          proposal.balanceCents = 0;
        }
        // Preparação exclusiva do PostgreSQL local; não promove pedidos de outras amostras.
        localNotificationSql(
          `update public.clients set has_contract=${options.contract ?? false} where id='${owner.id}'::uuid;`,
        );
        if (
          (
            await db
              .from("orders")
              .update({
                status: "quoted",
                total_cents: proposal.totalCents,
                deposit_cents: proposal.depositCents,
                price_table_id: fixture.price.id,
                delivery_date: proposal.deliveryDate,
                internal_due_date: proposal.internalDueDate,
              })
              .eq("id", draft.order_id)
          ).error
        )
          throw new Error("Pedido sintético não preparado.");
        const number = `ORC-2026-${Date.now()}${Math.floor(
          Math.random() * 10000,
        )
          .toString()
          .padStart(4, "0")}`;
        if (
          (
            await db.from("quotes").insert({
              id,
              order_id: draft.order_id,
              number,
              items: proposal.items,
              total_cents: proposal.totalCents,
              valid_until: proposal.validUntil,
              checklist_revision: draft.revision,
              price_table_id: fixture.price.id,
              is_simulation: options.simulation ?? false,
            })
          ).error
        )
          throw new Error("Proposta contratual sintética não preparada.");
        if (options.context !== false && !options.simulation)
          localNotificationSql(`insert into private.quote_contract_contexts(quote_id,proposal,terms_version,terms_text,privacy_version,privacy_text,prepared_by)
values('${id}'::uuid,${literal(JSON.stringify(proposal))}::jsonb,${literal(terms)},'CONTEÚDO SINTÉTICO SEM VIGÊNCIA. Termos fictícios exclusivos para testar a contratação local.',${literal(privacy)},'CONTEÚDO SINTÉTICO SEM VIGÊNCIA. Informação de privacidade fictícia para o ensaio local.','${calculator.id}'::uuid);`);
        if (options.documents) {
          const fileId = randomUUID();
          if (
            (
              await db.from("files").insert({
                id: fileId,
                process_id: draft.process_id,
                order_id: draft.order_id,
                folder: "case",
                uploaded_by: owner.owner_id,
                name: "Processo inventado.pdf",
                mime: "application/pdf",
                path: `${owner.owner_id}/${draft.process_id}/${fileId}/contratacao-ficticia.pdf`,
                size_bytes: 100,
                sha256: "0".repeat(64),
                expected_sha256: "0".repeat(64),
                upload_status: "uploaded",
              })
            ).error
          )
            throw new Error("Documento sintético não preparado.");
        }
        const contextHash =
          options.context === false || options.simulation
            ? "0".repeat(64)
            : localNotificationSql(
                `select context_hash from private.quote_contract_contexts where quote_id='${id}'::uuid;`,
              );
        return {
          ...draft,
          id,
          number,
          proposal,
          contextHash,
          actor: owner.owner_id,
          args: (patch: Record<string, unknown> = {}) => ({
            actor: owner.owner_id,
            target_quote: id,
            expected_context: contextHash,
            request_id: randomUUID(),
            confirmed: true,
            ip_address: "192.0.2.44",
            user_agent: "Agente sintético de contratação",
            ...patch,
          }),
        };
      },
      cleanup: async () => {
        try {
          for (const entry of ids) {
            localNotificationSql(
              `delete from public.audit_log where action='manual_deposit_confirmed' and target_id in (select id from private.manual_deposit_receipts where quote_id='${entry.quote}'::uuid); delete from private.manual_deposit_requests where quote_id='${entry.quote}'::uuid; delete from private.manual_deposit_receipts where quote_id='${entry.quote}'::uuid; delete from public.payments where order_id='${entry.order}'::uuid; delete from private.quote_acceptance_requests where quote_id='${entry.quote}'::uuid; delete from private.quote_acceptances where quote_id='${entry.quote}'::uuid; delete from private.quote_rejection_requests where quote_id='${entry.quote}'::uuid; delete from private.quote_rejections where quote_id='${entry.quote}'::uuid; delete from private.quote_contract_contexts where quote_id='${entry.quote}'::uuid;`,
            );
            for (const result of [
              await db
                .from("notifications")
                .delete()
                .contains("data", { process_id: entry.process }),
              await db.from("audit_log").delete().eq("target_id", entry.quote),
              await db.from("quotes").delete().eq("id", entry.quote),
            ])
              if (result.error)
                throw new Error("Registro contratual sintético não removido.");
            await db
              .from("orders")
              .update({ status: "draft" })
              .eq("id", entry.order);
            await removeLocalDraft(entry.order);
          }
          localNotificationSql(
            `update public.clients set has_contract=${owner.has_contract},contract_revision=${owner.contract_revision} where id='${owner.id}'::uuid;`,
          );
        } finally {
          await fixture.cleanup();
        }
      },
    };
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}
