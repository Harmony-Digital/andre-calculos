-- Preparo local: vínculos fictícios e contexto da dívida, sem emissão/crédito.
create table private.payment_provider_scopes (
 id uuid primary key, provider text not null check(provider='asaas'),
 mode text not null check(mode='fixture'), environment text not null check(environment='sandbox'),
 account_id text not null check(account_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 wallet_id text check(wallet_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 created_at timestamptz not null default clock_timestamp(),
 unique(provider,environment,account_id)
);
create table private.payment_provider_configuration (
 singleton boolean primary key default true check(singleton),
 scope_id uuid not null references private.payment_provider_scopes(id)
);
create index payment_provider_configuration_scope_idx on private.payment_provider_configuration(scope_id);
create table private.payment_provider_customers (
 id uuid primary key, scope_id uuid not null references private.payment_provider_scopes(id),
 client_id uuid not null references public.clients(id),
 customer_id text not null check(customer_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 kind text not null check(kind in ('person','company')), document text not null,
 created_at timestamptz not null default clock_timestamp(),
 check((kind='person' and document ~ '^[0-9]{11}$' and private.valid_signup_cpf(document))
  or (kind='company' and document ~ '^[A-Z0-9]{12}[0-9]{2}$' and private.valid_signup_cnpj(document))),
 unique(scope_id,client_id), unique(scope_id,customer_id), unique(id,client_id)
);
create index payment_provider_customers_client_idx on private.payment_provider_customers(client_id);
create table private.payment_obligation_contexts (
 id uuid primary key, order_id uuid not null references public.orders(id),
 quote_id uuid not null references private.quote_acceptances(quote_id),
 client_id uuid not null references public.clients(id),
 binding_id uuid not null, actor_id uuid not null references public.profiles(id),
 phase text not null check(phase in ('deposit','balance')),
 context_hash text not null check(context_hash ~ '^[0-9a-f]{64}$'),
 remaining_cents bigint not null check(remaining_cents between 1 and 9007199254740991),
 billing_type text not null check(billing_type in ('PIX','BOLETO','CREDIT_CARD','UNDEFINED')),
 due_date date not null check(isfinite(due_date) and due_date between date '1900-01-01' and date '9999-12-31'),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(binding_id,client_id) references private.payment_provider_customers(id,client_id)
);
create index payment_obligation_contexts_order_idx on private.payment_obligation_contexts(order_id,created_at desc,id desc);
create index payment_obligation_contexts_quote_idx on private.payment_obligation_contexts(quote_id);
create index payment_obligation_contexts_binding_idx on private.payment_obligation_contexts(binding_id,client_id);
create index payment_obligation_contexts_actor_idx on private.payment_obligation_contexts(actor_id);
alter table private.payment_provider_scopes enable row level security;
alter table private.payment_provider_configuration enable row level security;
alter table private.payment_provider_customers enable row level security;
alter table private.payment_obligation_contexts enable row level security;
revoke all on private.payment_provider_scopes,private.payment_provider_configuration,
 private.payment_provider_customers,private.payment_obligation_contexts from public,anon,authenticated,service_role;
create trigger payment_scope_immutable before update on private.payment_provider_scopes
 for each row execute function private.preserve_quote_contract_record();
create trigger payment_customer_immutable before update on private.payment_provider_customers
 for each row execute function private.preserve_quote_contract_record();
create trigger payment_obligation_immutable before update on private.payment_obligation_contexts
 for each row execute function private.preserve_quote_contract_record();

create function private.authorize_payment_obligation(target_order uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner_id uuid; actor_role text;
begin
 select c.owner_id into owner_id from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order;
 select role into actor_role from public.profiles where id=actor;
 if actor is null or owner_id is null or actor_role is null or actor_role not in ('client','calculator')
  or (actor_role='client' and actor<>owner_id)
  or not exists(select 1 from public.profiles where id=owner_id and role='client')
  then raise exception 'Pedido indisponível'; end if;
 return actor;
end;
$$;
revoke all on function private.authorize_payment_obligation(uuid) from public,anon,authenticated,service_role;

create function private.payment_obligation_preview(target_order uuid,target_phase text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare job public.orders%rowtype; customer public.clients%rowtype; accepted record;
 binding private.payment_provider_customers%rowtype; scope private.payment_provider_scopes%rowtype;
 paid numeric; signal numeric; required bigint; remaining bigint; state text:='ready'; problem text;
begin
 if target_phase is null or target_phase not in ('deposit','balance') then raise exception 'Finalidade inválida'; end if;
 select * into job from public.orders where id=target_order;
 select * into customer from public.clients where id=job.client_id;
 select * into accepted from private.accepted_order_deposit(job.id);
 if not found then
  return jsonb_build_object('mode','fixture','identityProof','fixture_declared','status','blocked','reason','contract_missing',
   'orderId',job.id,'phase',target_phase,'quoteId',null,'contextHash',null,'processId',job.process_id,
   'clientId',job.client_id,'ownerId',customer.owner_id,'orderStatus',job.status,'hasContract',customer.has_contract,
   'contractRevision',customer.contract_revision,'totalCents',null,'requiredCents',null,'creditedCents',null,
   'totalCreditedCents',null,'remainingCents',null,'binding',null);
 end if;
 select coalesce(sum(p.amount_cents) filter(where p.kind in ('deposit','balance') and p.status='confirmed' and p.method='pix_manual'),0),
  coalesce(sum(p.amount_cents) filter(where p.kind='deposit' and p.status='confirmed' and p.method='pix_manual'),0)
  into paid,signal from public.payments p where p.order_id=job.id;
 required:=case when target_phase='deposit' then accepted.required_cents else accepted.total_cents end;
 if accepted.total_cents not between 0 and 9007199254740991 or required not between 0 and 9007199254740991
  or paid>9007199254740991 or signal>9007199254740991 then
  state:='blocked'; problem:='unsafe_amount'; paid:=null; signal:=null;
 elsif exists(select 1 from public.payments where order_id=job.id and method='asaas' and kind in ('deposit','balance')) then
  state:='blocked'; problem:='legacy_provider_reconciliation';
 elsif paid>accepted.total_cents or signal>accepted.required_cents then
  state:='blocked'; problem:='credit_excess';
 elsif job.status in ('cancelled','refunded') then
  state:='blocked'; problem:='order_closed';
 elsif target_phase='deposit' and customer.has_contract then
  state:='waived'; remaining:=0;
 elsif (case when target_phase='deposit' then signal else paid end)>=required then
  state:='settled'; remaining:=0;
 elsif target_phase='deposit' and job.status not in ('awaiting_payment','awaiting_documents') then
  state:='blocked'; problem:='phase_unavailable';
 elsif target_phase='balance' and (job.status not in ('delivered','completed')
  or not exists(select 1 from public.deliveries d where d.order_id=job.id and d.process_id=job.process_id)) then
  state:='blocked'; problem:='phase_unavailable';
 else
  remaining:=required-(case when target_phase='deposit' then signal else paid end)::bigint;
 end if;
 select s.* into scope from private.payment_provider_configuration cfg
  join private.payment_provider_scopes s on s.id=cfg.scope_id where cfg.singleton;
 if scope.id is not null then
  select * into binding from private.payment_provider_customers b where b.scope_id=scope.id and b.client_id=job.client_id;
 end if;
 if state='ready' then
  if scope.id is null then state:='blocked';problem:='scope_unconfigured';remaining:=null;
  elsif binding.id is null then state:='blocked';problem:='customer_unbound';remaining:=null;
  elsif binding.kind<>customer.kind or binding.document is distinct from customer.document then
   state:='blocked';problem:='customer_changed';remaining:=null;
  end if;
 end if;
 return jsonb_build_object('mode','fixture','identityProof','fixture_declared','status',state,'reason',problem,
  'orderId',job.id,'phase',target_phase,'quoteId',accepted.quote_id,'contextHash',accepted.context_hash,
  'processId',job.process_id,'clientId',job.client_id,'ownerId',customer.owner_id,'orderStatus',job.status,
  'hasContract',customer.has_contract,'contractRevision',customer.contract_revision,
  'totalCents',case when accepted.total_cents<=9007199254740991 then accepted.total_cents else null end,
  'requiredCents',case when required<=9007199254740991 then required else null end,
  'creditedCents',case when target_phase='deposit' then signal else paid end,'totalCreditedCents',paid,'remainingCents',remaining,
  'binding',case when binding.id is null then null else jsonb_build_object('id',binding.id,'scopeId',scope.id,
   'clientId',binding.client_id,'customerId',binding.customer_id,'scope',jsonb_strip_nulls(jsonb_build_object(
    'provider',scope.provider,'environment',scope.environment,'accountId',scope.account_id,'walletId',scope.wallet_id))) end);
end;
$$;
revoke all on function private.payment_obligation_preview(uuid,text) from public,anon,authenticated,service_role;

create function public.get_payment_obligation(target_order uuid,target_phase text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); initial_owner uuid; customer public.clients%rowtype; result jsonb;
begin
 select c.owner_id into initial_owner from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order;
 perform p.id from public.profiles p where p.id in (actor,initial_owner) order by p.id for share;
 select c.* into customer from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order for share of c;
 if customer.owner_id is distinct from initial_owner then raise exception 'Pedido indisponível'; end if;
 perform o.id from public.orders o where o.id=target_order and o.client_id=customer.id for share;
 if not found then raise exception 'Pedido indisponível'; end if;
 actor:=private.authorize_payment_obligation(target_order);
 result:=private.payment_obligation_preview(target_order,target_phase);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'payment_obligation_viewed','order',target_order);
 return result;
end;
$$;
revoke all on function public.get_payment_obligation(uuid,text) from public,anon,service_role;
grant execute on function public.get_payment_obligation(uuid,text) to authenticated;

create function public.prepare_payment_obligation(target_order uuid,target_phase text,expected_context text,
 expected_remaining_cents bigint,billing_type text,due_date date,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); initial_owner uuid; customer public.clients%rowtype;
 receipt private.payment_obligation_contexts%rowtype; preview jsonb;
begin
 if actor is null or request_id is null or expected_context is null or expected_context !~ '^[0-9a-f]{64}$'
  or expected_remaining_cents is null or expected_remaining_cents not between 1 and 9007199254740991
  or target_phase is null or target_phase not in ('deposit','balance')
  or billing_type is null or billing_type not in ('PIX','BOLETO','CREDIT_CARD','UNDEFINED')
  or due_date is null or not isfinite(due_date) or due_date not between date '1900-01-01' and date '9999-12-31'
  then raise exception 'Confira os dados da obrigação'; end if;
 select c.owner_id into initial_owner from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order;
 perform p.id from public.profiles p where p.id in (actor,initial_owner) order by p.id for share;
 actor:=private.authorize_payment_obligation(target_order);
 select c.* into customer from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order for update of c;
 if customer.owner_id is distinct from initial_owner then raise exception 'Pedido indisponível'; end if;
 perform o.id from public.orders o where o.id=target_order and o.client_id=customer.id for update;
 if not found then raise exception 'Pedido indisponível'; end if;
 perform p.id from public.payments p where p.order_id=target_order order by p.id for update;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-obligation:'||request_id::text,0));
 select * into receipt from private.payment_obligation_contexts where id=request_id;
 if receipt.id is not null then
  if (receipt.order_id,receipt.actor_id,receipt.phase,receipt.context_hash,receipt.remaining_cents,receipt.billing_type,receipt.due_date)
   is distinct from (target_order,actor,target_phase,expected_context,expected_remaining_cents,billing_type,due_date)
   then raise sqlstate 'PT409' using message='Tentativa já registrada com outros dados'; end if;
  return jsonb_build_object('id',receipt.id,'createdBy',receipt.actor_id,'createdAt',receipt.created_at,'snapshot',receipt.snapshot);
 end if;
 perform cfg.singleton from private.payment_provider_configuration cfg where cfg.singleton for share;
 preview:=private.payment_obligation_preview(target_order,target_phase);
 if preview->>'status'<>'ready' then raise sqlstate 'PT409' using message='Obrigação indisponível para preparo'; end if;
 if preview->>'contextHash'<>expected_context or (preview->>'remainingCents')::bigint<>expected_remaining_cents
  then raise sqlstate 'PT409' using message='A obrigação mudou em outra sessão'; end if;
 insert into private.payment_obligation_contexts(id,order_id,quote_id,client_id,binding_id,actor_id,phase,context_hash,
  remaining_cents,billing_type,due_date,snapshot)
 values(request_id,target_order,(preview->>'quoteId')::uuid,customer.id,(preview->'binding'->>'id')::uuid,actor,
  target_phase,expected_context,expected_remaining_cents,billing_type,due_date,preview||jsonb_build_object('billingType',billing_type,'dueDate',due_date))
 returning * into receipt;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'payment_obligation_prepared','payment_obligation',receipt.id);
 return jsonb_build_object('id',receipt.id,'createdBy',receipt.actor_id,'createdAt',receipt.created_at,'snapshot',receipt.snapshot);
end;
$$;
revoke all on function public.prepare_payment_obligation(uuid,text,text,bigint,text,date,uuid) from public,anon,service_role;
grant execute on function public.prepare_payment_obligation(uuid,text,text,bigint,text,date,uuid) to authenticated;
