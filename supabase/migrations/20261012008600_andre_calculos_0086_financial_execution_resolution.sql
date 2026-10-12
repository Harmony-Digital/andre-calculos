-- Terminal financeiro exclusivamente local, separado da prova de nao despacho S.
create table private.payment_financial_resolutions (
 request_id uuid primary key,
 application_request_id uuid not null unique references private.payment_financial_applications(request_id),
 intent_id uuid not null unique references private.payment_intents(id),
 run_id uuid not null unique references private.payment_execution_runs(id),
 execution_request_id uuid not null,
 order_id uuid not null references public.orders(id),
 charge_id uuid not null unique references private.payment_financial_charges(id),
 observation_id uuid not null references private.payment_financial_observations(id),
 basis_observation_id uuid not null references private.payment_financial_observations(id),
 reason text not null check(reason in('financial_received','financial_refunded')),
 position_revision bigint not null check(position_revision between 1 and 9007199254740991),
 charge_revision bigint not null check(charge_revision between 0 and 9007199254740991),
 journal_fingerprint text not null check(journal_fingerprint ~ '^[0-9a-f]{64}$'),
 expected_run_revision bigint not null check(expected_run_revision between 0 and 9007199254740990),
 applied_run_revision bigint not null check(applied_run_revision=expected_run_revision+1),
 recorded_at timestamptz not null,
 result jsonb not null check(jsonb_typeof(result)='object'),
 foreign key(execution_request_id,intent_id) references private.payment_intent_requests(id,intent_id)
);
create index payment_financial_resolutions_execution_idx on private.payment_financial_resolutions(execution_request_id,intent_id);
create index payment_financial_resolutions_order_idx on private.payment_financial_resolutions(order_id);
create index payment_financial_resolutions_observation_idx on private.payment_financial_resolutions(observation_id);
create index payment_financial_resolutions_basis_idx on private.payment_financial_resolutions(basis_observation_id);
alter table private.payment_financial_resolutions enable row level security;
revoke all on private.payment_financial_resolutions from public,anon,authenticated,service_role;
create trigger payment_financial_resolution_immutable before update on private.payment_financial_resolutions
 for each row execute function private.preserve_quote_contract_record();

create function public.get_financial_resolution_receipt(target_application uuid,request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare receipt private.payment_financial_resolutions%rowtype;
begin
 if auth.role() is distinct from 'service_role' or target_application is null or request_id is null then raise exception 'Resolucao financeira indisponivel'; end if;
 select * into receipt from private.payment_financial_resolutions r where r.request_id=get_financial_resolution_receipt.request_id;
 if receipt.request_id is null then return null; end if;
 if receipt.application_request_id is distinct from target_application then raise sqlstate 'PT409' using message='Resolucao ja vinculada a outra aplicacao'; end if;
 -- Recibo historico precede owner/configuracao/cobertura/reserva/marker atuais.
 return receipt.result;
end; $$;
revoke all on function public.get_financial_resolution_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_financial_resolution_receipt(uuid,uuid) to service_role;

-- As views atuais validam terminal historico, nunca a posicao depois de estorno.
create function private.financial_terminal_receipt(target_intent uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare terminal private.payment_financial_resolutions%rowtype; application private.payment_financial_applications%rowtype;
begin
 select * into terminal from private.payment_financial_resolutions where intent_id=target_intent;
 if terminal.request_id is null then return null; end if;
 select * into application from private.payment_financial_applications where request_id=terminal.application_request_id;
 if application.request_id is null
  or (application.charge_id,application.intent_id,application.order_id,application.observation_id,application.basis_observation_id,
      application.position_revision,application.charge_revision,application.journal_fingerprint)
   is distinct from (terminal.charge_id,terminal.intent_id,terminal.order_id,terminal.observation_id,terminal.basis_observation_id,
      terminal.position_revision,terminal.charge_revision,terminal.journal_fingerprint)
  or terminal.result->>'requestId' is distinct from terminal.request_id::text
  or terminal.result->>'applicationRequestId' is distinct from terminal.application_request_id::text
  or terminal.result->>'executionRequestId' is distinct from terminal.execution_request_id::text
  or terminal.result->>'reason' is distinct from terminal.reason
  or terminal.result->>'intentId' is distinct from terminal.intent_id::text
  or terminal.result->>'runId' is distinct from terminal.run_id::text
  or terminal.result->>'chargeId' is distinct from terminal.charge_id::text
  or terminal.result->>'orderId' is distinct from terminal.order_id::text
  or terminal.result->>'observationId' is distinct from terminal.observation_id::text
  or terminal.result->>'basisObservationId' is distinct from terminal.basis_observation_id::text
  or terminal.result->'positionRevision' is distinct from to_jsonb(terminal.position_revision)
  or terminal.result->'chargeRevision' is distinct from to_jsonb(terminal.charge_revision)
  or terminal.result->>'journalFingerprint' is distinct from terminal.journal_fingerprint
  or terminal.result->'appliedRunRevision' is distinct from to_jsonb(terminal.applied_run_revision)
  or terminal.result->'expectedRunRevision' is distinct from to_jsonb(terminal.expected_run_revision)
  or terminal.result->'view'->>'state' is distinct from 'resolved'
  or terminal.result->'view'->>'reason' is distinct from terminal.reason
  or terminal.result->'view'->>'runId' is distinct from terminal.run_id::text
  or terminal.result->'view'->>'intentId' is distinct from terminal.intent_id::text
  or terminal.result->'view'->'revision' is distinct from to_jsonb(terminal.applied_run_revision)
  or terminal.result->'view'->'dispatchClaimed' is distinct from 'true'::jsonb
  or terminal.result->'view'->'reservationActive' is distinct from 'false'::jsonb
  or exists(select 1 from private.payment_intent_resolutions where intent_id=target_intent)
  or exists(select 1 from private.payment_intent_withdrawals where intent_id=target_intent)
  or exists(select 1 from private.payment_intent_reservations where intent_id=target_intent)
  or not exists(select 1 from private.payment_execution_runs r join private.payment_intent_dispatch_claims claim on claim.run_id=r.id and claim.intent_id=r.intent_id
    where r.id=terminal.run_id and r.intent_id=terminal.intent_id and r.request_id=terminal.execution_request_id
     and r.state='resolved' and r.reason=terminal.reason and r.revision=terminal.applied_run_revision and r.current_step is null)
  then raise exception 'Terminal financeiro inconsistente'; end if;
 return terminal.result;
end; $$;
revoke all on function private.financial_terminal_receipt(uuid) from public,anon,authenticated,service_role;

create function public.get_financial_execution_resolution(target_request uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.role() is distinct from 'service_role' or target_request is null then raise exception 'Resolucao financeira indisponivel'; end if;
 select r.result into result from private.payment_financial_resolutions r where r.execution_request_id=target_request;
 return result;
end; $$;
revoke all on function public.get_financial_execution_resolution(uuid) from public,anon,authenticated;
grant execute on function public.get_financial_execution_resolution(uuid) to service_role;

create function public.resolve_financial_execution(target_application uuid,request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare application private.payment_financial_applications%rowtype;
 charge private.payment_financial_charges%rowtype; origin private.payment_execution_observations%rowtype;
 run private.payment_execution_runs%rowtype; intent private.payment_intents%rowtype;
 captured private.payment_obligation_contexts%rowtype; binding private.payment_provider_customers%rowtype;
 position private.payment_financial_positions%rowtype; owner_before uuid;
 scope jsonb; source jsonb; result jsonb; candidate text; reason text;
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
 reason:='financial_'||candidate;at_time:=clock_timestamp();
 update private.payment_execution_runs r set state='resolved',reason=resolve_financial_execution.reason,current_step=null,revision=r.revision+1
  where r.id=run.id and r.revision=expected_run_revision and r.state<>'resolved';
 if not found then raise sqlstate 'PT409' using message='Execucao mudou durante a resolucao'; end if;
 delete from private.payment_intent_reservations r where r.order_id=intent.order_id and r.intent_id=intent.id returning r.order_id into released;
 if released is distinct from intent.order_id then raise exception 'Reserva propria indisponivel'; end if;
 result:=jsonb_build_object('schemaVersion',1,'semantics','financial_resolution_receipt','mode','fixture','requestId',request_id,
  'applicationRequestId',target_application,'executionRequestId',run.request_id,'chargeId',charge.id,'orderId',intent.order_id,'intentId',intent.id,'runId',run.id,
  'observationId',application.observation_id,'basisObservationId',position.observation_id,'reason',reason,'recordedAt',at_time,
  'positionRevision',position.revision,'chargeRevision',position.charge_revision,'journalFingerprint',position.journal_fingerprint,
  'expectedRunRevision',expected_run_revision,'appliedRunRevision',expected_run_revision+1,
  'view',jsonb_build_object('mode','fixture','identityProof','fixture_declared','intentId',intent.id,'runId',run.id,'createdBy',intent.created_by,
   'currentOwnerId',owner_before,'createdAt',run.created_at,'state','resolved','reason',reason,'revision',expected_run_revision+1,'dispatchClaimed',true,'reservationActive',false));
 insert into private.payment_financial_resolutions(request_id,application_request_id,intent_id,run_id,execution_request_id,order_id,charge_id,observation_id,basis_observation_id,
  reason,position_revision,charge_revision,journal_fingerprint,expected_run_revision,applied_run_revision,recorded_at,result)
 values(request_id,target_application,intent.id,run.id,run.request_id,intent.order_id,charge.id,application.observation_id,position.observation_id,
  reason,position.revision,position.charge_revision,position.journal_fingerprint,expected_run_revision,expected_run_revision+1,at_time,result);
 if private.payment_execution_view(intent.id) is distinct from result->'view' then raise exception 'View terminal divergente'; end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_financial_resolved','payment_financial_resolution',request_id);
 return result;
end; $$;
revoke all on function public.resolve_financial_execution(uuid,uuid) from public,anon,authenticated;
grant execute on function public.resolve_financial_execution(uuid,uuid) to service_role;

create or replace function private.payment_execution_view(target_intent uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; terminal jsonb;
begin
 select jsonb_build_object('mode','fixture','identityProof','fixture_declared','intentId',i.id,
  'runId',r.id,'createdBy',i.created_by,'currentOwnerId',c.owner_id,'createdAt',r.created_at,
  'state',coalesce(r.state,'unstarted'),'reason',r.reason,'revision',coalesce(r.revision,0),
  'dispatchClaimed',exists(select 1 from private.payment_intent_dispatch_claims d where d.intent_id=i.id),
  'reservationActive',exists(select 1 from private.payment_intent_reservations x where x.intent_id=i.id)) into result
 from private.payment_intents i join public.orders o on o.id=i.order_id join public.clients c on c.id=o.client_id
 left join private.payment_execution_runs r on r.intent_id=i.id where i.id=target_intent;
 terminal:=private.financial_terminal_receipt(target_intent);
 if result->>'reason' in('financial_received','financial_refunded') and terminal is null then raise exception 'Terminal financeiro sem journal'; end if;
 return result;
end; $$;
revoke all on function private.payment_execution_view(uuid) from public,anon,authenticated,service_role;


create or replace function private.payment_intent_view(target_intent uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare job private.payment_intents%rowtype; captured private.payment_obligation_contexts%rowtype;
 active boolean; claim_at timestamptz; withdrawal private.payment_intent_withdrawals%rowtype;
 state text; revision integer; withdrawn_by uuid; current_owner uuid;
 resolution private.payment_intent_resolutions%rowtype; financial jsonb; result jsonb;
begin
 select * into job from private.payment_intents where id=target_intent;
 if job.id is null then raise exception 'Intenção indisponível'; end if;
 select * into captured from private.payment_obligation_contexts where id=job.context_id and order_id=job.order_id;
 select c.owner_id into current_owner from public.orders o join public.clients c on c.id=o.client_id where o.id=job.order_id;
 select exists(select 1 from private.payment_intent_reservations where intent_id=job.id and order_id=job.order_id) into active;
 select claimed_at into claim_at from private.payment_intent_dispatch_claims where intent_id=job.id;
 select * into withdrawal from private.payment_intent_withdrawals where intent_id=job.id;
 select * into resolution from private.payment_intent_resolutions where intent_id=job.id;
 financial:=private.financial_terminal_receipt(target_intent);
 if financial is not null then state:='resolved';revision:=2;
 elsif resolution.intent_id is not null then
  if active or claim_at is null or withdrawal.intent_id is not null or not exists(
   select 1 from private.payment_execution_runs r join private.payment_intent_dispatch_claims c on c.run_id=r.id
   where r.id=resolution.run_id and r.intent_id=job.id and c.intent_id=job.id and r.state='resolved'
   and r.reason='no_dispatch_proven' and r.revision=resolution.applied_revision and r.current_step is null) then raise exception 'Estado da intenção indisponível'; end if;
  state:='resolved';revision:=2;
 elsif withdrawal.intent_id is not null then
  if claim_at is not null or active then raise exception 'Estado da intenção indisponível'; end if;
  state:='withdrawn'; revision:=1;
  select actor_id into withdrawn_by from private.payment_intent_requests where id=withdrawal.request_id and intent_id=job.id;
 elsif active and claim_at is not null then state:='dispatch_claimed';revision:=1;
 elsif active then state:='reserved';revision:=0;
 else raise exception 'Estado da intenção indisponível'; end if;
 result:=jsonb_build_object('intent',jsonb_build_object('schemaVersion',1,'mode','fixture','identityProof','fixture_declared',
  'id',job.id,'reference',job.reference,'contextId',job.context_id,'createdBy',job.created_by,'createdAt',job.created_at,'obligation',captured.snapshot),
  'currentOwnerId',current_owner,'state',state,'revision',revision,'reservationActive',active,
  'claimedAt',claim_at,'withdrawnAt',withdrawal.withdrawn_at,'withdrawnBy',withdrawn_by);
 if financial is not null then result:=result||jsonb_build_object('resolvedAt',financial->>'recordedAt','resolutionReason',financial->>'reason');
 elsif state='resolved' then result:=result||jsonb_build_object('resolvedAt',resolution.recorded_at,'resolutionReason',resolution.reason); end if;
 return result;
end;
$$;
revoke all on function private.payment_intent_view(uuid) from public,anon,authenticated,service_role;

create or replace function public.claim_payment_execution_step(target_request uuid,worker_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare intent private.payment_intents%rowtype; captured private.payment_obligation_contexts%rowtype;
 binding private.payment_provider_customers%rowtype; run private.payment_execution_runs%rowtype;
 step private.payment_execution_steps%rowtype; prior_claim private.payment_intent_dispatch_claims%rowtype;
 selected_action text; scope jsonb;
begin
 if worker_id is null then raise exception 'Execução fictícia indisponível'; end if;
 intent:=private.lock_payment_execution(target_request);
 select * into captured from private.payment_obligation_contexts c where c.id=intent.context_id;
 select * into binding from private.payment_provider_customers b where b.id=captured.binding_id;
 select * into prior_claim from private.payment_intent_dispatch_claims c where c.intent_id=intent.id;
 scope:=private.require_payment_fixture_system((captured.snapshot->'binding'->>'scopeId')::uuid,captured.client_id);
 insert into private.payment_execution_runs(id,intent_id,request_id,scope_id,client_id,snapshot)
 values(coalesce(prior_claim.run_id,gen_random_uuid()),intent.id,target_request,(captured.snapshot->'binding'->>'scopeId')::uuid,captured.client_id,
  jsonb_build_object('obligation',captured.snapshot,'customer',jsonb_build_object('kind',binding.kind,'document',binding.document)))
 on conflict(intent_id) do nothing;
 select * into run from private.payment_execution_runs r where r.intent_id=intent.id for update;
 if run.request_id<>target_request or(prior_claim.intent_id is not null and prior_claim.run_id<>run.id) then raise exception 'Execução fictícia indisponível'; end if;
 if private.financial_terminal_receipt(intent.id) is not null then
  return jsonb_build_object('requestId',target_request,'view',private.payment_execution_view(intent.id),'step',null);
 end if;
 if run.state='resolved' and exists(select 1 from private.payment_intent_resolutions j where j.intent_id=intent.id and j.run_id=run.id) then
  return jsonb_build_object('requestId',target_request,'view',private.payment_execution_view(intent.id),'step',null);
 end if;
 if not exists(select 1 from private.payment_intent_reservations r where r.intent_id=intent.id and r.order_id=intent.order_id)
  or exists(select 1 from private.payment_intent_withdrawals w where w.intent_id=intent.id) then
  update private.payment_execution_runs r set state='stopped',reason='reservation_missing',current_step=null,revision=r.revision+1 where r.id=run.id;
  return jsonb_build_object('requestId',target_request,'view',private.payment_execution_view(intent.id),'step',null);
 end if;
 if prior_claim.intent_id is not null or exists(select 1 from private.payment_fixture_requests r where r.operation='payment_create'
  and private.payment_fixture_reference_matches(r.payload->>'reference',intent.id)) then selected_action:='find';
 elsif private.payment_execution_context_current(intent.id) then selected_action:='create';
 else
  update private.payment_execution_runs r set state='held',reason='context_changed',current_step=null,revision=r.revision+1 where r.id=run.id;
  return jsonb_build_object('requestId',target_request,'view',private.payment_execution_view(intent.id),'step',null);
 end if;
 insert into private.payment_execution_steps(run_id,worker_id,action,revision) values(run.id,worker_id,selected_action,run.revision+1) returning * into step;
 update private.payment_execution_runs r set state='pending',reason=null,current_step=step.id,revision=step.revision where r.id=run.id;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_execution_step_claimed','payment_execution_step',step.id);
 return jsonb_build_object('requestId',target_request,'view',private.payment_execution_view(intent.id),'step',jsonb_build_object(
  'id',step.id,'runId',run.id,'workerId',step.worker_id,'requestId',target_request,'intentId',intent.id,
  'action',step.action,'scopeId',run.scope_id,'clientId',run.client_id,'scope',scope,'snapshot',run.snapshot));
end; $$;
revoke all on function public.claim_payment_execution_step(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_payment_execution_step(uuid,uuid) to service_role;

create or replace function public.send_payment_fixture_request(target_scope uuid,target_client uuid,slot_id uuid,request_id uuid,operation text,fingerprint text,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare intent private.payment_intents%rowtype; owner_before uuid; customer public.clients%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Provedor ficticio indisponivel'; end if;
 if exists(select 1 from private.payment_fixture_requests r where r.id=request_id) or operation is distinct from 'payment_create' then
  return private.send_payment_fixture_request(target_scope,target_client,slot_id,request_id,operation,fingerprint,payload);
 end if;
 perform private.require_payment_fixture_system(target_scope,target_client);
 select * into intent from private.payment_intents where id=(payload->>'reference')::uuid;
 select owner_id into owner_before from public.clients where id=target_client;
 perform id from public.profiles where id in(owner_before,intent.created_by) order by id for share;
 select * into customer from public.clients where id=target_client for update;
 if customer.owner_id is distinct from owner_before then raise sqlstate 'PT409' using message='Cliente atualizado em outra sessao'; end if;
 perform id from public.orders where id=intent.order_id and client_id=target_client for update;
 if not found then raise exception 'Intencao ficticia indisponivel'; end if;
 perform id from public.payments where order_id=intent.order_id order by id for update;
 perform private.lock_order_financial_sources(intent.order_id);
 perform singleton from private.payment_provider_configuration where singleton for share;
 -- Um receipt pode ter surgido enquanto aguardamos os locks de dominio.
 -- Serializar por request e reler antes da guarda preserva esse replay.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-fixture-request:'||request_id::text,0));
 if exists(select 1 from private.payment_fixture_requests r where r.id=request_id) then
  return private.send_payment_fixture_request(target_scope,target_client,slot_id,request_id,operation,fingerprint,payload);
 end if;
 if exists(select 1 from private.payment_financial_resolutions where intent_id=intent.id) then raise sqlstate 'PT409' using message='Intencao financeiramente resolvida'; end if;
 if private.payment_execution_context_current(intent.id) is not true then raise sqlstate 'PT409' using message='Contexto financeiro atualizado'; end if;
 return private.send_payment_fixture_request(target_scope,target_client,slot_id,request_id,operation,fingerprint,payload);
end; $$;
revoke all on function public.send_payment_fixture_request(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.send_payment_fixture_request(uuid,uuid,uuid,uuid,text,text,jsonb) to service_role;
