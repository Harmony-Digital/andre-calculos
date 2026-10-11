-- O calculista precisa enxergar os metadados pendentes para autorizar o TUS.
-- Bytes/leitura/download continuam exigindo upload confirmado nas rotas/RPC.
create or replace function private.can_read_delivery_file(target_file uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.files f where f.id=target_file and f.folder='deliverables'
   and private.can_read_process(f.process_id)
   and (public.is_calculator() or (f.upload_status='uploaded' and exists(
    select 1 from public.delivery_files df join public.deliveries d on d.id=df.delivery_id
     join public.delivery_releases r on r.delivery_id=d.id join public.orders o on o.id=d.order_id
    where df.file_id=f.id and f.order_id=o.id and o.status in ('delivered','completed')
     and (r.policy='before_balance' or (r.policy='after_balance' and
      (select coalesce(sum(p.amount_cents),0) from public.payments p where p.order_id=o.id and p.status='confirmed' and p.kind in ('deposit','balance'))>=o.total_cents))
   )))
 );
$$;
revoke all on function private.can_read_delivery_file(uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_delivery_file(uuid) to authenticated;
