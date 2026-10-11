-- Conflito de revisão é HTTP 409, sem retries de serialization_failure.
create or replace function public.mutate_process_page_index(target_process uuid,request_id uuid,payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
<<index_mutation>>
declare actor uuid:=auth.uid(); operation text; entry_id uuid; file_id uuid; expected integer; piece text; pages text; note text;
 canonical jsonb; receipt private.page_index_receipts%rowtype; existing public.page_index%rowtype; source_file public.files%rowtype;
begin
 if actor is null or target_process is null or public.is_calculator() is not true or private.can_read_process(target_process) is not true or not exists(select 1 from public.processes where id=target_process) then raise exception 'Acesso não autorizado'; end if;
 if request_id is null or payload is null or jsonb_typeof(payload)<>'object' or payload-array['action','entryId','fileId','expectedRevision','piece','pages','note']<>'{}'::jsonb or (select count(*) from jsonb_object_keys(payload))<>7 then raise exception 'Índice inválido'; end if;
 if jsonb_typeof(payload->'action') is distinct from 'string' or payload->>'action' not in ('create','update','delete') or jsonb_typeof(payload->'entryId') is distinct from 'string' or jsonb_typeof(payload->'fileId') is distinct from 'string' or jsonb_typeof(payload->'expectedRevision') is distinct from 'number' or (payload->>'expectedRevision') !~ '^(0|[1-9][0-9]{0,9})$' or jsonb_typeof(payload->'piece') is distinct from 'string' or jsonb_typeof(payload->'pages') is distinct from 'string' or jsonb_typeof(payload->'note') is distinct from 'string' then raise exception 'Índice inválido'; end if;
 operation:=payload->>'action'; entry_id:=(payload->>'entryId')::uuid; file_id:=(payload->>'fileId')::uuid; expected:=(payload->>'expectedRevision')::integer;
 if (operation='create' and expected<>0) or (operation<>'create' and expected<1) then raise exception 'Revisão inválida'; end if;
 if operation='delete' then
  if payload->>'piece'<>'' or payload->>'pages'<>'' or payload->>'note'<>'' then raise exception 'Remoção inválida'; end if;
  piece:=''; pages:=''; note:=null;
 else
  piece:=payload->>'piece'; pages:=private.normalize_index_pages(payload->>'pages'); note:=nullif(private.clean_decision_text(payload->>'note'),'');
  if piece not in ('initial','defense','judgment','appeal','decision','financial_record','timecard','payslip','costs','prior_calculation','other') or length(coalesce(note,''))>2000 then raise exception 'Índice inválido'; end if;
 end if;
 canonical:=jsonb_build_object('action',operation,'entryId',entry_id,'fileId',file_id,'expectedRevision',expected,'piece',piece,'pages',pages,'note',note);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('page-index:'||request_id::text,0));
 select * into receipt from private.page_index_receipts r where r.request_id=mutate_process_page_index.request_id;
 if receipt.request_id is not null then
  if receipt.actor_id is distinct from actor or receipt.process_id is distinct from target_process or receipt.payload is distinct from canonical then raise exception 'Operação já registrada com outros dados'; end if;
  return receipt.result_id;
 end if;
 -- Ordem fixa: arquivo, depois entrada. Status/remoção não disputam com edição.
 select * into source_file from public.files f where f.id=file_id and f.process_id=target_process for share;
 if source_file.id is null or source_file.upload_status<>'uploaded' or source_file.mime<>'application/pdf' or source_file.folder not in ('case','client') then raise exception 'PDF confirmado indisponível'; end if;
 if operation='create' then
  insert into public.page_index(id,process_id,file_id,piece,pages,note,recorded_by) values(entry_id,target_process,file_id,piece,pages,note,actor);
 else
  select * into existing from public.page_index i where i.id=entry_id and i.process_id=target_process and i.file_id=index_mutation.file_id for update;
  if existing.id is null then raise exception 'Entrada indisponível'; end if;
  if existing.revision<>expected then raise exception 'O índice mudou. Recarregue antes de editar.' using errcode='PT409'; end if;
  if operation='delete' then delete from public.page_index where id=entry_id;
  else update public.page_index set piece=index_mutation.piece,pages=index_mutation.pages,note=index_mutation.note,revision=revision+1 where id=entry_id; end if;
 end if;
 insert into private.page_index_receipts(request_id,process_id,file_id,actor_id,payload,result_id) values(request_id,target_process,file_id,actor,canonical,entry_id);
 perform private.record_event(target_process,'index_updated',jsonb_build_object('entry_id',entry_id,'file_id',file_id,'action',operation),actor);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'page_index_'||operation,'page_index',entry_id);
 return entry_id;
end;
$$;
