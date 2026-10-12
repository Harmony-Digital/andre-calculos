-- Origem explicita e vinculo ficticios. Nenhum backfill por provider_ref.
create table private.payment_legacy_origins (
 request_id uuid primary key, observation_id uuid not null references private.payment_financial_observations(id),
 payment_id uuid not null unique references public.payments(id), charge_id uuid not null unique references private.payment_financial_charges(id),
 scope_id uuid not null references private.payment_provider_scopes(id), client_id uuid not null references public.clients(id),
 intent_id uuid not null references private.payment_intents(id), order_id uuid not null references public.orders(id),
 phase text not null check(phase in('deposit','balance')), execution_origin_id uuid not null references private.payment_execution_observations(id),
 receipt_id uuid not null references private.payment_fixture_requests(id), amount_cents bigint not null check(amount_cents between 1 and 9007199254740991),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'), recorded_at timestamptz not null,
 result jsonb not null check(jsonb_typeof(result)='object')
);
create index payment_legacy_origins_observation_idx on private.payment_legacy_origins(observation_id);
create index payment_legacy_origins_scope_idx on private.payment_legacy_origins(scope_id);
create index payment_legacy_origins_client_idx on private.payment_legacy_origins(client_id);
create index payment_legacy_origins_intent_idx on private.payment_legacy_origins(intent_id);
create index payment_legacy_origins_order_idx on private.payment_legacy_origins(order_id);
create index payment_legacy_origins_execution_idx on private.payment_legacy_origins(execution_origin_id);
create index payment_legacy_origins_receipt_idx on private.payment_legacy_origins(receipt_id);
alter table private.payment_legacy_bindings add column origin_request_id uuid not null unique references private.payment_legacy_origins(request_id);
create table private.payment_legacy_binding_receipts (
 request_id uuid primary key, origin_request_id uuid not null unique references private.payment_legacy_origins(request_id),
 application_request_id uuid not null references private.payment_financial_applications(request_id),
 payment_id uuid not null unique references public.payments(id), charge_id uuid not null references private.payment_financial_charges(id),
 scope_id uuid not null references private.payment_provider_scopes(id), intent_id uuid not null references private.payment_intents(id),
 order_id uuid not null references public.orders(id), phase text not null check(phase in('deposit','balance')),
 observation_id uuid not null references private.payment_financial_observations(id), basis_observation_id uuid not null references private.payment_financial_observations(id),
 position_revision bigint not null check(position_revision between 1 and 9007199254740991),
 charge_revision bigint not null check(charge_revision between 0 and 9007199254740991), journal_fingerprint text not null check(journal_fingerprint ~ '^[0-9a-f]{64}$'),
 bound_at timestamptz not null, result jsonb not null check(jsonb_typeof(result)='object')
);
create index payment_legacy_binding_receipts_application_idx on private.payment_legacy_binding_receipts(application_request_id);
create index payment_legacy_binding_receipts_charge_idx on private.payment_legacy_binding_receipts(charge_id);
create index payment_legacy_binding_receipts_scope_idx on private.payment_legacy_binding_receipts(scope_id);
create index payment_legacy_binding_receipts_intent_idx on private.payment_legacy_binding_receipts(intent_id);
create index payment_legacy_binding_receipts_order_idx on private.payment_legacy_binding_receipts(order_id);
create index payment_legacy_binding_receipts_observation_idx on private.payment_legacy_binding_receipts(observation_id);
create index payment_legacy_binding_receipts_basis_idx on private.payment_legacy_binding_receipts(basis_observation_id);
alter table private.payment_legacy_origins enable row level security;
alter table private.payment_legacy_binding_receipts enable row level security;
revoke all on private.payment_legacy_origins,private.payment_legacy_binding_receipts from public,anon,authenticated,service_role;

create function private.preserve_fixture_legacy_record() returns trigger language plpgsql set search_path='' as $$
begin
 -- A limpeza e administrativa, exclusiva do ensaio. PostgREST conserva session_user=authenticator.
 if tg_op='DELETE' and session_user='postgres' and exists(select 1 from private.payment_fixture_environment where singleton and enabled) then return old; end if;
 raise exception 'Origem do legado imutavel';
end; $$;
create trigger payment_legacy_origin_immutable before update or delete on private.payment_legacy_origins for each row execute function private.preserve_fixture_legacy_record();
create trigger payment_legacy_receipt_immutable before update or delete on private.payment_legacy_binding_receipts for each row execute function private.preserve_fixture_legacy_record();
drop trigger payment_legacy_binding_immutable on private.payment_legacy_bindings;
create trigger payment_legacy_binding_immutable before update or delete on private.payment_legacy_bindings for each row execute function private.preserve_fixture_legacy_record();
revoke all on function private.preserve_fixture_legacy_record() from public,anon,authenticated,service_role;

create function private.fixture_legacy_charge_origin(target_charge uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c private.payment_financial_charges%rowtype;r private.payment_execution_runs%rowtype;
 i private.payment_intents%rowtype;x private.payment_obligation_contexts%rowtype;b private.payment_provider_customers%rowtype;
 scope jsonb; source jsonb; owner_profile uuid;
begin
 select * into c from private.payment_financial_charges where id=target_charge;
 select run.* into r from private.payment_execution_runs run join private.payment_execution_observations o on o.run_id=run.id where o.id=c.origin_id;
 select * into i from private.payment_intents where id=c.intent_id;
 select * into x from private.payment_obligation_contexts where id=i.context_id;
 select * into b from private.payment_provider_customers where id=x.binding_id;
 select customer.owner_id into owner_profile from public.clients customer where customer.id=c.client_id;
 scope:=private.require_payment_fixture_system(c.scope_id,c.client_id);
 source:=public.get_financial_origin(c.origin_id);
 if c.id is null or r.id is null or i.id is null or x.id is null or b.id is null
  or (r.intent_id,r.scope_id,r.client_id,r.selected_payment_id) is distinct from(c.intent_id,c.scope_id,c.client_id,c.provider_payment_id)
  or (i.order_id,x.order_id,x.client_id,b.client_id,b.scope_id) is distinct from(c.order_id,c.order_id,c.client_id,c.client_id,c.scope_id)
  or not exists(select 1 from public.profiles p where p.id=owner_profile and p.role='client')
  or not exists(select 1 from public.profiles p where p.id=i.created_by and p.role in('client','calculator'))
  or x.snapshot->>'orderId' is distinct from x.order_id::text or x.snapshot->>'clientId' is distinct from x.client_id::text
  or x.snapshot->>'phase' is distinct from x.phase or x.snapshot->>'quoteId' is distinct from x.quote_id::text
  or x.snapshot->>'contextHash' is distinct from x.context_hash or (x.snapshot->>'remainingCents')::numeric is distinct from x.remaining_cents
  or x.snapshot->>'billingType' is distinct from x.billing_type or x.snapshot->>'dueDate' is distinct from x.due_date::text
  or x.snapshot->'binding'->>'id' is distinct from b.id::text or x.snapshot->'binding'->>'clientId' is distinct from b.client_id::text
  or x.snapshot->'binding'->>'customerId' is distinct from b.customer_id or x.snapshot->'binding'->'scope' is distinct from scope
  or r.snapshot->'obligation' is distinct from x.snapshot
  or c.expectation is distinct from jsonb_build_object('phase','observation','scope',scope,'paymentId',c.provider_payment_id,'customerId',b.customer_id,
   'reference',i.id::text,'contractedCents',x.remaining_cents,'billingType',x.billing_type,'dueDate',x.due_date::text)
  or source->>'originId' is distinct from c.origin_id::text or source->>'intentId' is distinct from i.id::text
  or source->>'scopeId' is distinct from c.scope_id::text or source->>'clientId' is distinct from c.client_id::text
  or source->'expectation' is distinct from c.expectation then raise exception 'Legado sem origem explicita'; end if;
 return jsonb_build_object('chargeId',c.id,'scopeId',c.scope_id,'clientId',c.client_id,'intentId',i.id,'orderId',c.order_id,
  'phase',x.phase,'executionOriginId',c.origin_id,'executionRequestId',r.request_id,'ownerId',owner_profile,'expectation',c.expectation);
end; $$;
revoke all on function private.fixture_legacy_charge_origin(uuid) from public,anon,authenticated,service_role;

create function private.fixture_legacy_received_source(target_observation uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare o private.payment_financial_observations%rowtype;c private.payment_financial_charges%rowtype;
 n private.payment_fixture_requests%rowtype;origin jsonb;gross numeric;
begin
 select * into o from private.payment_financial_observations where id=target_observation;
 select * into c from private.payment_financial_charges where id=o.charge_id;
 origin:=private.fixture_legacy_charge_origin(c.id);
 select * into n from private.payment_fixture_requests where id=o.receipt_id;
 gross:=(o.facts->'amounts'->>'receivedCents')::numeric;
 if o.id is null or n.id is null or o.normalizer_version<>1 or o.reason is not null
  or o.facts->>'status' is distinct from 'RECEIVED'
  or o.facts->>'classification' is distinct from 'received' or o.facts->'deleted' is distinct from 'false'::jsonb
  or o.facts->'scope' is distinct from c.expectation->'scope' or o.facts->>'paymentId' is distinct from c.provider_payment_id
  or o.facts->>'customerId' is distinct from c.expectation->>'customerId' or o.facts->>'reference' is distinct from c.intent_id::text
  or o.facts->'amounts'->'contractedCents' is distinct from c.expectation->'contractedCents'
  or o.facts->>'expectedBillingType' is distinct from c.expectation->>'billingType' or o.facts->>'dueDate' is distinct from c.expectation->>'dueDate'
  or jsonb_typeof(o.facts->'amounts'->'receivedCents') is distinct from 'number' or gross is null or gross not between 1 and 9007199254740991 or trunc(gross)<>gross
  or o.facts->'amounts'->'receivedCents' is distinct from o.facts->'amounts'->'currentValueCents'
  or o.facts->'reasons' ?| array['unknown_billing_type','billing_type_mismatch','manual_receipt','incompatible_event_status']
  or (n.scope_id,n.client_id) is distinct from(c.scope_id,c.client_id) or n.operation not in('payment_create','payment_get','payment_find')
  or n.outcome->'scope' is distinct from c.expectation->'scope' or n.outcome->>'kind' is distinct from 'response'
  or n.outcome->'status' is distinct from '200'::jsonb or o.body_hash is distinct from encode(sha256(convert_to(n.outcome->>'bodyText','UTF8')),'hex')
  or exists(select 1 from private.payment_financial_conflicts where observation_id=o.id)
  then raise exception 'Legado sem recebimento comprovado'; end if;
 return origin||jsonb_build_object('observationId',o.id,'receiptId',n.id,'amountCents',gross::bigint,'providerReference',c.provider_payment_id);
end; $$;
revoke all on function private.fixture_legacy_received_source(uuid) from public,anon,authenticated,service_role;

create function public.get_fixture_legacy_origin_receipt(target_observation uuid,request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare receipt private.payment_legacy_origins%rowtype;
begin
 if auth.role() is distinct from 'service_role' or target_observation is null or request_id is null then raise exception 'Origem ficticia indisponivel'; end if;
 select * into receipt from private.payment_legacy_origins o where o.request_id=get_fixture_legacy_origin_receipt.request_id;
 if receipt.request_id is null then return null; end if;
 if receipt.observation_id is distinct from target_observation then raise sqlstate 'PT409' using message='Solicitacao de origem divergente'; end if;
 return receipt.result;
end; $$;

create function public.create_fixture_legacy_origin(target_observation uuid,request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare o private.payment_financial_observations%rowtype;c private.payment_financial_charges%rowtype;r private.payment_execution_runs%rowtype;
 intent private.payment_intents%rowtype;source jsonb;result jsonb;snapshot jsonb;payment_id uuid;at_time timestamptz;owner_before uuid;
begin
 result:=public.get_fixture_legacy_origin_receipt(target_observation,request_id);
 if result is not null then return result; end if;
 select * into o from private.payment_financial_observations where id=target_observation;
 select * into c from private.payment_financial_charges where id=o.charge_id;
 select run.* into r from private.payment_execution_runs run join private.payment_execution_observations e on e.run_id=run.id where e.id=c.origin_id;
 select owner_id into owner_before from public.clients where id=c.client_id;
 if c.id is null or r.id is null then raise exception 'Origem ficticia indisponivel'; end if;
 intent:=private.lock_payment_execution(r.request_id);
 perform pg_advisory_xact_lock(hashtextextended('legacy-origin:'||request_id::text,0));
 result:=public.get_fixture_legacy_origin_receipt(target_observation,request_id);
 if result is not null then return result; end if;
 source:=private.fixture_legacy_received_source(target_observation);
 if intent.id is distinct from c.intent_id or source->>'ownerId' is distinct from owner_before::text then raise sqlstate 'PT409' using message='Origem do pedido mudou'; end if;
 if exists(select 1 from private.payment_legacy_origins where charge_id=c.id) then raise sqlstate 'PT409' using message='Representacao legada ja registrada'; end if;
 payment_id:=gen_random_uuid();at_time:=clock_timestamp();
 snapshot:=jsonb_build_object('orderId',c.order_id,'method','asaas','kind',source->>'phase','status','confirmed','amountCents',source->'amountCents','providerReference',source->>'providerReference');
 insert into public.payments(id,order_id,kind,method,amount_cents,status,provider_ref)
  values(payment_id,c.order_id,source->>'phase','asaas',(source->>'amountCents')::bigint,'confirmed',source->>'providerReference');
 result:=jsonb_build_object('schemaVersion',1,'semantics','legacy_origin_receipt','mode','fixture','identityProof','fixture_explicit_source',
  'requestId',request_id,'observationId',target_observation,'paymentId',payment_id,'chargeId',c.id,'scopeId',c.scope_id,'clientId',c.client_id,
  'intentId',c.intent_id,'orderId',c.order_id,'phase',source->>'phase','executionOriginId',c.origin_id,'receiptId',source->>'receiptId',
  'amountCents',source->'amountCents','snapshot',snapshot,'recordedAt',at_time);
 insert into private.payment_legacy_origins(request_id,observation_id,payment_id,charge_id,scope_id,client_id,intent_id,order_id,phase,execution_origin_id,receipt_id,amount_cents,snapshot,recorded_at,result)
  values(request_id,target_observation,payment_id,c.id,c.scope_id,c.client_id,c.intent_id,c.order_id,source->>'phase',c.origin_id,(source->>'receiptId')::uuid,(source->>'amountCents')::bigint,snapshot,at_time,result);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_legacy_origin_created','legacy_origin',request_id);
 return result;
end; $$;

create function private.guard_fixture_legacy_payment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.payment_legacy_origins where payment_id=old.id) or exists(select 1 from private.payment_legacy_bindings where payment_id=old.id) then
  if tg_op='DELETE' and session_user='postgres' and exists(select 1 from private.payment_fixture_environment where singleton and enabled) then return old; end if;
  raise exception 'Identidade da linha legada imutavel';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
create trigger payment_legacy_identity_guard before update or delete on public.payments for each row execute function private.guard_fixture_legacy_payment();
revoke all on function private.guard_fixture_legacy_payment() from public,anon,authenticated,service_role;

create or replace function private.guard_legacy_payment_binding() returns trigger language plpgsql set search_path='' as $$
declare origin private.payment_legacy_origins%rowtype;p public.payments%rowtype;source jsonb;
begin
 select * into origin from private.payment_legacy_origins where request_id=new.origin_request_id;
 select * into p from public.payments where id=new.payment_id;
 source:=private.fixture_legacy_received_source(origin.observation_id);
 if origin.request_id is null or p.id is null
  or (origin.payment_id,origin.charge_id,origin.scope_id,origin.observation_id) is distinct from(new.payment_id,new.charge_id,new.scope_id,new.observation_id)
  or source->>'chargeId' is distinct from origin.charge_id::text or source->>'scopeId' is distinct from origin.scope_id::text
  or source->>'clientId' is distinct from origin.client_id::text or source->>'intentId' is distinct from origin.intent_id::text
  or source->>'orderId' is distinct from origin.order_id::text or source->>'phase' is distinct from origin.phase
  or source->>'executionOriginId' is distinct from origin.execution_origin_id::text or source->>'receiptId' is distinct from origin.receipt_id::text
  or source->'amountCents' is distinct from to_jsonb(origin.amount_cents)
  or origin.snapshot is distinct from jsonb_build_object('orderId',p.order_id,'method',p.method,'kind',p.kind,'status',p.status,'amountCents',p.amount_cents,'providerReference',p.provider_ref)
  or origin.result->'snapshot' is distinct from origin.snapshot or origin.result->>'paymentId' is distinct from p.id::text
  or origin.result->>'requestId' is distinct from origin.request_id::text or origin.result->>'observationId' is distinct from origin.observation_id::text
  then raise exception 'Legado sem vinculo inequivoco'; end if;
 return new;
end; $$;

create function public.get_fixture_legacy_binding_receipt(target_origin uuid,target_application uuid,request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare receipt private.payment_legacy_binding_receipts%rowtype;
begin
 if auth.role() is distinct from 'service_role' or target_origin is null or target_application is null or request_id is null then raise exception 'Vinculo ficticio indisponivel'; end if;
 select * into receipt from private.payment_legacy_binding_receipts b where b.request_id=get_fixture_legacy_binding_receipt.request_id;
 if receipt.request_id is null then return null; end if;
 if (receipt.origin_request_id,receipt.application_request_id) is distinct from(target_origin,target_application) then raise sqlstate 'PT409' using message='Solicitacao de vinculo divergente'; end if;
 return receipt.result;
end; $$;

create function public.bind_fixture_legacy_payment(target_origin uuid,target_application uuid,request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare origin private.payment_legacy_origins%rowtype;application private.payment_financial_applications%rowtype;
 c private.payment_financial_charges%rowtype;r private.payment_execution_runs%rowtype;i private.payment_intents%rowtype;
 x private.payment_obligation_contexts%rowtype;p private.payment_financial_positions%rowtype;
 source jsonb;authority jsonb;result jsonb;projection jsonb;recipient uuid;owner_before uuid;next_status text;at_time timestamptz;
begin
 result:=public.get_fixture_legacy_binding_receipt(target_origin,target_application,request_id);
 if result is not null then return result; end if;
 select * into origin from private.payment_legacy_origins o where o.request_id=target_origin;
 select * into application from private.payment_financial_applications a where a.request_id=target_application;
 select * into c from private.payment_financial_charges where id=origin.charge_id;
 select run.* into r from private.payment_execution_runs run join private.payment_execution_observations e on e.run_id=run.id where e.id=c.origin_id;
 if origin.request_id is null or application.request_id is null or c.id is null or r.id is null then raise exception 'Origem do vinculo indisponivel'; end if;
 select profile_id into recipient from private.calculator_notification_recipient where singleton for share;
 select * into i from private.payment_intents where id=c.intent_id;
 select * into x from private.payment_obligation_contexts where id=i.context_id;
 select owner_id into owner_before from public.clients where id=c.client_id;
 perform id from public.profiles where id in(recipient,owner_before,i.created_by,x.actor_id,(x.snapshot->>'ownerId')::uuid) order by id for share;
 if recipient is not null and not exists(select 1 from public.profiles where id=recipient and role='calculator') then raise exception 'Responsavel pelos avisos indisponivel'; end if;
 i:=private.lock_payment_execution(r.request_id);
 perform id from public.settings where singleton for share;
 perform pg_advisory_xact_lock(hashtextextended('legacy-binding:'||request_id::text,0));
 result:=public.get_fixture_legacy_binding_receipt(target_origin,target_application,request_id);
 if result is not null then return result; end if;
 select * into origin from private.payment_legacy_origins o where o.request_id=target_origin;
 select * into application from private.payment_financial_applications a where a.request_id=target_application;
 select * into c from private.payment_financial_charges where id=origin.charge_id;
 authority:=private.fixture_legacy_charge_origin(c.id);
 if authority->>'ownerId' is distinct from owner_before::text or i.id is distinct from c.intent_id
  or (application.charge_id,application.intent_id,application.order_id) is distinct from(c.id,c.intent_id,c.order_id)
  or application.result->>'requestId' is distinct from application.request_id::text
  or application.result->>'observationId' is distinct from application.observation_id::text
  or application.result->>'chargeId' is distinct from c.id::text or application.result->>'intentId' is distinct from c.intent_id::text
  or application.result->>'orderId' is distinct from c.order_id::text
  or application.result->'positionRevision' is distinct from to_jsonb(application.position_revision)
  or application.result->'chargeRevision' is distinct from to_jsonb(application.charge_revision)
  or application.result->>'journalFingerprint' is distinct from application.journal_fingerprint
  then raise exception 'Aplicacao sem origem para vinculo'; end if;
 if exists(select 1 from private.payment_legacy_bindings where payment_id=origin.payment_id)
  or exists(select 1 from private.payment_legacy_binding_receipts where origin_request_id=origin.request_id)
  then raise sqlstate 'PT409' using message='Legado ja vinculado'; end if;
 select * into p from private.payment_financial_positions where charge_id=c.id;
 source:=public.get_financial_projection_source(application.observation_id);
 if source->'captureIsCurrent' is distinct from 'true'::jsonb or c.current_query is not null
  or p.revision is distinct from application.position_revision or p.charge_revision is distinct from application.charge_revision
  or p.charge_revision is distinct from c.revision or p.journal_fingerprint is distinct from application.journal_fingerprint
  or p.journal_fingerprint is distinct from private.financial_journal_fingerprint(c.id)
  or p.observation_id is distinct from application.basis_observation_id or p.value is distinct from application.result->'position'
  then raise sqlstate 'PT412' using message='Fonte do vinculo mudou'; end if;
 insert into private.payment_legacy_bindings(payment_id,charge_id,scope_id,observation_id,identity_proof,origin_request_id)
  values(origin.payment_id,c.id,c.scope_id,origin.observation_id,'fixture_explicit_source',origin.request_id);
 next_status:=private.queue_after_deposit_or_contract(c.order_id,null);
 projection:=private.order_payment_credit(c.order_id);at_time:=clock_timestamp();
 result:=jsonb_build_object('schemaVersion',1,'semantics','legacy_binding_receipt','mode','fixture','identityProof','fixture_explicit_source',
  'requestId',request_id,'originRequestId',origin.request_id,'applicationRequestId',application.request_id,'paymentId',origin.payment_id,
  'chargeId',c.id,'scopeId',c.scope_id,'intentId',c.intent_id,'orderId',c.order_id,'phase',origin.phase,
  'observationId',origin.observation_id,'basisObservationId',p.observation_id,'positionRevision',p.revision,'chargeRevision',p.charge_revision,
  'journalFingerprint',p.journal_fingerprint,'projection',projection,'orderStatus',next_status,'boundAt',at_time);
 insert into private.payment_legacy_binding_receipts(request_id,origin_request_id,application_request_id,payment_id,charge_id,scope_id,intent_id,order_id,phase,observation_id,basis_observation_id,position_revision,charge_revision,journal_fingerprint,bound_at,result)
  values(request_id,origin.request_id,application.request_id,origin.payment_id,c.id,c.scope_id,c.intent_id,c.order_id,origin.phase,origin.observation_id,p.observation_id,p.revision,p.charge_revision,p.journal_fingerprint,at_time,result);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_legacy_bound','legacy_binding',request_id);
 return result;
end; $$;

revoke all on function public.get_fixture_legacy_origin_receipt(uuid,uuid),public.create_fixture_legacy_origin(uuid,uuid),public.get_fixture_legacy_binding_receipt(uuid,uuid,uuid),public.bind_fixture_legacy_payment(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_fixture_legacy_origin_receipt(uuid,uuid),public.create_fixture_legacy_origin(uuid,uuid),public.get_fixture_legacy_binding_receipt(uuid,uuid,uuid),public.bind_fixture_legacy_payment(uuid,uuid,uuid) to service_role;
