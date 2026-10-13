-- Transporte somente fixture. Fontes/fatos privados; nenhum crédito financeiro.
alter table private.payment_execution_runs add column selected_payment_id text;
alter table private.payment_execution_runs drop constraint payment_execution_runs_state_check;
alter table private.payment_execution_runs add check(state in('pending','held','stopped','identified'));
alter table private.payment_execution_steps add column finished_at timestamptz;
create table private.payment_execution_protocols (
 step_id uuid not null,run_id uuid not null,operation text not null check(operation in('customer_get','payment_create','payment_find')),
 version integer not null check(version=1),request_id uuid not null unique,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),payload jsonb not null,
 scope_id uuid not null references private.payment_provider_scopes(id),client_id uuid not null references public.clients(id),
 created_at timestamptz not null default clock_timestamp(),primary key(step_id,operation),
 foreign key(step_id,run_id) references private.payment_execution_steps(id,run_id),check(jsonb_typeof(payload)='object')
);
create index payment_execution_protocols_run_idx on private.payment_execution_protocols(run_id);
create index payment_execution_protocols_scope_idx on private.payment_execution_protocols(scope_id);
create index payment_execution_protocols_client_idx on private.payment_execution_protocols(client_id);
create table private.payment_execution_observations (
 id uuid primary key default gen_random_uuid(),step_id uuid not null unique,run_id uuid not null,
 receipt_id uuid references private.payment_fixture_requests(id),customer_receipt_id uuid references private.payment_fixture_requests(id),
 body_hash text check(body_hash ~ '^[0-9a-f]{64}$'),normalizer_version integer not null check(normalizer_version=1),
 disposition text not null check(disposition in('observed','reconcile')),reason text,
 facts jsonb,source_at timestamptz,recorded_at timestamptz not null default clock_timestamp(),
 foreign key(step_id,run_id) references private.payment_execution_steps(id,run_id),
 check(facts is null or(jsonb_typeof(facts)='object' and octet_length(facts::text)<=1048576)),
 check((facts is null) or(receipt_id is not null and body_hash is not null)),
 check((disposition='observed' and facts is not null and reason is null) or(disposition='reconcile' and reason is not null))
);
create index payment_execution_observations_run_idx on private.payment_execution_observations(run_id);
create index payment_execution_observations_receipt_idx on private.payment_execution_observations(receipt_id);
create index payment_execution_observations_customer_idx on private.payment_execution_observations(customer_receipt_id);
alter table private.payment_execution_protocols enable row level security;
alter table private.payment_execution_observations enable row level security;
revoke all on private.payment_execution_protocols,private.payment_execution_observations from public,anon,authenticated,service_role;
create trigger payment_execution_protocol_immutable before update on private.payment_execution_protocols for each row execute function private.preserve_quote_contract_record();
create trigger payment_execution_observation_immutable before update on private.payment_execution_observations for each row execute function private.preserve_quote_contract_record();
create or replace function private.preserve_payment_execution_step() returns trigger language plpgsql set search_path='' as $$
begin
 if(new.id,new.run_id,new.worker_id,new.action,new.revision,new.created_at)
  is distinct from(old.id,old.run_id,old.worker_id,old.action,old.revision,old.created_at)
  or(old.started and not new.started) or(old.finished_at is not null and new.finished_at is distinct from old.finished_at)
  then raise exception 'Etapa imutável'; end if;
 return new;
end; $$;
create or replace function private.preserve_payment_execution_run() returns trigger language plpgsql set search_path='' as $$
begin
 if(new.id,new.intent_id,new.request_id,new.scope_id,new.client_id,new.snapshot,new.created_at)
  is distinct from(old.id,old.intent_id,old.request_id,old.scope_id,old.client_id,old.snapshot,old.created_at)
  or new.revision<old.revision or(old.selected_payment_id is not null and new.selected_payment_id is distinct from old.selected_payment_id)
  then raise exception 'Execução imutável'; end if;
 return new;
end; $$;

create function public.get_payment_execution_step(target_step uuid,worker_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare step private.payment_execution_steps%rowtype;run private.payment_execution_runs%rowtype;intent private.payment_intents%rowtype;scope jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Execução fictícia indisponível'; end if;
 select * into step from private.payment_execution_steps s where s.id=target_step;
 select * into run from private.payment_execution_runs r where r.id=step.run_id;
 intent:=private.lock_payment_execution(run.request_id);
 select * into run from private.payment_execution_runs r where r.id=run.id for update;
 select * into step from private.payment_execution_steps s where s.id=target_step for update;
 if step.worker_id is distinct from worker_id or step.started or run.current_step is distinct from step.id
  or run.revision<>step.revision or not exists(select 1 from private.payment_intent_reservations r where r.intent_id=intent.id) then return null; end if;
 scope:=private.require_payment_fixture_system(run.scope_id,run.client_id);
 return jsonb_build_object('requestId',run.request_id,'view',private.payment_execution_view(intent.id),'step',jsonb_build_object(
  'id',step.id,'runId',run.id,'workerId',step.worker_id,'requestId',run.request_id,'intentId',intent.id,
  'action',step.action,'scopeId',run.scope_id,'clientId',run.client_id,'scope',scope,'snapshot',run.snapshot));
end; $$;
create function public.prepare_payment_execution_protocol(target_step uuid,worker_id uuid,protocols jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare step private.payment_execution_steps%rowtype;run private.payment_execution_runs%rowtype;intent private.payment_intents%rowtype;
 value jsonb;expected jsonb;op text;raw text;expected_id uuid;prior private.payment_execution_protocols%rowtype;
begin
 select * into step from private.payment_execution_steps s where s.id=target_step;
 select * into run from private.payment_execution_runs r where r.id=step.run_id;
 intent:=private.lock_payment_execution(run.request_id);
 select * into run from private.payment_execution_runs r where r.id=run.id for update;
 select * into step from private.payment_execution_steps s where s.id=target_step for update;
 if step.worker_id is distinct from worker_id or step.started or run.current_step is distinct from step.id or run.revision<>step.revision then return false; end if;
 if jsonb_typeof(protocols) is distinct from 'array' then raise exception 'Protocolo indisponível'; end if;
 if jsonb_array_length(protocols)<>(case step.action when 'create' then 2 else 1 end)
  or(select count(distinct v->>'operation') from jsonb_array_elements(protocols) v)<>jsonb_array_length(protocols) then raise exception 'Protocolo indisponível'; end if;
 for value in select * from jsonb_array_elements(protocols) loop
  op:=value->>'operation';
  if value-array['operation','version','requestId','fingerprint','payload']<>'{}'::jsonb
   or value->'version' is distinct from '1'::jsonb or jsonb_typeof(value->'fingerprint') is distinct from 'string'
   or value->>'fingerprint' !~ '^[0-9a-f]{64}$' then raise exception 'Protocolo indisponível'; end if;
  if step.action='create' and op='customer_get' then expected:=jsonb_build_object('customerId',run.snapshot->'obligation'->'binding'->>'customerId');
  elsif step.action='create' and op='payment_create' then expected:=jsonb_build_object('customerId',run.snapshot->'obligation'->'binding'->>'customerId',
   'reference',intent.reference,'amountCents',(run.snapshot->'obligation'->>'remainingCents')::bigint,
   'billingType',run.snapshot->'obligation'->>'billingType','dueDate',run.snapshot->'obligation'->>'dueDate');
  elsif step.action='find' and op='payment_find' then expected:=jsonb_build_object('customerId',run.snapshot->'obligation'->'binding'->>'customerId','reference',intent.reference);
  else raise exception 'Protocolo indisponível'; end if;
  if value->'payload' is distinct from expected then raise exception 'Protocolo indisponível'; end if;
  raw:=encode(pg_catalog.sha256(pg_catalog.convert_to(step.id::text||':'||op,'UTF8')),'hex');
  expected_id:=(substr(raw,1,8)||'-'||substr(raw,9,4)||'-5'||substr(raw,14,3)||'-8'||substr(raw,18,3)||'-'||substr(raw,21,12))::uuid;
  if value->>'requestId' is distinct from expected_id::text then raise exception 'Protocolo indisponível'; end if;
  select * into prior from private.payment_execution_protocols p where p.step_id=step.id and p.operation=op;
  if prior.step_id is not null then
   if(prior.request_id,prior.fingerprint,prior.payload,prior.version) is distinct from(expected_id,value->>'fingerprint',expected,1) then raise sqlstate 'PT409' using message='Protocolo já registrado'; end if;
  else insert into private.payment_execution_protocols(step_id,run_id,operation,version,request_id,fingerprint,payload,scope_id,client_id)
   values(step.id,run.id,op,1,expected_id,value->>'fingerprint',expected,run.scope_id,run.client_id); end if;
 end loop;
 return true;
end; $$;

-- O start conserva a guarda anterior e passa a exigir a expectativa imutável.
alter function public.start_payment_execution_step(uuid,uuid) rename to start_payment_execution_step_before_protocol;
revoke all on function public.start_payment_execution_step_before_protocol(uuid,uuid) from public,anon,authenticated,service_role;
create function public.start_payment_execution_step(target_step uuid,worker_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare step private.payment_execution_steps%rowtype;run private.payment_execution_runs%rowtype;intent private.payment_intents%rowtype;
begin
 select * into step from private.payment_execution_steps s where s.id=target_step;
 select * into run from private.payment_execution_runs r where r.id=step.run_id;
 intent:=private.lock_payment_execution(run.request_id);
 select * into run from private.payment_execution_runs r where r.id=run.id for update;
 select * into step from private.payment_execution_steps s where s.id=target_step for update;
 if(select count(*) from private.payment_execution_protocols p where p.step_id=step.id)<>(case step.action when 'create' then 2 else 1 end)
  then return false; end if;
 return public.start_payment_execution_step_before_protocol(target_step,worker_id);
end; $$;

create function public.finish_payment_execution_step(target_step uuid,worker_id uuid,body_hash text,normalizer_version integer,facts jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare step private.payment_execution_steps%rowtype;run private.payment_execution_runs%rowtype;intent private.payment_intents%rowtype;
 protocol private.payment_execution_protocols%rowtype;source private.payment_fixture_requests%rowtype;
 customer_source uuid;prior private.payment_execution_observations%rowtype;value jsonb;candidate jsonb;scope jsonb;
 outcome text:='reconcile';problem text:='unavailable';digest text;observed_id text;
begin
 select * into step from private.payment_execution_steps s where s.id=target_step;
 select * into run from private.payment_execution_runs r where r.id=step.run_id;
 intent:=private.lock_payment_execution(run.request_id);
 select * into run from private.payment_execution_runs r where r.id=run.id for update;
 select * into step from private.payment_execution_steps s where s.id=target_step for update;
 if step.worker_id is distinct from worker_id or not step.started then raise exception 'Etapa indisponível'; end if;
 select * into prior from private.payment_execution_observations o where o.step_id=step.id;
 if prior.id is not null then
  if(prior.body_hash,prior.normalizer_version,prior.facts) is distinct from(body_hash,normalizer_version,facts) then raise sqlstate 'PT409' using message='Observação já registrada'; end if;
  return private.payment_execution_view(intent.id);
 end if;
 if normalizer_version is distinct from 1 or(facts is not null and(jsonb_typeof(facts)<>'object' or octet_length(facts::text)>1048576)) then raise exception 'Observação indisponível'; end if;
 scope:=private.require_payment_fixture_system(run.scope_id,run.client_id);
 for protocol in select * from private.payment_execution_protocols p where p.step_id=step.id loop
  select * into source from private.payment_fixture_requests r where r.id=protocol.request_id;
  if source.id is not null and(source.slot_id,source.scope_id,source.client_id,source.operation,source.fingerprint,source.payload)
   is distinct from(step.id,run.scope_id,run.client_id,protocol.operation,protocol.fingerprint,protocol.payload) then raise exception 'Fonte indisponível'; end if;
  if source.id is not null and source.outcome->'scope' is distinct from scope then raise exception 'Fonte indisponível'; end if;
  if protocol.operation='customer_get' then customer_source:=source.id; end if;
 end loop;
 select * into protocol from private.payment_execution_protocols p where p.step_id=step.id and p.operation=case step.action when 'create' then 'payment_create' else 'payment_find' end;
 select * into source from private.payment_fixture_requests r where r.id=protocol.request_id;
 if source.outcome->>'kind'='response' and source.outcome->'status'='200'::jsonb then
  digest:=encode(pg_catalog.sha256(pg_catalog.convert_to(source.outcome->>'bodyText','UTF8')),'hex');
  begin value:=(source.outcome->>'bodyText')::jsonb; exception when others then value:=null; end;
  if step.action='find' then
   if jsonb_typeof(value->'data')='array' then
    if value->'hasMore'='true'::jsonb then problem:='incomplete_list';
    elsif value->'hasMore'='false'::jsonb and value->'totalCount'=to_jsonb(jsonb_array_length(value->'data')) then
     if jsonb_array_length(value->'data')=0 then problem:='not_located';
     elsif jsonb_array_length(value->'data')=1 then candidate:=value->'data'->0;
     else problem:='multiple_candidates'; end if;
    end if;
   end if;
  else candidate:=value; end if;
  if candidate is not null then
   problem:='invalid_observation';
   if facts is not null then
    if body_hash is distinct from digest or facts->>'semantics' is distinct from 'cumulative_snapshot' or facts->>'effects' is distinct from 'none'
     or facts->>'identityProof' is distinct from 'declared_unverified' or facts->'scope' is distinct from scope
     or facts->'paymentId' is distinct from candidate->'id' or facts->'customerId' is distinct from candidate->'customer'
     or facts->>'customerId' is distinct from run.snapshot->'obligation'->'binding'->>'customerId'
     or facts->>'reference' is distinct from intent.reference or facts->'reference' is distinct from candidate->'externalReference'
     or facts->>'expectedBillingType' is distinct from run.snapshot->'obligation'->>'billingType'
     or facts->'billingType' is distinct from candidate->'billingType' or facts->'status' is distinct from candidate->'status'
     or facts->'deleted' is distinct from candidate->'deleted' or facts->'dueDate' is distinct from candidate->'dueDate'
     or facts->>'dueDate' is distinct from run.snapshot->'obligation'->>'dueDate'
     or facts->'amounts'->'contractedCents' is distinct from run.snapshot->'obligation'->'remainingCents'
     then raise exception 'Fatos indisponíveis'; end if;
    -- Números JSONB são decimais exatos; apenas invariantes de origem, sem repetir F.
    if jsonb_typeof(candidate->'value') is distinct from 'number' or facts->'amounts'->'currentValueCents' is distinct from to_jsonb((candidate->>'value')::numeric*100)
     or facts->'amounts'->'providerOriginalCents' is distinct from (case when jsonb_typeof(candidate->'originalValue')='number' then to_jsonb((candidate->>'originalValue')::numeric*100) else 'null'::jsonb end)
     or facts->'amounts'->'netCents' is distinct from (case when jsonb_typeof(candidate->'netValue')='number' then to_jsonb((candidate->>'netValue')::numeric*100) else 'null'::jsonb end)
     then raise exception 'Valores indisponíveis'; end if;
    observed_id:=facts->>'paymentId';
    if observed_id !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'Identidade indisponível'; end if;
    if facts->>'disposition'='observed' then outcome:='observed';problem:=null; else problem:='financial_reconciliation'; end if;
   end if;
  end if;
 elsif source.outcome->>'kind'='not_dispatched' then problem:='not_dispatched';
 elsif source.outcome->>'kind'='indeterminate' then problem:='indeterminate'; end if;
 if facts is null then
  if body_hash is not null then raise exception 'Observação indisponível'; end if;
  digest:=null;
 elsif candidate is null then raise exception 'Observação indisponível'; end if;
 insert into private.payment_execution_observations(step_id,run_id,receipt_id,customer_receipt_id,body_hash,normalizer_version,disposition,reason,facts,source_at)
 values(step.id,run.id,source.id,customer_source,digest,1,outcome,problem,facts,source.recorded_at);
 update private.payment_execution_steps s set finished_at=clock_timestamp() where s.id=step.id;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_execution_observed','payment_execution_step',step.id);
 if run.current_step=step.id and run.revision=step.revision then
  if run.selected_payment_id is not null and observed_id is not null and run.selected_payment_id<>observed_id then outcome:='reconcile';problem:='identity_changed'; end if;
  update private.payment_execution_runs r set state=case when outcome='observed' then 'identified' else 'held' end,reason=problem,
   selected_payment_id=case when r.selected_payment_id is null then observed_id else r.selected_payment_id end where r.id=run.id;
 end if;
 return private.payment_execution_view(intent.id);
end; $$;
revoke all on function public.get_payment_execution_step(uuid,uuid),public.prepare_payment_execution_protocol(uuid,uuid,jsonb),public.start_payment_execution_step(uuid,uuid),public.finish_payment_execution_step(uuid,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.get_payment_execution_step(uuid,uuid),public.prepare_payment_execution_protocol(uuid,uuid,jsonb),public.start_payment_execution_step(uuid,uuid),public.finish_payment_execution_step(uuid,uuid,text,integer,jsonb) to service_role;
