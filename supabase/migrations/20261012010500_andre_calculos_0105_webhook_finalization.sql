-- Cobertura das notificações recebidas e finalização atômica pelo núcleo T/Y.
create index payment_webhook_event_payment_idx on private.payment_webhook_events(scope_id,provider_payment_id,id);
alter table private.payment_webhook_runs add column resolution_request_id uuid not null unique default gen_random_uuid();
alter table private.payment_webhook_runs add column finalization_result jsonb check(finalization_result is null or jsonb_typeof(finalization_result)='object');
alter table private.payment_webhook_runs add constraint payment_webhook_finalization_check check((stage='complete')=(finalization_result is not null));
create or replace function private.preserve_webhook_run() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' and session_user='postgres' and exists(select 1 from private.payment_fixture_environment where singleton and enabled) then return old; end if;
 if tg_op='DELETE' or (new.id,new.trigger_event_id,new.scope_id,new.provider_payment_id,new.charge_id,new.query_id,new.application_request_id,new.source_snapshot,new.source_fingerprint,new.created_at)
  is distinct from(old.id,old.trigger_event_id,old.scope_id,old.provider_payment_id,old.charge_id,old.query_id,old.application_request_id,old.source_snapshot,old.source_fingerprint,old.created_at)
  or new.resolution_request_id is distinct from old.resolution_request_id
  or (old.finalization_result is not null and new.finalization_result is distinct from old.finalization_result)
  or new.epoch<old.epoch or (old.observation_id is not null and new.observation_id is distinct from old.observation_id)
  or (old.stage in('complete','superseded','unmatched','identity_mismatch') and new is distinct from old) then raise exception 'Run de webhook imutável'; end if;
 return new;
end; $$;
create function private.financial_observation_fingerprint(target_charge uuid) returns text
language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
 'observations',coalesce((select jsonb_agg(signature order by signature::text collate "C") from
 (select distinct jsonb_build_array(o.source_order,private.financial_canonical_facts(o.facts),private.financial_canonical_proof(o.proof),case when o.facts is null then o.id else null end) signature
 from private.payment_financial_observations o where o.charge_id=target_charge) s),'[]'::jsonb),
 'conflicts',coalesce((select jsonb_agg(jsonb_build_array(f.observation_id,f.attempt_hash) order by f.observation_id,f.attempt_hash) from private.payment_financial_conflicts f join private.payment_financial_observations o on o.id=f.observation_id where o.charge_id=target_charge),'[]'::jsonb)
 )::text,'UTF8')),'hex');
$$;

revoke all on function private.financial_observation_fingerprint(uuid) from public,anon,authenticated,service_role;
create or replace function private.financial_journal_fingerprint(target_charge uuid) returns text
language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object('financial',private.financial_observation_fingerprint(target_charge),
 'webhooks',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'bodyHash',e.minimal_body_hash,
  'conflicts',coalesce((select jsonb_agg(jsonb_build_array(x.id,x.minimal_body_hash) order by x.id) from private.payment_webhook_conflicts x where x.event_id=e.id),'[]'::jsonb)) order by e.id)
  from private.payment_webhook_events e join private.payment_financial_charges c on c.scope_id=e.scope_id and c.provider_payment_id=e.provider_payment_id where c.id=target_charge),'[]'::jsonb)
 )::text,'UTF8')),'hex');
$$;
create function private.webhook_charge_has_pending(target_charge uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from private.payment_webhook_events e join private.payment_webhook_queue q on q.event_id=e.id
  join private.payment_financial_charges c on c.scope_id=e.scope_id and c.provider_payment_id=e.provider_payment_id
  where c.id=target_charge and q.state<>'done');
$$;
revoke all on function private.webhook_charge_has_pending(uuid) from public,anon,authenticated,service_role;
create or replace function private.lock_order_financial_sources(target_order uuid) returns void
language plpgsql volatile set search_path='' as $$
declare charge record;
begin
 if target_order is null then raise exception 'Fontes financeiras indisponiveis'; end if;
 perform id from private.payment_financial_charges where order_id=target_order order by id for update;
 perform q.id from private.payment_financial_queries q join private.payment_financial_charges c on c.id=q.charge_id where c.order_id=target_order order by q.charge_id,q.revision for update of q;
 perform p.charge_id from private.payment_financial_positions p join private.payment_financial_charges c on c.id=p.charge_id where c.order_id=target_order order by p.charge_id for update of p;
 for charge in select scope_id,provider_payment_id from private.payment_financial_charges where order_id=target_order order by scope_id,provider_payment_id loop
  perform private.lock_webhook_payment(charge.scope_id,charge.provider_payment_id);
 end loop;
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
 join private.payment_obligation_contexts x on x.id=i.context_id left join private.payment_financial_positions p on p.charge_id=c.id cross join lateral(select (c.current_query is not null or p.journal_fingerprint is distinct from private.financial_journal_fingerprint(c.id) or private.webhook_charge_has_pending(c.id)) pending,
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
create or replace function public.resolve_financial_execution(target_application uuid,request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare application private.payment_financial_applications%rowtype;
 charge private.payment_financial_charges%rowtype; origin private.payment_execution_observations%rowtype;
 run private.payment_execution_runs%rowtype; intent private.payment_intents%rowtype;
 captured private.payment_obligation_contexts%rowtype; binding private.payment_provider_customers%rowtype;
 position private.payment_financial_positions%rowtype; owner_before uuid;
 scope jsonb; source jsonb; result jsonb; candidate text; resolution_reason text;
 at_time timestamptz; released uuid; expected_run_revision bigint;
begin
 if auth.role() is distinct from 'service_role' or target_application is null or request_id is null then raise exception 'Resolucao financeira indisponivel'; end if;
 result:=public.get_financial_resolution_receipt(target_application,request_id);
 if result is not null then return result; end if;
 select * into application from private.payment_financial_applications a where a.request_id=target_application;
 select * into charge from private.payment_financial_charges where id=application.charge_id;
 select * into origin from private.payment_execution_observations where id=charge.origin_id;
 select * into run from private.payment_execution_runs where id=origin.run_id;
 if application.request_id is null or charge.id is null or run.id is null then raise exception 'Origem da resolucao indisponivel'; end if;
 select owner_id into owner_before from public.clients where id=charge.client_id;
 intent:=private.lock_payment_execution(run.request_id);
 perform pg_advisory_xact_lock(hashtextextended('financial-resolution:'||request_id::text,0));
 result:=public.get_financial_resolution_receipt(target_application,request_id);
 if result is not null then return result; end if;
 -- Fontes mutaveis sao relidas depois dos mesmos locks de AB/Y/T.
 select * into application from private.payment_financial_applications a where a.request_id=target_application;
 select * into charge from private.payment_financial_charges where id=application.charge_id;
 select * into run from private.payment_execution_runs where id=origin.run_id for update;
 select * into captured from private.payment_obligation_contexts where id=intent.context_id;
 select * into binding from private.payment_provider_customers where id=captured.binding_id;
 scope:=private.require_payment_fixture_system(charge.scope_id,charge.client_id);
 if intent.id is distinct from charge.intent_id or intent.order_id is distinct from charge.order_id
  or (application.charge_id,application.intent_id,application.order_id) is distinct from (charge.id,intent.id,intent.order_id)
  or not exists(select 1 from private.payment_financial_observations o where o.id=application.observation_id and o.charge_id=charge.id)
  or application.result->'schemaVersion' is distinct from '1'::jsonb or application.result->>'semantics' is distinct from 'financial_application_receipt'
  or application.result->>'requestId' is distinct from application.request_id::text
  or application.result->>'observationId' is distinct from application.observation_id::text
  or application.result->>'chargeId' is distinct from application.charge_id::text
  or application.result->>'orderId' is distinct from application.order_id::text
  or application.result->>'intentId' is distinct from application.intent_id::text
  or application.result->'positionRevision' is distinct from to_jsonb(application.position_revision)
  or application.result->'chargeRevision' is distinct from to_jsonb(application.charge_revision)
  or application.result->>'journalFingerprint' is distinct from application.journal_fingerprint
  or (run.intent_id,run.scope_id,run.client_id,run.selected_payment_id) is distinct from (intent.id,charge.scope_id,charge.client_id,charge.provider_payment_id)
  or origin.run_id is distinct from run.id
  or (select owner_id from public.clients where id=charge.client_id) is distinct from owner_before
  or not exists(select 1 from public.profiles where id=owner_before and role='client')
  or not exists(select 1 from public.profiles where id=intent.created_by and role in('client','calculator'))
  or captured.order_id is distinct from intent.order_id or captured.client_id is distinct from charge.client_id
  or captured.snapshot->>'orderId' is distinct from captured.order_id::text or captured.snapshot->>'clientId' is distinct from captured.client_id::text
  or captured.snapshot->>'phase' is distinct from captured.phase or captured.snapshot->>'quoteId' is distinct from captured.quote_id::text
  or captured.snapshot->>'contextHash' is distinct from captured.context_hash
  or (captured.snapshot->>'remainingCents')::numeric is distinct from captured.remaining_cents
  or captured.snapshot->>'billingType' is distinct from captured.billing_type or captured.snapshot->>'dueDate' is distinct from captured.due_date::text
  or captured.snapshot->'binding'->>'id' is distinct from binding.id::text or binding.client_id is distinct from charge.client_id or binding.scope_id is distinct from charge.scope_id
  or captured.snapshot->'binding'->>'clientId' is distinct from binding.client_id::text
  or captured.snapshot->'binding'->>'customerId' is distinct from binding.customer_id
  or captured.snapshot->'binding'->'scope' is distinct from scope
  or run.snapshot->'obligation' is distinct from captured.snapshot
  or charge.expectation is distinct from jsonb_build_object('phase','observation','scope',scope,'paymentId',charge.provider_payment_id,'customerId',binding.customer_id,
   'reference',intent.id::text,'contractedCents',captured.remaining_cents,'billingType',captured.billing_type,'dueDate',captured.due_date::text)
  then raise exception 'Resolucao financeira sem origem'; end if;
 if exists(select 1 from private.payment_financial_resolutions where intent_id=intent.id)
  or exists(select 1 from private.payment_intent_resolutions where intent_id=intent.id)
  then raise sqlstate 'PT409' using message='Intencao ja resolvida'; end if;
 if run.state='resolved' or exists(select 1 from private.payment_intent_withdrawals where intent_id=intent.id)
  or not exists(select 1 from private.payment_intent_dispatch_claims where intent_id=intent.id and run_id=run.id)
  then raise sqlstate 'PT409' using message='Protecao da execucao indisponivel'; end if;
 select * into position from private.payment_financial_positions where charge_id=charge.id;
 source:=public.get_financial_projection_source(application.observation_id);
 if application.result->>'action' is null or application.result->>'action' not in('replace','same')
  or source->'captureIsCurrent' is distinct from 'true'::jsonb
  or source->'sourceConflictCount' is distinct from '0'::jsonb
  or charge.current_query is not null
  or private.webhook_charge_has_pending(charge.id)
  or position.revision is distinct from application.position_revision
  or position.charge_revision is distinct from application.charge_revision
  or position.charge_revision is distinct from charge.revision
  or position.journal_fingerprint is distinct from application.journal_fingerprint
  or position.journal_fingerprint is distinct from private.financial_journal_fingerprint(charge.id)
  or position.value is distinct from application.result->'position'
  or position.observation_id is distinct from application.basis_observation_id
  or position.value->>'certainty' is distinct from 'known' then return null; end if;
 perform private.validate_known_financial_history(charge.id,position.value);
 candidate:=position.value->>'resolutionCandidate';
 if candidate is null or candidate not in('received','refunded') then return null; end if;
 if position.value->'pendingRefundCents' is distinct from '0'::jsonb
  or position.value->'chargebackOutstandingCents' is distinct from '0'::jsonb
  or (candidate='received' and ((position.value->>'creditCents')::numeric<captured.remaining_cents or position.value->'completedRefundCents' is distinct from '0'::jsonb))
  or (candidate='refunded' and (position.value->'completedRefundCents' is distinct from position.value->'receivedGrossCents' or position.value->'creditCents' is distinct from '0'::jsonb))
  then raise exception 'Candidato financeiro inconsistente'; end if;
 -- Zero ou outra reserva nao provam liberacao anterior. Replay ja retornou.
 if not exists(select 1 from private.payment_intent_reservations where order_id=intent.order_id and intent_id=intent.id)
  then raise sqlstate 'PT409' using message='Reserva propria indisponivel'; end if;
 expected_run_revision:=run.revision;
 if expected_run_revision not between 0 and 9007199254740990 then raise exception 'Revisao terminal indisponivel'; end if;
 resolution_reason:='financial_'||candidate;at_time:=clock_timestamp();
 update private.payment_execution_runs r set state='resolved',reason=resolution_reason,current_step=null,revision=r.revision+1
  where r.id=run.id and r.revision=expected_run_revision and r.state<>'resolved';
 if not found then raise sqlstate 'PT409' using message='Execucao mudou durante a resolucao'; end if;
 delete from private.payment_intent_reservations r where r.order_id=intent.order_id and r.intent_id=intent.id returning r.order_id into released;
 if released is distinct from intent.order_id then raise exception 'Reserva propria indisponivel'; end if;
 result:=jsonb_build_object('schemaVersion',1,'semantics','financial_resolution_receipt','mode','fixture','requestId',request_id,
  'applicationRequestId',target_application,'executionRequestId',run.request_id,'chargeId',charge.id,'orderId',intent.order_id,'intentId',intent.id,'runId',run.id,
  'observationId',application.observation_id,'basisObservationId',position.observation_id,'reason',resolution_reason,'recordedAt',at_time,
  'positionRevision',position.revision,'chargeRevision',position.charge_revision,'journalFingerprint',position.journal_fingerprint,
  'expectedRunRevision',expected_run_revision,'appliedRunRevision',expected_run_revision+1,
  'view',jsonb_build_object('mode','fixture','identityProof','fixture_declared','intentId',intent.id,'runId',run.id,'createdBy',intent.created_by,
   'currentOwnerId',owner_before,'createdAt',run.created_at,'state','resolved','reason',resolution_reason,'revision',expected_run_revision+1,'dispatchClaimed',true,'reservationActive',false));
 insert into private.payment_financial_resolutions(request_id,application_request_id,intent_id,run_id,execution_request_id,order_id,charge_id,observation_id,basis_observation_id,
  reason,position_revision,charge_revision,journal_fingerprint,expected_run_revision,applied_run_revision,recorded_at,result)
 values(request_id,target_application,intent.id,run.id,run.request_id,intent.order_id,charge.id,application.observation_id,position.observation_id,
  resolution_reason,position.revision,position.charge_revision,position.journal_fingerprint,expected_run_revision,expected_run_revision+1,at_time,result);
 if private.payment_execution_view(intent.id) is distinct from result->'view' then raise exception 'View terminal divergente'; end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_financial_resolved','payment_financial_resolution',request_id);
 return result;
end; $$;

create function public.get_fixture_webhook_finalization_receipt(target_run uuid,worker_id uuid,expected_epoch bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r private.payment_webhook_runs%rowtype;c private.payment_financial_charges%rowtype;
begin
 if auth.role() is distinct from 'service_role' or target_run is null or worker_id is null or expected_epoch is null
  then raise exception 'Finalizacao de webhook indisponivel'; end if;
 select * into r from private.payment_webhook_runs where id=target_run;
 select * into c from private.payment_financial_charges where id=r.charge_id;
 perform private.require_payment_fixture_system(c.scope_id,c.client_id);
 if r.worker_id is distinct from worker_id or r.epoch is distinct from expected_epoch then raise sqlstate 'PT412' using message='Worker de webhook antigo'; end if;
 return r.finalization_result;
end; $$;
revoke all on function public.get_fixture_webhook_finalization_receipt(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.get_fixture_webhook_finalization_receipt(uuid,uuid,bigint) to service_role;

create function public.finalize_fixture_payment_webhook(target_run uuid,worker_id uuid,expected_epoch bigint,expected_source_fingerprint text,
 expected_position_revision bigint,expected_charge_revision bigint,expected_journal_fingerprint text,decision_action text,position_value jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r private.payment_webhook_runs%rowtype;c private.payment_financial_charges%rowtype;
 execution private.payment_execution_runs%rowtype;intent private.payment_intents%rowtype;captured private.payment_obligation_contexts%rowtype;
 q private.payment_financial_queries%rowtype;recipient uuid;owner_before uuid;fingerprint text;affected bigint;result jsonb;application jsonb;resolution jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Finalizacao de webhook indisponivel'; end if;
 result:=public.get_fixture_webhook_finalization_receipt(target_run,worker_id,expected_epoch);
 if result is not null then return result; end if;
 select * into r from private.payment_webhook_runs where id=target_run;
 select * into c from private.payment_financial_charges where id=r.charge_id;
 select x.* into execution from private.payment_execution_runs x join private.payment_execution_observations o on o.run_id=x.id where o.id=c.origin_id;
 if c.id is null or (execution.intent_id,execution.scope_id,execution.client_id,execution.selected_payment_id) is distinct from(c.intent_id,c.scope_id,c.client_id,c.provider_payment_id)
  then raise exception 'Origem financeira de webhook indisponivel'; end if;
 -- Mesma ordem de Y: responsavel/profiles antes de cliente/pedido/fontes.
 select profile_id into recipient from private.calculator_notification_recipient where singleton for share;
 select * into intent from private.payment_intents where id=c.intent_id;
 select * into captured from private.payment_obligation_contexts where id=intent.context_id;
 select owner_id into owner_before from public.clients where id=c.client_id;
 perform id from public.profiles where id in(recipient,owner_before,intent.created_by,captured.actor_id,(captured.snapshot->>'ownerId')::uuid) order by id for share;
 if recipient is not null and not exists(select 1 from public.profiles where id=recipient and role='calculator') then raise exception 'Responsavel pelos avisos indisponivel'; end if;
 intent:=private.lock_payment_execution(execution.request_id);
 if intent.id is distinct from c.intent_id or intent.order_id is distinct from c.order_id then raise exception 'Vinculo financeiro de webhook indisponivel'; end if;
 perform private.lock_webhook_payment(c.scope_id,c.provider_payment_id);
 select * into r from private.payment_webhook_runs where id=target_run for update;
 result:=public.get_fixture_webhook_finalization_receipt(target_run,worker_id,expected_epoch);
 if result is not null then return result; end if;
 select * into c from private.payment_financial_charges where id=r.charge_id;
 perform private.require_payment_fixture_system(c.scope_id,c.client_id);
 fingerprint:=encode(sha256(convert_to(private.webhook_pending_sources(r.scope_id,r.provider_payment_id)::text,'UTF8')),'hex');
 if r.stage is distinct from 'queried' or r.worker_id is distinct from worker_id or r.epoch is distinct from expected_epoch or r.lease_until<=clock_timestamp()
  or expected_source_fingerprint is distinct from r.source_fingerprint or fingerprint is distinct from r.source_fingerprint
  then raise sqlstate 'PT412' using message='Fonte de webhook mudou'; end if;
 select * into q from private.payment_financial_queries where id=r.query_id and charge_id=c.id;
 if q.finished_at is null or q.revision is distinct from c.revision or c.current_query is not null
  or not exists(select 1 from private.payment_financial_observations o where o.id=r.observation_id and o.charge_id=c.id and o.source_kind='query' and o.source_id=q.id)
  then raise sqlstate 'PT412' using message='Consulta de webhook antiga'; end if;
 if public.get_financial_application_receipt(r.observation_id,r.application_request_id) is not null then raise exception 'Aplicacao fora da finalizacao'; end if;
 perform x.event_id from private.payment_webhook_queue x where x.event_id in(select (v->>'eventId')::uuid from jsonb_array_elements(r.source_snapshot) v) order by x.event_id for update;
 if exists(select 1 from jsonb_array_elements(r.source_snapshot) v left join private.payment_webhook_queue x on x.event_id=(v->>'eventId')::uuid
  where x.event_id is null or x.state is distinct from 'processing' or x.worker_id is distinct from r.worker_id or x.revision is distinct from(v->>'revision')::bigint or x.lease_until is distinct from r.lease_until)
  then raise sqlstate 'PT412' using message='Fila de webhook mudou'; end if;
 -- Dentro desta transacao: liberar a guarda de pendencia antes de Y verificar a fila do Andre.
 update private.payment_webhook_queue set state='done',worker_id=null,lease_until=null
  where event_id in(select (v->>'eventId')::uuid from jsonb_array_elements(r.source_snapshot) v);
 get diagnostics affected=row_count;
 if affected<>jsonb_array_length(r.source_snapshot) then raise exception 'Lote de webhook incompleto'; end if;
 application:=public.apply_financial_observation(r.observation_id,r.application_request_id,expected_position_revision,expected_charge_revision,expected_journal_fingerprint,decision_action,position_value);
 if exists(select 1 from private.payment_intent_reservations where order_id=c.order_id and intent_id=c.intent_id)
  and not exists(select 1 from private.payment_execution_runs where id=execution.id and state='resolved') then
  resolution:=public.resolve_financial_execution(r.application_request_id,r.resolution_request_id);
 end if;
 result:=jsonb_build_object('schemaVersion',1,'semantics','webhook_finalization_receipt','mode','fixture','identityProof','fixture_declared',
  'runId',r.id,'eventId',r.trigger_event_id,'scopeId',r.scope_id,'paymentId',r.provider_payment_id,'chargeId',r.charge_id,
  'queryId',r.query_id,'observationId',r.observation_id,'applicationRequestId',r.application_request_id,'workerId',r.worker_id,'epoch',r.epoch,
  'sourceFingerprint',r.source_fingerprint,'sourceCount',jsonb_array_length(r.source_snapshot),'completedAt',clock_timestamp(),
  'application',application,'resolution',resolution);
 update private.payment_webhook_runs set stage='complete',finalization_result=result where id=r.id;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_webhook_finalized','payment_webhook_run',r.id);
 return result;
end; $$;
revoke all on function public.finalize_fixture_payment_webhook(uuid,uuid,bigint,text,bigint,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_fixture_payment_webhook(uuid,uuid,bigint,text,bigint,bigint,text,text,jsonb) to service_role;
