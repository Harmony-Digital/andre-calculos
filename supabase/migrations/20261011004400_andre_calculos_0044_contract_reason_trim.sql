-- Mesmo trim do formulário: espaços Unicode, tabs e quebras não formam motivo.
create function private.trim_client_contract_reason(value text) returns text
language sql immutable strict set search_path='' as $$
 select btrim(value,U&'\0020\0009\000a\000d\000c\000b\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff')
$$;
revoke all on function private.trim_client_contract_reason(text) from public,anon,authenticated,service_role;
alter table private.client_contract_changes add constraint client_contract_reason_trimmed check(reason=private.trim_client_contract_reason(reason));

create or replace function public.set_client_contract(target_client uuid,has_contract boolean,reason text,expected_revision integer,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); initial_owner uuid; customer public.clients%rowtype;
 receipt private.client_contract_changes%rowtype; job public.orders%rowtype; accepted record;
 next_status text; paid numeric; effects jsonb:='[]'::jsonb; actor_name text; normalized_reason text;
begin
 if actor is null or target_client is null or request_id is null or has_contract is null or reason is null
  or expected_revision is null or expected_revision not between 0 and 2147483646 then raise exception 'Confira a condição e o motivo'; end if;
 normalized_reason:=private.trim_client_contract_reason(reason);
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
