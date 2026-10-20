-- Campo calculado PostgREST: filtrar antes de contar/paginar propostas abertas.
-- Argumento sem nome evita exposição como RPC; acesso permanece por dono/papel.
-- https://docs.postgrest.org/en/stable/references/api/computed_fields.html
create function public.quote_is_current(public.quotes) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select private.is_current_quote(real.id) from public.quotes real
 where real.id=($1).id and private.can_read_order(real.order_id)
 and exists(select 1 from public.profiles where id=auth.uid() and role in('client','calculator'))),false)
$$;
revoke all on function public.quote_is_current(public.quotes) from public,anon,service_role;
grant execute on function public.quote_is_current(public.quotes) to authenticated;
