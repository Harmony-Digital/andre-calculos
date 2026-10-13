-- Contrato e confirmação de arquivo usam W sob locks compartilhados com os writers financeiros.
-- Contextos/recibos e decisão comercial de dispensa permanecem inalterados.
create or replace function public.set_client_contract(target_client uuid,has_contract boolean,reason text,expected_revision integer,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); initial_owner uuid; customer public.clients%rowtype;
 receipt private.client_contract_changes%rowtype; job public.orders%rowtype; accepted record;
 next_status text; paid numeric; projection jsonb; effects jsonb:='[]'::jsonb; actor_name text; normalized_reason text; recipient uuid;
begin
 if actor is null or target_client is null or request_id is null or has_contract is null or reason is null
  or expected_revision is null or expected_revision not between 0 and 2147483646 then raise exception 'Confira a condição e o motivo'; end if;
 normalized_reason:=private.trim_client_contract_reason(reason);
 if length(normalized_reason) not between 3 and 1000 then raise exception 'Informe o motivo da alteração'; end if;
 select owner_id into initial_owner from public.clients where id=target_client;
 -- Ordem compartilhada com edição do perfil: nunca trancar o perfil do dono
 -- depois do cliente. Também impede transferência de identidade no meio.
 select profile_id into recipient from private.calculator_notification_recipient where singleton for share;
 perform p.id from public.profiles p where p.id in (actor,initial_owner,recipient) order by p.id for share;
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
 -- Ordem comum com Y/manual; os arquivos só serão consultados depois das fontes.
 for job in select o.* from public.orders o where o.client_id=customer.id order by o.id loop
  perform private.lock_order_financial_sources(job.id);
 end loop;
 -- Inclui pedidos concluídos e reservas de contas anteriores, sem resolver provedor.
 if exists(select 1 from private.payment_intent_reservations r join public.orders o on o.id=r.order_id where o.client_id=customer.id) then
  raise sqlstate 'PT423' using message='Há uma cobrança pendente de resolução para este cliente'; end if;
 if not has_contract and private.client_contract_in_use(customer.id) then raise sqlstate 'PT409' using message='Há pedidos em andamento com esta condição'; end if;
 update public.clients c set has_contract=set_client_contract.has_contract,contract_revision=c.contract_revision+1 where c.id=customer.id;
 for job in select o.* from public.orders o where o.client_id=customer.id and o.status in ('awaiting_payment','awaiting_documents') order by o.id loop
  select * into accepted from private.accepted_order_deposit(job.id);
  if not found then continue; end if;
  if has_contract then
   next_status:=private.queue_after_deposit_or_contract(job.id,actor);
  else
   projection:=private.order_payment_credit(job.id);
   paid:=(projection->>'depositCreditCents')::numeric;
   if accepted.required_cents<=0 or projection->'unsafeAmount' is distinct from 'false'::jsonb
    or projection->'depositUncertain' is distinct from 'false'::jsonb or paid is null or paid<accepted.required_cents then
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

create or replace function public.complete_file_system(target_file uuid,actor uuid,observed_hash text,observed_size bigint)
returns void language plpgsql security definer set search_path='' as $$
declare initial public.files%rowtype; f public.files%rowtype; customer public.clients%rowtype; job public.orders%rowtype; initial_owner uuid; recipient uuid;
begin
 if actor is null or target_file is null then raise exception 'Acesso não autorizado'; end if;
 select * into initial from public.files where id=target_file;
 if initial.id is null or initial.uploaded_by is distinct from actor then raise exception 'Acesso não autorizado'; end if;
 select c.owner_id into initial_owner from public.clients c join public.processes p on p.client_id=c.id where p.id=initial.process_id;
 select profile_id into recipient from private.calculator_notification_recipient where singleton for share;
 -- Mesma ordem profiles/client/order/payments/fontes/file de Y. A preleitura
 -- é revalidada depois dos locks; não transfere identidade ou contexto de arquivo.
 perform id from public.profiles where id in(actor,initial_owner,recipient) order by id for share;
 if not exists(select 1 from public.profiles where id=actor and role in('client','calculator'))
  or not exists(select 1 from public.profiles where id=initial_owner and role='client') then raise exception 'Acesso não autorizado'; end if;
 select c.* into customer from public.clients c join public.processes p on p.client_id=c.id where p.id=initial.process_id for update of c;
 if customer.id is null or customer.owner_id is distinct from initial_owner
  or (customer.owner_id is distinct from actor and not exists(select 1 from public.profiles where id=actor and role='calculator')) then raise exception 'Acesso não autorizado'; end if;
 perform o.id from public.orders o where o.process_id=initial.process_id and o.client_id=customer.id
  and (initial.order_id is null or o.id=initial.order_id) order by o.id for update;
 for job in select o.* from public.orders o where o.process_id=initial.process_id and o.client_id=customer.id
  and (initial.order_id is null or o.id=initial.order_id) order by o.id loop
  perform p.id from public.payments p where p.order_id=job.id order by p.id for update;
 end loop;
 for job in select o.* from public.orders o where o.process_id=initial.process_id and o.client_id=customer.id
  and (initial.order_id is null or o.id=initial.order_id) order by o.id loop
  perform private.lock_order_financial_sources(job.id);
 end loop;
 select * into f from public.files where id=target_file for update;
 if f.id is null or (f.process_id,f.order_id,f.uploaded_by,f.expected_sha256,f.size_bytes,f.path) is distinct from (initial.process_id,initial.order_id,actor,initial.expected_sha256,initial.size_bytes,initial.path)
 or not exists(select 1 from public.processes p where p.id=f.process_id and p.client_id=customer.id) then raise exception 'Arquivo atualizado em outra sessão'; end if;
 if observed_hash is null or observed_hash !~ '^[0-9a-f]{64}$' or observed_size is null or observed_size<=0 or f.expected_sha256 is null
 or f.expected_sha256 is distinct from observed_hash or f.size_bytes is distinct from observed_size then raise exception 'Integridade não conferida'; end if;
 if f.upload_status='uploaded' and f.sha256=observed_hash then return; end if;
 if f.upload_status is distinct from 'pending' then raise exception 'Integridade não conferida'; end if;
 update public.files set upload_status='uploaded',sha256=observed_hash where id=f.id;
 perform private.record_event(f.process_id,'file_uploaded',jsonb_build_object('file_id',f.id),actor,f.order_id);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'upload_verified','file',f.id);
 if f.folder in ('case','client') then
  for job in select o.* from public.orders o where o.process_id=f.process_id and o.client_id=customer.id
   and o.status in ('awaiting_payment','awaiting_documents') and (f.order_id is null or o.id=f.order_id) order by o.id loop
   perform private.queue_after_deposit_or_contract(job.id,actor);
  end loop;
 end if;
end;
$$;
