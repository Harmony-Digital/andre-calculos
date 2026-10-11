-- Validação de anexo e lock abrangem o mesmo conjunto de IDs.
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
  -- Trava todos os IDs antes de validar, inclusive os que estão pendentes.
  -- Evita promoção/movimentação entre a aquisição do lock e a conferência.
  perform f.id from public.files f where f.id=any(canonical) order by f.id for share;
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

