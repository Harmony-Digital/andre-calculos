-- Projeção mínima para o classificador do checklist, sem liberar settings ao cliente.
create function public.get_complexity_limits() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('wageThreshold',s.complexity_limits->'wages','pageThreshold',s.complexity_limits->'pages','claimantThreshold',s.complexity_limits->'claimants') from public.settings s where s.singleton and auth.uid() is not null;
$$;
revoke all on function public.get_complexity_limits() from public,anon;
grant execute on function public.get_complexity_limits() to authenticated;
