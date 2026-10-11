-- Conversa privada: ator inferido do JWT, anexos do mesmo processo e escrita idempotente.
create function public.send_process_message(target_process uuid, message_body text, attachments uuid[], request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing public.messages%rowtype; cleaned text;
  canonical uuid[]; owner uuid; client_email text; event_payload jsonb;
begin
  if actor is null or public.is_admin() or not private.can_read_process(target_process)
    or not exists(select 1 from public.profiles p where p.id=actor and p.role in ('client','calculator')) then raise exception 'Acesso não autorizado'; end if;
  cleaned := trim(regexp_replace(message_body,E'\r\n?',E'\n','g'));
  if request_id is null or cleaned is null or length(cleaned) not between 1 and 10000
    or attachments is null or cardinality(attachments)>10 or array_position(attachments,null) is not null then raise exception 'Mensagem inválida'; end if;
  select coalesce(array_agg(item order by item),'{}'::uuid[]) into canonical from (select distinct unnest(attachments) item) normalized;
  if cardinality(canonical) <> cardinality(attachments) then raise exception 'Anexos inválidos'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('message:'||request_id::text,0));
  select * into existing from public.messages m where m.id=request_id;
  if existing.id is not null then
    if existing.author_id<>actor or existing.process_id<>target_process or existing.body<>cleaned or existing.attachment_ids<>canonical then raise exception 'Mensagem já registrada com outros dados'; end if;
    return existing.id;
  end if;
  -- Trava metadados dos anexos até confirmar a mensagem. Não aceita pendentes/entregas/triagem.
  perform f.id from public.files f where f.id=any(canonical) and f.process_id=target_process and f.folder='client' and f.upload_status='uploaded' for share;
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

-- Nomes estritamente vinculados à pasta; nenhum e-mail ou perfil inteiro é projetado.
create function public.get_process_participants(target_process uuid)
returns table(profile_id uuid, display_name text, participant_role text)
language sql stable security definer set search_path = '' as $$
  select profile.id,profile.full_name,profile.role from public.profiles profile
  where auth.uid() is not null and not public.is_admin() and private.can_read_process(target_process)
    and profile.role in ('client','calculator') and (
      exists(select 1 from public.processes p join public.clients c on c.id=p.client_id where p.id=target_process and c.owner_id=profile.id)
      or exists(select 1 from public.messages m where m.process_id=target_process and m.author_id=profile.id)
      or exists(select 1 from public.decisions d where d.process_id=target_process and d.recorded_by=profile.id)
      or exists(select 1 from public.timeline_events t where t.process_id=target_process and t.actor_id=profile.id)
    );
$$;
revoke all on function public.get_process_participants(uuid) from public,anon;
grant execute on function public.get_process_participants(uuid) to authenticated;
create index messages_process_created_id_idx on public.messages(process_id,created_at desc,id desc);
