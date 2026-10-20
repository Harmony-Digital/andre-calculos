-- M3.10a: conferência humana explícita. Contagem declarada, sem inferência/IA.
create table private.pdf_versions (
 file_id uuid primary key references public.files(id) on delete cascade,
 process_id uuid not null references public.processes(id) on delete cascade,
 previous_file_id uuid references public.files(id),
 sequence integer not null check(sequence between 1 and 1000),
 page_count integer not null check(page_count between 1 and 100000),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 revision integer not null default 1 check(revision>0),
 registered_by uuid not null references public.profiles(id), registered_at timestamptz not null default now(),
 check(previous_file_id is distinct from file_id)
);
create unique index pdf_versions_successor_idx on private.pdf_versions(previous_file_id) where previous_file_id is not null;
create index pdf_versions_process_idx on private.pdf_versions(process_id);
create index pdf_versions_actor_idx on private.pdf_versions(registered_by);
create table private.pdf_page_checks (
 file_id uuid not null references private.pdf_versions(file_id) on delete cascade,
 page integer not null check(page between 1 and 100000),
 is_read boolean, read_by uuid references public.profiles(id), read_at timestamptz,
 source_page integer check(source_page between 1 and 100000), source_read boolean not null default false,
 matched_by uuid references public.profiles(id), matched_at timestamptz,
 primary key(file_id,page)
);
create unique index pdf_page_checks_source_idx on private.pdf_page_checks(file_id,source_page) where source_page is not null;
create index pdf_page_checks_reader_idx on private.pdf_page_checks(read_by);
create index pdf_page_checks_matcher_idx on private.pdf_page_checks(matched_by);
create table private.pdf_reference_origins (
 entry_id uuid primary key, file_id uuid not null references private.pdf_versions(file_id) on delete cascade,
 source_entry_id uuid not null, source_file_id uuid not null,
 source_snapshot jsonb not null, page_map jsonb not null,
 copied_by uuid not null references public.profiles(id), copied_name text not null,
 copied_at timestamptz not null default now(), unique(file_id,source_entry_id)
);
create index pdf_reference_origins_actor_idx on private.pdf_reference_origins(copied_by);
create index pdf_reference_origins_source_idx on private.pdf_reference_origins(source_file_id);
create table private.pdf_version_receipts (
 request_id uuid primary key, process_id uuid not null references public.processes(id) on delete cascade,
 actor_id uuid not null references public.profiles(id), payload jsonb not null,
 result jsonb not null, created_at timestamptz not null default now()
);
create index pdf_version_receipts_process_idx on private.pdf_version_receipts(process_id);
create index pdf_version_receipts_actor_idx on private.pdf_version_receipts(actor_id);
alter table private.pdf_versions enable row level security;
alter table private.pdf_page_checks enable row level security;
alter table private.pdf_reference_origins enable row level security;
alter table private.pdf_version_receipts enable row level security;
revoke all on private.pdf_versions,private.pdf_page_checks,private.pdf_reference_origins,private.pdf_version_receipts from public,anon,authenticated;
grant all on private.pdf_versions,private.pdf_page_checks,private.pdf_reference_origins,private.pdf_version_receipts to service_role;
create trigger pdf_origins_immutable before update on private.pdf_reference_origins for each row execute function private.preserve_index_receipt();
create trigger pdf_receipts_immutable before update on private.pdf_version_receipts for each row execute function private.preserve_index_receipt();

create function private.preserve_reviewed_pdf() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') and exists(select 1 from private.pdf_versions where file_id=old.id) then
  raise exception 'PDF conferido é imutável; envie outra versão';
 end if;
 return new;
end; $$;
revoke all on function private.preserve_reviewed_pdf() from public,anon,authenticated,service_role;
create trigger files_preserve_pdf_review before update on public.files for each row execute function private.preserve_reviewed_pdf();

-- Limite por operação: nunca expande centenas de milhares de referências.
create function private.pdf_page_numbers(value text) returns integer[] language plpgsql immutable set search_path='' as $$
declare normalized text:=private.normalize_index_pages(value); part text; bounds text[]; first_page integer; last_page integer; result integer[]:='{}';
begin
 foreach part in array string_to_array(replace(normalized,' ',''),',') loop
  bounds:=string_to_array(part,'-'); first_page:=bounds[1]::integer; last_page:=coalesce(bounds[2],bounds[1])::integer;
  if cardinality(result)+last_page-first_page+1>500 then return null; end if;
  result:=result||array(select generate_series(first_page,last_page));
 end loop;
 return array(select distinct p from unnest(result) p order by p);
end; $$;
revoke all on function private.pdf_page_numbers(text) from public,anon,authenticated,service_role;
create function private.pdf_compact_pages(value integer[]) returns text language sql immutable set search_path='' as $$
 with distinct_pages as(select distinct p from unnest(value) p), islands as(select p,p-row_number() over(order by p) as group_id from distinct_pages),
 ranges as(select min(p) as first_page,max(p) as last_page from islands group by group_id)
 select string_agg(case when first_page=last_page then first_page::text else first_page||'-'||last_page end,', ' order by first_page) from ranges;
$$;
revoke all on function private.pdf_compact_pages(integer[]) from public,anon,authenticated,service_role;

create function public.mutate_pdf_version(target_process uuid,request_id uuid,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
<<mutation>>
declare actor uuid:=auth.uid(); operation text; target uuid; expected integer; previous uuid; count_pages integer;
 canonical jsonb; receipt private.pdf_version_receipts%rowtype; current_version private.pdf_versions%rowtype; prior private.pdf_versions%rowtype;
 f public.files%rowtype; old_entry public.page_index%rowtype; pages integer[]; mapped integer[]; item jsonb; p integer; from_page integer; to_page integer;
 snapshot_read boolean; copied_id uuid; result jsonb; mappings jsonb; content_pages text; expected_entry integer;
begin
 if actor is null or public.is_calculator() is not true or target_process is null or private.can_read_process(target_process) is not true then raise exception 'Acesso não autorizado'; end if;
 if request_id is null or payload is null or jsonb_typeof(payload)<>'object' then raise exception 'Conferência inválida'; end if;
 operation:=payload->>'operation';
 if operation is null or operation not in('register','read','map','copy') or jsonb_typeof(payload->'fileId') is distinct from 'string'
  or jsonb_typeof(payload->'revision') is distinct from 'number' or (payload->>'revision') !~ '^(0|[1-9][0-9]{0,9})$' then raise exception 'Conferência inválida'; end if;
 target:=(payload->>'fileId')::uuid; expected:=(payload->>'revision')::integer;
 if expected>2147483646 then raise exception 'Revisão inválida'; end if;
 if operation='register' then
  if payload-array['operation','fileId','revision','pageCount','previousFileId','confirmed']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(payload))<>6
   or payload->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(payload->'pageCount') is distinct from 'number'
   or (payload->>'pageCount') !~ '^[1-9][0-9]{0,5}$' or (payload->>'pageCount')::integer>100000 or expected<>0
   or jsonb_typeof(payload->'previousFileId') not in('string','null') then raise exception 'Confirme a quantidade de páginas e a versão anterior'; end if;
  count_pages:=(payload->>'pageCount')::integer; previous:=(payload->>'previousFileId')::uuid;
  if previous=target then raise exception 'Escolha arquivos diferentes'; end if;
 elsif operation='read' then
  if payload-array['operation','fileId','revision','pages','read']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(payload))<>5
   or jsonb_typeof(payload->'pages') is distinct from 'string' or jsonb_typeof(payload->'read') is distinct from 'boolean' then raise exception 'Marcação inválida'; end if;
  pages:=private.pdf_page_numbers(payload->>'pages');
  if pages is null then raise exception 'Marque até 500 páginas por vez'; end if;
 elsif operation='map' then
  if payload-array['operation','fileId','revision','pairs','confirmed']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(payload))<>5
   or payload->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(payload->'pairs') is distinct from 'array'
   or jsonb_array_length(payload->'pairs') not between 1 and 100 then raise exception 'Confirme até 100 correspondências por vez'; end if;
  for item in select * from jsonb_array_elements(payload->'pairs') loop
   if jsonb_typeof(item)<>'object' or item-array['source','target']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(item))<>2
    or jsonb_typeof(item->'target') is distinct from 'number' or (item->>'target') !~ '^[1-9][0-9]{0,5}$'
    or jsonb_typeof(item->'source') not in('number','null') or (item->>'source' is not null and (item->>'source') !~ '^[1-9][0-9]{0,5}$') then raise exception 'Correspondência inválida'; end if;
  end loop;
  if (select count(distinct (x->>'target')::integer) from jsonb_array_elements(payload->'pairs') x)<>jsonb_array_length(payload->'pairs')
   or (select count(*) from jsonb_array_elements(payload->'pairs') x where x->>'source' is not null)<>(select count(distinct (x->>'source')::integer) from jsonb_array_elements(payload->'pairs') x where x->>'source' is not null) then raise exception 'Não repita páginas na correspondência'; end if;
 elsif operation='copy' then
  if payload-array['operation','fileId','revision','entryId','entryRevision']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(payload))<>5
   or jsonb_typeof(payload->'entryId') is distinct from 'string' or jsonb_typeof(payload->'entryRevision') is distinct from 'number'
   or (payload->>'entryRevision') !~ '^[1-9][0-9]{0,9}$' then raise exception 'Referência inválida'; end if;
  expected_entry:=(payload->>'entryRevision')::integer;
 end if;
 canonical:=payload;
 perform pg_advisory_xact_lock(hashtextextended('pdf-version:'||request_id::text,0));
 select * into receipt from private.pdf_version_receipts r where r.request_id=mutate_pdf_version.request_id;
 if found then
  if receipt.actor_id<>actor or receipt.process_id<>target_process or receipt.payload is distinct from canonical then raise exception 'Operação já registrada com outros dados'; end if;
  return receipt.result;
 end if;
 -- Serializa registro inicial, edição e ligação de sucessores do mesmo processo.
 perform pg_advisory_xact_lock(hashtextextended('pdf-process:'||target_process::text,0));
 select * into current_version from private.pdf_versions where file_id=target for update;
 if operation='register' then
  if current_version.file_id is not null then raise sqlstate 'PT409' using message='PDF já registrado'; end if;
  if previous is not null then
   select * into prior from private.pdf_versions where file_id=previous and process_id=target_process for update;
   if prior.file_id is null or prior.sequence>=1000 or exists(select 1 from private.pdf_versions where previous_file_id=previous) then raise sqlstate 'PT409' using message='Escolha a última versão já conferida'; end if;
  end if;
 else
  if current_version.file_id is null or current_version.process_id<>target_process then raise exception 'PDF indisponível'; end if;
  if current_version.revision<>expected then raise sqlstate 'PT409' using message='A conferência mudou'; end if;
  if current_version.previous_file_id is not null then select * into prior from private.pdf_versions where file_id=current_version.previous_file_id; end if;
 end if;
 -- Mesma subsequência arquivo → entrada usada pelo editor de índice existente.
 perform id from public.files where id in(target,previous,prior.file_id) order by id for share;
 select * into f from public.files where id=target and process_id=target_process;
 if f.id is null or f.upload_status<>'uploaded' or f.mime<>'application/pdf' or f.folder not in('case','client') or f.sha256 is null then raise exception 'PDF confirmado indisponível'; end if;
 if operation<>'register' and f.sha256 is distinct from current_version.sha256 then raise exception 'Conteúdo do PDF mudou'; end if;
 if prior.file_id is not null and not exists(select 1 from public.files where id=prior.file_id and process_id=target_process and upload_status='uploaded' and sha256=prior.sha256) then raise exception 'Versão anterior indisponível'; end if;
 if operation='register' then
  if exists(select 1 from public.page_index i cross join lateral regexp_split_to_table(replace(i.pages,' ',''),'[,-]') n where i.file_id=target and n::integer>count_pages) then raise exception 'A quantidade declarada não cobre o índice existente'; end if;
  insert into private.pdf_versions(file_id,process_id,previous_file_id,sequence,page_count,sha256,registered_by)
   values(target,target_process,previous,coalesce(prior.sequence,0)+1,count_pages,f.sha256,actor);
 elsif operation='read' then
  if (select max(n) from unnest(pages) n)>current_version.page_count then raise exception 'Página fora do PDF conferido'; end if;
  foreach p in array pages loop
   insert into private.pdf_page_checks(file_id,page,is_read,read_by,read_at) values(target,p,(payload->>'read')::boolean,actor,now())
    on conflict(file_id,page) do update set is_read=excluded.is_read,read_by=actor,read_at=now();
  end loop;
 elsif operation='map' then
  if prior.file_id is null then raise exception 'Este PDF não tem versão anterior'; end if;
  for item in select * from jsonb_array_elements(payload->'pairs') loop
   from_page:=(item->>'source')::integer; to_page:=(item->>'target')::integer;
   if to_page>current_version.page_count or from_page>prior.page_count then raise exception 'Página fora do PDF conferido'; end if;
  end loop;
  -- Limpa somente os alvos deste comando para permitir reordenação atômica.
  update private.pdf_page_checks set source_page=null,source_read=false,matched_by=null,matched_at=null
   where file_id=target and page in(select (x->>'target')::integer from jsonb_array_elements(payload->'pairs') x);
  for item in select * from jsonb_array_elements(payload->'pairs') loop
   from_page:=(item->>'source')::integer; to_page:=(item->>'target')::integer;
   select coalesce(is_read,source_read,false) into snapshot_read from private.pdf_page_checks where file_id=prior.file_id and page=from_page;
   insert into private.pdf_page_checks(file_id,page,source_page,source_read,matched_by,matched_at)
    values(target,to_page,from_page,coalesce(snapshot_read,false),case when from_page is not null then actor end,case when from_page is not null then now() end)
    on conflict(file_id,page) do update set source_page=excluded.source_page,source_read=excluded.source_read,matched_by=excluded.matched_by,matched_at=excluded.matched_at;
  end loop;
 elsif operation='copy' then
  if prior.file_id is null then raise exception 'Este PDF não tem versão anterior'; end if;
  select * into old_entry from public.page_index where id=(payload->>'entryId')::uuid and file_id=prior.file_id and process_id=target_process for share;
  if old_entry.id is null or old_entry.revision<>expected_entry then raise sqlstate 'PT409' using message='A referência original mudou'; end if;
  if exists(select 1 from private.pdf_reference_origins where file_id=target and source_entry_id=old_entry.id) then raise exception 'Referência já reaproveitada; confira o índice'; end if;
  pages:=private.pdf_page_numbers(old_entry.pages);
  if pages is null then raise exception 'Divida a referência em até 500 páginas antes de reaproveitar'; end if;
  select array_agg(c.page order by c.page),jsonb_agg(jsonb_build_object('source',c.source_page,'target',c.page) order by c.source_page)
   into mapped,mappings from private.pdf_page_checks c where c.file_id=target and c.source_page=any(pages);
  if cardinality(mapped) is distinct from cardinality(pages) then raise exception 'Confirme a correspondência de todas as páginas da referência'; end if;
  content_pages:=private.pdf_compact_pages(mapped);
  if length(content_pages)>1000 then raise exception 'Divida a referência antes de reaproveitar'; end if;
  copied_id:=gen_random_uuid();
  insert into public.page_index(id,process_id,file_id,piece,pages,note,recorded_by) values(copied_id,target_process,target,old_entry.piece,content_pages,old_entry.note,actor);
  insert into private.pdf_reference_origins(entry_id,file_id,source_entry_id,source_file_id,source_snapshot,page_map,copied_by,copied_name)
   values(copied_id,target,old_entry.id,prior.file_id,to_jsonb(old_entry)||jsonb_build_object('fileName',(select name from public.files where id=prior.file_id),'fileSha256',prior.sha256),mappings,actor,(select full_name from public.profiles where id=actor));
 end if;
 if operation<>'register' then update private.pdf_versions set revision=revision+1 where file_id=target; end if;
 result:=jsonb_build_object('fileId',target,'revision',case when operation='register' then 1 else expected+1 end,'entryId',copied_id);
 insert into private.pdf_version_receipts(request_id,process_id,actor_id,payload,result) values(request_id,target_process,actor,canonical,result);
 perform private.record_event(target_process,'index_updated',jsonb_build_object('operation','pdf_'||operation,'file_id',target,'entry_id',copied_id),actor);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'pdf_'||operation,'file',target);
 return result;
end; $$;
revoke all on function public.mutate_pdf_version(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mutate_pdf_version(uuid,uuid,jsonb) to authenticated;

create function public.get_pdf_version_context(target_file uuid,start_page integer default 1,ref_after_at timestamptz default null,ref_after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare f public.files%rowtype; v private.pdf_versions%rowtype; prior private.pdf_versions%rowtype; result jsonb;
begin
 if auth.uid() is null or public.is_calculator() is not true then raise exception 'Acesso não autorizado'; end if;
 if start_page is null or start_page<1 or (ref_after_at is null)<>(ref_after_id is null) or (ref_after_at is not null and not isfinite(ref_after_at)) then raise exception 'Página inválida'; end if;
 select * into f from public.files where id=target_file;
 if f.id is null or f.upload_status<>'uploaded' or f.mime<>'application/pdf' or f.folder not in('case','client') or private.can_read_process(f.process_id) is not true then raise exception 'PDF indisponível'; end if;
 select * into v from private.pdf_versions where file_id=f.id;
 if v.file_id is null then return jsonb_build_object('review',null,'pages','[]'::jsonb,'entries','[]'::jsonb,'hasMoreEntries',false,'readCount',0,'mappedCount',0,'unmappedPrevious',0); end if;
 if start_page>v.page_count then raise exception 'Página fora do PDF conferido'; end if;
 if v.previous_file_id is not null then select * into prior from private.pdf_versions where file_id=v.previous_file_id; end if;
 with entries as materialized (
  select i.id,i.piece,i.pages,i.note,i.revision,i.created_at,
   private.pdf_page_numbers(i.pages) as source_pages,
   exists(select 1 from private.pdf_reference_origins o where o.file_id=f.id and o.source_entry_id=i.id) as already_copied
  from public.page_index i where i.file_id=prior.file_id and i.process_id=f.process_id
   and (ref_after_at is null or (i.created_at,i.id)<(ref_after_at,ref_after_id))
  order by i.created_at desc,i.id desc limit 51
 ), page_entries as (
  select e.id,e.piece,e.pages,e.note,e.revision,e.created_at,e.already_copied,
   coalesce(cardinality(e.source_pages)=(select count(*) from private.pdf_page_checks c where c.file_id=f.id and c.source_page=any(e.source_pages)),false) as ready
  from entries e order by e.created_at desc,e.id desc limit 50
 )
 select jsonb_build_object(
  'review',jsonb_build_object('fileId',v.file_id,'pageCount',v.page_count,'sequence',v.sequence,'revision',v.revision,'registeredAt',v.registered_at,
   'registeredName',(select full_name from public.profiles where id=v.registered_by),'previousFileId',v.previous_file_id,
   'previousName',(select name from public.files where id=v.previous_file_id),'previousCount',prior.page_count),
  'pages',coalesce((select jsonb_agg(jsonb_build_object('page',n,'read',coalesce(c.is_read,c.source_read,false),'sourcePage',c.source_page,
    'inherited',c.is_read is null and coalesce(c.source_read,false),'checkedName',(select full_name from public.profiles where id=coalesce(c.read_by,c.matched_by)),
    'checkedAt',coalesce(c.read_at,c.matched_at)) order by n)
   from generate_series(start_page,least(start_page+49,v.page_count)) n left join private.pdf_page_checks c on c.file_id=f.id and c.page=n),'[]'::jsonb),
  'entries',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc) from page_entries e),'[]'::jsonb),
  'hasMoreEntries',(select count(*)>50 from entries),
  'readCount',(select count(*) from private.pdf_page_checks where file_id=f.id and coalesce(is_read,source_read,false)),
  'mappedCount',(select count(*) from private.pdf_page_checks where file_id=f.id and source_page is not null),
  'unmappedPrevious',coalesce(prior.page_count,0)-(select count(*) from private.pdf_page_checks where file_id=f.id and source_page is not null)
 ) into result;
 return result;
end; $$;
revoke all on function public.get_pdf_version_context(uuid,integer,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_pdf_version_context(uuid,integer,timestamptz,uuid) to authenticated;

create function public.get_pdf_index_origins(target_process uuid,entry_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in('client','calculator')) or private.can_read_process(target_process) is not true then raise exception 'Acesso não autorizado'; end if;
 if entry_ids is null or cardinality(entry_ids)>50 then raise exception 'Referências inválidas'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'entryId',o.entry_id,'sourceEntryId',o.source_entry_id,'sourceFileId',o.source_file_id,'sourceName',o.source_snapshot->>'fileName',
  'sourcePages',o.source_snapshot->>'pages','sourceRevision',(o.source_snapshot->>'revision')::integer,
  'copiedName',o.copied_name,'copiedAt',o.copied_at,'edited',i.revision>1,
  'requiresReview',exists(select 1 from jsonb_array_elements(o.page_map) m where not exists(select 1 from private.pdf_page_checks c where c.file_id=o.file_id and c.page=(m->>'target')::integer and c.source_page=(m->>'source')::integer))
 )) from private.pdf_reference_origins o join public.page_index i on i.id=o.entry_id and i.file_id=o.file_id
  where i.process_id=target_process and o.entry_id=any(entry_ids)),'[]'::jsonb);
end; $$;
revoke all on function public.get_pdf_index_origins(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.get_pdf_index_origins(uuid,uuid[]) to authenticated;
