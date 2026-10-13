-- Recusa pré-contratação, sem cobranças ou alteração da proposta congelada.
create table private.quote_rejections (
 quote_id uuid primary key references public.quotes(id),
 order_id uuid not null references public.orders(id), process_id uuid not null references public.processes(id),
 actor_id uuid not null references public.profiles(id), context_hash text not null check(context_hash ~ '^[0-9a-f]{64}$'),
 number text not null, reason text not null check(length(reason)<=500 and reason=private.trim_client_contract_reason(reason)),
 expected_revision integer not null check(expected_revision>=0), applied_revision integer not null check(applied_revision=expected_revision+1),
 rejected_at timestamptz not null, rejected_ip inet not null, rejected_user_agent text not null check(length(rejected_user_agent)<=512),
 unique(order_id)
);
create index quote_rejections_process_idx on private.quote_rejections(process_id);
create index quote_rejections_actor_idx on private.quote_rejections(actor_id);
create table private.quote_rejection_requests (
 request_id uuid primary key, quote_id uuid not null references private.quote_rejections(quote_id),
 payload jsonb not null, created_at timestamptz not null default now()
);
create index quote_rejection_requests_quote_idx on private.quote_rejection_requests(quote_id);
alter table private.quote_rejections enable row level security;
alter table private.quote_rejection_requests enable row level security;
revoke all on private.quote_rejections,private.quote_rejection_requests from public,anon,authenticated,service_role;
create trigger quote_rejection_immutable before update on private.quote_rejections for each row execute function private.preserve_quote_contract_record();
create trigger quote_rejection_request_immutable before update on private.quote_rejection_requests for each row execute function private.preserve_quote_contract_record();
create function private.quote_rejection_result(r private.quote_rejections) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('quoteId',r.quote_id,'orderId',r.order_id,'processId',r.process_id,'number',r.number,
 'contextHash',r.context_hash,'reason',r.reason,'expectedRevision',r.expected_revision,'revision',r.applied_revision,
 'rejectedAt',r.rejected_at,'status','cancelled')
$$;
revoke all on function private.quote_rejection_result(private.quote_rejections) from public,anon,authenticated,service_role;

create function private.can_reject_quote(q public.quotes,job public.orders,ctx private.quote_contract_contexts) returns boolean
language sql stable set search_path='' as $$
 select (q.id is not null and job.id is not null and ctx.quote_id=q.id and q.order_id=job.id and not q.is_simulation
 and job.status='quoted' and ctx.proposal->>'mode'='commercial'
 and ctx.proposal->>'orderId'=job.id::text and ctx.proposal->>'processId'=job.process_id::text
 and ctx.context_hash=encode(sha256(convert_to(jsonb_build_object('quoteId',q.id,'number',q.number,'proposal',ctx.proposal,
  'termsVersion',ctx.terms_version,'termsText',ctx.terms_text,'privacyVersion',ctx.privacy_version,'privacyText',ctx.privacy_text)::text,'UTF8')),'hex')
 and job.price_table_id::text=ctx.proposal->>'priceTableId' and job.total_cents::text=ctx.proposal->>'totalCents'
 and job.deposit_cents::text=ctx.proposal->>'depositCents' and job.delivery_date::text=ctx.proposal->>'deliveryDate'
 and job.internal_due_date::text=ctx.proposal->>'internalDueDate'
 and (select count(*) from public.quotes where order_id=job.id)=1
 and not exists(select 1 from public.quotes x where x.order_id=job.id and
  (x.accepted_at is not null or x.accepted_by is not null or x.accepted_ip is not null or x.accepted_user_agent is not null))
 and not exists(select 1 from private.quote_acceptances a join public.quotes x on x.id=a.quote_id where x.order_id=job.id)
 and not exists(select 1 from private.quote_rejections where order_id=job.id)
 and not exists(select 1 from public.payments where order_id=job.id)) is true
$$;
revoke all on function private.can_reject_quote(public.quotes,public.orders,private.quote_contract_contexts) from public,anon,authenticated,service_role;

create function public.reject_quote_system(actor uuid,target_quote uuid,expected_context text,expected_revision integer,request_id uuid,confirmed boolean,reason text,ip_address text,user_agent text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare customer public.clients%rowtype; job public.orders%rowtype; q public.quotes%rowtype;
 ctx private.quote_contract_contexts%rowtype; r private.quote_rejections%rowtype; retry private.quote_rejection_requests%rowtype;
 canonical jsonb; normalized text; captured_ip inet;
begin
 if auth.role() is distinct from 'service_role' or actor is null or target_quote is null or request_id is null then raise exception 'Acesso não autorizado'; end if;
 if confirmed is distinct from true or expected_context is null or expected_context !~ '^[0-9a-f]{64}$'
 or expected_revision is null or expected_revision not between 0 and 2147483646 or reason is null then raise exception 'Recusa inválida'; end if;
 normalized:=private.trim_client_contract_reason(reason);
 if length(normalized)>500 then raise exception 'Motivo muito longo'; end if;
 if ip_address is null or ip_address='' or length(ip_address)>45 or user_agent is null or length(user_agent)>512 then raise exception 'Metadados indisponíveis'; end if;
 captured_ip:=ip_address::inet;
 if masklen(captured_ip)<>(case family(captured_ip) when 4 then 32 else 128 end) then raise exception 'IP inválido'; end if;
 perform id from public.profiles where id=actor and role='client' for share;
 if not found then raise exception 'Acesso não autorizado'; end if;
 select * into customer from public.clients where owner_id=actor for update;
 select o.* into job from public.orders o join public.quotes x on x.order_id=o.id where x.id=target_quote and o.client_id=customer.id for update of o;
 if job.id is null or not exists(select 1 from public.processes where id=job.process_id and client_id=customer.id) then raise exception 'Proposta indisponível'; end if;
 select * into q from public.quotes where id=target_quote and order_id=job.id for update;
 if q.id is null then raise exception 'Proposta indisponível'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quote-reject:'||request_id::text,0));
 canonical:=jsonb_build_object('actor',actor,'quoteId',target_quote,'contextHash',expected_context,'revision',expected_revision,'reason',normalized);
 select * into retry from private.quote_rejection_requests x where x.request_id=reject_quote_system.request_id;
 if retry.request_id is not null then
  if retry.payload is distinct from canonical then raise sqlstate 'PT409' using message='Tentativa já registrada com outros dados'; end if;
  select * into r from private.quote_rejections where quote_id=retry.quote_id;
  return private.quote_rejection_result(r);
 end if;
 select * into r from private.quote_rejections where order_id=job.id;
 if r.quote_id is not null then
  if (r.quote_id,r.actor_id,r.context_hash,r.expected_revision,r.reason) is distinct from (target_quote,actor,expected_context,expected_revision,normalized) then raise sqlstate 'PT409' using message='Recusa já registrada com outros dados'; end if;
  insert into private.quote_rejection_requests(request_id,quote_id,payload) values(request_id,r.quote_id,canonical);
  return private.quote_rejection_result(r);
 end if;
 select * into ctx from private.quote_contract_contexts where quote_id=q.id for share;
 if ctx.context_hash is distinct from expected_context or job.status_revision<>expected_revision or
  private.can_reject_quote(q,job,ctx) is not true then raise sqlstate 'PT409' using message='Proposta atualizada ou indisponível para recusa'; end if;
 insert into private.quote_rejections(quote_id,order_id,process_id,actor_id,context_hash,number,reason,expected_revision,applied_revision,rejected_at,rejected_ip,rejected_user_agent)
 values(q.id,job.id,job.process_id,actor,ctx.context_hash,q.number,normalized,expected_revision,expected_revision+1,clock_timestamp(),captured_ip,user_agent) returning * into r;
 insert into private.quote_rejection_requests(request_id,quote_id,payload) values(request_id,q.id,canonical);
 update public.orders set status='cancelled',resume_status=null where id=job.id;
 perform private.record_event(job.process_id,'status_changed',jsonb_build_object('from','quoted','to','cancelled','code',job.code,'operation','reject_quote','quote_id',q.id,'number',q.number,'note',nullif(normalized,'')),actor,job.id,request_id);
 insert into public.audit_log(actor_id,action,target_type,target_id,ip) values(actor,'quote_rejected','quote',q.id,captured_ip);
 return private.quote_rejection_result(r);
end;
$$;
revoke all on function public.reject_quote_system(uuid,uuid,text,integer,uuid,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.reject_quote_system(uuid,uuid,text,integer,uuid,boolean,text,text,text) to service_role;

-- Guardar o corpo já testado; a única entrada pública acrescenta o bloqueio de recusa.
alter function public.accept_quote_system(uuid,uuid,text,uuid,boolean,text,text) set schema private;
revoke all on function private.accept_quote_system(uuid,uuid,text,uuid,boolean,text,text) from public,anon,authenticated,service_role;
create function public.accept_quote_system(actor uuid,target_quote uuid,expected_context text,request_id uuid,confirmed boolean,ip_address text,user_agent text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare customer public.clients%rowtype; job public.orders%rowtype;
begin
 if auth.role() is distinct from 'service_role' or actor is null or target_quote is null then raise exception 'Acesso não autorizado'; end if;
 perform id from public.profiles where id=actor and role='client' for share;
 if not found then raise exception 'Acesso não autorizado'; end if;
 select * into customer from public.clients where owner_id=actor for update;
 select o.* into job from public.orders o join public.quotes q on q.order_id=o.id where q.id=target_quote and o.client_id=customer.id for update of o;
 if job.id is null then raise exception 'Proposta indisponível'; end if;
 perform id from public.quotes where id=target_quote and order_id=job.id for update;
 if not found then raise exception 'Proposta indisponível'; end if;
 if exists(select 1 from private.quote_rejections where order_id=job.id) then raise sqlstate 'PT409' using message='Proposta já recusada'; end if;
 return private.accept_quote_system(actor,target_quote,expected_context,request_id,confirmed,ip_address,user_agent);
end;
$$;
revoke all on function public.accept_quote_system(uuid,uuid,text,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.accept_quote_system(uuid,uuid,text,uuid,boolean,text,text) to service_role;

alter function public.get_quote_contract_context(uuid) set schema private;
revoke all on function private.get_quote_contract_context(uuid) from public,anon,authenticated,service_role;
create function public.get_quote_contract_context(target_quote uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; q public.quotes%rowtype; job public.orders%rowtype; ctx private.quote_contract_contexts%rowtype;
 r private.quote_rejections%rowtype; eligible boolean;
begin
 result:=private.get_quote_contract_context(target_quote);
 if result is null then return null; end if;
 select * into q from public.quotes where id=target_quote;
 select * into job from public.orders where id=q.order_id;
 select * into ctx from private.quote_contract_contexts where quote_id=q.id;
 select * into r from private.quote_rejections where order_id=job.id;
 eligible:=private.can_reject_quote(q,job,ctx) and exists(select 1 from public.profiles where id=auth.uid() and role='client')
  and exists(select 1 from public.clients where id=job.client_id and owner_id=auth.uid());
 return result || jsonb_build_object('canAccept',(result->>'canAccept')::boolean and r.quote_id is null,
 'blockMessage',case when r.quote_id is not null then 'Proposta recusada pelo cliente.' else result->>'blockMessage' end,
 'canReject',eligible,'rejectionBlockMessage',case when eligible or r.quote_id is not null then null else 'A recusa está indisponível nesta situação. Confira a pasta do processo.' end,
 'statusRevision',job.status_revision,'rejectionReceipt',case when r.quote_id is null then null else private.quote_rejection_result(r) end);
end;
$$;
revoke all on function public.get_quote_contract_context(uuid) from public,anon,service_role;
grant execute on function public.get_quote_contract_context(uuid) to authenticated;
