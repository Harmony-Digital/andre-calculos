-- A visualização e o download validam o mesmo escopo e geram registros distintos.
drop function public.record_file_access(uuid);
create function public.record_file_access(target_file uuid, access_kind text default 'file_download') returns void
language plpgsql security definer set search_path = '' as $$
declare f public.files%rowtype;
begin
  if access_kind is null or access_kind not in ('file_download','file_view') then raise exception 'Acesso inválido'; end if;
  select * into f from public.files where id=target_file;
  if f.id is null or auth.uid() is null or public.is_admin() or not private.can_read_process(f.process_id)
    or f.upload_status<>'uploaded' then raise exception 'Acesso não autorizado'; end if;
  if f.folder='deliverables' and not public.is_calculator()
    and not exists(select 1 from public.orders where id=f.order_id and status in ('delivered','completed')) then raise exception 'Entrega não liberada'; end if;
  insert into public.audit_log(actor_id,action,target_type,target_id) values(auth.uid(),access_kind,'file',f.id);
end;
$$;
revoke all on function public.record_file_access(uuid,text) from public,anon;
grant execute on function public.record_file_access(uuid,text) to authenticated;
