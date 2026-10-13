-- DTOs atuais separados dos contextos/recibos históricos de obrigação.
create function private.current_order_credit(target_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare projection jsonb; active boolean; contracted boolean; state text;
begin
 select c.has_contract into contracted from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order;
 if not found then raise exception 'Pedido indisponivel'; end if;
 projection:=private.order_payment_credit(target_order);
 -- Não depende de charge/run: a reserva antes do primeiro POST também protege.
 select exists(select 1 from private.payment_intent_reservations where order_id=target_order) into active;
 state:=case when projection->'unsafeAmount' is distinct from 'false'::jsonb
  or projection->'depositUncertain' is distinct from 'false'::jsonb or projection->'uncertain' is distinct from 'false'::jsonb
  or projection->'depositCreditCents'='null'::jsonb or projection->'totalCreditCents'='null'::jsonb then 'reconcile'
  when (projection->>'depositExcessCents')::numeric>0 or (projection->>'totalExcessCents')::numeric>0 then 'excess'
  when active then 'active' else 'clear' end;
 return jsonb_build_object('schemaVersion',1,'semantics','current_order_credit','orderId',target_order,
  'hasContract',contracted,'activeReservation',active,'collectionState',state,'projection',projection);
end; $$;
revoke all on function private.current_order_credit(uuid) from public,anon,authenticated,service_role;

create function private.current_order_credits(target_orders uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid; result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in('client','calculator')) then raise exception 'Acesso nao autorizado'; end if;
 if target_orders is null or cardinality(target_orders)>50 or coalesce(array_ndims(target_orders),1)<>1
  or array_position(target_orders,null) is not null or cardinality(target_orders)<>(select count(distinct id) from unnest(target_orders) id) then raise exception 'Pedidos invalidos'; end if;
 -- Builder STABLE: autorização e valores compartilham o mesmo snapshot.
 foreach target in array target_orders loop perform private.authorize_payment_obligation(target); end loop;
 select coalesce(jsonb_agg(private.current_order_credit(o.id) order by o.id),'[]'::jsonb) into result from public.orders o where o.id=any(target_orders);
 return result;
end; $$;
revoke all on function private.current_order_credits(uuid[]) from public,anon,authenticated,service_role;
create function public.get_current_order_credits(target_orders uuid[]) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; target uuid;
begin
 select private.current_order_credits(target_orders) into result;
 foreach target in array target_orders loop
  insert into public.audit_log(actor_id,action,target_type,target_id) values(auth.uid(),'payment_credit_read','order',target);
 end loop;
 return result;
end; $$;
revoke all on function public.get_current_order_credits(uuid[]) from public,anon,service_role;
grant execute on function public.get_current_order_credits(uuid[]) to authenticated;

create or replace function public.get_process_deposit_instructions(target_process uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); calc boolean; job record; credit jsonb; projection jsonb; paid numeric; remaining numeric;
 receipt private.manual_deposit_receipts%rowtype; eligible_receipt boolean; payment_status text; actor_name text; pix text; can_confirm boolean;
 result jsonb:='[]'::jsonb;
begin
 select role='calculator' into calc from public.profiles where id=actor and role in('client','calculator');
 if actor is null or calc is null or private.can_read_process(target_process) is not true then raise exception 'Acesso nao autorizado'; end if;
 select pix_key into pix from public.settings where singleton;
 for job in select o.*,a.quote_id,a.context_hash,a.required_cents,a.has_contract from public.orders o
  cross join lateral private.accepted_order_deposit(o.id) a where o.process_id=target_process order by o.id loop
  credit:=private.current_order_credit(job.id);projection:=credit->'projection';
  paid:=(projection->>'depositCreditCents')::numeric;remaining:=(projection->>'remainingDepositCents')::numeric;
  receipt:=null;payment_status:=null;actor_name:=null;
  select * into receipt from private.manual_deposit_receipts r where r.order_id=job.id and r.quote_id=job.quote_id order by r.confirmed_at desc,r.id desc limit 1;
  if receipt.id is not null then
   select full_name into actor_name from public.profiles where id=receipt.actor_id;
   select status into payment_status from public.payments where id=receipt.payment_id;
  end if;
  select exists(select 1 from private.manual_deposit_receipts r left join public.payments p on p.id=r.payment_id
   where r.quote_id=job.quote_id and r.context_hash=job.context_hash and(r.payment_id is null or p.status='confirmed')) into eligible_receipt;
  can_confirm:=calc and not job.has_contract and job.required_cents>0 and job.status in('awaiting_payment','awaiting_documents')
   and projection->'unsafeAmount'='false'::jsonb and projection->'depositUncertain'='false'::jsonb and projection->'uncertain'='false'::jsonb
   and (projection->>'depositExcessCents')::numeric=0 and (projection->>'totalExcessCents')::numeric=0
   and ((remaining>0 and credit->'activeReservation'='false'::jsonb)
    -- Conferência zero de manual comprovado não cria crédito/instrução nova.
    or (remaining=0 and (projection->>'manualDepositCents')::numeric>=job.required_cents and not eligible_receipt));
  result:=result||jsonb_build_array(jsonb_build_object('orderId',job.id,'quoteId',job.quote_id,'processId',job.process_id,'code',job.code,'status',job.status,
   'contextHash',job.context_hash,'requiredCents',job.required_cents,'confirmedCents',paid,'remainingCents',remaining,'credit',credit,
   'hasContract',job.has_contract,'pixKey',case when not job.has_contract and job.required_cents>0 and remaining>0
    and job.status in('awaiting_payment','awaiting_documents') and credit->>'collectionState'='clear' then nullif(btrim(pix),'') else null end,
   'canConfirm',coalesce(can_confirm,false),'receipt',case when receipt.id is null then null else private.manual_deposit_result(receipt) end,
   'confirmedName',actor_name,'paymentStatus',payment_status));
 end loop;
 return result;
end; $$;

create function public.get_delivery_credit_instructions(target_process uuid,target_deliveries uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or public.is_admin() or private.can_read_process(target_process) is not true then raise exception 'Acesso nao autorizado'; end if;
 if target_deliveries is null or cardinality(target_deliveries)>50 or coalesce(array_ndims(target_deliveries),1)<>1 or array_position(target_deliveries,null) is not null then raise exception 'Entregas invalidas'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('deliveryId',d.id,'orderId',d.order_id,'orderCode',d.code,'credit',d.credit,
  'remainingCents',(d.credit->'projection'->>'remainingTotalCents')::numeric,
  'pixKey',case when d.credit->>'collectionState'='clear' and(d.credit->'projection'->>'remainingTotalCents')::numeric>0 then nullif(btrim(d.pix_key),'') else null end) order by d.order_id),'[]'::jsonb) into result
 from(select distinct on(o.id) d.id,d.order_id,o.code,s.pix_key,private.current_order_credit(o.id) credit
  from public.deliveries d join public.delivery_releases r on r.delivery_id=d.id
  join public.orders o on o.id=d.order_id and o.process_id=d.process_id cross join public.settings s
  where d.process_id=target_process and d.id=any(target_deliveries) and s.singleton
   and r.policy='after_balance' and o.status in('delivered','completed') order by o.id,d.created_at desc,d.id desc) d;
 return result;
end; $$;
revoke all on function public.get_delivery_credit_instructions(uuid,uuid[]) from public,anon,service_role;
grant execute on function public.get_delivery_credit_instructions(uuid,uuid[]) to authenticated;

-- Compatibilidade somente da leitura TABLE antiga, sem mudar seu retorno nem snapshots.
create or replace function public.get_delivery_payment_instructions(target_process uuid,target_deliveries uuid[])
returns table(delivery_id uuid,pix_key text,remaining_cents bigint,order_code text)
language plpgsql stable security definer set search_path='' as $$
begin
 return query select (r->>'deliveryId')::uuid,r->>'pixKey',(r->>'remainingCents')::bigint,r->>'orderCode'
  from jsonb_array_elements(public.get_delivery_credit_instructions(target_process,target_deliveries)) r
  where r->'remainingCents'='null'::jsonb or (r->>'remainingCents')::numeric>0;
end; $$;
