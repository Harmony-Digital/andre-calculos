-- Reserva de trabalho e metadados históricos; esta migration não produz ready.
create table private.quote_contract_pdf_jobs (
 quote_id uuid primary key references private.quote_contract_generation_intents(quote_id) on delete cascade,
 snapshot_sha256 text not null,
 renderer_version text not null check(renderer_version='contract-pdf-v1'),
 epoch bigint not null check(epoch>0), claim_id uuid not null, lease_until timestamptz not null,
 state text not null check(state in('processing','prepared','failed')),
 error_code text check(error_code in('render_failed','transport_failed','integrity_conflict')),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(quote_id,snapshot_sha256) references private.quote_contract_snapshots(quote_id,snapshot_sha256) on delete cascade,
 unique(quote_id,snapshot_sha256,renderer_version),
 check((state='failed')=(error_code is not null))
);
create table private.quote_contract_pdf_claims (
 claim_id uuid primary key, quote_id uuid not null references private.quote_contract_pdf_jobs(quote_id) on delete cascade,
 epoch bigint not null, lease_until timestamptz not null, result jsonb not null
);
create index contract_pdf_claim_quote_idx on private.quote_contract_pdf_claims(quote_id);
create table private.quote_contract_pdf_metadata (
 quote_id uuid primary key, snapshot_sha256 text not null, renderer_version text not null,
 bucket text not null default 'processos' check(bucket='processos'),
 object_path text generated always as ('contracts/'||quote_id::text||'/'||snapshot_sha256||'/'||renderer_version||'.pdf') stored,
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 size_bytes bigint not null check(size_bytes between 1 and 50000000),
 prepared_at timestamptz not null default clock_timestamp(),
 foreign key(quote_id,snapshot_sha256,renderer_version) references private.quote_contract_pdf_jobs(quote_id,snapshot_sha256,renderer_version) on delete cascade,
 unique(quote_id,snapshot_sha256,renderer_version)
);
alter table private.quote_contract_pdf_jobs enable row level security;
alter table private.quote_contract_pdf_claims enable row level security;
alter table private.quote_contract_pdf_metadata enable row level security;
revoke all on private.quote_contract_pdf_jobs,private.quote_contract_pdf_claims,private.quote_contract_pdf_metadata from public,anon,authenticated,service_role;
create trigger contract_pdf_claim_immutable before update on private.quote_contract_pdf_claims for each row execute function private.preserve_quote_contract_record();
create trigger contract_pdf_metadata_immutable before update on private.quote_contract_pdf_metadata for each row execute function private.preserve_quote_contract_record();

create function private.require_contract_pdf_worker() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Processador de contrato indisponível' using errcode='PT404'; end if;
end; $$;
revoke all on function private.require_contract_pdf_worker() from public,anon,authenticated,service_role;
create function private.guard_contract_pdf_job() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.quote_id,new.snapshot_sha256,new.renderer_version,new.created_at) is distinct from (old.quote_id,old.snapshot_sha256,old.renderer_version,old.created_at) then
  raise exception 'Identidade do contrato é imutável';
 end if;
 if new.state='prepared' and not exists(select 1 from private.quote_contract_pdf_metadata where quote_id=new.quote_id) then
  raise exception 'Metadados do contrato não conferidos';
 end if;
 return new;
end; $$;
revoke all on function private.guard_contract_pdf_job() from public,anon,authenticated,service_role;
create trigger contract_pdf_job_identity before insert or update on private.quote_contract_pdf_jobs for each row execute function private.guard_contract_pdf_job();

create function public.claim_quote_contract_pdf(target_quote uuid,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare intent private.quote_contract_generation_intents%rowtype; j private.quote_contract_pdf_jobs%rowtype;
 c private.quote_contract_pdf_claims%rowtype; m private.quote_contract_pdf_metadata%rowtype; result jsonb; at_time timestamptz;
begin
 perform private.require_contract_pdf_worker();
 if target_quote is null or request_id is null then raise exception 'Solicitação inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended('contract_pdf_claim:'||request_id::text,0));
 select * into intent from private.quote_contract_generation_intents where quote_id=target_quote for update;
 if intent.quote_id is null then raise exception 'Contrato indisponível' using errcode='PT404'; end if;
 select * into j from private.quote_contract_pdf_jobs where quote_id=target_quote for update;
 select * into c from private.quote_contract_pdf_claims where claim_id=request_id;
 at_time:=clock_timestamp();
 if c.claim_id is not null then
  if c.quote_id<>target_quote then raise exception 'Solicitação divergente' using errcode='PT409'; end if;
  if j.epoch<>c.epoch or j.claim_id<>request_id or j.lease_until<=at_time or j.state='failed' then
   return jsonb_build_object('state','stale','quoteId',target_quote);
  end if;
  result:=c.result;
 else
  if j.state='failed' and j.error_code='integrity_conflict' then return jsonb_build_object('state','quarantined','quoteId',target_quote); end if;
  if j.state in('processing','prepared') and j.lease_until>at_time then return jsonb_build_object('state','busy','quoteId',target_quote); end if;
  if j.quote_id is null then
   insert into private.quote_contract_pdf_jobs(quote_id,snapshot_sha256,renderer_version,epoch,claim_id,lease_until,state)
    values(target_quote,intent.snapshot_sha256,'contract-pdf-v1',1,request_id,at_time+interval '2 minutes','processing') returning * into j;
  else
   update private.quote_contract_pdf_jobs set epoch=epoch+1,claim_id=request_id,lease_until=at_time+interval '2 minutes',state='processing',error_code=null where quote_id=target_quote returning * into j;
  end if;
  select * into m from private.quote_contract_pdf_metadata where quote_id=target_quote;
  result:=jsonb_build_object('state','claimed','quoteId',target_quote,'claimId',j.claim_id,'epoch',j.epoch,'leaseUntil',j.lease_until,
   'rendererVersion',j.renderer_version,'snapshotHash',j.snapshot_sha256,
   'objectPath','contracts/'||j.quote_id::text||'/'||j.snapshot_sha256||'/'||j.renderer_version||'.pdf',
   'prepared',case when m.quote_id is null then null else jsonb_build_object('sha256',m.sha256,'sizeBytes',m.size_bytes) end);
  insert into private.quote_contract_pdf_claims values(request_id,target_quote,j.epoch,j.lease_until,result);
  insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'contract_pdf_claimed','quote',target_quote);
 end if;
 return result||jsonb_build_object('archive',(select jsonb_build_object('snapshotHash',snapshot_sha256,'snapshot',snapshot) from private.quote_contract_snapshots where quote_id=target_quote));
end; $$;
revoke all on function public.claim_quote_contract_pdf(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_quote_contract_pdf(uuid,uuid) to service_role;

create function public.prepare_quote_contract_pdf(target_quote uuid,worker_claim uuid,expected_epoch bigint,pdf_sha256 text,pdf_size bigint) returns boolean
language plpgsql security definer set search_path='' as $$
declare j private.quote_contract_pdf_jobs%rowtype; m private.quote_contract_pdf_metadata%rowtype;
begin
 perform private.require_contract_pdf_worker();
 if pdf_sha256 is null or pdf_sha256 !~ '^[0-9a-f]{64}$' or pdf_size is null or pdf_size not between 1 and 50000000 then raise exception 'PDF inválido'; end if;
 select * into j from private.quote_contract_pdf_jobs where quote_id=target_quote for update;
 if j.quote_id is null or j.claim_id is distinct from worker_claim or j.epoch is distinct from expected_epoch or j.lease_until<=clock_timestamp() or j.state not in('processing','prepared') then return false; end if;
 select * into m from private.quote_contract_pdf_metadata where quote_id=target_quote;
 if m.quote_id is not null then
  if m.sha256<>pdf_sha256 or m.size_bytes<>pdf_size then raise exception 'PDF histórico divergente' using errcode='PT409'; end if;
 else
  insert into private.quote_contract_pdf_metadata(quote_id,snapshot_sha256,renderer_version,sha256,size_bytes) values(j.quote_id,j.snapshot_sha256,j.renderer_version,pdf_sha256,pdf_size);
  insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'contract_pdf_prepared','quote',target_quote);
 end if;
 update private.quote_contract_pdf_jobs set state='prepared',error_code=null where quote_id=target_quote;
 return true;
end; $$;
revoke all on function public.prepare_quote_contract_pdf(uuid,uuid,bigint,text,bigint) from public,anon,authenticated;
grant execute on function public.prepare_quote_contract_pdf(uuid,uuid,bigint,text,bigint) to service_role;

create function public.fail_quote_contract_pdf(target_quote uuid,worker_claim uuid,expected_epoch bigint,failure_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare j private.quote_contract_pdf_jobs%rowtype;
begin
 perform private.require_contract_pdf_worker();
 if failure_code is null or failure_code not in('render_failed','transport_failed','integrity_conflict') then raise exception 'Falha inválida'; end if;
 select * into j from private.quote_contract_pdf_jobs where quote_id=target_quote for update;
 if j.quote_id is null or j.claim_id is distinct from worker_claim or j.epoch is distinct from expected_epoch then return false; end if;
 if j.state='failed' then return j.error_code=failure_code; end if;
 if j.lease_until<=clock_timestamp() or j.state not in('processing','prepared') then return false; end if;
 update private.quote_contract_pdf_jobs set state='failed',error_code=failure_code where quote_id=target_quote;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'contract_pdf_generation_failed','quote',target_quote);
 return true;
end; $$;
revoke all on function public.fail_quote_contract_pdf(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.fail_quote_contract_pdf(uuid,uuid,bigint,text) to service_role;

create function public.get_quote_contract_pdf_state(target_quote uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j private.quote_contract_pdf_jobs%rowtype;
begin
 perform public.get_quote_contract_snapshot(target_quote);
 select * into j from private.quote_contract_pdf_jobs where quote_id=target_quote;
 return jsonb_build_object('quoteId',target_quote,'state',case when j.state='failed' then 'failed' when j.state='processing' and j.lease_until>now() then 'processing' else 'pending' end);
end; $$;
revoke all on function public.get_quote_contract_pdf_state(uuid) from public,anon,service_role;
grant execute on function public.get_quote_contract_pdf_state(uuid) to authenticated;
