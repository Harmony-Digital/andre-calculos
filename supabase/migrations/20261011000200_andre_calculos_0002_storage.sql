-- Arquivos privados: o navegador recebe uma permissão de upload para um único caminho.
-- Downloads passam pelo servidor para exigir autorização e auditoria antes da assinatura.
alter table public.files add column upload_status text not null default 'pending' check(upload_status in ('pending','uploaded','failed'));
alter table public.files add column expected_sha256 text check(expected_sha256 ~ '^[0-9a-f]{64}$');
create index files_pending_uploader_idx on public.files(uploaded_by,process_id,created_at) where upload_status = 'pending';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('processos','processos',false,500000000,array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/octet-stream']);

create policy processos_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'processos' and exists (
    select 1 from public.files f where f.path = name and f.bucket = bucket_id
      and f.uploaded_by = (select auth.uid()) and f.upload_status = 'pending'
      and private.can_read_process(f.process_id)
      and (f.folder <> 'deliverables' or (select public.is_calculator()))
  )
);
-- Sem SELECT/UPDATE/DELETE para clientes em storage.objects: um JWT não contorna a auditoria do app.

create function public.prepare_file_upload(target_process uuid,file_name text,file_mime text,file_size bigint,expected_hash text,target_folder text default 'case')
returns table(file_id uuid,object_path text) language plpgsql security definer set search_path = '' as $$
declare p public.processes%rowtype; f public.files%rowtype; safe_name text;
begin
  if auth.uid() is null or public.is_admin() or not private.can_read_process(target_process) then raise exception 'Acesso não autorizado'; end if;
  if target_folder not in ('case','client','triage','deliverables') or (target_folder='deliverables' and not public.is_calculator()) then raise exception 'Pasta não permitida'; end if;
  if file_size < 1 or file_size > 500000000 or length(file_name) not between 1 and 200 or expected_hash !~ '^[0-9a-f]{64}$'
     or file_mime not in ('application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/octet-stream') then raise exception 'Arquivo inválido'; end if;
  select * into p from public.processes where id=target_process;
  select * into f from public.files where process_id=p.id and uploaded_by=auth.uid() and folder=target_folder
     and name=file_name and size_bytes=file_size and expected_sha256=expected_hash and upload_status='pending'
     and created_at > now()-interval '2 hours' order by created_at desc limit 1;
  if f.id is null then
    f.id := gen_random_uuid();
    safe_name := regexp_replace(file_name,'[^A-Za-z0-9._-]','-','g');
    safe_name := regexp_replace(safe_name,'^\\.+','arquivo-');
    f.path := p.client_id::text || '/' || p.id::text || '/' || target_folder || '/' || f.id::text || '-' || safe_name;
    insert into public.files(id,process_id,folder,path,name,mime,size_bytes,uploaded_by,expected_sha256)
      values(f.id,p.id,target_folder,f.path,file_name,file_mime,file_size,auth.uid(),expected_hash);
  end if;
  insert into public.audit_log(actor_id,action,target_type,target_id) values(auth.uid(),'upload_authorized','file',f.id);
  return query select f.id,f.path;
end;
$$;
revoke all on function public.prepare_file_upload(uuid,text,text,bigint,text,text) from public,anon;
grant execute on function public.prepare_file_upload(uuid,text,text,bigint,text,text) to authenticated;

create function public.complete_file_system(target_file uuid,actor uuid,observed_hash text,observed_size bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.files%rowtype;
begin
  select * into f from public.files where id=target_file for update;
  if f.id is null or f.uploaded_by<>actor or not exists(select 1 from public.profiles where id=actor and role in ('client','calculator')) then raise exception 'Acesso não autorizado'; end if;
  if f.upload_status <> 'pending' or f.expected_sha256<>observed_hash or f.size_bytes<>observed_size then raise exception 'Integridade não conferida'; end if;
  update public.files set upload_status='uploaded',sha256=observed_hash where id=f.id;
  insert into public.timeline_events(process_id,order_id,kind,data,actor_id) values(f.process_id,f.order_id,'file_uploaded',jsonb_build_object('file_id',f.id),actor);
  insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'upload_verified','file',f.id);
end;
$$;
revoke all on function public.complete_file_system(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.complete_file_system(uuid,uuid,text,bigint) to service_role;

create function public.record_file_access(target_file uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.files%rowtype;
begin
  select * into f from public.files where id=target_file;
  if f.id is null or auth.uid() is null or public.is_admin() or not private.can_read_process(f.process_id)
    or f.upload_status<>'uploaded' then raise exception 'Acesso não autorizado'; end if;
  if f.folder='deliverables' and not public.is_calculator()
    and not exists(select 1 from public.orders where id=f.order_id and status in ('delivered','completed')) then raise exception 'Entrega não liberada'; end if;
  insert into public.audit_log(actor_id,action,target_type,target_id) values(auth.uid(),'file_download','file',f.id);
end;
$$;
revoke all on function public.record_file_access(uuid) from public,anon;
grant execute on function public.record_file_access(uuid) to authenticated;
