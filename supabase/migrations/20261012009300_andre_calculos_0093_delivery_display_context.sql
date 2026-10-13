-- Ambos os leitores STABLE compartilham o snapshot desta leitura de apresentação.
create function public.get_delivery_display_context(target_process uuid,target_deliveries uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare contexts jsonb;payments jsonb;
begin
 contexts:=public.get_current_delivery_access_contexts(target_process,target_deliveries);
 payments:=public.get_delivery_credit_instructions(target_process,target_deliveries);
 return jsonb_build_object('schemaVersion',1,'semantics','delivery_display','effects','none','contexts',contexts,'payments',payments);
end; $$;
revoke all on function public.get_delivery_display_context(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.get_delivery_display_context(uuid,uuid[]) to authenticated;
