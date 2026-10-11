-- Uma obrigação financeira por pedido, mesmo com várias entregas na página.
create or replace function public.get_delivery_payment_instructions(target_process uuid,target_deliveries uuid[])
returns table(delivery_id uuid,pix_key text,remaining_cents bigint,order_code text)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or public.is_admin() or private.can_read_process(target_process) is not true then raise exception 'Acesso não autorizado'; end if;
 if target_deliveries is null or cardinality(target_deliveries)>50 or coalesce(array_ndims(target_deliveries),1)<>1 or array_position(target_deliveries,null) is not null then raise exception 'Entregas inválidas'; end if;
 return query select distinct on (o.id) d.id,nullif(btrim(s.pix_key),''),greatest(o.total_cents-coalesce(paid.amount,0),0)::bigint,o.code
  from public.deliveries d join public.delivery_releases r on r.delivery_id=d.id
   join public.orders o on o.id=d.order_id and o.process_id=d.process_id cross join public.settings s
   left join lateral(select sum(p.amount_cents) amount from public.payments p where p.order_id=o.id and p.status='confirmed' and p.kind in ('deposit','balance')) paid on true
  where d.process_id=target_process and d.id=any(target_deliveries) and s.singleton
   and r.policy='after_balance' and o.status in ('delivered','completed') and coalesce(paid.amount,0)<o.total_cents
  order by o.id,d.created_at desc,d.id desc;
end;
$$;
