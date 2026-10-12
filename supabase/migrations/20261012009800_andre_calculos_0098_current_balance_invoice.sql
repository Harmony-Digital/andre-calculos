-- Consulta seleciona a origem da reserva vigente; cobranças antigas continuam na projeção/histórico.
create or replace function private.payment_balance_invoice_context(target_order uuid,target_actor uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare initial_owner uuid; actor_role text; customer public.clients%rowtype; job public.orders%rowtype;
 scope private.payment_provider_scopes%rowtype; binding private.payment_provider_customers%rowtype;
 charge private.payment_financial_charges%rowtype; captured private.payment_obligation_contexts%rowtype;
 run private.payment_execution_runs%rowtype; accepted record; projection jsonb; state text:='blocked'; reason text:='no_invoice';
 remaining bigint; expectation jsonb; identity jsonb; enabled boolean; charge_count integer; source_fingerprint text; pending_only boolean:=false; known_before numeric;
begin
 select c.owner_id into initial_owner from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order;
 perform p.id from public.profiles p where p.id in(target_actor,initial_owner)
  or p.id in(select created_by from private.payment_intents where order_id=target_order) order by p.id for share;
 select c.* into customer from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order for update of c;
 select role into actor_role from public.profiles where id=target_actor;
 if customer.id is null or customer.owner_id is distinct from initial_owner or target_actor is null
  or actor_role is null or actor_role not in('client','calculator') or(actor_role='client' and target_actor<>customer.owner_id)
  or not exists(select 1 from public.profiles where id=customer.owner_id and role='client') then raise exception 'Fatura indisponivel'; end if;
 select * into job from public.orders where id=target_order and client_id=customer.id for update;
 if job.id is null or not exists(select 1 from public.processes where id=job.process_id and client_id=customer.id) then raise exception 'Fatura indisponivel'; end if;
 perform id from public.payments where order_id=job.id order by id for update;
 perform private.lock_order_financial_sources(job.id);
 perform singleton from private.payment_provider_configuration where singleton for share;
 select s.* into scope from private.payment_provider_configuration cfg join private.payment_provider_scopes s on s.id=cfg.scope_id where cfg.singleton for share of s;
 select e.enabled into enabled from private.payment_fixture_environment e where e.singleton for share;
 select * into binding from private.payment_provider_customers where scope_id=scope.id and client_id=customer.id for share;
 perform id from public.deliveries where order_id=job.id and process_id=job.process_id order by id for share;
 select * into accepted from private.accepted_order_deposit(job.id);
 projection:=private.order_payment_credit(job.id);
 remaining:=(projection->>'remainingTotalCents')::bigint;
 select count(*) into charge_count from private.payment_financial_charges c join private.payment_obligation_contexts ctx on ctx.id=(select context_id from private.payment_intents where id=c.intent_id)
  where c.order_id=job.id and ctx.phase='balance' and exists(select 1 from private.payment_intent_reservations reservation where reservation.order_id=job.id and reservation.intent_id=c.intent_id);
 if charge_count=1 then
  select c.* into charge from private.payment_financial_charges c join private.payment_intents i on i.id=c.intent_id
   join private.payment_obligation_contexts ctx on ctx.id=i.context_id where c.order_id=job.id and ctx.phase='balance' and exists(select 1 from private.payment_intent_reservations reservation where reservation.order_id=job.id and reservation.intent_id=c.intent_id);
  select ctx.* into captured from private.payment_obligation_contexts ctx join private.payment_intents i on i.context_id=ctx.id where i.id=charge.intent_id for share of ctx;
  select r.* into run from private.payment_execution_runs r where r.intent_id=charge.intent_id for share;
 end if;
 identity:=jsonb_build_object('order',jsonb_build_array(job.id,job.process_id,job.client_id,job.status),
  'actor',(select jsonb_build_array(id,role,updated_at) from public.profiles where id=target_actor),
  'owner',(select jsonb_build_array(id,role,updated_at) from public.profiles where id=customer.owner_id),
  'client',jsonb_build_array(customer.id,customer.owner_id,customer.has_contract,customer.contract_revision,
    encode(sha256(convert_to(jsonb_build_array(customer.kind,customer.document)::text,'UTF8')),'hex')),
  'scope',case when scope.id is null then null else jsonb_build_array(scope.id,scope.mode,scope.environment,scope.account_id,scope.wallet_id) end,
  'binding',case when binding.id is null then null else jsonb_build_array(binding.id,binding.scope_id,binding.client_id,binding.customer_id,
    encode(sha256(convert_to(jsonb_build_array(binding.kind,binding.document)::text,'UTF8')),'hex')) end,
  'enabled',enabled,'accepted',case when accepted.quote_id is null then null else jsonb_build_array(accepted.quote_id,accepted.context_hash,accepted.required_cents,accepted.total_cents) end,
  'phase','balance','projection',projection,'chargeCount',charge_count,
  'deliveries',(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]'::jsonb)::text,'UTF8')),'hex') from public.deliveries d where d.order_id=job.id and d.process_id=job.process_id),
  'run',case when run.id is null then null else jsonb_build_array(run.id,run.revision,run.state,run.reason,run.selected_payment_id) end,
  'reservation',(select jsonb_agg(jsonb_build_array(order_id,intent_id) order by order_id) from private.payment_intent_reservations where order_id=job.id),
  'claim',(select jsonb_agg(jsonb_build_array(intent_id,run_id) order by intent_id) from private.payment_intent_dispatch_claims where intent_id in(select id from private.payment_intents where order_id=job.id)));
 select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(c.id,c.revision,c.current_query,p.revision,p.journal_fingerprint,p.value) order by c.id),'[]'::jsonb)::text,'UTF8')),'hex')
  into source_fingerprint from private.payment_financial_charges c left join private.payment_financial_positions p on p.charge_id=c.id where c.order_id=job.id;
 identity:=identity||jsonb_build_object('sources',source_fingerprint,'expectation',charge.expectation);
 -- Fatura ja emitida PENDING: nao transforma incerteza financeira em credito zero.
 -- So a propria origem pendente, sem recebimentos/estornos/observacoes ausentes
 -- ou conflitos, permite uma leitura atual do link. Quantia vem da emissao.
 known_before:=(projection->>'manualTotalCents')::numeric+(projection->>'providerObservedTotalCents')::numeric;
 if charge_count=1 and charge.current_query is null
  and projection->'unsafeAmount'='false'::jsonb
  and (projection->>'unlinkedLegacyCount')::numeric=0
  and (projection->>'conflictedChargeCount')::numeric=0
  and projection->'depositUncertain'='false'::jsonb
  and known_before=(captured.snapshot->>'totalCreditedCents')::numeric
  and accepted.total_cents-known_before=captured.remaining_cents
  and not exists(select 1 from private.payment_financial_charges other left join private.payment_financial_positions pos on pos.charge_id=other.id
   where other.order_id=job.id and other.id<>charge.id and (other.current_query is not null or pos.charge_id is null
    or pos.value->>'certainty' is distinct from 'known' or pos.charge_revision is distinct from other.revision
    or pos.journal_fingerprint is distinct from private.financial_journal_fingerprint(other.id)))
  and not exists(select 1 from private.payment_financial_conflicts cf join private.payment_financial_observations o on o.id=cf.observation_id where o.charge_id=charge.id)
  and exists(select 1 from private.payment_financial_positions p where p.charge_id=charge.id
   and p.journal_fingerprint=private.financial_journal_fingerprint(charge.id)
   and p.value->'snapshot'->>'status'='PENDING' and p.value->'snapshot'->>'classification'='obligation')
  and not exists(select 1 from private.payment_financial_observations o where o.charge_id=charge.id
   and (o.facts is null or o.facts->>'status' is distinct from 'PENDING' or o.facts->>'classification' is distinct from 'obligation'
    or o.facts->'deleted' is distinct from 'false'::jsonb or o.facts->'chargeback' is distinct from 'null'::jsonb
    or coalesce((o.facts->'refunds'->>'completedCents')::numeric,0)>0 or coalesce((o.facts->'refunds'->>'pendingCents')::numeric,0)>0))
  then pending_only:=true; end if;
 if accepted.quote_id is null then reason:='no_invoice';remaining:=null;
 elsif (projection->'unsafeAmount' is distinct from 'false'::jsonb or projection->'depositUncertain' is distinct from 'false'::jsonb
  or projection->'uncertain' is distinct from 'false'::jsonb or remaining is null) and pending_only is not true then state:='uncertain';reason:='reconciliation';remaining:=null;
 elsif job.status in('cancelled','refunded') then reason:='context_changed';
 elsif job.status not in('delivered','completed') or not exists(select 1 from public.deliveries where order_id=job.id and process_id=job.process_id) then reason:='phase_unavailable';
 elsif accepted.total_cents=0 then reason:='no_balance';remaining:=0;
 elsif (projection->>'depositExcessCents')::numeric>0 or (projection->>'totalExcessCents')::numeric>0 then reason:='context_changed';
 elsif remaining=0 then state:='paid';reason:='credit_confirmed';
 elsif scope.id is null or scope.mode is distinct from 'fixture' or scope.environment is distinct from 'sandbox' or enabled is distinct from true then reason:='provider_not_ready';
 elsif binding.id is null or binding.kind is distinct from customer.kind or binding.document is distinct from customer.document then reason:='context_changed';
 elsif charge_count<>1 or charge.id is null then reason:=case when exists(select 1 from private.payment_intent_reservations where order_id=job.id) then 'protected_execution' else 'no_invoice' end;
 elsif (charge.scope_id,charge.client_id,charge.order_id) is distinct from(scope.id,customer.id,job.id)
  or captured.quote_id is distinct from accepted.quote_id or captured.context_hash is distinct from accepted.context_hash
  or captured.binding_id is distinct from binding.id or captured.snapshot->'binding'->>'customerId' is distinct from binding.customer_id
  or captured.snapshot->'binding'->'scope' is distinct from jsonb_strip_nulls(jsonb_build_object('provider','asaas','environment',scope.environment,'accountId',scope.account_id,'walletId',scope.wallet_id))
  or run.snapshot->'obligation' is distinct from captured.snapshot or run.selected_payment_id is distinct from charge.provider_payment_id
  or run.state is distinct from 'identified' or not exists(select 1 from private.payment_intent_dispatch_claims where intent_id=charge.intent_id and run_id=run.id)
  or not exists(select 1 from private.payment_intent_reservations where order_id=job.id and intent_id=charge.intent_id)
  or exists(select 1 from private.payment_intent_reservations where order_id=job.id and intent_id<>charge.intent_id)
  or exists(select 1 from private.payment_financial_resolutions where intent_id=charge.intent_id)
  or (remaining is not null and captured.remaining_cents is distinct from remaining) or job.status not in('delivered','completed')
  then reason:='context_changed';
 else
  expectation:=jsonb_build_object('phase','observation','scope',jsonb_strip_nulls(jsonb_build_object('provider','asaas','environment',scope.environment,'accountId',scope.account_id,'walletId',scope.wallet_id)),
   'paymentId',charge.provider_payment_id,'customerId',binding.customer_id,'reference',charge.intent_id::text,'contractedCents',captured.remaining_cents,
   'billingType',captured.billing_type,'dueDate',captured.due_date::text);
  if expectation is distinct from charge.expectation then reason:='context_changed';expectation:=null;
  else state:='active';reason:='pending'; end if;
 end if;
 return jsonb_build_object('phase','balance','orderId',job.id,'processId',job.process_id,'clientId',customer.id,'ownerId',customer.owner_id,'scopeId',scope.id,
  'scope',case when scope.id is null then null else jsonb_strip_nulls(jsonb_build_object('provider','asaas','environment',scope.environment,'accountId',scope.account_id,'walletId',scope.wallet_id)) end,
  'chargeId',charge.id,'expectation',expectation,'contextHash',encode(sha256(convert_to(identity::text,'UTF8')),'hex'),
  'state',state,'reason',reason,'remainingCents',remaining,'invoiceAmountCents',case when state='active' then captured.remaining_cents else null end);
end; $$;
