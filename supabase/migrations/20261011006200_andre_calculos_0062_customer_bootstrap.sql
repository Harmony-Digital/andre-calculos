-- Bootstrap exclusivamente fictício. Solicitação humana e worker separados.
create table private.payment_customer_work (
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references private.payment_provider_scopes(id),
 client_id uuid not null references public.clients(id), owner_id uuid not null references public.profiles(id),
 kind text not null check(kind in('person','company')), document text not null, name text not null,
 initial_binding_id uuid, initial_customer_id text,
 state text not null default 'pending' check(state in('pending','ready_to_create','held','bound')),
 reason text, revision bigint not null default 0 check(revision between 0 and 9007199254740991),
 create_claimed boolean not null default false, current_step uuid,
 created_at timestamptz not null default clock_timestamp(), unique(scope_id,client_id),
 check((initial_binding_id is null)=(initial_customer_id is null)),
 check((kind='person' and private.valid_signup_cpf(document)) or(kind='company' and private.valid_signup_cnpj(document))),
 check(name=trim(name) and length(name) between 3 and 200)
);
create index payment_customer_work_client_idx on private.payment_customer_work(client_id);
create index payment_customer_work_owner_idx on private.payment_customer_work(owner_id);
create table private.payment_customer_requests (
 id uuid primary key, work_id uuid not null references private.payment_customer_work(id),
 client_id uuid not null references public.clients(id), actor_id uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp()
);
create index payment_customer_requests_work_idx on private.payment_customer_requests(work_id);
create index payment_customer_requests_client_idx on private.payment_customer_requests(client_id);
create index payment_customer_requests_actor_idx on private.payment_customer_requests(actor_id);
create table private.payment_customer_steps (
 id uuid primary key default gen_random_uuid(), work_id uuid not null references private.payment_customer_work(id),
 request_id uuid not null references private.payment_customer_requests(id), worker_id uuid not null,
 action text not null check(action in('find','get','create')), customer_id text,
 revision bigint not null, started boolean not null default false, result jsonb,
 created_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
 check((action='get')=(customer_id is not null)), check((result is null)=(finished_at is null)),
 check(result is null or jsonb_typeof(result)='object')
);
create index payment_customer_steps_work_idx on private.payment_customer_steps(work_id);
create index payment_customer_steps_request_idx on private.payment_customer_steps(request_id);
alter table private.payment_customer_work add foreign key(current_step) references private.payment_customer_steps(id);
create index payment_customer_work_step_idx on private.payment_customer_work(current_step);
alter table private.payment_customer_work enable row level security;
alter table private.payment_customer_requests enable row level security;
alter table private.payment_customer_steps enable row level security;
revoke all on private.payment_customer_work,private.payment_customer_requests,private.payment_customer_steps from public,anon,authenticated,service_role;
create trigger payment_customer_request_immutable before update on private.payment_customer_requests
 for each row execute function private.preserve_quote_contract_record();
create function private.preserve_customer_work() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.scope_id,new.client_id,new.owner_id,new.kind,new.document,new.name,new.initial_binding_id,new.initial_customer_id,new.created_at)
  is distinct from (old.id,old.scope_id,old.client_id,old.owner_id,old.kind,old.document,old.name,old.initial_binding_id,old.initial_customer_id,old.created_at)
  or (old.create_claimed and not new.create_claimed) or new.revision<old.revision then raise exception 'Operação imutável'; end if;
 return new;
end; $$;
create trigger payment_customer_work_preserve before update on private.payment_customer_work
 for each row execute function private.preserve_customer_work();
create function private.preserve_customer_step() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.work_id,new.request_id,new.worker_id,new.action,new.customer_id,new.revision,new.created_at)
  is distinct from (old.id,old.work_id,old.request_id,old.worker_id,old.action,old.customer_id,old.revision,old.created_at)
  or (old.started and not new.started) or (old.result is not null and (new.result,new.finished_at) is distinct from (old.result,old.finished_at))
  then raise exception 'Etapa imutável'; end if;
 return new;
end; $$;
create trigger payment_customer_step_preserve before update on private.payment_customer_steps
 for each row execute function private.preserve_customer_step();
revoke all on function private.preserve_customer_work(),private.preserve_customer_step() from public,anon,authenticated,service_role;

create function private.authorize_payment_customer(target_client uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner_id uuid; actor_role text;
begin
 select c.owner_id into owner_id from public.clients c where c.id=target_client;
 select p.role into actor_role from public.profiles p where p.id=actor;
 if actor is null or owner_id is null or actor_role is null or actor_role not in('client','calculator')
  or(actor_role='client' and actor<>owner_id)
  or not exists(select 1 from public.profiles p where p.id=owner_id and p.role='client') then raise exception 'Cliente indisponível'; end if;
 return actor;
end; $$;
create function private.payment_customer_view(target_request uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('mode','fixture','identityProof','fixture_declared','requestId',r.id,
 'clientId',r.client_id,'currentOwnerId',c.owner_id,'createdBy',r.actor_id,'createdAt',r.created_at,'revision',w.revision,
 'state',case when(c.owner_id,c.kind,c.document,c.legal_name) is distinct from(w.owner_id,w.kind,w.document,w.name)
  or not exists(select 1 from private.payment_provider_configuration cfg where cfg.singleton and cfg.scope_id=w.scope_id)
  then 'held' else w.state end,
 'reason',case when(c.owner_id,c.kind,c.document,c.legal_name) is distinct from(w.owner_id,w.kind,w.document,w.name)
  or not exists(select 1 from private.payment_provider_configuration cfg where cfg.singleton and cfg.scope_id=w.scope_id)
  then 'context_changed' else w.reason end)
 from private.payment_customer_requests r join private.payment_customer_work w on w.id=r.work_id
 join public.clients c on c.id=r.client_id where r.id=target_request;
$$;
revoke all on function private.authorize_payment_customer(uuid),private.payment_customer_view(uuid) from public,anon,authenticated,service_role;

create function public.request_payment_customer(target_client uuid,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner_id uuid; c public.clients%rowtype;
 configured_scope uuid; binding private.payment_provider_customers%rowtype;
 work private.payment_customer_work%rowtype; receipt private.payment_customer_requests%rowtype;
begin
 if actor is null or target_client is null or request_id is null then raise exception 'Confira os dados do cliente'; end if;
 select v.owner_id into owner_id from public.clients v where v.id=target_client;
 perform p.id from public.profiles p where p.id in(actor,owner_id) order by p.id for share;
 select * into c from public.clients v where v.id=target_client for update;
 if c.owner_id is distinct from owner_id then raise exception 'Cliente indisponível'; end if;
 actor:=private.authorize_payment_customer(target_client);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-customer-request:'||request_id::text,0));
 select * into receipt from private.payment_customer_requests r where r.id=request_id;
 if receipt.id is not null then
  if(receipt.client_id,receipt.actor_id) is distinct from(target_client,actor) then raise sqlstate 'PT409' using message='Tentativa já registrada com outros dados'; end if;
  return private.payment_customer_view(receipt.id);
 end if;
 select cfg.scope_id into configured_scope from private.payment_provider_configuration cfg where cfg.singleton for share;
 if configured_scope is null or not exists(select 1 from private.payment_provider_scopes s where s.id=configured_scope and s.mode='fixture' and s.environment='sandbox')
  or c.document is null or trim(c.legal_name)<>c.legal_name or length(c.legal_name) not between 3 and 200
  or not((c.kind='person' and private.valid_signup_cpf(c.document)) or(c.kind='company' and private.valid_signup_cnpj(c.document)))
  then raise sqlstate 'PT409' using message='Cliente indisponível para preparo'; end if;
 select * into binding from private.payment_provider_customers b where b.scope_id=configured_scope and b.client_id=target_client for share;
 insert into private.payment_customer_work(scope_id,client_id,owner_id,kind,document,name,initial_binding_id,initial_customer_id,create_claimed)
 values(configured_scope,target_client,c.owner_id,c.kind,c.document,c.legal_name,binding.id,binding.customer_id,
 exists(select 1 from private.payment_fixture_requests r where r.scope_id=configured_scope and r.client_id=target_client and r.operation='customer_create'))
 on conflict(scope_id,client_id) do nothing;
 select * into work from private.payment_customer_work w where w.scope_id=configured_scope and w.client_id=target_client for update;
 insert into private.payment_customer_requests(id,work_id,client_id,actor_id) values(request_id,work.id,target_client,actor);
 if work.state='bound' then
  update private.payment_customer_work w set state='pending',reason=null,current_step=null,revision=w.revision+1 where w.id=work.id;
 end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'payment_customer_requested','payment_customer_request',request_id);
 return private.payment_customer_view(request_id);
end; $$;
create function public.get_payment_customer_request(target_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); client_id uuid; owner_id uuid; locked_owner uuid;
begin
 select r.client_id,c.owner_id into client_id,owner_id from private.payment_customer_requests r join public.clients c on c.id=r.client_id where r.id=target_request;
 perform p.id from public.profiles p where p.id in(actor,owner_id) order by p.id for share;
 select c.owner_id into locked_owner from public.clients c where c.id=client_id for share;
 if client_id is null or locked_owner is distinct from owner_id then raise exception 'Cliente indisponível'; end if;
 actor:=private.authorize_payment_customer(client_id);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'payment_customer_viewed','payment_customer_request',target_request);
 return private.payment_customer_view(target_request);
end; $$;
revoke all on function public.request_payment_customer(uuid,uuid),public.get_payment_customer_request(uuid) from public,anon,service_role;
grant execute on function public.request_payment_customer(uuid,uuid),public.get_payment_customer_request(uuid) to authenticated;

create function private.lock_payment_customer_work(target_request uuid) returns private.payment_customer_work
language plpgsql security definer set search_path='' as $$
declare work private.payment_customer_work%rowtype; receipt private.payment_customer_requests%rowtype; owner_id uuid; locked_owner uuid;
begin
 select * into receipt from private.payment_customer_requests r where r.id=target_request;
 select * into work from private.payment_customer_work w where w.id=receipt.work_id;
 if work.id is null then raise exception 'Operação fictícia indisponível'; end if;
 perform private.require_payment_fixture_system(work.scope_id,work.client_id);
 select c.owner_id into owner_id from public.clients c where c.id=work.client_id;
 perform p.id from public.profiles p where p.id in(owner_id,work.owner_id,receipt.actor_id) order by p.id for share;
 select c.owner_id into locked_owner from public.clients c where c.id=work.client_id for update;
 if locked_owner is distinct from owner_id then raise sqlstate 'PT409' using message='Cliente mudou em outra sessão'; end if;
 perform cfg.singleton from private.payment_provider_configuration cfg where cfg.singleton for share;
 perform b.id from private.payment_provider_customers b where b.scope_id=work.scope_id and b.client_id=work.client_id for share;
 select * into work from private.payment_customer_work w where w.id=work.id for update;
 return work;
end; $$;
create function private.customer_work_current(work private.payment_customer_work,request_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.clients c join public.profiles p on p.id=c.owner_id
 join private.payment_provider_configuration cfg on cfg.singleton and cfg.scope_id=(work).scope_id
 join private.payment_customer_requests r on r.id=request_id
 join public.profiles a on a.id=r.actor_id
 where c.id=(work).client_id and(c.owner_id,c.kind,c.document,c.legal_name)=((work).owner_id,(work).kind,(work).document,(work).name)
 and p.role='client' and(a.role='calculator' or(a.role='client' and a.id=c.owner_id)));
$$;
revoke all on function private.lock_payment_customer_work(uuid),private.customer_work_current(private.payment_customer_work,uuid) from public,anon,authenticated,service_role;

create function public.claim_payment_customer_step(target_request uuid,worker_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare work private.payment_customer_work%rowtype; binding private.payment_provider_customers%rowtype;
 step private.payment_customer_steps%rowtype; action text; customer_id text; scope jsonb;
begin
 if worker_id is null then raise exception 'Operação fictícia indisponível'; end if;
 work:=private.lock_payment_customer_work(target_request);
 scope:=private.require_payment_fixture_system(work.scope_id,work.client_id);
 if not work.create_claimed and exists(select 1 from private.payment_fixture_requests r where r.scope_id=work.scope_id and r.client_id=work.client_id and r.operation='customer_create') then
  update private.payment_customer_work w set create_claimed=true,state='held',reason='indeterminate' where w.id=work.id returning * into work;
 end if;
 if not work.create_claimed and not private.customer_work_current(work,target_request) then
  update private.payment_customer_work w set state='held',reason='context_changed',current_step=null,revision=w.revision+1 where w.id=work.id;
  return jsonb_build_object('view',private.payment_customer_view(target_request),'step',null);
 end if;
 select * into binding from private.payment_provider_customers b where b.scope_id=work.scope_id and b.client_id=work.client_id;
 customer_id:=coalesce(work.initial_customer_id,binding.customer_id);
 if customer_id is not null then action:='get';
 elsif work.state='ready_to_create' and not work.create_claimed then action:='create';
 else action:='find'; end if;
 insert into private.payment_customer_steps(work_id,request_id,worker_id,action,customer_id,revision)
 values(work.id,target_request,worker_id,action,case when action='get' then customer_id else null end,work.revision+1) returning * into step;
 update private.payment_customer_work w set state='pending',reason=null,current_step=step.id,revision=step.revision where w.id=work.id;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_customer_step_claimed','payment_customer_step',step.id);
 return jsonb_build_object('view',private.payment_customer_view(target_request),'step',jsonb_build_object(
  'id',step.id,'workerId',step.worker_id,'requestId',target_request,'action',step.action,'scopeId',work.scope_id,
  'clientId',work.client_id,'scope',scope,'kind',work.kind,'document',work.document,'name',work.name,'customerId',step.customer_id));
end; $$;
create function public.start_payment_customer_step(target_step uuid,worker_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare step private.payment_customer_steps%rowtype; work private.payment_customer_work%rowtype;
begin
 select * into step from private.payment_customer_steps s where s.id=target_step;
 work:=private.lock_payment_customer_work(step.request_id);
 select * into step from private.payment_customer_steps s where s.id=target_step for update;
 if step.worker_id is distinct from worker_id or step.started or step.result is not null
  or work.current_step is distinct from step.id or work.revision<>step.revision then return false; end if;
 if step.action='create' and(work.create_claimed or not private.customer_work_current(work,step.request_id)
  or exists(select 1 from private.payment_provider_customers b where b.scope_id=work.scope_id and b.client_id=work.client_id)
  or exists(select 1 from private.payment_fixture_requests r where r.scope_id=work.scope_id and r.client_id=work.client_id and r.operation='customer_create')) then
  update private.payment_customer_work w set state='held',reason='context_changed' where w.id=work.id;
  return false;
 end if;
 if step.action='create' then update private.payment_customer_work w set create_claimed=true where w.id=work.id; end if;
 update private.payment_customer_steps s set started=true where s.id=step.id;
 return true;
end; $$;

create function public.finish_payment_customer_step(target_step uuid,worker_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare step private.payment_customer_steps%rowtype; work private.payment_customer_work%rowtype;
 transport private.payment_fixture_requests%rowtype; binding private.payment_provider_customers%rowtype;
 body jsonb; candidate jsonb; kind text:='reconcile'; observed_reason text:='unavailable'; observed_id text;
begin
 select * into step from private.payment_customer_steps s where s.id=target_step;
 work:=private.lock_payment_customer_work(step.request_id);
 select * into step from private.payment_customer_steps s where s.id=target_step for update;
 if step.worker_id is distinct from worker_id or not step.started then raise exception 'Etapa fictícia indisponível'; end if;
 if step.result is not null then return private.payment_customer_view(step.request_id); end if;
 select * into transport from private.payment_fixture_requests r where r.slot_id=step.id and r.scope_id=work.scope_id
  and r.client_id=work.client_id and r.operation=case step.action when 'create' then 'customer_create' when 'get' then 'customer_get' else 'customer_find' end;
 -- Somente o recibo imutável do transporte prova a observação. Sem resultado livre de usuário/worker.
 if transport.outcome->'scope' is distinct from private.require_payment_fixture_system(work.scope_id,work.client_id)
  or (step.action='find' and transport.payload<>jsonb_build_object('reference',work.client_id::text,'document',work.document))
  or(step.action='get' and transport.payload<>jsonb_build_object('customerId',step.customer_id))
  or(step.action='create' and transport.payload<>jsonb_build_object('name',work.name,'document',work.document,'reference',work.client_id::text,'notificationDisabled',true)) then
  transport.outcome:=null;
 end if;
 if transport.outcome->>'kind'='response' and transport.outcome->'status'='200'::jsonb then
  begin body:=(transport.outcome->>'bodyText')::jsonb; exception when others then body:=null; end;
  if step.action='find' then
   if jsonb_typeof(body->'data')='array' and body->'hasMore'='false'::jsonb
    and body->'totalCount'=to_jsonb(jsonb_array_length(body->'data')) then
    if jsonb_array_length(body->'data')=0 then kind:='zero';observed_reason:='not_located';
    elsif jsonb_array_length(body->'data')=1 then candidate:=body->'data'->0;
    else observed_reason:='multiple_candidates'; end if;
   elsif body->'hasMore'='true'::jsonb then observed_reason:='incomplete_list'; end if;
  else candidate:=body; end if;
  if jsonb_typeof(candidate)='object' and jsonb_typeof(candidate->'id')='string' and candidate->>'id' ~ '^[A-Za-z0-9_-]{1,100}$'
   and candidate->'cpfCnpj'=to_jsonb(work.document) and candidate->'externalReference'=to_jsonb(work.client_id::text)
   and candidate->'notificationDisabled'='true'::jsonb
   and(step.action<>'get' or candidate->>'id'=step.customer_id) then
   kind:='observed';observed_reason:=null;observed_id:=candidate->>'id';
  end if;
 elsif transport.outcome->>'kind'='not_dispatched' then observed_reason:='not_dispatched';
 elsif transport.outcome->>'kind'='indeterminate' then observed_reason:='indeterminate'; end if;
 update private.payment_customer_steps s set result=jsonb_strip_nulls(jsonb_build_object('kind',kind,'reason',observed_reason,'customerId',observed_id)),
  finished_at=clock_timestamp() where s.id=step.id;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_customer_step_finished','payment_customer_step',step.id);
 if work.current_step is distinct from step.id or work.revision<>step.revision then return private.payment_customer_view(step.request_id); end if;
 if not private.customer_work_current(work,step.request_id) then kind:='reconcile';observed_reason:='context_changed'; end if;
 if kind='observed' then
  select * into binding from private.payment_provider_customers b where b.scope_id=work.scope_id and b.client_id=work.client_id;
  if(binding.id is not null and(binding.customer_id,binding.kind,binding.document) is distinct from(observed_id,work.kind,work.document))
   or(work.initial_binding_id is not null and binding.id is distinct from work.initial_binding_id)
   or exists(select 1 from private.payment_provider_customers b where b.scope_id=work.scope_id and b.customer_id=observed_id and b.client_id<>work.client_id) then
   kind:='reconcile';observed_reason:='binding_changed';
  else
   if binding.id is null then
    insert into private.payment_provider_customers(id,scope_id,client_id,customer_id,kind,document)
    values(gen_random_uuid(),work.scope_id,work.client_id,observed_id,work.kind,work.document);
   end if;
   update private.payment_customer_work w set state='bound',reason=null where w.id=work.id;
   insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_customer_bound','payment_customer_request',step.request_id);
  end if;
 end if;
 if kind='zero' and not work.create_claimed and work.initial_binding_id is null
  and not exists(select 1 from private.payment_fixture_requests r where r.scope_id=work.scope_id and r.client_id=work.client_id and r.operation='customer_create') then
  update private.payment_customer_work w set state='ready_to_create',reason=null where w.id=work.id;
 elsif kind<>'observed' then update private.payment_customer_work w set state='held',reason=observed_reason where w.id=work.id; end if;
 return private.payment_customer_view(step.request_id);
end; $$;
revoke all on function public.claim_payment_customer_step(uuid,uuid),public.start_payment_customer_step(uuid,uuid),public.finish_payment_customer_step(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_payment_customer_step(uuid,uuid),public.start_payment_customer_step(uuid,uuid),public.finish_payment_customer_step(uuid,uuid) to service_role;
