-- A sequência explícita é a versão exibida; o metadado legado do envio não muda.
create function public.get_pdf_version_sequences(target_process uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in('client','calculator')) or private.can_read_process(target_process) is not true then raise exception 'Acesso não autorizado'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('fileId',v.file_id,'sequence',v.sequence) order by v.file_id)
 from private.pdf_versions v join public.files f on f.id=v.file_id
 where v.process_id=target_process and f.upload_status='uploaded' and f.sha256=v.sha256),'[]'::jsonb);
end; $$;
revoke all on function public.get_pdf_version_sequences(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_pdf_version_sequences(uuid) to authenticated;
