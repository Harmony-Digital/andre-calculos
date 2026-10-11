-- Confirmação técnica é distinta da liberação financeira (D6 permanece aberta).
alter table public.settings add column delivery_release_policy text
  check(delivery_release_policy in ('before_balance','after_balance'));

create table public.deliveries (
 id uuid primary key, process_id uuid not null references public.processes(id),
 order_id uuid not null, confirmed_by uuid not null references public.profiles(id),
 pje_version text not null check(length(pje_version) between 1 and 40),
 index_month text not null check(index_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 checklist jsonb not null check(checklist='{"liquidated":true,"taxIdPresent":true,"reviewed":true}'::jsonb),
 professional jsonb not null check(jsonb_typeof(professional)='object'),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 created_at timestamptz not null default now(),
 foreign key(order_id,process_id) references public.orders(id,process_id)
);
create table public.delivery_files (
 delivery_id uuid not null references public.deliveries(id) on delete cascade,
 file_id uuid not null references public.files(id),
 kind text not null check(kind in ('calculation','pjc','report','attachment')),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 primary key(delivery_id,file_id)
);
create unique index delivery_core_kind_idx on public.delivery_files(delivery_id,kind) where kind<>'attachment';
create table public.delivery_releases (
 delivery_id uuid primary key references public.deliveries(id) on delete cascade,
 policy text not null check(policy in ('before_balance','after_balance')),
 approved_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.deliveries enable row level security;
alter table public.delivery_files enable row level security;
alter table public.delivery_releases enable row level security;
revoke all on public.deliveries,public.delivery_files,public.delivery_releases from anon,authenticated;
grant select on public.deliveries,public.delivery_files,public.delivery_releases to authenticated;
grant all on public.deliveries,public.delivery_files,public.delivery_releases to service_role;
create policy deliveries_read on public.deliveries for select to authenticated using(private.can_read_process(process_id));
create policy delivery_files_read on public.delivery_files for select to authenticated using(exists(select 1 from public.deliveries d where d.id=delivery_id));
create policy delivery_releases_read on public.delivery_releases for select to authenticated using(exists(select 1 from public.deliveries d where d.id=delivery_id));
create index deliveries_process_created_id_idx on public.deliveries(process_id,created_at desc,id desc);
create index deliveries_order_idx on public.deliveries(order_id);
create index deliveries_confirmed_by_idx on public.deliveries(confirmed_by);
create index delivery_files_file_idx on public.delivery_files(file_id);
create index delivery_releases_actor_idx on public.delivery_releases(approved_by);

create function private.preserve_delivery_record() returns trigger language plpgsql set search_path='' as $$
begin
 if to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'Entrega registrada não pode ser alterada'; end if;
 return new;
end;
$$;
revoke all on function private.preserve_delivery_record() from public,anon,authenticated,service_role;
create trigger deliveries_immutable before update on public.deliveries for each row execute function private.preserve_delivery_record();
create trigger delivery_files_immutable before update on public.delivery_files for each row execute function private.preserve_delivery_record();
create trigger delivery_releases_immutable before update on public.delivery_releases for each row execute function private.preserve_delivery_record();
create function private.preserve_delivered_file() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.delivery_files where file_id=old.id)
   and (to_jsonb(new)-array['updated_at','upload_status','pages']) is distinct from (to_jsonb(old)-array['updated_at','upload_status','pages']) then
   raise exception 'Arquivo de entrega exige nova versão para alterar o conteúdo';
 end if;
 return new;
end;
$$;
revoke all on function private.preserve_delivered_file() from public,anon,authenticated,service_role;
create trigger files_preserve_delivery before update on public.files for each row execute function private.preserve_delivered_file();

-- Um registro explícito de liberação captura a política aprovada; mudar settings
-- não libera retroativamente entregas anteriores. Ausência de registro bloqueia.
create function private.can_read_delivery_file(target_file uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.files f where f.id=target_file and f.folder='deliverables'
   and f.upload_status='uploaded' and private.can_read_process(f.process_id)
   and (public.is_calculator() or exists(
    select 1 from public.delivery_files df join public.deliveries d on d.id=df.delivery_id
     join public.delivery_releases r on r.delivery_id=d.id join public.orders o on o.id=d.order_id
    where df.file_id=f.id and f.order_id=o.id and o.status in ('delivered','completed')
     and (r.policy='before_balance' or (r.policy='after_balance' and
      (select coalesce(sum(p.amount_cents),0) from public.payments p where p.order_id=o.id and p.status='confirmed' and p.kind in ('deposit','balance'))>=o.total_cents))
   ))
 );
$$;
revoke all on function private.can_read_delivery_file(uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_delivery_file(uuid) to authenticated;
drop policy files_read on public.files;
create policy files_read on public.files for select to authenticated using(private.can_read_process(process_id) and (folder<>'deliverables' or private.can_read_delivery_file(id)));
create or replace function public.record_file_access(target_file uuid,access_kind text default 'file_download') returns void
language plpgsql security definer set search_path='' as $$
declare f public.files%rowtype;
begin
 if access_kind is null or access_kind not in ('file_download','file_view') then raise exception 'Acesso inválido'; end if;
 select * into f from public.files where id=target_file;
 if f.id is null or auth.uid() is null or public.is_admin() or private.can_read_process(f.process_id) is not true or f.upload_status<>'uploaded' then raise exception 'Acesso não autorizado'; end if;
 if f.folder='deliverables' and private.can_read_delivery_file(f.id) is not true then raise exception 'Entrega não liberada'; end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(auth.uid(),access_kind,'file',f.id);
end;
$$;
revoke all on function public.record_file_access(uuid,text) from public,anon;
grant execute on function public.record_file_access(uuid,text) to authenticated;

create function public.confirm_order_delivery(target_process uuid,target_order uuid,request_id uuid,payload jsonb)
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
 perform files.id from public.files where files.id=any(all_ids) order by files.id for share;
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
