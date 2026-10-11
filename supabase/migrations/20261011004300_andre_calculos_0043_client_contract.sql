-- Condição comercial do cliente: decisão explícita, revisão e recibo privado.
alter table public.clients add column contract_revision integer not null default 0 check(contract_revision>=0);
create table private.client_contract_changes (
 id uuid primary key,client_id uuid not null references public.clients(id),
 actor_id uuid not null references public.profiles(id),actor_name text not null,
 has_contract boolean not null,prior_has_contract boolean not null,
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 expected_revision integer not null check(expected_revision>=0),
 applied_revision integer not null check(applied_revision=expected_revision+1),
 changed_at timestamptz not null,effects jsonb not null check(jsonb_typeof(effects)='array')
);
create index client_contract_changes_client_idx on private.client_contract_changes(client_id,applied_revision desc);
create unique index client_contract_changes_revision_idx on private.client_contract_changes(client_id,applied_revision);
create index client_contract_changes_actor_idx on private.client_contract_changes(actor_id);
alter table private.client_contract_changes enable row level security;
revoke all on private.client_contract_changes from public,anon,authenticated,service_role;
create trigger client_contract_change_immutable before update on private.client_contract_changes
 for each row execute function private.preserve_quote_contract_record();

-- Nem o cliente, nem uma escrita administrativa via API modifica a condição.
-- Funções autorizadas e preparação administrativa pelo dono do banco conservam
-- seu alcance; fixtures usam somente PostgreSQL local, sem permissões especiais.
revoke insert,update on public.clients from service_role;
grant insert(id,owner_id,kind,document,legal_name,created_at,updated_at,deletion_requested_at),
 update(owner_id,kind,document,legal_name,created_at,updated_at,deletion_requested_at) on public.clients to service_role;

create function private.client_contract_in_use(target_client uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.orders where client_id=target_client and status in
 ('queued','in_analysis','awaiting_client','in_calculation','in_review','in_adjustment','delivered'))
$$;
revoke all on function private.client_contract_in_use(uuid) from public,anon,authenticated,service_role;
create function private.client_contract_result(receipt private.client_contract_changes) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',receipt.id,'clientId',receipt.client_id,'hasContract',receipt.has_contract,
  'priorHasContract',receipt.prior_has_contract,'reason',receipt.reason,'revision',receipt.applied_revision,
  'changedAt',receipt.changed_at,'changedBy',receipt.actor_id,'changedName',receipt.actor_name,
  'effects',receipt.effects)
$$;
revoke all on function private.client_contract_result(private.client_contract_changes) from public,anon,authenticated,service_role;

create function public.set_client_contract(target_client uuid,has_contract boolean,reason text,expected_revision integer,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); initial_owner uuid; customer public.clients%rowtype;
 receipt private.client_contract_changes%rowtype; job public.orders%rowtype; accepted record;
 next_status text; paid numeric; effects jsonb:='[]'::jsonb; actor_name text; normalized_reason text;
begin
 if actor is null or target_client is null or request_id is null or has_contract is null or reason is null
  or expected_revision is null or expected_revision not between 0 and 2147483646 then raise exception 'Confira a condição e o motivo'; end if;
 normalized_reason:=btrim(reason);
 if length(normalized_reason) not between 3 and 1000 then raise exception 'Informe o motivo da alteração'; end if;
 select owner_id into initial_owner from public.clients where id=target_client;
 -- Ordem compartilhada com edição do perfil: nunca trancar o perfil do dono
 -- depois do cliente. Também impede transferência de identidade no meio.
 perform p.id from public.profiles p where p.id in (actor,initial_owner) order by p.id for share;
 select full_name into actor_name from public.profiles where id=actor and role='calculator';
 if not found or not exists(select 1 from public.profiles where id=initial_owner and role='client') then raise exception 'Acesso não autorizado'; end if;
 select * into customer from public.clients where id=target_client for update;
 if customer.id is null or customer.owner_id is distinct from initial_owner then raise exception 'Cliente indisponível'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client-contract:'||request_id::text,0));
 select * into receipt from private.client_contract_changes r where r.id=request_id;
 if receipt.id is not null then
  if (receipt.client_id,receipt.actor_id,receipt.has_contract,receipt.reason,receipt.expected_revision)
   is distinct from (target_client,actor,has_contract,normalized_reason,expected_revision) then
   raise sqlstate 'PT409' using message='Tentativa já registrada com outros dados'; end if;
  return private.client_contract_result(receipt);
 end if;
 if customer.contract_revision<>expected_revision then raise sqlstate 'PT409' using message='A condição mudou em outra sessão'; end if;
 if customer.has_contract=has_contract then raise sqlstate 'PT409' using message='Esta condição já está cadastrada'; end if;
 perform o.id from public.orders o where o.client_id=customer.id order by o.id for update;
 perform p.id from public.payments p join public.orders o on o.id=p.order_id where o.client_id=customer.id order by p.order_id,p.id for update of p;
 if not has_contract and private.client_contract_in_use(customer.id) then raise sqlstate 'PT409' using message='Há pedidos em andamento com esta condição'; end if;
 update public.clients c set has_contract=set_client_contract.has_contract,contract_revision=c.contract_revision+1 where c.id=customer.id;
 for job in select o.* from public.orders o where o.client_id=customer.id and o.status in ('awaiting_payment','awaiting_documents') order by o.id loop
  select * into accepted from private.accepted_order_deposit(job.id);
  if not found then continue; end if;
  if has_contract then
   next_status:=private.queue_after_deposit_or_contract(job.id,actor);
  else
   select coalesce(sum(p.amount_cents),0) into paid from public.payments p where p.order_id=job.id and p.kind='deposit' and p.status='confirmed';
   if accepted.required_cents<=0 or paid<accepted.required_cents then
    next_status:='awaiting_payment';
    if job.status<>next_status then
     update public.orders set status=next_status where id=job.id;
     perform private.record_event(job.process_id,'status_changed',jsonb_build_object('from',job.status,'to',next_status,'code',job.code),actor,job.id);
    end if;
   else
    next_status:=private.queue_after_deposit_or_contract(job.id,actor);
   end if;
  end if;
  if next_status<>job.status then effects:=effects||jsonb_build_array(jsonb_build_object('orderId',job.id,'processId',job.process_id,'from',job.status,'to',next_status)); end if;
 end loop;
 insert into private.client_contract_changes(id,client_id,actor_id,actor_name,has_contract,prior_has_contract,reason,expected_revision,applied_revision,changed_at,effects)
  values(request_id,customer.id,actor,actor_name,has_contract,customer.has_contract,normalized_reason,expected_revision,expected_revision+1,clock_timestamp(),effects) returning * into receipt;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'client_contract_changed','client_contract_change',request_id);
 return private.client_contract_result(receipt);
end;
$$;
revoke all on function public.set_client_contract(uuid,boolean,text,integer,uuid) from public,anon,service_role;
grant execute on function public.set_client_contract(uuid,boolean,text,integer,uuid) to authenticated;

-- Somente o calculista lê o motivo, limitado à página de clientes solicitada.
create function public.get_client_contract_context(target_clients uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare customer public.clients%rowtype; receipt private.client_contract_changes%rowtype; result jsonb:='[]'::jsonb;
begin
 if auth.uid() is null or public.is_calculator() is not true then raise exception 'Acesso não autorizado'; end if;
 if target_clients is null or cardinality(target_clients)>50 or array_position(target_clients,null) is not null then raise exception 'Seleção de clientes inválida'; end if;
 for customer in select c.* from public.clients c join public.profiles p on p.id=c.owner_id and p.role='client' where c.id=any(target_clients) order by c.id loop
  select * into receipt from private.client_contract_changes r where r.client_id=customer.id order by r.applied_revision desc limit 1;
  result:=result||jsonb_build_array(jsonb_build_object('clientId',customer.id,'hasContract',customer.has_contract,'revision',customer.contract_revision,
   'canRemove',not private.client_contract_in_use(customer.id),'receipt',case when receipt.id is null then null else private.client_contract_result(receipt)-'effects' end));
 end loop;
 return result;
end;
$$;
revoke all on function public.get_client_contract_context(uuid[]) from public,anon,service_role;
grant execute on function public.get_client_contract_context(uuid[]) to authenticated;
