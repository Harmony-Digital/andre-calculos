-- Resolução exclusivamente local; prova durável explícita, sem crédito ou cobrança real.
create table private.payment_intent_resolutions (
 request_id uuid primary key,intent_id uuid not null unique references private.payment_intents(id),
 execution_request_id uuid not null,run_id uuid not null unique references private.payment_execution_runs(id),
 step_id uuid not null,receipt_id uuid not null references private.payment_fixture_requests(id),
 reason text not null check(reason='no_dispatch_proven'),
 expected_revision bigint not null check(expected_revision between 0 and 9007199254740990),
 applied_revision bigint not null check(applied_revision=expected_revision+1),
 recorded_at timestamptz not null,result jsonb not null check(jsonb_typeof(result)='object'),
 foreign key(execution_request_id,intent_id) references private.payment_intent_requests(id,intent_id),
 foreign key(step_id,run_id) references private.payment_execution_steps(id,run_id)
);
create index payment_intent_resolutions_request_idx on private.payment_intent_resolutions(execution_request_id,intent_id);
create index payment_intent_resolutions_step_idx on private.payment_intent_resolutions(step_id,run_id);
create index payment_intent_resolutions_receipt_idx on private.payment_intent_resolutions(receipt_id);
alter table private.payment_intent_resolutions enable row level security;
revoke all on private.payment_intent_resolutions from public,anon,authenticated,service_role;
create trigger payment_intent_resolution_immutable before update on private.payment_intent_resolutions for each row execute function private.preserve_quote_contract_record();
alter table private.payment_execution_runs drop constraint payment_execution_runs_state_check;
alter table private.payment_execution_runs add check(state in('pending','held','stopped','identified','resolved'));
create or replace function private.preserve_payment_execution_run() returns trigger language plpgsql set search_path='' as $$
begin
 if(new.id,new.intent_id,new.request_id,new.scope_id,new.client_id,new.snapshot,new.created_at)
  is distinct from(old.id,old.intent_id,old.request_id,old.scope_id,old.client_id,old.snapshot,old.created_at)
  or new.revision<old.revision or(old.selected_payment_id is not null and new.selected_payment_id is distinct from old.selected_payment_id)
  or(old.state='resolved' and new is distinct from old) then raise exception 'Execução imutável'; end if;
 return new;
end; $$;
create or replace function private.payment_intent_view(target_intent uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare job private.payment_intents%rowtype; captured private.payment_obligation_contexts%rowtype;
 active boolean; claim_at timestamptz; withdrawal private.payment_intent_withdrawals%rowtype;
 state text; revision integer; withdrawn_by uuid; current_owner uuid;
 resolution private.payment_intent_resolutions%rowtype; result jsonb;
begin
 select * into job from private.payment_intents where id=target_intent;
 if job.id is null then raise exception 'Intenção indisponível'; end if;
 select * into captured from private.payment_obligation_contexts where id=job.context_id and order_id=job.order_id;
 select c.owner_id into current_owner from public.orders o join public.clients c on c.id=o.client_id where o.id=job.order_id;
 select exists(select 1 from private.payment_intent_reservations where intent_id=job.id and order_id=job.order_id) into active;
 select claimed_at into claim_at from private.payment_intent_dispatch_claims where intent_id=job.id;
 select * into withdrawal from private.payment_intent_withdrawals where intent_id=job.id;
 select * into resolution from private.payment_intent_resolutions where intent_id=job.id;
 if resolution.intent_id is not null then
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
 if state='resolved' then result:=result||jsonb_build_object('resolvedAt',resolution.recorded_at,'resolutionReason',resolution.reason); end if;
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
 if run.state='resolved' and exists(select 1 from private.payment_intent_resolutions j where j.intent_id=intent.id and j.run_id=run.id) then
  return jsonb_build_object('requestId',target_request,'view',private.payment_execution_view(intent.id),'step',null);
 end if;
 if not exists(select 1 from private.payment_intent_reservations r where r.intent_id=intent.id and r.order_id=intent.order_id)
  or exists(select 1 from private.payment_intent_withdrawals w where w.intent_id=intent.id) then
  update private.payment_execution_runs r set state='stopped',reason='reservation_missing',current_step=null,revision=r.revision+1 where r.id=run.id;
  return jsonb_build_object('requestId',target_request,'view',private.payment_execution_view(intent.id),'step',null);
 end if;
 if prior_claim.intent_id is not null or exists(select 1 from private.payment_fixture_requests r where r.operation='payment_create'
  and r.scope_id=run.scope_id and r.client_id=run.client_id and r.payload->>'reference'=intent.reference) then selected_action:='find';
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
create or replace function public.finish_payment_execution_step(target_step uuid,worker_id uuid,body_hash text,normalizer_version integer,facts jsonb) returns jsonb
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
 if run.state is distinct from 'resolved' and run.current_step=step.id and run.revision=step.revision then
  if run.selected_payment_id is not null and observed_id is not null and run.selected_payment_id<>observed_id then outcome:='reconcile';problem:='identity_changed'; end if;
  update private.payment_execution_runs r set state=case when outcome='observed' then 'identified' else 'held' end,reason=problem,
   selected_payment_id=case when r.selected_payment_id is null then observed_id else r.selected_payment_id end where r.id=run.id;
 end if;
 return private.payment_execution_view(intent.id);
end; $$;
CREATE OR REPLACE FUNCTION public.send_payment_fixture_request(target_scope uuid, target_client uuid, slot_id uuid, request_id uuid, operation text, fingerprint text, payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare scope jsonb; prior private.payment_fixture_requests%rowtype; customer public.clients%rowtype;
 entity private.payment_fixture_customers%rowtype; payment private.payment_fixture_payments%rowtype;
 job private.payment_intents%rowtype; captured private.payment_obligation_contexts%rowtype;
 fault private.payment_fixture_controls%rowtype; behavior text:='normal'; result jsonb; body jsonb; data jsonb; total bigint;
 status integer:=200; effect text; owner_before uuid; preview jsonb;
begin
 scope:=private.require_payment_fixture_system(target_scope,target_client);
 if slot_id is null or request_id is null or operation is null or operation not in ('customer_create','customer_get','customer_find','payment_create','payment_get','payment_find')
  or fingerprint is null or fingerprint !~ '^[0-9a-f]{64}$' or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>1048576
  then raise exception 'Solicitação fictícia inválida'; end if;
 -- Nenhum lock de transporte antecede perfil/cliente/pedido: mesma ordem dos fluxos.
 if operation in ('customer_create','payment_create') then
  select owner_id into owner_before from public.clients where id=target_client;
  if operation='payment_create' then
   select * into job from private.payment_intents where id=(payload->>'reference')::uuid;
  end if;
  perform p.id from public.profiles p where p.id in(owner_before,job.created_by) order by p.id for share;
  select * into customer from public.clients where id=target_client for update;
  if customer.owner_id is distinct from owner_before then raise sqlstate 'PT409' using message='Cliente atualizado em outra sessão'; end if;
  if operation='payment_create' then
   perform o.id from public.orders o where o.id=job.order_id and o.client_id=target_client for update;
   if not found then raise exception 'Intenção fictícia indisponível'; end if;
   perform p.id from public.payments p where p.order_id=job.order_id order by p.id for update;
  end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-fixture-request:'||request_id::text,0));
 select * into prior from private.payment_fixture_requests r where r.id=request_id;
 if prior.id is not null then
  if (prior.scope_id,prior.client_id,prior.slot_id,prior.operation,prior.fingerprint,prior.payload)
   is distinct from (target_scope,target_client,slot_id,operation,fingerprint,payload) then raise sqlstate 'PT409' using message='Solicitação já registrada com outros dados'; end if;
  insert into private.payment_fixture_invocations(request_id,replayed) values(request_id,true);
  return prior.outcome;
 end if;
 if operation='payment_create' and exists(select 1 from private.payment_intent_resolutions j where j.intent_id=job.id) then
  raise sqlstate 'PT409' using message='Intenção já resolvida';
 end if;
 select * into fault from private.payment_fixture_controls c where c.scope_id=target_scope and c.client_id=target_client and c.operation=send_payment_fixture_request.operation for update;
 if fault.calls_left>0 then
  behavior:=fault.behavior;
  update private.payment_fixture_controls c set calls_left=c.calls_left-1 where c.scope_id=target_scope and c.client_id=target_client and c.operation=send_payment_fixture_request.operation;
 end if;
 -- Falha conhecida de transporte é distinta de resposta vazia ou incerta.
 if behavior='not_dispatched' then result:=jsonb_build_object('kind','not_dispatched','scope',scope);
 elsif behavior='indeterminate_before' then result:=jsonb_build_object('kind','indeterminate','scope',scope);
 elsif behavior in ('unavailable','not_found') then
  result:=jsonb_build_object('kind','response','scope',scope,'status',case when behavior='not_found' then 404 else 503 end,'bodyText','{}');
 else
  if operation='customer_create' then
   if payload-array['name','document','reference','notificationDisabled','email','mobilePhone']<>'{}'::jsonb
    or jsonb_typeof(payload->'name') is distinct from 'string' or jsonb_typeof(payload->'document') is distinct from 'string'
    or jsonb_typeof(payload->'reference') is distinct from 'string'
    or (payload?'email' and (jsonb_typeof(payload->'email') is distinct from 'string' or length(payload->>'email')>254 or payload->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'))
    or (payload?'mobilePhone' and (jsonb_typeof(payload->'mobilePhone') is distinct from 'string' or payload->>'mobilePhone' !~ '^[0-9]{10,11}$'))
    or payload->>'reference' is distinct from target_client::text or payload->>'document' is distinct from customer.document
    or payload->'notificationDisabled' is distinct from 'true'::jsonb or length(payload->>'name') not between 3 and 200
    or payload->>'name' is distinct from btrim(payload->>'name') then raise exception 'Cliente fictício inválido'; end if;
   insert into private.payment_fixture_customers(scope_id,client_id,kind,document,name) values(target_scope,target_client,customer.kind,customer.document,payload->>'name') returning * into entity;
   effect:=entity.id; body:=private.payment_fixture_customer_wire(entity);
  elsif operation='customer_get' then
   if payload-array['customerId']<>'{}'::jsonb or jsonb_typeof(payload->'customerId') is distinct from 'string' then raise exception 'Consulta fictícia inválida'; end if;
   select * into entity from private.payment_fixture_customers c where c.scope_id=target_scope and c.client_id=target_client and c.id=payload->>'customerId';
   if entity.id is null then status:=404;body:='{}'::jsonb; else body:=private.payment_fixture_customer_wire(entity); end if;
  elsif operation='customer_find' then
   if payload-array['reference','document']<>'{}'::jsonb or jsonb_typeof(payload->'reference') is distinct from 'string' or payload->>'reference' is distinct from target_client::text or jsonb_typeof(payload->'document') is distinct from 'string' then raise exception 'Consulta fictícia inválida'; end if;
   select count(*) into total from private.payment_fixture_customers c where c.scope_id=target_scope and c.client_id=target_client and c.document=payload->>'document';
   select coalesce(jsonb_agg(private.payment_fixture_customer_wire(c) order by c.created_at,c.id),'[]'::jsonb) into data
    from (select * from private.payment_fixture_customers c where c.scope_id=target_scope and c.client_id=target_client and c.document=payload->>'document' order by c.created_at,c.id limit 2) c;
   body:=jsonb_build_object('object','list','offset',0,'limit',2,'totalCount',total,'hasMore',total>2,'data',data);
  elsif operation='payment_create' then
   if payload-array['customerId','reference','amountCents','billingType','dueDate']<>'{}'::jsonb
    or jsonb_typeof(payload->'customerId') is distinct from 'string' or jsonb_typeof(payload->'reference') is distinct from 'string'
    or jsonb_typeof(payload->'amountCents') is distinct from 'number' or payload->>'amountCents' !~ '^[1-9][0-9]{0,15}$'
    or jsonb_typeof(payload->'billingType') is distinct from 'string' or jsonb_typeof(payload->'dueDate') is distinct from 'string' then raise exception 'Cobrança fictícia inválida'; end if;
   perform cfg.singleton from private.payment_provider_configuration cfg where cfg.singleton for share;
   select * into captured from private.payment_obligation_contexts where id=job.context_id and order_id=job.order_id;
   preview:=private.payment_obligation_preview(job.order_id,captured.phase);
   if not exists(select 1 from private.payment_intent_reservations where intent_id=job.id and order_id=job.order_id)
    or not exists(select 1 from private.payment_intent_dispatch_claims where intent_id=job.id)
    or preview->>'status'<>'ready' or preview is distinct from (captured.snapshot-array['billingType','dueDate'])
    or captured.snapshot->'binding'->>'scopeId' is distinct from target_scope::text
    or captured.snapshot->'binding'->>'customerId' is distinct from payload->>'customerId'
    or captured.snapshot->>'remainingCents' is distinct from payload->>'amountCents'
    or captured.snapshot->>'billingType' is distinct from payload->>'billingType'
    or captured.snapshot->>'dueDate' is distinct from payload->>'dueDate' then raise sqlstate 'PT409' using message='Contexto fictício atualizado'; end if;
   select * into entity from private.payment_fixture_customers c where c.id=payload->>'customerId' and c.scope_id=target_scope and c.client_id=target_client;
   if entity.id is null or not entity.notification_disabled or entity.document is distinct from customer.document then raise exception 'Cliente fictício indisponível'; end if;
   insert into private.payment_fixture_payments(scope_id,client_id,customer_id,intent_id,reference,value_cents,billing_type,due_date)
    values(target_scope,target_client,entity.id,job.id,job.id,(payload->>'amountCents')::bigint,payload->>'billingType',(payload->>'dueDate')::date) returning * into payment;
   effect:=payment.id;body:=private.payment_fixture_payment_wire(payment);
  elsif operation='payment_get' then
   if payload-array['paymentId']<>'{}'::jsonb or jsonb_typeof(payload->'paymentId') is distinct from 'string' then raise exception 'Consulta fictícia inválida'; end if;
   select * into payment from private.payment_fixture_payments p where p.scope_id=target_scope and p.client_id=target_client and p.id=payload->>'paymentId';
   if payment.id is null then status:=404;body:='{}'::jsonb; else body:=private.payment_fixture_payment_wire(payment); end if;
  elsif operation='payment_find' then
   if payload-array['reference','customerId']<>'{}'::jsonb or jsonb_typeof(payload->'reference') is distinct from 'string' or jsonb_typeof(payload->'customerId') is distinct from 'string' then raise exception 'Consulta fictícia inválida'; end if;
   select count(*) into total from private.payment_fixture_payments p where p.scope_id=target_scope and p.client_id=target_client and p.customer_id=payload->>'customerId' and p.reference=(payload->>'reference')::uuid;
   select coalesce(jsonb_agg(private.payment_fixture_payment_wire(p) order by p.created_at,p.id),'[]'::jsonb) into data
    from (select * from private.payment_fixture_payments p where p.scope_id=target_scope and p.client_id=target_client and p.customer_id=payload->>'customerId' and p.reference=(payload->>'reference')::uuid order by p.created_at,p.id limit 2) p;
   body:=jsonb_build_object('object','list','offset',0,'limit',2,'totalCount',total,'hasMore',total>2,'data',data);
  end if;
  if behavior='incomplete_list' and operation in ('customer_find','payment_find') then
   -- Metadados incompletos: com candidato há envelope válido; sem ele é incoerente.
   body:=body||jsonb_build_object('totalCount',greatest(total,3),'hasMore',true,'data',case when jsonb_array_length(data)=1 then jsonb_build_array(data->0,jsonb_set(data->0,'{id}',to_jsonb((case when operation='customer_find' then 'cus_fixture_' else 'pay_fixture_' end)||pg_catalog.gen_random_uuid()::text))) else data end);
   result:=jsonb_build_object('kind','response','scope',scope,'status',200,'bodyText',body::text);
  elsif behavior='lost_after_create' and operation in ('customer_create','payment_create') then result:=jsonb_build_object('kind','indeterminate','scope',scope);
  elsif behavior='invalid_after_create' and operation in ('customer_create','payment_create') then result:=jsonb_build_object('kind','response','scope',scope,'status',200,'bodyText','{');
  else result:=jsonb_build_object('kind','response','scope',scope,'status',status,'bodyText',body::text); end if;
 end if;
 insert into private.payment_fixture_requests(id,slot_id,scope_id,client_id,operation,fingerprint,payload,outcome,effect_id)
  values(request_id,slot_id,target_scope,target_client,operation,fingerprint,payload,result,effect);
 insert into private.payment_fixture_invocations(request_id,replayed) values(request_id,false);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_fixture_transport','payment_fixture_request',request_id);
 return result;
end;
$function$;



create function public.resolve_payment_execution_no_dispatch(target_request uuid,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare intent private.payment_intents%rowtype;run private.payment_execution_runs%rowtype;
 prior private.payment_intent_resolutions%rowtype;step private.payment_execution_steps%rowtype;
 protocol private.payment_execution_protocols%rowtype;source private.payment_fixture_requests%rowtype;
 primary_step uuid;primary_receipt uuid;scope jsonb;expected jsonb;released uuid;at_time timestamptz;result jsonb;
begin
 if target_request is null or request_id is null then raise exception 'Resolução fictícia indisponível'; end if;
 intent:=private.lock_payment_execution(target_request);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-resolution-request:'||request_id::text,0));
 select * into prior from private.payment_intent_resolutions j where j.request_id=resolve_payment_execution_no_dispatch.request_id;
 if prior.request_id is not null then
  if prior.execution_request_id is distinct from target_request or prior.intent_id is distinct from intent.id then raise sqlstate 'PT409' using message='Resolução já registrada'; end if;
  return prior.result;
 end if;
 if exists(select 1 from private.payment_intent_resolutions j where j.intent_id=intent.id) then raise sqlstate 'PT409' using message='Intenção já resolvida'; end if;
 select * into run from private.payment_execution_runs r where r.intent_id=intent.id for update;
 if run.id is null or run.request_id is distinct from target_request or run.state='resolved'
  or run.selected_payment_id is not null or not exists(select 1 from private.payment_intent_dispatch_claims c where c.intent_id=intent.id and c.run_id=run.id)
  or exists(select 1 from private.payment_intent_withdrawals w where w.intent_id=intent.id)
  or not exists(select 1 from private.payment_intent_reservations r where r.intent_id=intent.id and r.order_id=intent.order_id) then return null; end if;
 scope:=private.require_payment_fixture_system(run.scope_id,run.client_id);
 expected:=jsonb_build_object('customerId',run.snapshot->'obligation'->'binding'->>'customerId','reference',intent.reference,
  'amountCents',(run.snapshot->'obligation'->>'remainingCents')::bigint,'billingType',run.snapshot->'obligation'->>'billingType','dueDate',run.snapshot->'obligation'->>'dueDate');
 -- Os mesmos locks de cliente/pedido também serializam todo payment_create de N.
 for step in select * from private.payment_execution_steps s where s.run_id=run.id and s.action='create' and s.started order by s.created_at,s.id for update loop
  select * into protocol from private.payment_execution_protocols p where p.step_id=step.id and p.operation='payment_create';
  select * into source from private.payment_fixture_requests r where r.id=protocol.request_id;
  if protocol.step_id is null or protocol.run_id is distinct from run.id or protocol.version is distinct from 1
   or protocol.scope_id is distinct from run.scope_id or protocol.client_id is distinct from run.client_id or protocol.payload is distinct from expected
   or not exists(select 1 from private.payment_execution_protocols p where p.step_id=step.id and p.run_id=run.id
    and p.operation='customer_get' and p.version=1 and p.scope_id=run.scope_id and p.client_id=run.client_id
    and p.payload=jsonb_build_object('customerId',expected->>'customerId'))
   or source.id is null or(source.slot_id,source.scope_id,source.client_id,source.operation,source.fingerprint,source.payload)
    is distinct from(step.id,run.scope_id,run.client_id,'payment_create',protocol.fingerprint,expected)
   or source.outcome is distinct from jsonb_build_object('kind','not_dispatched','scope',scope)
   or source.effect_id is not null then return null; end if;
  if primary_step is null then primary_step:=step.id;primary_receipt:=source.id; end if;
 end loop;
 if primary_step is null then return null; end if;
 if exists(select 1 from private.payment_fixture_requests r where r.operation='payment_create' and r.payload->>'reference'=intent.reference
  and((r.scope_id,r.client_id,r.payload) is distinct from(run.scope_id,run.client_id,expected)
   or r.outcome is distinct from jsonb_build_object('kind','not_dispatched','scope',scope) or r.effect_id is not null))
  or exists(select 1 from private.payment_fixture_payments p where p.intent_id=intent.id or p.reference=intent.id)
  or exists(select 1 from private.payment_execution_observations o join private.payment_execution_runs r on r.id=o.run_id where r.intent_id=intent.id and o.facts is not null)
  then return null; end if;
 at_time:=clock_timestamp();
 update private.payment_execution_runs r set state='resolved',reason='no_dispatch_proven',current_step=null,revision=r.revision+1 where r.id=run.id;
 delete from private.payment_intent_reservations r where r.order_id=intent.order_id and r.intent_id=intent.id returning r.order_id into released;
 if released is distinct from intent.order_id then raise exception 'Reserva indisponível'; end if;
 result:=jsonb_build_object('semantics','resolution_receipt','requestId',request_id,'executionRequestId',target_request,
  'reason','no_dispatch_proven','recordedAt',at_time,'expectedRevision',run.revision,'appliedRevision',run.revision+1,'view',private.payment_execution_view(intent.id));
 insert into private.payment_intent_resolutions(request_id,intent_id,execution_request_id,run_id,step_id,receipt_id,reason,expected_revision,applied_revision,recorded_at,result)
  values(request_id,intent.id,target_request,run.id,primary_step,primary_receipt,'no_dispatch_proven',run.revision,run.revision+1,at_time,result);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_execution_resolved','payment_intent',intent.id);
 return result;
end; $$;
revoke all on function public.resolve_payment_execution_no_dispatch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.resolve_payment_execution_no_dispatch(uuid,uuid) to service_role;
