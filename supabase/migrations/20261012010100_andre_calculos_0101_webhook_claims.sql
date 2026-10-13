-- Claims/consulta locais; aplicação e cobertura financeira pertencem à próxima parte.
create function private.lock_webhook_payment(target_scope uuid,payment text) returns void
language sql volatile set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended('webhook_payment:'||target_scope::text||':'||payment,0));
$$;
revoke all on function private.lock_webhook_payment(uuid,text) from public,anon,authenticated,service_role;

create function private.webhook_pending_sources(target_scope uuid,payment text) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('eventId',e.id,'revision',q.revision,'bodyHash',e.minimal_body_hash,
  'customer',e.minimal_body::jsonb->'payment'->'customer','reference',e.minimal_body::jsonb->'payment'->'externalReference',
  'conflicts',coalesce((select jsonb_agg(jsonb_build_array(c.id,c.minimal_body_hash) order by c.id) from private.payment_webhook_conflicts c where c.event_id=e.id),'[]'::jsonb)) order by e.id),'[]'::jsonb)
 from private.payment_webhook_events e join private.payment_webhook_queue q on q.event_id=e.id
 where e.scope_id=target_scope and e.provider_payment_id=payment and q.state<>'done';
$$;
revoke all on function private.webhook_pending_sources(uuid,text) from public,anon,authenticated,service_role;

create table private.payment_webhook_runs (
 id uuid primary key, trigger_event_id uuid not null references private.payment_webhook_events(id),
 scope_id uuid not null references private.payment_provider_scopes(id), provider_payment_id text not null,
 charge_id uuid references private.payment_financial_charges(id), query_id uuid not null unique default gen_random_uuid(),
 application_request_id uuid not null unique default gen_random_uuid(), source_snapshot jsonb not null,
 source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{64}$'),
 worker_id uuid not null default gen_random_uuid(), epoch bigint not null default 0 check(epoch>=0),
 lease_until timestamptz not null, stage text not null check(stage in('unmatched','identity_mismatch','claimed','queried','complete','superseded')),
 observation_id uuid references private.payment_financial_observations(id),created_at timestamptz not null default clock_timestamp(),
 check((stage='unmatched')=(charge_id is null)),check(stage<>'queried' or observation_id is not null)
);
create unique index payment_webhook_run_active_idx on private.payment_webhook_runs(scope_id,provider_payment_id) where stage in('claimed','queried');
create index payment_webhook_run_scope_idx on private.payment_webhook_runs(scope_id);
create index payment_webhook_run_charge_idx on private.payment_webhook_runs(charge_id);
create index payment_webhook_run_trigger_idx on private.payment_webhook_runs(trigger_event_id);
create index payment_webhook_run_observation_idx on private.payment_webhook_runs(observation_id);
create table private.payment_webhook_claims (
 request_id uuid primary key, run_id uuid not null references private.payment_webhook_runs(id),
 target_event uuid not null references private.payment_webhook_events(id), result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create index payment_webhook_claim_run_idx on private.payment_webhook_claims(run_id);
create index payment_webhook_claim_event_idx on private.payment_webhook_claims(target_event);
alter table private.payment_webhook_runs enable row level security;
alter table private.payment_webhook_claims enable row level security;
revoke all on private.payment_webhook_runs,private.payment_webhook_claims from public,anon,authenticated,service_role;
create trigger payment_webhook_claim_immutable before update or delete on private.payment_webhook_claims for each row execute function private.preserve_payment_webhook_event();
create function private.preserve_webhook_run() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' and session_user='postgres' and exists(select 1 from private.payment_fixture_environment where singleton and enabled) then return old; end if;
 if tg_op='DELETE' or (new.id,new.trigger_event_id,new.scope_id,new.provider_payment_id,new.charge_id,new.query_id,new.application_request_id,new.source_snapshot,new.source_fingerprint,new.created_at)
  is distinct from(old.id,old.trigger_event_id,old.scope_id,old.provider_payment_id,old.charge_id,old.query_id,old.application_request_id,old.source_snapshot,old.source_fingerprint,old.created_at)
  or new.epoch<old.epoch or (old.observation_id is not null and new.observation_id is distinct from old.observation_id)
  or (old.stage in('complete','superseded','unmatched','identity_mismatch') and new is distinct from old) then raise exception 'Run de webhook imutável'; end if;
 return new;
end; $$;
revoke all on function private.preserve_webhook_run() from public,anon,authenticated,service_role;
create trigger payment_webhook_run_preserve before update or delete on private.payment_webhook_runs for each row execute function private.preserve_webhook_run();

create function private.webhook_run_result(r private.payment_webhook_runs) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('schemaVersion',1,'mode','fixture','identityProof','fixture_declared','state',(r).stage,
  'runId',(r).id,'eventId',(r).trigger_event_id,'scopeId',(r).scope_id,'paymentId',(r).provider_payment_id,
  'chargeId',(r).charge_id,'queryId',(r).query_id,'applicationRequestId',(r).application_request_id,
  'workerId',(r).worker_id,'epoch',(r).epoch,'sourceFingerprint',(r).source_fingerprint,'sourceCount',jsonb_array_length((r).source_snapshot),
  'leaseUntil',(r).lease_until,'observationId',(r).observation_id);
$$;
revoke all on function private.webhook_run_result(private.payment_webhook_runs) from public,anon,authenticated,service_role;

create function public.claim_fixture_payment_webhook(target_event uuid,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.payment_webhook_events%rowtype;c private.payment_financial_charges%rowtype;r private.payment_webhook_runs%rowtype;
 prior private.payment_webhook_claims%rowtype;sources jsonb;fingerprint text;scope jsonb;result jsonb;state text;at_time timestamptz:=clock_timestamp();
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from private.payment_fixture_environment where singleton and enabled)
  or target_event is null or request_id is null then raise exception 'Worker de webhook indisponível'; end if;
 select * into e from private.payment_webhook_events where id=target_event;
 if e.id is null then raise exception 'Worker de webhook indisponível'; end if;
 perform private.lock_webhook_payment(e.scope_id,e.provider_payment_id);
 perform pg_advisory_xact_lock(hashtextextended('webhook_claim:'||request_id::text,0));
 select * into prior from private.payment_webhook_claims where payment_webhook_claims.request_id=claim_fixture_payment_webhook.request_id;
 if prior.request_id is not null then
  if prior.target_event is distinct from target_event then raise exception 'Solicitação de webhook divergente'; end if;
  select * into r from private.payment_webhook_runs where id=prior.run_id;
  if r.charge_id is not null then perform private.require_payment_fixture_system(r.scope_id,(select client_id from private.payment_financial_charges where id=r.charge_id)); end if;
  return prior.result;
 end if;
 sources:=private.webhook_pending_sources(e.scope_id,e.provider_payment_id);
 if jsonb_array_length(sources)=0 then return jsonb_build_object('schemaVersion',1,'mode','fixture','identityProof','fixture_declared','state','already_processed','eventId',e.id); end if;
 fingerprint:=encode(sha256(convert_to(sources::text,'UTF8')),'hex');
 select * into c from private.payment_financial_charges where scope_id=e.scope_id and provider_payment_id=e.provider_payment_id;
 state:='unmatched';
 if c.id is not null then
  scope:=private.require_payment_fixture_system(c.scope_id,c.client_id);
  if not exists(select 1 from private.payment_execution_observations o join private.payment_execution_runs x on x.id=o.run_id
    where o.id=c.origin_id and x.intent_id=c.intent_id and x.scope_id=c.scope_id and x.client_id=c.client_id and x.selected_payment_id=c.provider_payment_id)
   or c.expectation->'scope' is distinct from scope or c.expectation->>'reference' is distinct from c.intent_id::text then raise exception 'Origem de webhook indisponível'; end if;
  state:=case when exists(select 1 from jsonb_array_elements(sources) x where (x->'customer'<>'null'::jsonb and x->'customer' is distinct from c.expectation->'customerId')
    or (x->'reference'<>'null'::jsonb and x->>'reference' is distinct from c.intent_id::text)) then 'identity_mismatch' else 'claimed' end;
 end if;
 select * into r from private.payment_webhook_runs where scope_id=e.scope_id and provider_payment_id=e.provider_payment_id and stage in('claimed','queried') for update;
 if r.id is not null and r.source_fingerprint=fingerprint and r.lease_until>at_time then
  return jsonb_build_object('schemaVersion',1,'mode','fixture','identityProof','fixture_declared','state','busy','eventId',e.id);
 end if;
 if r.id is not null and r.source_fingerprint<>fingerprint then
  update private.payment_webhook_runs set stage='superseded' where id=r.id;
  update private.payment_webhook_queue set state='pending',worker_id=null,lease_until=null where worker_id=r.worker_id and event_id in(select (x->>'eventId')::uuid from jsonb_array_elements(r.source_snapshot) x);
  r:=null;
 end if;
 if r.id is null then
  insert into private.payment_webhook_runs(id,trigger_event_id,scope_id,provider_payment_id,charge_id,source_snapshot,source_fingerprint,lease_until,stage)
   values(request_id,e.id,e.scope_id,e.provider_payment_id,c.id,sources,fingerprint,at_time+interval '2 minutes',state) returning * into r;
 else
  update private.payment_webhook_runs set worker_id=gen_random_uuid(),epoch=epoch+1,lease_until=at_time+interval '2 minutes' where id=r.id returning * into r;
 end if;
 if r.stage in('claimed','queried') then
  update private.payment_webhook_queue set state='processing',worker_id=r.worker_id,lease_until=r.lease_until,attempts=attempts+1
   where event_id in(select (x->>'eventId')::uuid from jsonb_array_elements(sources) x);
 else
  update private.payment_webhook_queue set state='needs_reconciliation',worker_id=null,lease_until=null
   where event_id in(select (x->>'eventId')::uuid from jsonb_array_elements(sources) x);
 end if;
 result:=private.webhook_run_result(r);
 insert into private.payment_webhook_claims(request_id,run_id,target_event,result) values(request_id,r.id,e.id,result);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_webhook_claimed','payment_webhook_claim',request_id);
 return result;
end; $$;
revoke all on function public.claim_fixture_payment_webhook(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_fixture_payment_webhook(uuid,uuid) to service_role;

create function public.record_fixture_webhook_query(target_run uuid,worker_id uuid,expected_epoch bigint,target_observation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.payment_webhook_runs%rowtype;q private.payment_financial_queries%rowtype;o private.payment_financial_observations%rowtype;
 fingerprint text;
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from private.payment_fixture_environment where singleton and enabled) then raise exception 'Worker de webhook indisponível'; end if;
 select * into r from private.payment_webhook_runs where id=target_run;
 perform private.require_payment_fixture_system(r.scope_id,(select client_id from private.payment_financial_charges where id=r.charge_id));
 perform private.lock_webhook_payment(r.scope_id,r.provider_payment_id);
 select * into r from private.payment_webhook_runs where id=target_run for update;
 if r.worker_id is distinct from worker_id or r.epoch is distinct from expected_epoch or r.stage not in('claimed','queried') or r.lease_until<=clock_timestamp()
  then raise sqlstate 'PT412' using message='Worker de webhook antigo'; end if;
 fingerprint:=encode(sha256(convert_to(private.webhook_pending_sources(r.scope_id,r.provider_payment_id)::text,'UTF8')),'hex');
 if fingerprint is distinct from r.source_fingerprint then raise sqlstate 'PT412' using message='Fonte de webhook mudou'; end if;
 select * into q from private.payment_financial_queries where id=r.query_id and charge_id=r.charge_id;
 select * into o from private.payment_financial_observations where id=target_observation and charge_id=r.charge_id and source_kind='query' and source_id=r.query_id;
 if q.finished_at is null or o.id is null or q.revision is distinct from (select revision from private.payment_financial_charges where id=r.charge_id)
  then raise sqlstate 'PT412' using message='Consulta de webhook antiga'; end if;
 if r.observation_id is not null and r.observation_id is distinct from o.id then raise exception 'Consulta de webhook divergente'; end if;
 if r.observation_id is null then
  update private.payment_webhook_runs set observation_id=o.id,stage='queried' where id=r.id returning * into r;
  insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_webhook_queried','payment_webhook_run',r.id);
 end if;
 return private.webhook_run_result(r);
end; $$;
revoke all on function public.record_fixture_webhook_query(uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.record_fixture_webhook_query(uuid,uuid,bigint,uuid) to service_role;

create function public.get_fixture_webhook_context(target_run uuid,worker_id uuid,expected_epoch bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r private.payment_webhook_runs%rowtype;c private.payment_financial_charges%rowtype;e private.payment_webhook_events%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker de webhook indisponível'; end if;
 select * into r from private.payment_webhook_runs where id=target_run;
 select * into c from private.payment_financial_charges where id=r.charge_id;
 perform private.require_payment_fixture_system(c.scope_id,c.client_id);
 if r.worker_id is distinct from worker_id or r.epoch is distinct from expected_epoch or r.stage not in('claimed','queried') or r.lease_until<=statement_timestamp()
  or r.source_fingerprint is distinct from encode(sha256(convert_to(private.webhook_pending_sources(r.scope_id,r.provider_payment_id)::text,'UTF8')),'hex')
  then raise sqlstate 'PT412' using message='Fonte de webhook mudou'; end if;
 select * into e from private.payment_webhook_events where id=r.trigger_event_id;
 return jsonb_build_object('run',private.webhook_run_result(r),'expectation',c.expectation,'eventBody',e.minimal_body);
end; $$;
revoke all on function public.get_fixture_webhook_context(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.get_fixture_webhook_context(uuid,uuid,bigint) to service_role;

-- Compartilhar barreira de pagamento com claim/finalização.
create or replace function public.receive_fixture_payment_webhook(target_scope uuid,body_text text,source_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope private.payment_provider_scopes%rowtype; body jsonb; prior private.payment_webhook_events%rowtype;
 conflict private.payment_webhook_conflicts%rowtype; fingerprint text; queue_state text;
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from private.payment_fixture_environment where singleton and enabled)
  then raise exception 'Notificação financeira indisponível'; end if;
 select * into scope from private.payment_provider_scopes where id=target_scope and mode='fixture' and environment='sandbox' for key share;
 if scope.id is null or body_text is null or octet_length(body_text)>1048576 or source_hash is null or source_hash !~ '^[a-f0-9]{64}$'
  then raise exception 'Notificação financeira indisponível'; end if;
 if (body_text is json object with unique keys) is distinct from true then raise exception 'Notificação financeira indisponível'; end if;
 begin body:=body_text::jsonb; exception when others then raise exception 'Notificação financeira indisponível'; end;
 if private.valid_payment_webhook_body(body) is distinct from true or body->'account'->>'id' is distinct from scope.account_id
  then raise exception 'Notificação financeira indisponível'; end if;
 fingerprint:=encode(extensions.digest(convert_to(body_text,'UTF8'),'sha256'),'hex');
 perform private.lock_webhook_payment(scope.id,body->'payment'->>'id');
 perform pg_advisory_xact_lock(hashtextextended('payment_webhook:'||scope.id::text||':'||(body->>'id'),0));
 select * into prior from private.payment_webhook_events where scope_id=scope.id and provider_event_id=body->>'id';
 if prior.id is null then
  insert into private.payment_webhook_events(scope_id,provider_event_id,event_type,provider_payment_id,provider_created_at,minimal_body,minimal_body_hash,source_body_hash)
   values(scope.id,body->>'id',body->>'event',body->'payment'->>'id',body->>'dateCreated',body_text,fingerprint,source_hash) returning * into prior;
  insert into private.payment_webhook_queue(event_id) values(prior.id);
  insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_webhook_received','payment_webhook_event',prior.id);
  return jsonb_build_object('schemaVersion',1,'kind','recorded','eventId',prior.id,'conflictId',null,'queueState','pending');
 end if;
 if prior.minimal_body::jsonb=body then
  select state into queue_state from private.payment_webhook_queue where event_id=prior.id;
  if queue_state is null then raise exception 'Notificação financeira indisponível'; end if;
  return jsonb_build_object('schemaVersion',1,'kind','replay','eventId',prior.id,'conflictId',null,'queueState',queue_state);
 end if;
 select * into conflict from private.payment_webhook_conflicts where event_id=prior.id and minimal_body::jsonb=body;
 if conflict.id is null then
  insert into private.payment_webhook_conflicts(event_id,minimal_body,minimal_body_hash,source_body_hash)
   values(prior.id,body_text,fingerprint,source_hash) returning * into conflict;
  update private.payment_webhook_queue set state='needs_reconciliation',revision=revision+1,worker_id=null,lease_until=null where event_id=prior.id;
  if not found then raise exception 'Notificação financeira indisponível'; end if;
  insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_webhook_conflict','payment_webhook_conflict',conflict.id);
 end if;
 select state into queue_state from private.payment_webhook_queue where event_id=prior.id;
 if queue_state is null then raise exception 'Notificação financeira indisponível'; end if;
 return jsonb_build_object('schemaVersion',1,'kind','conflict','eventId',prior.id,'conflictId',conflict.id,'queueState',queue_state);
end;
$$;
