-- Provedor exclusivamente fictício. Desativado por padrão; sem endpoint externo.
create table private.payment_fixture_environment (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into private.payment_fixture_environment(singleton,enabled) values(true,false);
create table private.payment_fixture_customers (
 id text primary key default ('cus_fixture_'||pg_catalog.gen_random_uuid()::text),
 scope_id uuid not null references private.payment_provider_scopes(id), client_id uuid not null references public.clients(id),
 kind text not null check(kind in ('person','company')), document text not null, name text not null,
 notification_disabled boolean not null default true,
 created_at timestamptz not null default clock_timestamp(),
 check((kind='person' and private.valid_signup_cpf(document)) or (kind='company' and private.valid_signup_cnpj(document)))
);
-- Sem unicidade por referência: o ensaio precisa revelar POSTs duplicados.
create index payment_fixture_customers_lookup on private.payment_fixture_customers(scope_id,client_id,document,created_at,id);
create index payment_fixture_customers_client on private.payment_fixture_customers(client_id);
create table private.payment_fixture_payments (
 id text primary key default ('pay_fixture_'||pg_catalog.gen_random_uuid()::text),
 scope_id uuid not null references private.payment_provider_scopes(id), client_id uuid not null references public.clients(id),
 customer_id text not null references private.payment_fixture_customers(id), intent_id uuid not null references private.payment_intents(id),
 reference uuid not null, value_cents bigint not null check(value_cents between 1 and 9007199254740991),
 original_cents bigint check(original_cents between 1 and 9007199254740991), net_cents bigint check(net_cents between -9007199254740991 and 9007199254740991),
 billing_type text not null check(billing_type in ('PIX','BOLETO','CREDIT_CARD','UNDEFINED')),
 due_date date not null, status text not null default 'PENDING' check(status ~ '^[A-Z0-9_]{1,100}$'), deleted boolean not null default false,
 refunds jsonb check(refunds is null or jsonb_typeof(refunds)='array'), chargeback jsonb check(chargeback is null or jsonb_typeof(chargeback)='object'),
 created_at timestamptz not null default clock_timestamp(), check(reference=intent_id)
);
create index payment_fixture_payments_lookup on private.payment_fixture_payments(scope_id,client_id,customer_id,reference,created_at,id);
create index payment_fixture_payments_client on private.payment_fixture_payments(client_id);
create index payment_fixture_payments_customer on private.payment_fixture_payments(customer_id);
create index payment_fixture_payments_intent on private.payment_fixture_payments(intent_id);
create table private.payment_fixture_requests (
 id uuid primary key, slot_id uuid not null, scope_id uuid not null references private.payment_provider_scopes(id),
 client_id uuid not null references public.clients(id), operation text not null check(operation in ('customer_create','customer_get','customer_find','payment_create','payment_get','payment_find')),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'), payload jsonb not null check(jsonb_typeof(payload)='object'),
 outcome jsonb not null check(jsonb_typeof(outcome)='object'), effect_id text,
 execution_mode text not null default 'fixture' check(execution_mode='fixture'), recorded_at timestamptz not null default clock_timestamp(),
 check(octet_length(payload::text)<=1048576 and octet_length(outcome::text)<=1048576)
);
create index payment_fixture_requests_scope on private.payment_fixture_requests(scope_id,client_id,slot_id);
create index payment_fixture_requests_client on private.payment_fixture_requests(client_id);
create table private.payment_fixture_invocations (
 id uuid primary key default pg_catalog.gen_random_uuid(), request_id uuid not null references private.payment_fixture_requests(id),
 replayed boolean not null, executor text not null default 'local_fixture' check(executor='local_fixture'),
 invoked_at timestamptz not null default clock_timestamp()
);
create index payment_fixture_invocations_request on private.payment_fixture_invocations(request_id);
create table private.payment_fixture_controls (
 scope_id uuid not null references private.payment_provider_scopes(id), client_id uuid not null references public.clients(id),
 operation text not null check(operation in ('customer_create','customer_get','customer_find','payment_create','payment_get','payment_find')),
 behavior text not null check(behavior in ('normal','not_dispatched','indeterminate_before','lost_after_create','invalid_after_create','unavailable','not_found','incomplete_list')),
 calls_left integer not null default 1 check(calls_left between 0 and 10), primary key(scope_id,client_id,operation)
);
create index payment_fixture_controls_client on private.payment_fixture_controls(client_id);
alter table private.payment_fixture_environment enable row level security;
alter table private.payment_fixture_customers enable row level security;
alter table private.payment_fixture_payments enable row level security;
alter table private.payment_fixture_requests enable row level security;
alter table private.payment_fixture_invocations enable row level security;
alter table private.payment_fixture_controls enable row level security;
revoke all on private.payment_fixture_environment,private.payment_fixture_customers,private.payment_fixture_payments,
 private.payment_fixture_requests,private.payment_fixture_invocations,private.payment_fixture_controls from public,anon,authenticated,service_role;
create trigger payment_fixture_request_immutable before update on private.payment_fixture_requests for each row execute function private.preserve_quote_contract_record();
create trigger payment_fixture_invocation_immutable before update on private.payment_fixture_invocations for each row execute function private.preserve_quote_contract_record();

create function private.require_payment_fixture_system(target_scope uuid,target_client uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope private.payment_provider_scopes%rowtype;
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from private.payment_fixture_environment where singleton and enabled)
  then raise exception 'Transporte fictício indisponível'; end if;
 select * into scope from private.payment_provider_scopes where id=target_scope and mode='fixture' and environment='sandbox';
 if scope.id is null or not exists(select 1 from public.clients where id=target_client) then raise exception 'Transporte fictício indisponível'; end if;
 return jsonb_strip_nulls(jsonb_build_object('provider','asaas','environment',scope.environment,'accountId',scope.account_id,'walletId',scope.wallet_id));
end;
$$;
revoke all on function private.require_payment_fixture_system(uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_payment_fixture_scope(target_scope uuid,target_client uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return jsonb_build_object('schemaVersion',1,'mode','fixture','identityProof','fixture_declared','scopeId',target_scope,
  'clientId',target_client,'scope',private.require_payment_fixture_system(target_scope,target_client));
end;
$$;
revoke all on function public.get_payment_fixture_scope(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_payment_fixture_scope(uuid,uuid) to service_role;

create function private.payment_fixture_customer_wire(value private.payment_fixture_customers) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',(value).id,'cpfCnpj',(value).document,'externalReference',(value).client_id,'notificationDisabled',(value).notification_disabled)
$$;
create function private.payment_fixture_payment_wire(value private.payment_fixture_payments) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',(value).id,'customer',(value).customer_id,'externalReference',(value).reference,
  'value',((value).value_cents::numeric/100)::numeric(18,2),'originalValue',((value).original_cents::numeric/100)::numeric(18,2),
  'netValue',((value).net_cents::numeric/100)::numeric(18,2),'billingType',(value).billing_type,'dueDate',(value).due_date::text,
  'status',(value).status,'deleted',(value).deleted,'invoiceUrl','https://sandbox.asaas.com/i/'||(value).id,'refunds',(value).refunds,'chargeback',(value).chargeback)
$$;
revoke all on function private.payment_fixture_customer_wire(private.payment_fixture_customers),private.payment_fixture_payment_wire(private.payment_fixture_payments) from public,anon,authenticated,service_role;

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


revoke all on function public.send_payment_fixture_request(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.send_payment_fixture_request(uuid,uuid,uuid,uuid,text,text,jsonb) to service_role;
CREATE OR REPLACE FUNCTION public.get_payment_fixture_receipt(target_scope uuid, target_client uuid, slot_id uuid, request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r private.payment_fixture_requests%rowtype; scope jsonb;
begin
 scope:=private.require_payment_fixture_system(target_scope,target_client);
 select * into r from private.payment_fixture_requests where id=request_id;
 if r.id is null then return null; end if;
 if (r.scope_id,r.client_id,r.slot_id) is distinct from (target_scope,target_client,slot_id) then raise exception 'Recibo fictício indisponível'; end if;
 return jsonb_build_object('schemaVersion',1,'mode','fixture','identityProof','fixture_declared','scope',scope,'requestId',r.id,'slotId',r.slot_id,
  'scopeId',r.scope_id,'clientId',r.client_id,'operation',r.operation,'fingerprint',r.fingerprint,'recordedAt',r.recorded_at,'outcome',r.outcome);
end;
$function$;


revoke all on function public.get_payment_fixture_receipt(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_payment_fixture_receipt(uuid,uuid,uuid,uuid) to service_role;
