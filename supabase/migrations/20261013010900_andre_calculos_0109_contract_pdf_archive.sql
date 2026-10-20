-- Finalização exclusiva do processador, depois de reler e conferir o objeto.
create table private.quote_contract_pdf_archives (
 quote_id uuid primary key, snapshot_sha256 text not null, renderer_version text not null,
 bucket text not null check(bucket='processos'),
 object_path text generated always as ('contracts/'||quote_id::text||'/'||snapshot_sha256||'/'||renderer_version||'.pdf') stored,
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),size_bytes bigint not null check(size_bytes between 1 and 50000000),
 verified_at timestamptz not null default clock_timestamp(),
 foreign key(quote_id,snapshot_sha256,renderer_version) references private.quote_contract_pdf_metadata(quote_id,snapshot_sha256,renderer_version) on delete cascade,
 unique(quote_id,snapshot_sha256,renderer_version),unique(bucket,object_path)
);
alter table private.quote_contract_pdf_archives enable row level security;
revoke all on private.quote_contract_pdf_archives from public,anon,authenticated,service_role;
create trigger contract_pdf_archive_immutable before update on private.quote_contract_pdf_archives for each row execute function private.preserve_quote_contract_record();
alter table private.quote_contract_pdf_jobs drop constraint quote_contract_pdf_jobs_state_check;
alter table private.quote_contract_pdf_jobs add constraint quote_contract_pdf_jobs_state_check check(state in('processing','prepared','failed','ready'));
create or replace function private.guard_contract_pdf_job() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.quote_id,new.snapshot_sha256,new.renderer_version,new.created_at) is distinct from (old.quote_id,old.snapshot_sha256,old.renderer_version,old.created_at) then raise exception 'Identidade do contrato é imutável'; end if;
 if new.state='prepared' and not exists(select 1 from private.quote_contract_pdf_metadata where quote_id=new.quote_id) then raise exception 'Metadados do contrato não conferidos'; end if;
 if new.state='ready' and not exists(select 1 from private.quote_contract_pdf_archives a join private.quote_contract_pdf_metadata m using(quote_id,snapshot_sha256,renderer_version)
  where a.quote_id=new.quote_id and a.sha256=m.sha256 and a.size_bytes=m.size_bytes and a.object_path=m.object_path) then raise exception 'Contrato não arquivado'; end if;
 if tg_op='UPDATE' and old.state='ready' and new is distinct from old then raise exception 'Contrato arquivado é imutável'; end if;
 return new;
end; $$;

alter function public.claim_quote_contract_pdf(uuid,uuid) set schema private;
alter function private.claim_quote_contract_pdf(uuid,uuid) rename to claim_quote_contract_pdf_unarchived;
revoke all on function private.claim_quote_contract_pdf_unarchived(uuid,uuid) from public,anon,authenticated,service_role;
create function public.claim_quote_contract_pdf(target_quote uuid,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_contract_pdf_worker();
 if target_quote is null or request_id is null then raise exception 'Solicitação inválida'; end if;
 if exists(select 1 from private.quote_contract_pdf_claims where claim_id=request_id and quote_id<>target_quote) then raise exception 'Solicitação divergente' using errcode='PT409'; end if;
 if exists(select 1 from private.quote_contract_pdf_archives where quote_id=target_quote) then return jsonb_build_object('state','ready','quoteId',target_quote); end if;
 return private.claim_quote_contract_pdf_unarchived(target_quote,request_id);
end; $$;
revoke all on function public.claim_quote_contract_pdf(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_quote_contract_pdf(uuid,uuid) to service_role;

create function public.complete_quote_contract_pdf(target_quote uuid,worker_claim uuid,expected_epoch bigint,observed_sha256 text,observed_size bigint) returns boolean
language plpgsql security definer set search_path='' as $$
declare j private.quote_contract_pdf_jobs%rowtype; m private.quote_contract_pdf_metadata%rowtype;
begin
 perform private.require_contract_pdf_worker();
 select * into j from private.quote_contract_pdf_jobs where quote_id=target_quote for update;
 select * into m from private.quote_contract_pdf_metadata where quote_id=target_quote;
 if m.quote_id is null or m.sha256 is distinct from observed_sha256 or m.size_bytes is distinct from observed_size then return false; end if;
 if j.state='ready' then return exists(select 1 from private.quote_contract_pdf_archives where quote_id=target_quote and sha256=observed_sha256 and size_bytes=observed_size); end if;
 if j.claim_id is distinct from worker_claim or j.epoch is distinct from expected_epoch or j.lease_until<=clock_timestamp() or j.state<>'prepared' then return false; end if;
 if not exists(select 1 from storage.buckets b join storage.objects o on o.bucket_id=b.id where b.id=m.bucket and not b.public and o.name=m.object_path and o.metadata->>'size'=m.size_bytes::text) then return false; end if;
 insert into private.quote_contract_pdf_archives(quote_id,snapshot_sha256,renderer_version,bucket,sha256,size_bytes) values(m.quote_id,m.snapshot_sha256,m.renderer_version,m.bucket,m.sha256,m.size_bytes);
 update private.quote_contract_pdf_jobs set state='ready',error_code=null where quote_id=target_quote;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'contract_pdf_archived','quote',target_quote);
 return true;
end; $$;
revoke all on function public.complete_quote_contract_pdf(uuid,uuid,bigint,text,bigint) from public,anon,authenticated;
grant execute on function public.complete_quote_contract_pdf(uuid,uuid,bigint,text,bigint) to service_role;

create function public.select_pending_quote_contract_pdfs(batch_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_contract_pdf_worker();
 if batch_limit is null or batch_limit not between 1 and 10 then raise exception 'Lote inválido'; end if;
 return coalesce((select jsonb_agg(quote_id order by created_at,quote_id) from (
  select i.quote_id,i.created_at from private.quote_contract_generation_intents i left join private.quote_contract_pdf_jobs j using(quote_id)
  where j.quote_id is null or (j.state<>'ready' and j.error_code is distinct from 'integrity_conflict' and (j.state='failed' or j.lease_until<=now()))
  order by i.created_at,i.quote_id limit batch_limit) candidates),'[]'::jsonb);
end; $$;
revoke all on function public.select_pending_quote_contract_pdfs(integer) from public,anon,authenticated;
grant execute on function public.select_pending_quote_contract_pdfs(integer) to service_role;

create or replace function public.get_quote_contract_pdf_state(target_quote uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j private.quote_contract_pdf_jobs%rowtype;
begin
 perform public.get_quote_contract_snapshot(target_quote);
 select * into j from private.quote_contract_pdf_jobs where quote_id=target_quote;
 return jsonb_build_object('quoteId',target_quote,'state',case when j.state='ready' then 'ready' when j.state='failed' then 'failed' when j.state='processing' and j.lease_until>now() then 'processing' else 'pending' end);
end; $$;
create function public.authorize_quote_contract_download(target_quote uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.quote_contract_pdf_archives%rowtype; snapshot jsonb;
begin
 snapshot:=public.get_quote_contract_snapshot(target_quote);
 select * into a from private.quote_contract_pdf_archives where quote_id=target_quote;
 if a.quote_id is null then raise exception 'Contrato ainda não disponível' using errcode='PT409'; end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(auth.uid(),'contract_pdf_download_authorized','quote',target_quote);
 return jsonb_build_object('quoteId',a.quote_id,'bucket',a.bucket,'objectPath',a.object_path,'sha256',a.sha256,'sizeBytes',a.size_bytes,'number',snapshot->'snapshot'->>'number');
end; $$;
revoke all on function public.authorize_quote_contract_download(uuid) from public,anon,service_role;
grant execute on function public.authorize_quote_contract_download(uuid) to authenticated;
create function public.record_quote_contract_download(target_quote uuid,expected_sha256 text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform public.get_quote_contract_snapshot(target_quote);
 if not exists(select 1 from private.quote_contract_pdf_archives where quote_id=target_quote and sha256=expected_sha256) then return false; end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(auth.uid(),'contract_pdf_downloaded','quote',target_quote);
 return true;
end; $$;
revoke all on function public.record_quote_contract_download(uuid,text) from public,anon,service_role;
grant execute on function public.record_quote_contract_download(uuid,text) to authenticated;
