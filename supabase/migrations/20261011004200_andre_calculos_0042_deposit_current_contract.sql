-- Contrato histórico não substitui a condição vigente para entrada na fila.
create or replace function private.accepted_order_deposit(target_order uuid)
returns table(quote_id uuid,context_hash text,required_cents bigint,total_cents bigint,has_contract boolean)
language sql stable security definer set search_path='' as $$
 select q.id,ctx.context_hash,r.deposit_cents,o.total_cents,c.has_contract
 from public.orders o join public.clients c on c.id=o.client_id
 join public.quotes q on q.order_id=o.id
 join private.quote_acceptances r on r.quote_id=q.id
 join private.quote_contract_contexts ctx on ctx.quote_id=q.id
 where o.id=target_order and not q.is_simulation
 and q.accepted_at=r.accepted_at and q.accepted_by=r.actor_id and r.actor_id=c.owner_id
 and 1=(select count(*) from public.quotes other join private.quote_acceptances ar on ar.quote_id=other.id where other.order_id=o.id and not other.is_simulation)
 and r.context_hash=ctx.context_hash and q.items=ctx.proposal->'items'
 and q.total_cents=o.total_cents and o.total_cents=(ctx.proposal->>'totalCents')::bigint
 and o.deposit_cents=r.deposit_cents and r.deposit_cents=(ctx.proposal->>'depositCents')::bigint
 and q.price_table_id::text=ctx.proposal->>'priceTableId' and o.price_table_id=q.price_table_id
 and ctx.proposal->>'orderId'=o.id::text and ctx.proposal->>'processId'=o.process_id::text
 and o.delivery_date=(ctx.proposal->>'deliveryDate')::date
 and o.internal_due_date=(ctx.proposal->>'internalDueDate')::date
$$;

create or replace function public.get_process_deposit_instructions(target_process uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); calc boolean; job record; paid numeric; receipt private.manual_deposit_receipts%rowtype;
 payment_status text; actor_name text; pix text; result jsonb:='[]'::jsonb;
begin
 select role='calculator' into calc from public.profiles where id=actor and role in ('client','calculator');
 if actor is null or calc is null or private.can_read_process(target_process) is not true then raise exception 'Acesso não autorizado'; end if;
 select pix_key into pix from public.settings where singleton;
 for job in select o.*,a.quote_id,a.context_hash,a.required_cents,a.has_contract from public.orders o
  cross join lateral private.accepted_order_deposit(o.id) a where o.process_id=target_process order by o.id loop
  select coalesce(sum(p.amount_cents),0) into paid from public.payments p where p.order_id=job.id and p.kind='deposit' and p.status='confirmed';
  receipt:=null; payment_status:=null; actor_name:=null;
  select * into receipt from private.manual_deposit_receipts r where r.order_id=job.id and r.quote_id=job.quote_id order by r.confirmed_at desc,r.id desc limit 1;
  if receipt.id is not null then
   select full_name into actor_name from public.profiles where id=receipt.actor_id;
   select status into payment_status from public.payments where id=receipt.payment_id;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('orderId',job.id,'quoteId',job.quote_id,'processId',job.process_id,'code',job.code,'status',job.status,
   'contextHash',job.context_hash,'requiredCents',job.required_cents,'confirmedCents',paid,'remainingCents',greatest(job.required_cents-paid,0),
   'hasContract',job.has_contract,'pixKey',case when not job.has_contract and job.required_cents>paid and job.status in ('awaiting_payment','awaiting_documents') then nullif(btrim(pix),'') else null end,
   'canConfirm',calc and not job.has_contract and job.required_cents>0 and job.status in ('awaiting_payment','awaiting_documents') and (paid<job.required_cents or receipt.id is null),
   'receipt',case when receipt.id is null then null else private.manual_deposit_result(receipt) end,'confirmedName',actor_name,'paymentStatus',payment_status));
 end loop;
 return result;
end;
$$;
