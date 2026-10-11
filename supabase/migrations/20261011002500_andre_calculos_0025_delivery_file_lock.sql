-- Lock exclusivo dos arquivos evita promoção concorrente de locks compartilhados.
create or replace function public.confirm_order_delivery(target_process uuid,target_order uuid,request_id uuid,payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
<<delivery_confirmation>>
declare actor uuid:=auth.uid(); existing public.deliveries%rowtype; ord public.orders%rowtype;
 cfg public.settings%rowtype; calculation_id uuid; pjc_id uuid; report_id uuid;
 extras uuid[]; all_ids uuid[]; canonical jsonb; version_text text; month_text text;
 f public.files%rowtype; file_kind text; owner uuid; client_email text;
begin
 if actor is null or target_process is null or target_order is null or public.is_calculator() is not true or private.can_read_process(target_process) is not true then raise exception 'Acesso não autorizado'; end if;
 if request_id is null or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>4096
  or (select count(*) from jsonb_object_keys(payload))<>9
  or not payload ?& array['calculationFile','pjcFile','reportFile','attachments','pjeVersion','indexMonth','liquidated','taxIdPresent','reviewed']
  or payload->'liquidated' is distinct from 'true'::jsonb or payload->'taxIdPresent' is distinct from 'true'::jsonb or payload->'reviewed' is distinct from 'true'::jsonb
  or jsonb_typeof(payload->'attachments') is distinct from 'array'
  or jsonb_typeof(payload->'pjeVersion') is distinct from 'string' or jsonb_typeof(payload->'indexMonth') is distinct from 'string'
  or jsonb_typeof(payload->'calculationFile') is distinct from 'string' or jsonb_typeof(payload->'pjcFile') is distinct from 'string' or jsonb_typeof(payload->'reportFile') is distinct from 'string' then raise exception 'Checklist de entrega inválido'; end if;
 if jsonb_array_length(payload->'attachments')>10 or exists(select 1 from jsonb_array_elements(payload->'attachments') a where jsonb_typeof(a)<>'string') then raise exception 'Anexos inválidos'; end if;
 calculation_id:=(payload->>'calculationFile')::uuid; pjc_id:=(payload->>'pjcFile')::uuid; report_id:=(payload->>'reportFile')::uuid;
 select coalesce(array_agg(value::uuid order by value::uuid),array[]::uuid[]) into extras from jsonb_array_elements_text(payload->'attachments');
 all_ids:=array[calculation_id,pjc_id,report_id]||extras;
 if cardinality(all_ids)<>(select count(distinct unnest_id) from unnest(all_ids) unnest_id) then raise exception 'Escolha arquivos distintos'; end if;
 version_text:=btrim(payload->>'pjeVersion'); month_text:=payload->>'indexMonth';
 if version_text !~ '^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,39}$' or month_text !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or substring(month_text,1,4)::integer<1900 then raise exception 'Versão ou mês inválido'; end if;
 canonical:=jsonb_build_object('calculationFile',calculation_id,'pjcFile',pjc_id,'reportFile',report_id,'attachments',to_jsonb(extras),'pjeVersion',version_text,'indexMonth',month_text,'liquidated',true,'taxIdPresent',true,'reviewed',true);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delivery:'||request_id::text,0));
 select * into existing from public.deliveries d where d.id=request_id;
 if existing.id is not null then
  if existing.process_id is distinct from target_process or existing.order_id is distinct from target_order or existing.confirmed_by is distinct from actor or existing.payload is distinct from canonical then raise exception 'Entrega já registrada com outros dados'; end if;
  return existing.id;
 end if;
 select * into ord from public.orders o where o.id=target_order and o.process_id=target_process for update;
 if ord.id is null then raise exception 'Pedido indisponível'; end if;
 if ord.status<>'in_review' then raise sqlstate 'PT409' using message='Pedido precisa estar em revisão'; end if;
 select * into cfg from public.settings where singleton for share;
 if cfg.id is null or nullif(btrim(cfg.technical_name),'') is null or nullif(btrim(cfg.crc_number),'') is null or nullif(btrim(cfg.crc_state),'') is null or nullif(btrim(cfg.crc_category),'') is null then raise exception 'Identificação profissional incompleta'; end if;
 perform files.id from public.files where files.id=any(all_ids) order by files.id for update;
 if (select count(*) from public.files where id=any(all_ids) and process_id=target_process and folder='deliverables' and upload_status='uploaded' and size_bytes>0 and sha256 is not null and sha256=expected_sha256 and (order_id is null or order_id=target_order))<>cardinality(all_ids) then raise exception 'Arquivos de entrega indisponíveis'; end if;
 for f in select * from public.files where id=any(all_ids) order by id loop
  file_kind:=case f.id when calculation_id then 'calculation' when pjc_id then 'pjc' when report_id then 'report' else 'attachment' end;
  if not exists(select 1 from public.profiles where id=f.uploaded_by and role='calculator') then raise exception 'Arquivo não enviado pelo calculista'; end if;
  if (file_kind in ('calculation','report') and (f.mime<>'application/pdf' or lower(f.name) !~ '\.pdf$'))
   or (file_kind='pjc' and (f.mime<>'application/octet-stream' or lower(f.name) !~ '\.pjc$'))
   or (file_kind='attachment' and not ((f.mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document' and lower(f.name) ~ '\.docx$') or (f.mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and lower(f.name) ~ '\.xlsx$'))) then raise exception 'Tipo de entrega inválido'; end if;
 end loop;
 insert into public.deliveries(id,process_id,order_id,confirmed_by,pje_version,index_month,checklist,professional,payload)
 values(request_id,target_process,target_order,actor,version_text,month_text,jsonb_build_object('liquidated',true,'taxIdPresent',true,'reviewed',true),jsonb_build_object('name',cfg.technical_name,'crcNumber',cfg.crc_number,'crcState',cfg.crc_state,'crcCategory',cfg.crc_category),canonical);
 for f in select * from public.files where id=any(all_ids) order by id loop
  file_kind:=case f.id when calculation_id then 'calculation' when pjc_id then 'pjc' when report_id then 'report' else 'attachment' end;
  update public.files set order_id=target_order where id=f.id and order_id is null;
  insert into public.delivery_files(delivery_id,file_id,kind,snapshot) values(request_id,f.id,file_kind,jsonb_build_object('name',f.name,'mime',f.mime,'size',f.size_bytes,'sha256',f.sha256,'version',f.version));
 end loop;
 if cfg.delivery_release_policy is not null then
  insert into public.delivery_releases(delivery_id,policy,approved_by) values(request_id,cfg.delivery_release_policy,actor);
 end if;
 update public.orders set status='delivered' where id=ord.id;
 perform private.record_event(target_process,'delivered',jsonb_build_object('delivery_id',request_id),actor,target_order);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'delivery_confirmed','delivery',request_id);
 select c.owner_id,u.email into owner,client_email from public.clients c join auth.users u on u.id=c.owner_id where c.id=ord.client_id;
 if client_email is not null and not exists(select 1 from public.notification_preferences where profile_id=owner and event='delivery_ready' and channel='email' and not enabled) then
  insert into public.notifications(channel,recipient,template,data,dedup_key) values('email',client_email,'delivery_ready',jsonb_build_object('process_id',target_process,'order_id',target_order,'delivery_id',request_id,'state','confirmed'),'delivery:'||request_id::text||':email') on conflict(dedup_key) do nothing;
 end if;
 return request_id;
end;
$$;
revoke all on function public.confirm_order_delivery(uuid,uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.confirm_order_delivery(uuid,uuid,uuid,jsonb) to authenticated;
