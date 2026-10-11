create or replace function public.record_auth_audit(event text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or event is null or event not in ('login','logout','password_changed') then raise exception 'Acesso não autorizado'; end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(auth.uid(),event,'profile',auth.uid());
end;
$$;
