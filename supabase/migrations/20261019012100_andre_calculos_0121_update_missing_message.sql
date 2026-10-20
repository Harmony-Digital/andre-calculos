-- A pendência abre mensagem consultável na pasta, com o aviso existente na mesma transação.
create or replace function public.create_calculation_update(target_process uuid,source_order uuid,request_id uuid,source_file uuid default null)
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
  perform public.send_process_message(target_process,'PJC ausente no pedido de atualização. Solicito o envio do arquivo para continuar a revisão e gerar a nova proposta.','{}'::uuid[],created);
 end if;
 return created;
end; $$;
