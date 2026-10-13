-- Cobertura do conjunto T; revisao de consulta nao e ordem financeira.
-- Sem backfill: posicoes anteriores ficam incertas ate rederivacao valida.
alter table private.payment_financial_positions add column journal_fingerprint text check(journal_fingerprint ~ '^[0-9a-f]{64}$');
alter table private.payment_financial_positions add column charge_revision bigint check(charge_revision between 0 and 9007199254740991);
create function private.financial_canonical_facts(facts jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select case when facts is null then null when jsonb_typeof(facts->'refunds'->'items')='array' then
 jsonb_set(facts,'{refunds,items}',coalesce((select jsonb_agg(v order by v::text collate "C") from jsonb_array_elements(facts->'refunds'->'items') v),'[]'::jsonb)) else facts end;
$$;
create function private.financial_canonical_proof(proof jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select case when proof->>'kind'='proven' then jsonb_set(proof,'{reversals}',coalesce((select jsonb_agg(v order by v::text collate "C") from jsonb_array_elements(proof->'reversals') v),'[]'::jsonb)) else proof end;
$$;
create function private.financial_journal_fingerprint(target_charge uuid) returns text
language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
 'observations',coalesce((select jsonb_agg(signature order by signature::text collate "C") from
 (select distinct jsonb_build_array(o.source_order,private.financial_canonical_facts(o.facts),private.financial_canonical_proof(o.proof),case when o.facts is null then o.id else null end) signature
 from private.payment_financial_observations o where o.charge_id=target_charge) s),'[]'::jsonb),
 'conflicts',coalesce((select jsonb_agg(jsonb_build_array(f.observation_id,f.attempt_hash) order by f.observation_id,f.attempt_hash) from private.payment_financial_conflicts f join private.payment_financial_observations o on o.id=f.observation_id where o.charge_id=target_charge),'[]'::jsonb)
 )::text,'UTF8')),'hex');
$$;
revoke all on function private.financial_canonical_facts(jsonb),private.financial_canonical_proof(jsonb),private.financial_journal_fingerprint(uuid) from public,anon,authenticated,service_role;
create or replace function private.guard_financial_position() returns trigger language plpgsql set search_path='' as $$
declare c private.payment_financial_charges%rowtype;o private.payment_financial_observations%rowtype;key text;number numeric;gross numeric;done numeric;pending numeric;cb numeric;credit numeric;contracted numeric;candidate text;
begin
 if tg_op='UPDATE' and(new.charge_id is distinct from old.charge_id or new.created_at is distinct from old.created_at or new.revision<>old.revision+1) then raise exception 'Revisão financeira indisponível'; end if;
 select * into c from private.payment_financial_charges where id=new.charge_id;
 select * into o from private.payment_financial_observations where id=new.observation_id and charge_id=c.id;
 if o.id is null or new.value->'schemaVersion' is distinct from '1'::jsonb or new.value->>'semantics' is distinct from 'cumulative_position'
  or new.value->>'certainty' is null or new.value->>'certainty' not in('known','reconcile') or new.value->>'observationId' is distinct from o.id::text
  or new.value->'snapshot' is distinct from coalesce(o.facts,'null'::jsonb) or new.value->'proof' is distinct from o.proof
  or new.value->'sourceOrder' is distinct from coalesce(to_jsonb(o.source_order),'null'::jsonb)
  or new.value-array['schemaVersion','semantics','certainty','observationId','sourceOrder','snapshot','proof','receivedGrossCents','completedRefundCents','pendingRefundCents','chargebackOutstandingCents','creditCents','lastKnownCreditCents','remainingCents','excessCents','feeCents','reasons','resolutionCandidate']<>'{}'::jsonb
  then raise exception 'Posição financeira sem origem'; end if;
 foreach key in array array['receivedGrossCents','completedRefundCents','pendingRefundCents','chargebackOutstandingCents','creditCents','lastKnownCreditCents','remainingCents','excessCents','feeCents'] loop
  if new.value->key is null then raise exception 'Campo financeiro ausente'; end if;
  if new.value->key<>'null'::jsonb then
   if jsonb_typeof(new.value->key)<>'number' then raise exception 'Valor financeiro inválido'; end if;
   number:=(new.value->>key)::numeric;
   if number<0 or number>9007199254740991 or trunc(number)<>number then raise exception 'Valor financeiro inválido'; end if;
  end if;
 end loop;
 if new.value->'receivedGrossCents'<>'null'::jsonb and not exists(select 1 from private.payment_financial_observations h where h.charge_id=c.id
  and h.facts->>'status'='RECEIVED' and h.facts->>'classification'='received' and h.facts->'deleted'='false'::jsonb
  and h.facts->'amounts'->'receivedCents'=new.value->'receivedGrossCents') then raise exception 'Bruto sem prova de recebimento'; end if;
 if new.value->>'certainty'='known' then
  if new.value->'creditCents'='null'::jsonb or jsonb_typeof(new.value->'creditCents') is distinct from 'number'
   or (new.value->>'creditCents')::numeric not between 0 and 9007199254740991 then raise exception 'Crédito financeiro inválido'; end if;
 end if;
 if jsonb_typeof(new.value->'reasons') is distinct from 'array' or not(new.value ? 'resolutionCandidate')
  or exists(select 1 from jsonb_array_elements(new.value->'reasons') r where jsonb_typeof(r)<>'string' or r#>>'{}' !~ '^[a-z_]{1,100}$') then raise exception 'Posicao financeira invalida'; end if;
 if new.value->>'certainty'='reconcile' and new.value->'resolutionCandidate' is distinct from 'null'::jsonb then raise exception 'Resolucao financeira invalida'; end if;
 if new.value->>'certainty'='known' then
  if o.facts is null or o.source_order is null or o.facts->'deleted' is distinct from 'false'::jsonb
   or exists(select 1 from jsonb_array_elements_text(new.value->'reasons') r where r<>'fee_unknown')
   or new.value->'lastKnownCreditCents' is distinct from new.value->'creditCents'
   or new.value->'pendingRefundCents' is distinct from '0'::jsonb
   or o.facts->'chargeback'->>'status' in('REQUESTED','IN_DISPUTE') then raise exception 'Posicao conhecida invalida'; end if;
  foreach key in array array['receivedGrossCents','completedRefundCents','pendingRefundCents','chargebackOutstandingCents','creditCents','lastKnownCreditCents','remainingCents','excessCents'] loop
   if new.value->key='null'::jsonb then raise exception 'Posicao conhecida incompleta'; end if;
  end loop;
 end if;
 if new.value->'creditCents'<>'null'::jsonb then
  gross:=(new.value->>'receivedGrossCents')::numeric;done:=(new.value->>'completedRefundCents')::numeric;
  pending:=(new.value->>'pendingRefundCents')::numeric;cb:=(new.value->>'chargebackOutstandingCents')::numeric;
  credit:=(new.value->>'creditCents')::numeric;contracted:=(o.facts->'amounts'->>'contractedCents')::numeric;
  if gross is null or gross<=0 or done is null or pending is null or cb is null or contracted is null
   or credit is distinct from gross-done-cb or new.value->'completedRefundCents' is distinct from o.facts->'refunds'->'completedCents'
   or new.value->'pendingRefundCents' is distinct from o.facts->'refunds'->'pendingCents'
   or new.value->'feeCents' is distinct from o.facts->'amounts'->'feeCents'
   or (new.value->>'remainingCents')::numeric is distinct from greatest(contracted-credit,0)
   or (new.value->>'excessCents')::numeric is distinct from greatest(credit-contracted,0) then raise exception 'Credito sem composicao financeira'; end if;
  if o.facts->'chargeback'='null'::jsonb then
   if o.facts->'presence'->>'chargeback' is distinct from 'null' or cb<>0 then raise exception 'Debito financeiro invalido'; end if;
  elsif new.value->'proof'->>'kind' is distinct from 'proven' or new.value->'chargebackOutstandingCents' is distinct from new.value->'proof'->'outstandingCents' then raise exception 'Debito sem prova'; end if;
  candidate:=case when new.value->>'certainty'<>'known' then null when credit>=contracted and done=0 and cb=0 then 'received' when done=gross and cb=0 and credit=0 then 'refunded' else null end;
  if new.value->'resolutionCandidate' is distinct from coalesce(to_jsonb(candidate),'null'::jsonb) then raise exception 'Resolucao financeira invalida'; end if;
 end if;
 -- Apenas o futuro escritor X, sob locks e rederivacao, podera confirmar cobertura.
 new.journal_fingerprint:=private.financial_journal_fingerprint(c.id);
 new.charge_revision:=c.revision;
 return new;
end; $$;
create or replace function private.order_payment_credit(target_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare accepted record;manual_deposit numeric;manual_total numeric;provider_deposit numeric;provider_total numeric;
 dep_uncertain boolean:=false;total_uncertain boolean:=false;unsafe boolean:=false;dep numeric;total numeric;
 required bigint;contract_total bigint;legacy_count bigint;missing_count bigint;legacy_deposit boolean;pending_count bigint;conflict_count bigint;
begin
 if not exists(select 1 from public.orders where id=target_order) then raise exception 'Pedido indisponível'; end if;
 select * into accepted from private.accepted_order_deposit(target_order);
 if found then required:=accepted.required_cents;contract_total:=accepted.total_cents; end if;
 select coalesce(sum(amount_cents) filter(where kind='deposit'),0),coalesce(sum(amount_cents),0) into manual_deposit,manual_total
 from public.payments where order_id=target_order and method='pix_manual' and status='confirmed' and kind in('deposit','balance');
 select coalesce(sum((p.value->>'creditCents')::numeric) filter(where x.phase='deposit'),0),coalesce(sum((p.value->>'creditCents')::numeric),0),
  coalesce(bool_or(x.phase='deposit' and(p.charge_id is null or p.value->>'certainty' is distinct from 'known' or pending_state.pending or pending_state.conflicted)),false),
  coalesce(bool_or(p.charge_id is null or p.value->>'certainty' is distinct from 'known' or pending_state.pending or pending_state.conflicted),false),count(*) filter(where p.charge_id is null),count(*) filter(where pending_state.pending),count(*) filter(where pending_state.conflicted)
 into provider_deposit,provider_total,dep_uncertain,total_uncertain,missing_count,pending_count,conflict_count
 from private.payment_financial_charges c join private.payment_intents i on i.id=c.intent_id
 join private.payment_obligation_contexts x on x.id=i.context_id left join private.payment_financial_positions p on p.charge_id=c.id cross join lateral(select (c.current_query is not null or p.journal_fingerprint is distinct from private.financial_journal_fingerprint(c.id)) pending,
 exists(select 1 from private.payment_financial_conflicts f join private.payment_financial_observations o on o.id=f.observation_id where o.charge_id=c.id) conflicted) pending_state where c.order_id=target_order;
 select count(*),coalesce(bool_or(p.kind='deposit'),false) into legacy_count,legacy_deposit
 from public.payments p left join private.payment_legacy_bindings b on b.payment_id=p.id
 where p.order_id=target_order and p.method='asaas' and p.kind in('deposit','balance') and b.payment_id is null;
 -- Legado não prova conta por provider_ref: conserva incerteza e não soma.
 dep_uncertain:=dep_uncertain or legacy_deposit;
 total_uncertain:=total_uncertain or legacy_count>0;
 dep:=manual_deposit+provider_deposit;total:=manual_total+provider_total;
 unsafe:=manual_deposit>9007199254740991 or manual_total>9007199254740991 or provider_deposit>9007199254740991 or provider_total>9007199254740991
  or dep>9007199254740991 or total>9007199254740991 or required not between 0 and 9007199254740991 or contract_total not between 0 and 9007199254740991;
 if unsafe or required is null or contract_total is null then dep_uncertain:=true;total_uncertain:=true; end if;
 return jsonb_build_object('schemaVersion',1,'semantics','credit_projection','orderId',target_order,'effects','none',
  'requiredDepositCents',required,'totalCents',contract_total,
  'manualDepositCents',case when manual_deposit<=9007199254740991 then manual_deposit else null end,
  'manualTotalCents',case when manual_total<=9007199254740991 then manual_total else null end,
  'providerObservedDepositCents',case when provider_deposit<=9007199254740991 then provider_deposit else null end,
  'providerObservedTotalCents',case when provider_total<=9007199254740991 then provider_total else null end,
  'depositCreditCents',case when dep_uncertain then null else dep end,'totalCreditCents',case when total_uncertain then null else total end,
  'depositUncertain',dep_uncertain,'uncertain',total_uncertain,'unsafeAmount',coalesce(unsafe,false),
  'partial',case when dep_uncertain then null else dep<required end,
  'remainingDepositCents',case when dep_uncertain then null else greatest(required-dep,0) end,
  'remainingTotalCents',case when total_uncertain then null else greatest(contract_total-total,0) end,
  'depositExcessCents',case when dep_uncertain then null else greatest(dep-required,0) end,
  'totalExcessCents',case when total_uncertain then null else greatest(total-contract_total,0) end,
  'unlinkedLegacyCount',legacy_count,'missingPositionCount',missing_count,'pendingChargeCount',pending_count,'conflictedChargeCount',conflict_count);
end; $$;
revoke all on function private.order_payment_credit(uuid) from public,anon,authenticated,service_role;
create or replace function public.get_financial_projection_source(target_observation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.payment_financial_charges%rowtype;o private.payment_financial_observations%rowtype;p private.payment_financial_positions%rowtype;
 phase text;history jsonb;fresh boolean;precedes boolean;conflict_count bigint;query_revision bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Projeção fictícia indisponível'; end if;
 select * into o from private.payment_financial_observations where id=target_observation;
 select * into c from private.payment_financial_charges where id=o.charge_id;
 perform private.require_payment_fixture_system(c.scope_id,c.client_id);
 select x.phase into phase from private.payment_intents i join private.payment_obligation_contexts x on x.id=i.context_id where i.id=c.intent_id;
 select * into p from private.payment_financial_positions where charge_id=c.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'sourceOrder',source_order,'facts',facts,'proof',proof) order by id),'[]'::jsonb) into history
 from(select min(id::text)::uuid id,source_order,facts,proof from private.payment_financial_observations
  where charge_id=c.id and id<>o.id and facts is not null group by source_order,facts,proof) h;
 fresh:=case when o.source_kind='query' then exists(select 1 from private.payment_financial_queries q where q.id=o.source_id and q.charge_id=c.id and q.revision=c.revision) else c.revision=0 end;
 select count(*) into conflict_count from private.payment_financial_conflicts f join private.payment_financial_observations h on h.id=f.observation_id where h.charge_id=c.id;
 query_revision:=case when o.source_kind='query' then (select revision from private.payment_financial_queries where id=o.source_id and charge_id=c.id) else 0 end;
 precedes:=p.charge_id is not null and p.charge_revision is not null and query_revision<p.charge_revision;
 return jsonb_build_object('chargeId',c.id,'orderId',c.order_id,'intentId',c.intent_id,'phase',phase,'expectation',c.expectation,
  'revision',coalesce(p.revision,0),'chargeRevision',c.revision,'journalFingerprint',private.financial_journal_fingerprint(c.id),'sourceConflictCount',conflict_count,'observation',jsonb_build_object('id',o.id,'sourceOrder',o.source_order,'facts',o.facts,'proof',o.proof),
  'previous',p.value,'history',history,'captureIsCurrent',fresh,'capturePrecedesPrevious',coalesce(precedes,false));
end; $$;
revoke all on function public.get_financial_projection_source(uuid) from public,anon,authenticated;
grant execute on function public.get_financial_projection_source(uuid) to service_role;
