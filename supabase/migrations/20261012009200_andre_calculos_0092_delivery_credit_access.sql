-- Certeza da fase exigida; a projeção é atual, não um recibo de pagamento.
create function private.delivery_credit_access(order_status text,release_policy text,credit jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare p jsonb; key text; value numeric; required numeric; price numeric; deposit numeric; total numeric;
begin
 if jsonb_typeof(credit) is distinct from 'object' or credit->>'semantics' is distinct from 'current_order_credit'
  or credit->'schemaVersion' is distinct from '1'::jsonb or jsonb_typeof(credit->'projection') is distinct from 'object' then return 'financial_pending'; end if;
 p:=credit->'projection';
 if p->>'semantics' is distinct from 'credit_projection' or p->'schemaVersion' is distinct from '1'::jsonb
  or p->>'effects' is distinct from 'none' or p->>'orderId' is null or p->>'orderId' is distinct from credit->>'orderId'
  or credit->'hasContract' not in ('true'::jsonb,'false'::jsonb)
  or p->'depositUncertain' not in ('true'::jsonb,'false'::jsonb) or p->'uncertain' not in ('true'::jsonb,'false'::jsonb)
  or credit->'hasContract' is null or p->'depositUncertain' is null or p->'uncertain' is null then return 'financial_pending'; end if;
 foreach key in array array['requiredDepositCents','totalCents','depositCreditCents','totalCreditCents'] loop
  if p->key is null then return 'financial_pending'; end if;
  if p->key<>'null'::jsonb then
   if jsonb_typeof(p->key)<>'number' then return 'financial_pending'; end if;
   value:=(p->>key)::numeric;
   if value<0 or value>9007199254740991 or floor(value)<>value then return 'financial_pending'; end if;
  end if;
 end loop;
 required:=(p->>'requiredDepositCents')::numeric;price:=(p->>'totalCents')::numeric;
 deposit:=(p->>'depositCreditCents')::numeric;total:=(p->>'totalCreditCents')::numeric;
 if (p->'depositUncertain'='true'::jsonb and (deposit is not null or p->'uncertain'<>'true'::jsonb))
  or (p->'depositUncertain'='false'::jsonb and deposit is null)
  or (p->'uncertain'='true'::jsonb and total is not null) or (p->'uncertain'='false'::jsonb and total is null)
  or (deposit is not null and total is not null and deposit>total) then return 'financial_pending'; end if;
 if order_status is null or order_status not in('delivered','completed') then return 'review_pending'; end if;
 if release_policy is null then return 'policy_pending'; end if;
 if release_policy not in('before_balance','after_balance') or p->'unsafeAmount' is distinct from 'false'::jsonb
  or required is null or price is null or required>price then return 'financial_pending'; end if;
 if release_policy='before_balance' then
  if credit->'hasContract'='true'::jsonb then return 'ready'; end if;
  if p->'depositUncertain'='true'::jsonb then return 'financial_pending'; end if;
  return case when deposit>=required then 'ready' else 'deposit_pending' end;
 end if;
 if p->'uncertain'='true'::jsonb then return 'financial_pending'; end if;
 return case when total>=price then 'ready' else 'balance_pending' end;
end; $$;
revoke all on function private.delivery_credit_access(text,text,jsonb) from public,anon,authenticated,service_role;

create function private.current_delivery_access(target_delivery uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion',1,'semantics','current_delivery_access','effects','none',
  'deliveryId',d.id,'orderId',d.order_id,'processId',d.process_id,'orderStatus',o.status,'releasePolicy',r.policy,
  'credit',private.current_order_credit(o.id))
 from public.deliveries d join public.orders o on o.id=d.order_id and o.process_id=d.process_id
 left join public.delivery_releases r on r.delivery_id=d.id where d.id=target_delivery;
$$;
revoke all on function private.current_delivery_access(uuid) from public,anon,authenticated,service_role;

create function public.get_current_delivery_access_contexts(target_process uuid,target_deliveries uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in('client','calculator'))
  or private.can_read_process(target_process) is not true then raise exception 'Acesso não autorizado'; end if;
 if target_deliveries is null or cardinality(target_deliveries)>50 or coalesce(array_ndims(target_deliveries),1)<>1
  or array_position(target_deliveries,null) is not null
  or cardinality(target_deliveries)<>(select count(distinct id) from unnest(target_deliveries) id) then raise exception 'Entregas inválidas'; end if;
 if exists(select 1 from unnest(target_deliveries) requested(delivery_id) left join public.deliveries d on d.id=requested.delivery_id and d.process_id=target_process where d.id is null)
  then raise exception 'Entrega indisponível'; end if;
 select coalesce(jsonb_agg(private.current_delivery_access(d.id) order by d.id),'[]'::jsonb) into result
 from public.deliveries d where d.id=any(target_deliveries) and d.process_id=target_process;
 return result;
end; $$;
revoke all on function public.get_current_delivery_access_contexts(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.get_current_delivery_access_contexts(uuid,uuid[]) to authenticated;

create or replace function private.can_read_delivery_file(target_file uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.files f where f.id=target_file and f.folder='deliverables' and private.can_read_process(f.process_id)
   and (public.is_calculator() or (f.upload_status='uploaded' and exists(
    select 1 from public.delivery_files df join public.deliveries d on d.id=df.delivery_id
     join public.orders o on o.id=d.order_id and o.process_id=d.process_id
     cross join lateral(select private.current_delivery_access(d.id) value) context
    where df.file_id=f.id and f.order_id=o.id and d.process_id=f.process_id
     and private.delivery_credit_access(context.value->>'orderStatus',context.value->>'releasePolicy',context.value->'credit')='ready'
   )))
 );
$$;
revoke all on function private.can_read_delivery_file(uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_delivery_file(uuid) to authenticated;

-- A autorização, o audit e os metadados devolvidos pertencem à mesma operação.
create function public.authorize_file_access(target_file uuid,access_kind text default 'file_download') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); before_file public.files%rowtype; f public.files%rowtype;
 client_id_before uuid; owner_before uuid; customer public.clients%rowtype; actor_role text;
begin
 if actor is null or target_file is null or access_kind is null or access_kind not in('file_download','file_view') then raise exception 'Acesso não autorizado'; end if;
 select * into before_file from public.files where id=target_file;
 if not found then raise exception 'Arquivo indisponível'; end if;
 select p.client_id,c.owner_id into client_id_before,owner_before from public.processes p join public.clients c on c.id=p.client_id where p.id=before_file.process_id;
 if client_id_before is null or owner_before is null then raise exception 'Arquivo indisponível'; end if;
 -- Mesma ordem de AG/execução: profiles, cliente, processo, pedido, pagamentos/fontes, arquivo.
 perform p.id from public.profiles p where p.id in(actor,owner_before) order by p.id for share;
 select * into customer from public.clients c where c.id=client_id_before for update;
 if customer.owner_id is distinct from owner_before then raise sqlstate 'PT409' using message='Cliente mudou em outra sessão'; end if;
 select role into actor_role from public.profiles where id=actor;
 if actor_role is null or actor_role not in('client','calculator') or(actor_role='client' and actor<>customer.owner_id) then raise exception 'Acesso não autorizado'; end if;
 perform p.id from public.processes p where p.id=before_file.process_id and p.client_id=customer.id for share;
 if not found then raise sqlstate 'PT409' using message='Processo mudou em outra sessão'; end if;
 if before_file.order_id is not null then
  perform o.id from public.orders o where o.id=before_file.order_id and o.process_id=before_file.process_id and o.client_id=customer.id for update;
  if not found then raise exception 'Arquivo indisponível'; end if;
  perform p.id from public.payments p where p.order_id=before_file.order_id order by p.id for update;
  perform private.lock_order_financial_sources(before_file.order_id);
 end if;
 select * into f from public.files where id=target_file for share;
 if f.id is null or f.process_id is distinct from before_file.process_id or f.order_id is distinct from before_file.order_id
  or f.folder is distinct from before_file.folder then raise sqlstate 'PT409' using message='Arquivo mudou em outra sessão'; end if;
 -- Reconsulta após toda espera. Leitores STABLE continuam sem locks ou escrita.
 if f.upload_status<>'uploaded' or private.can_read_process(f.process_id) is not true
  or (f.folder='deliverables' and private.can_read_delivery_file(f.id) is not true) then raise exception 'Entrega não liberada'; end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,access_kind,'file',f.id);
 return jsonb_build_object('id',f.id,'path',f.path,'name',f.name,'mime',f.mime,'size_bytes',f.size_bytes,'upload_status',f.upload_status);
end; $$;
revoke all on function public.authorize_file_access(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.authorize_file_access(uuid,text) to authenticated;

-- Compatibilidade de assinatura; AO consome os metadados atômicos da função nova.
create or replace function public.record_file_access(target_file uuid,access_kind text default 'file_download') returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 perform public.authorize_file_access(target_file,access_kind);
end; $$;
revoke all on function public.record_file_access(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.record_file_access(uuid,text) to authenticated;
