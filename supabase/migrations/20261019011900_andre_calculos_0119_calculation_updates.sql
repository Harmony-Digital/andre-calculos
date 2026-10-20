-- Atualização é outro pedido; originais, arquivos e concordâncias permanecem históricos.
create table private.calculation_updates (
 order_id uuid primary key references public.orders(id) on delete cascade,
 process_id uuid not null references public.processes(id) on delete cascade,
 source_order_id uuid not null references public.orders(id) on delete cascade,
 request_id uuid not null unique, actor_id uuid not null references public.profiles(id),
 source_checklist jsonb not null, source_revision integer not null,
 source_index jsonb not null, source_decisions jsonb not null,
 source_file_id uuid references public.files(id), file_snapshot jsonb,
 missing_requested boolean not null, reviewed_revision integer,
 reviewed_at timestamptz, created_at timestamptz not null default clock_timestamp(),
 check(order_id<>source_order_id),
 check((source_file_id is null)=(file_snapshot is null)),
 check((reviewed_revision is null)=(reviewed_at is null))
);
create index calculation_updates_process_idx on private.calculation_updates(process_id);
create index calculation_updates_source_idx on private.calculation_updates(source_order_id);
create index calculation_updates_actor_idx on private.calculation_updates(actor_id);
create index calculation_updates_file_idx on private.calculation_updates(source_file_id);
alter table private.calculation_updates enable row level security;
revoke all on private.calculation_updates from public,anon,authenticated,service_role;

create function private.valid_update_pjc(target_file uuid,target_process uuid,source_order uuid,update_order uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.files f where f.id=target_file and f.process_id=target_process
 and f.upload_status='uploaded' and f.mime='application/octet-stream' and lower(f.name) like '%.pjc'
 and f.size_bytes>0 and f.sha256=f.expected_sha256 and f.sha256 ~ '^[a-f0-9]{64}$'
 and ((f.folder='deliverables' and f.order_id=source_order and exists(select 1 from public.deliveries release where release.order_id=source_order and exists(select 1 from public.delivery_files df where df.delivery_id=release.id and df.file_id=f.id) and private.delivery_credit_access((private.current_delivery_access(release.id))->>'orderStatus',(private.current_delivery_access(release.id))->>'releasePolicy',(private.current_delivery_access(release.id))->'credit')='ready')
 and exists(select 1 from public.delivery_files df join public.deliveries d on d.id=df.delivery_id
 where df.file_id=f.id and df.kind='pjc' and d.order_id=source_order and d.process_id=target_process))
 or(update_order is not null and f.folder='client' and f.order_id is null and exists(select 1 from private.calculation_updates u where u.order_id=update_order and u.actor_id=f.uploaded_by and f.created_at>=u.created_at))))
$$;
revoke all on function private.valid_update_pjc(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.create_calculation_update(target_process uuid,source_order uuid,request_id uuid,source_file uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner uuid; ord public.orders%rowtype; chk public.checklists%rowtype;
 saved private.calculation_updates%rowtype; created uuid; snap jsonb; answers jsonb;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='client') then raise exception 'Acesso não autorizado'; end if;
 perform id from public.profiles where id=actor for share;
 select id into owner from public.clients where owner_id=actor for update;
 if owner is null or target_process is null or source_order is null or request_id is null then raise exception 'Pedido indisponível'; end if;
 select * into ord from public.orders where id=source_order and process_id=target_process and client_id=owner for update;
 if ord.id is null then raise exception 'Pedido indisponível'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('calculation-update:'||request_id::text,0));
 select * into saved from private.calculation_updates u where u.request_id=create_calculation_update.request_id;
 if found then
  if (saved.actor_id,saved.process_id,saved.source_order_id,saved.missing_requested) is distinct from(actor,target_process,source_order,source_file is null)
   or(not saved.missing_requested and saved.source_file_id is distinct from source_file) then raise exception 'Tentativa já usada com outros dados'; end if;
  return saved.order_id;
 end if;
 if ord.status not in('delivered','completed') or not exists(select 1 from public.deliveries where order_id=ord.id and process_id=target_process) then raise exception 'Cálculo anterior não entregue'; end if;
 if exists(select 1 from private.calculation_updates u join public.orders o on o.id=u.order_id where u.source_order_id=source_order and o.status not in('delivered','completed','cancelled')) then raise sqlstate 'PT409' using message='Já existe atualização em andamento; continue o pedido existente'; end if;
 select * into chk from public.checklists where order_id=source_order for share;
 if chk.id is null or chk.schema_version<>1 or chk.completed_step<>8 or chk.answers->>'baseDate' is null then raise exception 'Checklist anterior indisponível'; end if;
 perform id from public.processes where id=target_process and client_id=owner for update;
 if source_file is not null then
  -- Autoriza e audita sob os mesmos locks financeiros do download; nenhum byte é transferido aqui.
  perform public.authorize_file_access(source_file,'file_view');
  perform id from public.files where id=source_file for share;
  if private.valid_update_pjc(source_file,target_process,source_order) is not true then raise exception 'PJC anterior indisponível'; end if;
  select jsonb_build_object('id',id,'name',name,'sha256',sha256,'sizeBytes',size_bytes,'origin','delivery') into snap from public.files where id=source_file;
 end if;
 insert into public.orders(process_id,client_id,calc_type,status) values(target_process,owner,'update','draft') returning id into created;
 answers:=chk.answers||jsonb_build_object('calculationType','update','baseDate','','noticeDate','','urgency',false);
 insert into public.checklists(order_id,schema_version,answers,completed_step) values(created,1,answers,0);
 insert into private.calculation_updates(order_id,process_id,source_order_id,request_id,actor_id,source_checklist,source_revision,source_index,source_decisions,source_file_id,file_snapshot,missing_requested)
 values(created,target_process,source_order,request_id,actor,chk.answers,chk.revision,
 (select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from public.page_index i where process_id=target_process),
 (select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') from public.decisions d where process_id=target_process),source_file,snap,source_file is null);
 perform private.record_event(target_process,'draft_created',jsonb_build_object('operation','calculation_update','source_order_id',source_order,'pjc_missing',source_file is null),actor,created);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'calculation_update_created','order',created);
 if source_file is null then
  perform private.notify_calculator('new_message',jsonb_build_object('process_id',target_process,'order_id',created,'reason','pjc_missing'),'update-pjc:'||created::text);
 end if;
 return created;
end; $$;
revoke all on function public.create_calculation_update(uuid,uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.create_calculation_update(uuid,uuid,uuid,uuid) to authenticated;

create function public.complete_calculation_update(target_order uuid,expected_revision integer,source_file uuid default null,confirm_review boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner uuid; ord public.orders%rowtype; u private.calculation_updates%rowtype; chk public.checklists%rowtype; snap jsonb;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='client') then raise exception 'Acesso não autorizado'; end if;
 select id into owner from public.clients where owner_id=actor for update;
 select * into ord from public.orders where id=target_order and client_id=owner for update;
 select * into u from private.calculation_updates where order_id=ord.id for update;
 if u.order_id is null or ord.status<>'draft' then raise exception 'Atualização indisponível'; end if;
 select * into chk from public.checklists where order_id=ord.id for update;
 if chk.revision is distinct from expected_revision then raise sqlstate 'PT409' using message='Checklist mudou em outra sessão'; end if;
 if source_file is not null then
  if u.source_file_id is not null then
   if u.source_file_id<>source_file then raise exception 'Origem já confirmada'; end if;
  else
   perform id from public.files where id=source_file for share;
   if private.valid_update_pjc(source_file,u.process_id,u.source_order_id,u.order_id) is not true then raise exception 'PJC indisponível para este pedido'; end if;
   select jsonb_build_object('id',id,'name',name,'sha256',sha256,'sizeBytes',size_bytes,'origin','client_upload') into snap from public.files where id=source_file;
   update private.calculation_updates set source_file_id=source_file,file_snapshot=snap where order_id=u.order_id;
   u.source_file_id:=source_file;
   perform private.record_event(u.process_id,'draft_updated',jsonb_build_object('operation','update_pjc_attached'),actor,u.order_id);
   insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'update_pjc_attached','order',u.order_id);
  end if;
 end if;
 if confirm_review is true then
  if chk.completed_step<>8 or chk.answers->>'calculationType'<>'update' or chk.answers->>'baseDate' is null or chk.answers->>'baseDate'=''
   or (chk.answers->>'baseDate')::date<=(u.source_checklist->>'baseDate')::date
   or private.valid_update_pjc(u.source_file_id,u.process_id,u.source_order_id,u.order_id) is not true then raise exception 'Revise as etapas, informe nova data-base e confirme o PJC'; end if;
  if u.reviewed_revision is distinct from chk.revision then
   update private.calculation_updates set reviewed_revision=chk.revision,reviewed_at=clock_timestamp() where order_id=u.order_id;
   insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'update_checklist_reviewed','order',u.order_id);
  end if;
 end if;
end; $$;
revoke all on function public.complete_calculation_update(uuid,integer,uuid,boolean) from public,anon,service_role;
grant execute on function public.complete_calculation_update(uuid,integer,uuid,boolean) to authenticated;

create function private.guard_calculation_update() returns trigger language plpgsql security definer set search_path='' as $$
declare u private.calculation_updates%rowtype; chk public.checklists%rowtype;
begin
 if TG_TABLE_NAME='orders' then
  if exists(select 1 from private.calculation_updates where order_id=old.id) and(new.calc_type,new.process_id,new.client_id) is distinct from(old.calc_type,old.process_id,old.client_id) then raise exception 'Origem da atualização não pode mudar'; end if;
 else
  select * into u from private.calculation_updates where order_id=new.order_id;
  if u.order_id is not null then
   if TG_TABLE_NAME='checklists' then
    if new.answers->>'calculationType' is distinct from 'update' or new.completed_step>old.completed_step+1 then raise exception 'Revise as etapas da atualização'; end if;
   else
    select * into chk from public.checklists where order_id=new.order_id;
    if u.reviewed_revision is distinct from chk.revision or chk.completed_step<>8 or private.valid_update_pjc(u.source_file_id,u.process_id,u.source_order_id,u.order_id) is not true then raise exception 'Revisão da atualização pendente'; end if;
   end if;
  end if;
 end if;
 return new;
end; $$;
revoke all on function private.guard_calculation_update() from public,anon,authenticated,service_role;
create trigger orders_guard_update_origin before update on public.orders for each row execute function private.guard_calculation_update();
create trigger checklists_guard_update_review before update on public.checklists for each row execute function private.guard_calculation_update();
create trigger quotes_guard_update_review before insert on public.quotes for each row execute function private.guard_calculation_update();

create function public.get_calculation_update(target_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u private.calculation_updates%rowtype; result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in('client','calculator')) then raise exception 'Acesso não autorizado'; end if;
 if not exists(select 1 from public.orders where id=target_order and private.can_read_process(process_id)) then raise exception 'Pedido indisponível'; end if;
 select * into u from private.calculation_updates where order_id=target_order;
 if not found then return null; end if;
 select jsonb_build_object('orderId',u.order_id,'processId',u.process_id,'sourceOrderId',u.source_order_id,'sourceCode',o.code,
 'sourceBaseDate',u.source_checklist->>'baseDate','sourceRevision',u.source_revision,'file',u.file_snapshot,
 'indexCount',jsonb_array_length(u.source_index),'decisionCount',jsonb_array_length(u.source_decisions),'createdAt',u.created_at,
 'reviewedRevision',u.reviewed_revision,'missingRequested',u.missing_requested) into result from public.orders o where o.id=u.source_order_id;
 return result;
end; $$;
revoke all on function public.get_calculation_update(uuid) from public,anon,service_role;
grant execute on function public.get_calculation_update(uuid) to authenticated;

create function private.preserve_update_pjc() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.calculation_updates where source_file_id=old.id)
 and(to_jsonb(new)-'updated_at') is distinct from(to_jsonb(old)-'updated_at') then raise exception 'PJC de origem exige novo arquivo'; end if;
 return new;
end; $$;
revoke all on function private.preserve_update_pjc() from public,anon,authenticated,service_role;
create trigger files_preserve_update_pjc before update on public.files for each row execute function private.preserve_update_pjc();
