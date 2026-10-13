-- Somente ensaio local: ordem do produtor junto ao snapshot, não relógio Asaas.
alter table private.payment_fixture_payments add column fixture_revision bigint not null default 1 check(fixture_revision between 1 and 9007199254740991);
alter table private.payment_fixture_payments drop constraint payment_fixture_payments_pkey;
alter table private.payment_fixture_payments add primary key(scope_id,id);
create function private.advance_fixture_payment_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if new.fixture_revision is distinct from old.fixture_revision then raise exception 'Revisão controlada pelo produtor'; end if;
 if new is distinct from old then new.fixture_revision:=old.fixture_revision+1; end if;
 return new;
end; $$;
create trigger payment_fixture_state_revision before update on private.payment_fixture_payments for each row execute function private.advance_fixture_payment_revision();
create or replace function private.payment_fixture_payment_wire(value private.payment_fixture_payments) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',(value).id,'customer',(value).customer_id,'externalReference',(value).reference,
  'value',((value).value_cents::numeric/100)::numeric(18,2),'originalValue',((value).original_cents::numeric/100)::numeric(18,2),
  'netValue',((value).net_cents::numeric/100)::numeric(18,2),'billingType',(value).billing_type,'dueDate',(value).due_date::text,
  'status',(value).status,'deleted',(value).deleted,'invoiceUrl','https://sandbox.asaas.com/i/'||(value).id,
  'refunds',(value).refunds,'chargeback',(value).chargeback,'fixtureStateRevision',(value).fixture_revision)
$$;
revoke all on function private.advance_fixture_payment_revision() from public,anon,authenticated,service_role;

create table private.payment_financial_charges (
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references private.payment_provider_scopes(id),
 client_id uuid not null references public.clients(id), provider_payment_id text not null check(provider_payment_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 intent_id uuid not null unique references private.payment_intents(id), order_id uuid not null references public.orders(id),
 origin_id uuid not null unique references private.payment_execution_observations(id), expectation jsonb not null,
 revision bigint not null default 0 check(revision between 0 and 9007199254740991),current_query uuid,
 created_at timestamptz not null default clock_timestamp(),unique(scope_id,provider_payment_id)
);
create index payment_financial_charges_client_idx on private.payment_financial_charges(client_id);
create index payment_financial_charges_order_idx on private.payment_financial_charges(order_id);
create table private.payment_financial_queries (
 id uuid primary key,charge_id uuid not null references private.payment_financial_charges(id),worker_id uuid not null default gen_random_uuid(),
 revision bigint not null,started boolean not null default false,protocol jsonb,finished_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),unique(id,charge_id),unique(charge_id,revision)
);
alter table private.payment_financial_charges add foreign key(current_query,id) references private.payment_financial_queries(id,charge_id);
create index payment_financial_charges_query_idx on private.payment_financial_charges(current_query,id);
create table private.payment_financial_observations (
 id uuid primary key default gen_random_uuid(),charge_id uuid not null references private.payment_financial_charges(id),
 source_kind text not null check(source_kind in('execution','query')),source_id uuid not null,
 receipt_id uuid references private.payment_fixture_requests(id),body_hash text,normalizer_version integer not null check(normalizer_version=1),
 source_order bigint check(source_order between 1 and 9007199254740991),facts jsonb,proof jsonb not null,
 reason text,recorded_at timestamptz not null default clock_timestamp(),unique(charge_id,source_kind,source_id),
 check(body_hash is null or body_hash ~ '^[0-9a-f]{64}$'),check(jsonb_typeof(proof)='object'),
 check(facts is null or(jsonb_typeof(facts)='object' and octet_length(facts::text)<=1048576)),
 check((facts is null and reason is not null) or(facts is not null and receipt_id is not null and body_hash is not null))
);
create index payment_financial_observations_receipt_idx on private.payment_financial_observations(receipt_id);
create table private.payment_financial_conflicts (
 id uuid primary key default gen_random_uuid(),observation_id uuid not null references private.payment_financial_observations(id),
 attempt_hash text not null check(attempt_hash ~ '^[0-9a-f]{64}$'),recorded_at timestamptz not null default clock_timestamp(),unique(observation_id,attempt_hash)
);
alter table private.payment_financial_charges enable row level security;
alter table private.payment_financial_queries enable row level security;
alter table private.payment_financial_observations enable row level security;
alter table private.payment_financial_conflicts enable row level security;
revoke all on private.payment_financial_charges,private.payment_financial_queries,private.payment_financial_observations,private.payment_financial_conflicts from public,anon,authenticated,service_role;
create trigger payment_financial_observation_immutable before update on private.payment_financial_observations for each row execute function private.preserve_quote_contract_record();
create trigger payment_financial_conflict_immutable before update on private.payment_financial_conflicts for each row execute function private.preserve_quote_contract_record();
create function private.preserve_payment_financial_record() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='payment_financial_charges' then
  if(new.id,new.scope_id,new.client_id,new.provider_payment_id,new.intent_id,new.order_id,new.origin_id,new.expectation,new.created_at)
   is distinct from(old.id,old.scope_id,old.client_id,old.provider_payment_id,old.intent_id,old.order_id,old.origin_id,old.expectation,old.created_at)
   or new.revision<old.revision then raise exception 'Identidade financeira imutável'; end if;
 else
  if(new.id,new.charge_id,new.worker_id,new.revision,new.created_at) is distinct from(old.id,old.charge_id,old.worker_id,old.revision,old.created_at)
   or(old.started and not new.started) or(old.protocol is not null and new.protocol is distinct from old.protocol)
   or(old.finished_at is not null and new.finished_at is distinct from old.finished_at) then raise exception 'Consulta imutável'; end if;
 end if; return new;
end; $$;
create trigger payment_financial_charge_preserve before update on private.payment_financial_charges for each row execute function private.preserve_payment_financial_record();
create trigger payment_financial_query_preserve before update on private.payment_financial_queries for each row execute function private.preserve_payment_financial_record();
revoke all on function private.preserve_payment_financial_record() from public,anon,authenticated,service_role;

-- Sem documento, URL ou body no domínio financeiro. Só a ponte interna lê N.
create function public.get_financial_origin(target_observation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.payment_execution_observations%rowtype;r private.payment_execution_runs%rowtype;
 p private.payment_execution_protocols%rowtype;n private.payment_fixture_requests%rowtype;e jsonb;scope jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Observação indisponível'; end if;
 select * into o from private.payment_execution_observations where id=target_observation;
 select * into r from private.payment_execution_runs where id=o.run_id;
 scope:=private.require_payment_fixture_system(r.scope_id,r.client_id);
 select * into n from private.payment_fixture_requests where id=o.receipt_id;
 select * into p from private.payment_execution_protocols where step_id=o.step_id and request_id=n.id;
 if o.facts is null or r.selected_payment_id is null or o.facts->>'paymentId' is distinct from r.selected_payment_id
  or n.id is null or p.request_id is null or(n.slot_id,n.scope_id,n.client_id,n.operation,n.fingerprint,n.payload)
   is distinct from(o.step_id,r.scope_id,r.client_id,p.operation,p.fingerprint,p.payload)
  or n.outcome->'scope' is distinct from scope or n.outcome->>'kind' is distinct from 'response' or n.outcome->'status' is distinct from '200'::jsonb
  or o.body_hash is distinct from encode(sha256(convert_to(n.outcome->>'bodyText','UTF8')),'hex') then raise exception 'Origem indisponível'; end if;
 e:=jsonb_build_object('phase','observation','scope',scope,'paymentId',r.selected_payment_id,
  'customerId',r.snapshot->'obligation'->'binding'->>'customerId','reference',r.intent_id::text,
  'contractedCents',r.snapshot->'obligation'->'remainingCents','billingType',r.snapshot->'obligation'->>'billingType','dueDate',r.snapshot->'obligation'->>'dueDate');
 return jsonb_build_object('originId',o.id,'intentId',r.intent_id,'scopeId',r.scope_id,'clientId',r.client_id,'expectation',e,'operation',n.operation,'bodyText',n.outcome->>'bodyText');
end; $$;

create function private.financial_observation_result(value private.payment_financial_observations, kind text default 'recorded', conflict_id uuid default null) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('kind',kind,'chargeId',(value).charge_id,'observationId',(value).id,'conflictId',conflict_id)
$$;
-- A entrada desta RPC é construída somente pelo worker fixo; valida a fonte N.
create function private.record_financial_observation(target_charge uuid,kind text,source_id uuid,receipt_id uuid,
 body_hash text,facts jsonb,proof jsonb,source_order bigint,problem text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare charge private.payment_financial_charges%rowtype;prior private.payment_financial_observations%rowtype;
 n private.payment_fixture_requests%rowtype;candidate jsonb;scope jsonb;digest text;conflict uuid;v jsonb;raw jsonb; item jsonb;total numeric:=0;
begin
 select * into charge from private.payment_financial_charges where id=target_charge for update;
 scope:=private.require_payment_fixture_system(charge.scope_id,charge.client_id);
 select * into prior from private.payment_financial_observations o where o.charge_id=charge.id and o.source_kind=kind and o.source_id=record_financial_observation.source_id;
 if prior.id is not null then
  if(prior.receipt_id,prior.body_hash,prior.facts,prior.proof,prior.source_order,prior.reason) is not distinct from(receipt_id,body_hash,facts,proof,source_order,problem)
   then return private.financial_observation_result(prior,'replay'); end if;
  digest:=encode(sha256(convert_to(jsonb_build_array(receipt_id,body_hash,facts,proof,source_order,problem)::text,'UTF8')),'hex');
  insert into private.payment_financial_conflicts(observation_id,attempt_hash) values(prior.id,digest)
   on conflict(observation_id,attempt_hash) do nothing;
  select id into conflict from private.payment_financial_conflicts where observation_id=prior.id and attempt_hash=digest;
  return private.financial_observation_result(prior,'conflict',conflict);
 end if;
 if proof is null or jsonb_typeof(proof)<>'object' or octet_length(proof::text)>65536 or proof->>'kind' is null or proof->>'kind' not in('unknown','invalid','proven')
  or(facts is null and (problem is null or body_hash is not null or source_order is not null or proof<>'{"kind":"unknown"}'::jsonb)) then raise exception 'Fatos indisponíveis'; end if;
 if facts is not null then
  select * into n from private.payment_fixture_requests where id=receipt_id;
  if n.scope_id is distinct from charge.scope_id or n.client_id is distinct from charge.client_id or n.outcome->'scope' is distinct from scope
   or n.outcome->>'kind' is distinct from 'response' or n.outcome->'status' is distinct from '200'::jsonb then raise exception 'Fonte indisponível'; end if;
  digest:=encode(sha256(convert_to(n.outcome->>'bodyText','UTF8')),'hex');
  begin candidate:=(n.outcome->>'bodyText')::jsonb; exception when others then raise exception 'Fonte indisponível'; end;
  if n.operation='payment_find' then
   if candidate->'hasMore' is distinct from 'false'::jsonb or candidate->'totalCount' is distinct from '1'::jsonb or jsonb_array_length(candidate->'data')<>1 then raise exception 'Fonte ambígua'; end if;
   candidate:=candidate->'data'->0;
  end if;
  if body_hash is distinct from digest or facts->>'semantics' is distinct from 'cumulative_snapshot' or facts->>'effects' is distinct from 'none'
   or facts->>'identityProof' is distinct from 'declared_unverified' or facts->'scope' is distinct from scope
   or facts->>'paymentId' is distinct from charge.provider_payment_id or facts->'paymentId' is distinct from candidate->'id'
   or facts->'customerId' is distinct from candidate->'customer' or facts->'customerId' is distinct from charge.expectation->'customerId'
   or facts->'reference' is distinct from candidate->'externalReference' or facts->>'reference' is distinct from charge.intent_id::text
   or facts->'expectedBillingType' is distinct from charge.expectation->'billingType'
   or facts->'billingType' is distinct from candidate->'billingType' or facts->'status' is distinct from candidate->'status'
   or facts->'deleted' is distinct from candidate->'deleted' or facts->'dueDate' is distinct from charge.expectation->'dueDate'
   or facts->'dueDate' is distinct from candidate->'dueDate' or facts->'amounts'->'contractedCents' is distinct from charge.expectation->'contractedCents'
   or facts->'amounts'->'currentValueCents' is distinct from to_jsonb((candidate->>'value')::numeric*100)
   or facts->'amounts'->'providerOriginalCents' is distinct from (case when jsonb_typeof(candidate->'originalValue')='number' then to_jsonb((candidate->>'originalValue')::numeric*100) else 'null'::jsonb end)
   or facts->'amounts'->'netCents' is distinct from (case when jsonb_typeof(candidate->'netValue')='number' then to_jsonb((candidate->>'netValue')::numeric*100) else 'null'::jsonb end)
   or facts-array['semantics','effects','identityProof','disposition','reasons','classification','scope','paymentId','customerId','reference','expectedBillingType','billingType','status','deleted','dueDate','presence','amounts','refunds','chargeback']<>'{}'::jsonb
   or source_order is distinct from (candidate->>'fixtureStateRevision')::bigint then raise exception 'Fatos indisponíveis'; end if;
  if proof->>'kind'='proven' then
   raw:=candidate->'chargeback'->'fixtureProof';
   if raw->>'semantics' is distinct from 'fixture_chargeback_cumulative' or raw->'schemaVersion' is distinct from '1'::jsonb
    or raw->>'paymentId' is distinct from charge.provider_payment_id or raw->>'reference' is distinct from charge.intent_id::text
    or proof->'caseId' is distinct from raw->'caseId' or proof->'debit'->'id' is distinct from raw->'debit'->'id'
    or proof->'debit'->'effectedAt' is distinct from raw->'debit'->'effectedAt'
    or proof->'debitedCents' is distinct from to_jsonb((raw->'debit'->>'value')::numeric*100)
    or proof->'debit'->'amountCents' is distinct from proof->'debitedCents'
    or jsonb_array_length(proof->'reversals')<>jsonb_array_length(raw->'reversals') then raise exception 'Prova indisponível'; end if;
   for v,item in select a.value,b.value from jsonb_array_elements(proof->'reversals') a(value)
    join jsonb_array_elements(raw->'reversals') b(value) on a.value->'id'=b.value->'id' loop
    if v->'id' is distinct from item->'id' or v->'reversesDebitId' is distinct from item->'reversesDebitId'
     or v->'reversesDebitId' is distinct from proof->'debit'->'id' or v->'effectedAt' is distinct from item->'effectedAt'
     or v->'amountCents' is distinct from to_jsonb((item->>'value')::numeric*100) then raise exception 'Prova indisponível'; end if;
    total:=total+(v->>'amountCents')::numeric;
   end loop;
   if proof->'reversedCents' is distinct from to_jsonb(total) or proof->'outstandingCents' is distinct from to_jsonb((proof->>'debitedCents')::numeric-total)
    or total>(proof->>'debitedCents')::numeric then raise exception 'Prova indisponível'; end if;
  end if;
 end if;
 insert into private.payment_financial_observations(charge_id,source_kind,source_id,receipt_id,body_hash,normalizer_version,source_order,facts,proof,reason)
 values(charge.id,kind,source_id,receipt_id,body_hash,1,source_order,facts,proof,problem) returning * into prior;
 return private.financial_observation_result(prior);
end; $$;
revoke all on function private.record_financial_observation(uuid,text,uuid,uuid,text,jsonb,jsonb,bigint,text),private.financial_observation_result(private.payment_financial_observations,text,uuid) from public,anon,authenticated,service_role;

create function public.capture_financial_origin(target_observation uuid,body_hash text,facts jsonb,proof jsonb,source_order bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare origin jsonb;charge private.payment_financial_charges%rowtype;intent private.payment_intents%rowtype;o private.payment_execution_observations%rowtype;
begin
 origin:=public.get_financial_origin(target_observation);
 select * into o from private.payment_execution_observations where id=target_observation;
 select * into intent from private.payment_intents where id=(origin->>'intentId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('financial-origin:'||intent.id::text,0));
 insert into private.payment_financial_charges(scope_id,client_id,provider_payment_id,intent_id,order_id,origin_id,expectation)
 values((origin->>'scopeId')::uuid,(origin->>'clientId')::uuid,origin->'expectation'->>'paymentId',intent.id,intent.order_id,target_observation,origin->'expectation')
 on conflict(intent_id) do nothing;
 select * into charge from private.payment_financial_charges where intent_id=intent.id;
 if(charge.scope_id,charge.client_id,charge.provider_payment_id,charge.expectation) is distinct from((origin->>'scopeId')::uuid,(origin->>'clientId')::uuid,origin->'expectation'->>'paymentId',origin->'expectation') then raise exception 'Vínculo indisponível'; end if;
 return private.record_financial_observation(charge.id,'execution',o.id,o.receipt_id,body_hash,facts,proof,source_order,null);
end; $$;

create function private.financial_query_descriptor(q private.payment_financial_queries,c private.payment_financial_charges) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('queryId',(q).id,'chargeId',(c).id,'workerId',(q).worker_id,'revision',(q).revision,'scopeId',(c).scope_id,'clientId',(c).client_id,
  'expectation',(c).expectation,'started',(q).started,'finished',(q).finished_at is not null,'protocol',(q).protocol)
$$;
create function public.allocate_financial_query(target_charge uuid,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.payment_financial_charges%rowtype;q private.payment_financial_queries%rowtype;
begin
 select * into c from private.payment_financial_charges where id=target_charge for update;
 perform private.require_payment_fixture_system(c.scope_id,c.client_id);
 if request_id is null then raise exception 'Consulta indisponível'; end if;
 perform pg_advisory_xact_lock(hashtextextended('financial-query:'||request_id::text,0));
 select * into q from private.payment_financial_queries where id=request_id;
 if q.id is not null then
  if q.charge_id<>c.id then raise exception 'Consulta já vinculada'; end if;
  return private.financial_query_descriptor(q,c);
 end if;
 insert into private.payment_financial_queries(id,charge_id,revision) values(request_id,c.id,c.revision+1) returning * into q;
 update private.payment_financial_charges set revision=q.revision,current_query=q.id where id=c.id;
 return private.financial_query_descriptor(q,c);
end; $$;
create function public.start_financial_query(target_query uuid,worker_id uuid,protocol jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare q private.payment_financial_queries%rowtype;c private.payment_financial_charges%rowtype;raw text;expected uuid;
begin
 select * into q from private.payment_financial_queries where id=target_query;
 select * into c from private.payment_financial_charges where id=q.charge_id for update;
 perform private.require_payment_fixture_system(c.scope_id,c.client_id);
 select * into q from private.payment_financial_queries where id=target_query for update;
 raw:=encode(sha256(convert_to(q.id::text||':payment_get','UTF8')),'hex');
 expected:=(substr(raw,1,8)||'-'||substr(raw,9,4)||'-5'||substr(raw,14,3)||'-8'||substr(raw,18,3)||'-'||substr(raw,21,12))::uuid;
 if q.worker_id is distinct from worker_id then raise exception 'Worker indisponível'; end if;
 if q.started then
  if q.protocol is distinct from protocol then raise exception 'Protocolo já capturado'; end if;
  return q.finished_at is null;
 end if;
 if c.current_query is distinct from q.id or c.revision<>q.revision then return false; end if;
 if protocol is null or jsonb_typeof(protocol)<>'object' or protocol->>'fingerprint' is null or protocol->>'operation' is distinct from 'payment_get' or protocol->'version' is distinct from '1'::jsonb
  or protocol->>'requestId' is distinct from expected::text or protocol->>'fingerprint' !~ '^[0-9a-f]{64}$'
  or protocol->'payload' is distinct from jsonb_build_object('paymentId',c.provider_payment_id)
  or protocol-array['operation','version','requestId','fingerprint','payload']<>'{}'::jsonb then raise exception 'Protocolo indisponível'; end if;
 update private.payment_financial_queries set started=true,protocol=start_financial_query.protocol where id=q.id;
 return true;
end; $$;
create function public.finish_financial_query(target_query uuid,worker_id uuid,body_hash text,facts jsonb,proof jsonb,source_order bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q private.payment_financial_queries%rowtype;c private.payment_financial_charges%rowtype;n private.payment_fixture_requests%rowtype;
 result jsonb;problem text;
begin
 select * into q from private.payment_financial_queries where id=target_query;
 select * into c from private.payment_financial_charges where id=q.charge_id for update;
 perform private.require_payment_fixture_system(c.scope_id,c.client_id);
 select * into q from private.payment_financial_queries where id=target_query for update;
 if q.worker_id is distinct from worker_id or not q.started then raise exception 'Consulta indisponível'; end if;
 select * into n from private.payment_fixture_requests where id=(q.protocol->>'requestId')::uuid;
 if n.id is not null and(n.slot_id,n.scope_id,n.client_id,n.operation,n.fingerprint,n.payload,n.outcome->'scope')
  is distinct from(q.id,c.scope_id,c.client_id,'payment_get',q.protocol->>'fingerprint',q.protocol->'payload',c.expectation->'scope') then raise exception 'Fonte indisponível'; end if;
 if facts is null then
  problem:=case when n.id is null then 'unavailable' when n.outcome->>'kind'='indeterminate' then 'indeterminate'
   when n.outcome->>'kind'='not_dispatched' then 'not_dispatched' when n.outcome->'status'='404'::jsonb then 'not_located' else 'invalid_observation' end;
 end if;
 result:=private.record_financial_observation(c.id,'query',q.id,n.id,body_hash,facts,proof,source_order,problem);
 if result->>'kind' <> 'conflict' and q.finished_at is null then update private.payment_financial_queries set finished_at=clock_timestamp() where id=q.id; end if;
 -- Fencing da coordenação; não declara vencedor financeiro.
 if result->>'kind' <> 'conflict' and c.current_query=q.id and c.revision=q.revision then update private.payment_financial_charges set current_query=null where id=c.id; end if;
 return result||jsonb_build_object('current',c.current_query=q.id and c.revision=q.revision);
end; $$;
revoke all on function private.financial_query_descriptor(private.payment_financial_queries,private.payment_financial_charges) from public,anon,authenticated,service_role;
revoke all on function public.get_financial_origin(uuid),public.capture_financial_origin(uuid,text,jsonb,jsonb,bigint),public.allocate_financial_query(uuid,uuid),public.start_financial_query(uuid,uuid,jsonb),public.finish_financial_query(uuid,uuid,text,jsonb,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.get_financial_origin(uuid),public.capture_financial_origin(uuid,text,jsonb,jsonb,bigint),public.allocate_financial_query(uuid,uuid),public.start_financial_query(uuid,uuid,jsonb),public.finish_financial_query(uuid,uuid,text,jsonb,jsonb,bigint) to service_role;
create function public.get_financial_query_observation(target_query uuid,worker_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q private.payment_financial_queries%rowtype;c private.payment_financial_charges%rowtype;o private.payment_financial_observations%rowtype;
begin
 select * into q from private.payment_financial_queries where id=target_query;
 select * into c from private.payment_financial_charges where id=q.charge_id;
 perform private.require_payment_fixture_system(c.scope_id,c.client_id);
 if q.worker_id is distinct from worker_id then raise exception 'Worker indisponível'; end if;
 select * into o from private.payment_financial_observations where charge_id=c.id and source_kind='query' and source_id=q.id;
 if o.id is null then return null; end if;
 return private.financial_observation_result(o,'replay');
end; $$;
revoke all on function public.get_financial_query_observation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_financial_query_observation(uuid,uuid) to service_role;
create function private.guard_financial_fixture_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  if exists(select 1 from private.payment_financial_charges where scope_id=new.scope_id and provider_payment_id=new.id) then raise exception 'Identidade não reutilizável'; end if;
  return new;
 end if;
 if exists(select 1 from private.payment_financial_charges where scope_id=old.scope_id and provider_payment_id=old.id)
  and(tg_op='DELETE' or (new.scope_id,new.id,new.client_id,new.intent_id,new.reference,new.customer_id) is distinct from(old.scope_id,old.id,old.client_id,old.intent_id,old.reference,old.customer_id)) then raise exception 'Identidade financeira preservada'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end; $$;
create trigger payment_fixture_financial_identity before insert or update or delete on private.payment_fixture_payments for each row execute function private.guard_financial_fixture_identity();
revoke all on function private.guard_financial_fixture_identity() from public,anon,authenticated,service_role;
