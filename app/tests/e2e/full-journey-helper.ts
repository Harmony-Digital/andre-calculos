import { randomUUID, randomInt } from "node:crypto";
import { quoteFixture } from "./quote-helper";
import { localNotificationSql } from "./notification-helper";
import { removeLocalUser } from "./local-helper";
import { leaseQueue } from "./queue-helper";
import { checklistLaborV1 } from "@/modules/checklist/v1";
import { quoteFixtureInputs } from "@/modules/quotes/local-fixtures";
import { evaluateProposal } from "@/modules/quotes/proposal";
import type { PriceTable } from "@/modules/quotes/pricing";

const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const uuid = (value: string) => {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))
    throw new Error("Identificador do ensaio inválido.");
  return `${literal(value)}::uuid`;
};

/** Um lease e um cliente novo. Não cria outro pedido nem altera a aplicação. */
export async function fullJourneyFixture() {
  const fixture = await quoteFixture(),
    db = fixture.db,
    email = `jornada-${randomUUID()}@exemplo.com`,
    registrationTerms = "fixture-termos-v1",
    registrationPrivacy = "fixture-privacidade-v1",
    terms = "teste-jornada-termos-v1",
    privacy = "teste-jornada-privacidade-v1";
  let releaseQueue: () => Promise<void>;
  try {
    // Mesma ordem dos ensaios de painel/entrega: settings, depois fila.
    releaseQueue = await leaseQueue();
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
  let actorId: string | undefined;
  const identity = async () => {
    if (actorId) return actorId;
    for (let page = 1; page <= 100; page++) {
      const users = await db.auth.admin.listUsers({ page, perPage: 50 });
      if (users.error) throw new Error("Identidade do ensaio indisponível.");
      actorId = users.data.users.find((user) => user.email === email)?.id;
      if (actorId || users.data.users.length < 50) return actorId;
    }
    throw new Error("Escopo local de usuários maior que o esperado.");
  };
  const ownedOrder = async (orderId: string) => {
    uuid(orderId);
    const actor = await identity();
    if (!actor) throw new Error("Cadastro do ensaio indisponível.");
    const client = await db
      .from("clients")
      .select("id,owner_id")
      .eq("owner_id", actor)
      .single();
    const order = await db
      .from("orders")
      .select("id,process_id,client_id,code,status,total_cents,deposit_cents")
      .eq("id", orderId)
      .single();
    if (client.error || order.error || order.data.client_id !== client.data.id)
      throw new Error("Pedido não pertence ao cadastro deste ensaio.");
    return { ...order.data, actor };
  };
  return {
    ...fixture,
    email,
    terms,
    privacy,
    registrationTerms,
    registrationPrivacy,
    identity,
    ownedOrder,
    prepareContract: async (orderId: string) => {
      const order = await ownedOrder(orderId),
        checklist = await db
          .from("checklists")
          .select("answers,revision")
          .eq("order_id", orderId)
          .single(),
        calculator = await db
          .from("profiles")
          .select("id")
          .eq("role", "calculator")
          .single();
      if (checklist.error || calculator.error)
        throw new Error("Contexto do ensaio indisponível.");
      const answers = checklistLaborV1.parse(checklist.data.answers),
        now = new Date(),
        cfg = fixture.settings,
        inputs = quoteFixtureInputs(now, answers);
      if (!inputs.period || !inputs.calendar || !inputs.capacity)
        throw new Error("Insumos sintéticos indisponíveis.");
      const evaluated = evaluateProposal({
        now,
        mode: "commercial",
        orderId,
        processId: order.process_id,
        checklistRevision: checklist.data.revision,
        settingsRevision: cfg.revision,
        answers,
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
        period: { ...inputs.period, basis: "reviewed" },
        calendar: { ...inputs.calendar, basis: "reviewed" },
        capacity: { ...inputs.capacity, basis: "reviewed" },
      });
      if (evaluated.status !== "commercial_ready")
        throw new Error("Proposta sintética indisponível.");
      const proposal = evaluated.proposal,
        id = randomUUID(),
        number = `ORC-2026-${Date.now()}${randomInt(1000, 10000)}`;
      // O contrato rejeita versões de cadastro prefixadas fixture/rascunho.
      // Somente versão sintética deste ensaio, com texto sem vigência arquivado.
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
        throw new Error("Versões contratuais sintéticas não preparadas.");
      // Fronteira sintética: a simulação imutável é removida, nunca promovida.
      // O produtor comercial permanece bloqueado. Somente o mesmo pedido local.
      localNotificationSql(`begin;
do $$begin
 if exists(select 1 from public.quotes where order_id=${uuid(orderId)} and (not is_simulation or accepted_at is not null)) then raise exception 'Ensaio já contratado'; end if;
end$$;
delete from private.quote_requests where order_id=${uuid(orderId)};
delete from public.audit_log where target_id in(select id from public.quotes where order_id=${uuid(orderId)});
delete from public.quotes where order_id=${uuid(orderId)};
commit;`);
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
            .eq("id", orderId)
        ).error
      )
        throw new Error("Pedido sintético não preparado.");
      if (
        (
          await db.from("quotes").insert({
            id,
            order_id: orderId,
            number,
            items: proposal.items,
            total_cents: proposal.totalCents,
            valid_until: proposal.validUntil,
            checklist_revision: checklist.data.revision,
            price_table_id: fixture.price.id,
          })
        ).error
      )
        throw new Error("Proposta sintética não preparada.");
      localNotificationSql(`insert into private.quote_contract_contexts(quote_id,proposal,terms_version,terms_text,privacy_version,privacy_text,prepared_by)
values(${uuid(id)},${literal(JSON.stringify(proposal))}::jsonb,${literal(terms)},'CONTEÚDO SINTÉTICO SEM VIGÊNCIA. Termos fictícios exclusivos da jornada local.',${literal(privacy)},'CONTEÚDO SINTÉTICO SEM VIGÊNCIA. Privacidade fictícia da jornada local.',${uuid(calculator.data.id)});`);
      return { ...order, id, number, proposal };
    },
    prepareTechnicalReview: async (orderId: string) => {
      const order = await ownedOrder(orderId);
      if (order.status !== "queued")
        throw new Error("Fila do ensaio não confirmada.");
      // Ponte explícita: execução manual no PJe-Calc ainda não tem transição UI.
      if (
        (
          await db
            .from("orders")
            .update({ status: "in_review" })
            .eq("id", orderId)
        ).error
      )
        throw new Error("Revisão sintética não preparada.");
    },
    prepareBalance: async (orderId: string) => {
      const order = await ownedOrder(orderId);
      if (order.status !== "delivered")
        throw new Error("Entrega do ensaio não confirmada.");
      const calculator = await db
        .from("profiles")
        .select("id")
        .eq("role", "calculator")
        .single();
      if (calculator.error)
        throw new Error("Calculista fictício indisponível.");
      // M3.09 não está implementada; somente saldo fictício para provar o gate.
      if (
        (
          await db.from("payments").insert({
            order_id: orderId,
            kind: "balance",
            method: "pix_manual",
            amount_cents: order.total_cents - order.deposit_cents,
            status: "confirmed",
            confirmed_by: calculator.data.id,
            confirmed_at: new Date().toISOString(),
          })
        ).error
      )
        throw new Error("Saldo fictício não preparado.");
    },
    cleanup: async () => {
      try {
        const actor = await identity();
        if (!actor) return;
        const client = await db
          .from("clients")
          .select("id")
          .eq("owner_id", actor)
          .maybeSingle();
        if (client.error)
          throw new Error("Cliente do ensaio indisponível para limpeza.");
        if (client.data) {
          const processes = await db
            .from("processes")
            .select("id")
            .eq("client_id", client.data.id);
          if (processes.error || processes.data.length > 1)
            throw new Error("Escopo inesperado na limpeza da jornada.");
          for (const process of processes.data) {
            const files = await db
              .from("files")
              .select("path")
              .eq("process_id", process.id);
            if (files.error)
              throw new Error("Arquivos do ensaio indisponíveis.");
            if (
              files.data.length &&
              (
                await db.storage
                  .from("processos")
                  .remove(files.data.map((file) => file.path))
              ).error
            )
              throw new Error("Storage do ensaio não removido.");
            const p = uuid(process.id);
            localNotificationSql(`begin;
delete from public.audit_log where target_id in (
 select ${p} union select id from public.orders where process_id=${p}
 union select id from public.quotes where order_id in(select id from public.orders where process_id=${p})
 union select id from public.files where process_id=${p}
 union select id from public.messages where process_id=${p}
 union select id from public.decisions where process_id=${p}
 union select id from public.deliveries where process_id=${p}
 union select id from private.manual_deposit_receipts where order_id in(select id from public.orders where process_id=${p})
);
delete from public.notifications where data->>'process_id'=${literal(process.id)};
delete from private.manual_deposit_requests where quote_id in(select id from public.quotes where order_id in(select id from public.orders where process_id=${p}));
delete from private.manual_deposit_receipts where order_id in(select id from public.orders where process_id=${p});
delete from public.payments where order_id in(select id from public.orders where process_id=${p});
delete from private.quote_acceptance_requests where quote_id in(select id from public.quotes where order_id in(select id from public.orders where process_id=${p}));
delete from private.quote_acceptances where quote_id in(select id from public.quotes where order_id in(select id from public.orders where process_id=${p}));
delete from private.quote_contract_contexts where quote_id in(select id from public.quotes where order_id in(select id from public.orders where process_id=${p}));
delete from private.quote_requests where order_id in(select id from public.orders where process_id=${p});
delete from public.quotes where order_id in(select id from public.orders where process_id=${p});
delete from public.deliveries where process_id=${p};
delete from public.messages where process_id=${p};
delete from public.decisions where process_id=${p};
delete from private.page_index_receipts where process_id=${p};
delete from public.page_index where process_id=${p};
delete from public.files where process_id=${p};
delete from public.timeline_events where process_id=${p};
delete from private.deadline_reminder_receipts where order_id in(select id from public.orders where process_id=${p});
delete from public.deadlines where order_id in(select id from public.orders where process_id=${p});
delete from public.checklists where order_id in(select id from public.orders where process_id=${p});
delete from public.orders where process_id=${p};
delete from public.processes where id=${p};
commit;`);
          }
        }
        await removeLocalUser(actor);
      } finally {
        try {
          await fixture.cleanup();
        } finally {
          await releaseQueue();
        }
      }
    },
  };
}
