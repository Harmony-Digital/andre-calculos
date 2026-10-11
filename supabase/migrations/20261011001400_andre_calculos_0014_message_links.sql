-- Vínculos com FK e conteúdo imutável para preservar anexos e replays.
create or replace function public.send_process_message(target_process uuid, message_body text, attachments uuid[], request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing public.messages%rowtype; cleaned text;
  canonical uuid[]; owner uuid; client_email text; event_payload jsonb;
begin
  if actor is null or target_process is null or public.is_admin() or private.can_read_process(target_process) is not true
    or not exists(select 1 from public.profiles p where p.id=actor and p.role in ('client','calculator')) then raise exception 'Acesso não autorizado'; end if;
  cleaned := btrim(regexp_replace(message_body,E'\r\n?',E'\n','g'), E' \t\n\r\v\f' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  if request_id is null or cleaned is null or length(cleaned) not between 1 and 10000
    or attachments is null or coalesce(array_ndims(attachments),1)<>1 or cardinality(attachments)>10 or array_position(attachments,null) is not null then raise exception 'Mensagem inválida'; end if;
  select coalesce(array_agg(item order by item),'{}'::uuid[]) into canonical from (select distinct unnest(attachments) item) normalized;
  if cardinality(canonical) <> cardinality(attachments) then raise exception 'Anexos inválidos'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('message:'||request_id::text,0));
  select * into existing from public.messages m where m.id=request_id;
  if existing.id is not null then
    if existing.author_id is distinct from actor or existing.process_id is distinct from target_process or existing.body is distinct from cleaned or existing.attachment_ids is distinct from canonical then raise exception 'Mensagem já registrada com outros dados'; end if;
    return existing.id;
  end if;
  -- Trava metadados dos anexos até confirmar a mensagem. Não aceita pendentes/entregas/triagem.
  perform f.id from public.files f where f.id=any(canonical) and f.process_id=target_process and f.folder='client' and f.upload_status='uploaded' order by f.id for share;
  if (select count(*) from public.files f where f.id=any(canonical) and f.process_id=target_process and f.folder='client' and f.upload_status='uploaded')<>cardinality(canonical) then raise exception 'Anexos indisponíveis'; end if;
  insert into public.messages(id,process_id,author_id,body,attachment_ids) values(request_id,target_process,actor,cleaned,canonical);
  insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'message_sent','message',request_id);
  insert into public.timeline_events(process_id,kind,data,actor_id) values(target_process,'message_sent',jsonb_build_object('message_id',request_id),actor);
  event_payload := jsonb_build_object('process_id',target_process,'message_id',request_id);
  if public.is_calculator() then
    select c.owner_id into owner from public.processes p join public.clients c on c.id=p.client_id where p.id=target_process;
    select u.email into client_email from auth.users u where u.id=owner;
    if client_email is not null and not exists(select 1 from public.notification_preferences n where n.profile_id=owner and n.event='new_message' and n.channel='email' and not n.enabled) then
      insert into public.notifications(channel,recipient,template,data,dedup_key) values('email',client_email,'new_message',event_payload,'message:'||request_id::text||':email') on conflict(dedup_key) do nothing;
    end if;
  else
    perform private.notify_calculator('new_message',event_payload,'message:'||request_id::text);
  end if;
  return request_id;
end;
$$;
revoke all on function public.send_process_message(uuid,text,uuid[],uuid) from public,anon;
grant execute on function public.send_process_message(uuid,text,uuid[],uuid) to authenticated;

create table private.message_attachments (
  message_id uuid not null references public.messages(id) on delete cascade,
  file_id uuid not null, process_id uuid not null,
  primary key(message_id,file_id), foreign key(file_id,process_id) references public.files(id,process_id)
);
alter table private.message_attachments enable row level security;
revoke all on private.message_attachments from public,anon,authenticated,service_role;
create index message_attachments_file_process_idx on private.message_attachments(file_id,process_id);
insert into private.message_attachments(message_id,file_id,process_id)
  select m.id,item,m.process_id from public.messages m cross join lateral unnest(m.attachment_ids) item;
create function private.link_message_attachments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.message_attachments(message_id,file_id,process_id)
    select new.id,item,new.process_id from unnest(new.attachment_ids) item;
  return new;
end;
$$;
revoke all on function private.link_message_attachments() from public,anon,authenticated,service_role;
create trigger messages_link_files after insert on public.messages for each row execute function private.link_message_attachments();
create function private.preserve_message_content() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id,new.process_id,new.author_id,new.body,new.attachment_ids,new.created_at)
    is distinct from (old.id,old.process_id,old.author_id,old.body,old.attachment_ids,old.created_at) then raise exception 'Mensagem já enviada não pode ser alterada'; end if;
  return new;
end;
$$;
revoke all on function private.preserve_message_content() from public,anon,authenticated,service_role;
create trigger messages_preserve_content before update on public.messages for each row execute function private.preserve_message_content();
create function private.preserve_attached_file() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at')
    and exists(select 1 from private.message_attachments a where a.file_id=old.id) then raise exception 'Arquivo vinculado a mensagem não pode ser alterado'; end if;
  return new;
end;
$$;
revoke all on function private.preserve_attached_file() from public,anon,authenticated,service_role;
create trigger files_preserve_message_attachment before update on public.files for each row execute function private.preserve_attached_file();
