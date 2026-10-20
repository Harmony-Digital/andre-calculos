-- Só o servidor registra download concluído, depois de conferir os bytes.
revoke all on function public.record_quote_contract_download(uuid,text) from public,anon,authenticated,service_role;
create function public.record_quote_contract_download_system(target_quote uuid,actor uuid,expected_sha256 text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_contract_pdf_worker();
 if not exists(select 1 from private.quote_contract_pdf_archives a join public.quotes q on q.id=a.quote_id
   join public.orders o on o.id=q.order_id join public.clients c on c.id=o.client_id join public.profiles p on p.id=actor
   where a.quote_id=target_quote and a.sha256=expected_sha256 and p.role in('client','calculator')
     and (p.role='calculator' or c.owner_id=actor)) then return false; end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'contract_pdf_downloaded','quote',target_quote);
 return true;
end; $$;
revoke all on function public.record_quote_contract_download_system(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_quote_contract_download_system(uuid,uuid,text) to service_role;
