-- Registro central de eventos, mantido na transação de cada caso de uso.
create function private.record_event(target_process uuid,event_kind text,event_data jsonb,event_actor uuid,target_order uuid default null,event_id uuid default pg_catalog.gen_random_uuid())
returns uuid language plpgsql volatile set search_path = '' as $$
begin
 if target_process is null or event_id is null or event_kind is null or event_kind not in ('draft_created','draft_updated','checklist_draft_saved','file_uploaded','message_sent','note_added','decision_recorded','quote_created','quote_accepted','payment_confirmed','status_changed','delivered') or event_data is null or jsonb_typeof(event_data)<>'object' then raise exception 'Evento inválido'; end if;
 -- Só RPCs internas autorizadas chamam este helper; upload tem contexto de sistema.
 insert into public.timeline_events(id,process_id,order_id,kind,data,actor_id) values(event_id,target_process,target_order,event_kind,event_data,event_actor);
 return event_id;
end;
$$;
revoke all on function private.record_event(uuid,text,jsonb,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.complete_file_system(target_file uuid,actor uuid,observed_hash text,observed_size bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.files%rowtype;
begin
  select * into f from public.files where id=target_file for update;
  if f.id is null or f.uploaded_by<>actor or not exists(select 1 from public.profiles where id=actor and role in ('client','calculator')) then raise exception 'Acesso não autorizado'; end if;
  if observed_hash is null or observed_size is null or f.expected_sha256 is null or f.upload_status <> 'pending' or f.expected_sha256<>observed_hash or f.size_bytes<>observed_size then raise exception 'Integridade não conferida'; end if;
  update public.files set upload_status='uploaded',sha256=observed_hash where id=f.id;
  perform private.record_event(f.process_id,'file_uploaded',jsonb_build_object('file_id',f.id),actor,f.order_id);
  insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'upload_verified','file',f.id);
end;
$$;
revoke all on function public.complete_file_system(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.complete_file_system(uuid,uuid,text,bigint) to service_role;

-- Qualificação explícita das variáveis locais para revisão da identificação do processo.
create or replace function public.save_checklist_draft(payload jsonb, completed_step integer, draft_id uuid default null, expected_revision integer default null)
returns table(order_id uuid,order_code text,process_id uuid,revision integer,saved_step integer)
language plpgsql security definer set search_path = '' as $$
<<draft_save>>
declare actor uuid:=auth.uid(); owner uuid; cnj text; proc public.processes%rowtype; ord public.orders%rowtype; saved public.checklists%rowtype; calc text; side text; chamber text; trt text; claimant_count integer;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='client') then raise exception 'Acesso não autorizado'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>65536 or payload->>'schemaVersion' is distinct from '1' or completed_step is null or completed_step not between 0 and 8 then raise exception 'Checklist inválido'; end if;
 select id into owner from public.clients where owner_id=actor for update;
 if owner is null then raise exception 'Conta indisponível'; end if;
 cnj:=regexp_replace(trim(payload->>'processNumber'),'[-.]','','g'); calc:=payload->>'calculationType'; chamber:=trim(payload->>'court'); trt:='TRT-'||substring(cnj,15,2); side:=case payload->>'side' when 'claimant' then 'claimant' when 'respondent' then 'defendant' else null end;
 if not private.valid_labor_cnj(cnj) or calc is null or calc not in ('initial','liquidation','challenge','update') or side is null or chamber is null or length(chamber) not between 1 and 160 or payload->>'claimants' is null or payload->>'claimants' !~ '^[0-9]{1,4}$' or payload->>'tribunal' is distinct from substring(cnj,15,2)::integer::text then raise exception 'Processo inválido'; end if;
 claimant_count:=(payload->>'claimants')::integer;
 if claimant_count not between 1 and 1000 then raise exception 'Processo inválido'; end if;
 if draft_id is null then
  if expected_revision is not null then raise exception 'Revisão inválida'; end if;
  insert into public.processes(client_id,cnj_number,court,chamber,side,claimants_count) values(owner,cnj,trt,chamber,side,claimant_count) on conflict(client_id,cnj_number) do nothing;
  select * into proc from public.processes where client_id=owner and cnj_number=cnj for update;
  if (proc.chamber,proc.side,proc.claimants_count) is distinct from (chamber,side,claimant_count) then raise exception 'Confira a identificação do processo já cadastrado'; end if;
  insert into public.orders(process_id,client_id,calc_type,status) values(proc.id,owner,calc,'draft') returning * into ord;
  insert into public.checklists(order_id,schema_version,answers,completed_step) values(ord.id,1,payload,completed_step) returning * into saved;
 else
  select * into ord from public.orders where id=draft_id and client_id=owner and status='draft' for update;
  if not found then raise exception 'Rascunho indisponível'; end if;
  select * into saved from public.checklists where checklists.order_id=ord.id for update;
  if not found or expected_revision is null or saved.revision<>expected_revision then raise exception 'Rascunho atualizado em outra sessão'; end if;
  select * into proc from public.processes where id=ord.process_id and client_id=owner for update;
  if (proc.cnj_number,proc.chamber,proc.side,proc.claimants_count) is distinct from (cnj,chamber,side,claimant_count) then
   if exists(select 1 from public.orders o where o.process_id=proc.id and o.id<>ord.id) or exists(select 1 from public.files f where f.process_id=proc.id) then raise exception 'Processo já vinculado a outros pedidos ou documentos'; end if;
   update public.processes p set cnj_number=cnj,court=trt,chamber=draft_save.chamber,side=draft_save.side,claimants_count=claimant_count where p.id=proc.id;
  end if;
  update public.orders o set calc_type=calc where o.id=ord.id;
  update public.checklists c set answers=payload,completed_step=greatest(c.completed_step,save_checklist_draft.completed_step),revision=c.revision+1 where c.id=saved.id returning * into saved;
 end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'checklist_draft_saved','order',ord.id);
 perform private.record_event(proc.id,'checklist_draft_saved',jsonb_build_object('step',completed_step,'revision',saved.revision),actor,ord.id);
 return query select ord.id,ord.code,proc.id,saved.revision,saved.completed_step;
end;
$$;
revoke all on function public.save_checklist_draft(jsonb,integer,uuid,integer) from public,anon;
grant execute on function public.save_checklist_draft(jsonb,integer,uuid,integer) to authenticated;

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
  perform private.record_event(target_process,'message_sent',jsonb_build_object('message_id',request_id),actor);
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

create function public.add_process_note(target_process uuid,note_body text,request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); cleaned text; existing public.timeline_events%rowtype;
begin
 if actor is null or target_process is null or public.is_calculator() is not true or private.can_read_process(target_process) is not true then raise exception 'Acesso não autorizado'; end if;
 cleaned:=btrim(regexp_replace(note_body,E'\r\n?',E'\n','g'), E' \t\n\r\v\f' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 if request_id is null or cleaned is null or length(cleaned) not between 1 and 2000 then raise exception 'Nota inválida'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('timeline-note:'||request_id::text,0));
 select * into existing from public.timeline_events where id=request_id;
 if existing.id is not null then
  if existing.process_id is distinct from target_process or existing.kind is distinct from 'note_added' or existing.order_id is not null or existing.actor_id is distinct from actor or existing.data is distinct from jsonb_build_object('note',cleaned) then raise exception 'Nota já registrada com outros dados'; end if;
  return request_id;
 end if;
 perform private.record_event(target_process,'note_added',jsonb_build_object('note',cleaned),actor,null,request_id);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'note_added','timeline_event',request_id);
 return request_id;
end;
$$;
revoke all on function public.add_process_note(uuid,text,uuid) from public,anon;
grant execute on function public.add_process_note(uuid,text,uuid) to authenticated;

create function private.preserve_timeline_event() returns trigger
language plpgsql set search_path = '' as $$
begin
 if (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then raise exception 'Atividade registrada não pode ser alterada'; end if;
 return new;
end;
$$;
revoke all on function private.preserve_timeline_event() from public,anon,authenticated,service_role;
create trigger timeline_preserve_content before update on public.timeline_events for each row execute function private.preserve_timeline_event();
