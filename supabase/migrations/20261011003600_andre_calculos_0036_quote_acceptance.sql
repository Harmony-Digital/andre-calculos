-- Preparação contratual protegida. O produtor comercial de M2.12 deverá criar
-- o contexto junto da proposta e da reserva de agenda. Ainda não há produtor
-- nem permissão de escrita para a aplicação. CHECK 0033/emissor 0034 intactos.
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check(status in
 ('draft','awaiting_triage','in_triage','quoted','awaiting_payment','awaiting_documents','queued','in_analysis','awaiting_client','in_calculation','in_review','delivered','completed','in_adjustment','cancelled','refunded'));

create table private.quote_contract_contexts (
 quote_id uuid primary key references public.quotes(id),
 proposal jsonb not null,
 terms_version text not null,terms_text text not null,
 privacy_version text not null,privacy_text text not null,
 terms_sha256 text not null,privacy_sha256 text not null,context_hash text not null,
 prepared_by uuid not null references public.profiles(id),prepared_at timestamptz not null default now(),
 check(context_hash ~ '^[0-9a-f]{64}$'),
 check(terms_sha256 ~ '^[0-9a-f]{64}$' and privacy_sha256 ~ '^[0-9a-f]{64}$')
);
create index quote_contract_contexts_prepared_by_idx on private.quote_contract_contexts(prepared_by);
create table private.quote_acceptances (
 quote_id uuid primary key references public.quotes(id),
 actor_id uuid not null references public.profiles(id),
 context_hash text not null,number text not null,
 accepted_at timestamptz not null,accepted_ip inet not null,accepted_user_agent text not null,
 terms_version text not null,terms_sha256 text not null,
 privacy_version text not null,privacy_sha256 text not null,
 order_status text not null check(order_status in ('awaiting_payment','awaiting_documents','queued')),
 has_contract boolean not null,minimum_document_present boolean not null,
 deposit_cents bigint not null check(deposit_cents>=0)
);
create index quote_acceptances_actor_idx on private.quote_acceptances(actor_id);
create table private.quote_acceptance_requests (
 request_id uuid primary key,quote_id uuid not null references private.quote_acceptances(quote_id),
 actor_id uuid not null references public.profiles(id),context_hash text not null,
 created_at timestamptz not null default now()
);
create index quote_acceptance_requests_quote_idx on private.quote_acceptance_requests(quote_id);
create index quote_acceptance_requests_actor_idx on private.quote_acceptance_requests(actor_id);
alter table private.quote_contract_contexts enable row level security;
alter table private.quote_acceptances enable row level security;
alter table private.quote_acceptance_requests enable row level security;
revoke all on private.quote_contract_contexts,private.quote_acceptances,private.quote_acceptance_requests from public,anon,authenticated,service_role;

create function private.preserve_quote_contract_record() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'Registro contratual imutável'; end;$$;
revoke all on function private.preserve_quote_contract_record() from public,anon,authenticated,service_role;
create trigger contract_context_immutable before update on private.quote_contract_contexts for each row execute function private.preserve_quote_contract_record();
create trigger quote_acceptance_immutable before update on private.quote_acceptances for each row execute function private.preserve_quote_contract_record();
create trigger quote_acceptance_request_immutable before update on private.quote_acceptance_requests for each row execute function private.preserve_quote_contract_record();

create function private.prepare_quote_contract_context() returns trigger
language plpgsql security definer set search_path='' as $$
declare q public.quotes%rowtype; job public.orders%rowtype; cfg public.settings%rowtype;
 prices public.price_tables%rowtype; item jsonb; total numeric:=0;
begin
 select * into q from public.quotes where id=new.quote_id for update;
 select * into job from public.orders where id=q.order_id;
 select * into cfg from public.settings where singleton for share;
 select * into prices from public.price_tables where id=q.price_table_id for share;
 if q.id is null or q.is_simulation or q.proposal_snapshot is not null or q.accepted_at is not null
 or q.accepted_by is not null or q.accepted_ip is not null or q.accepted_user_agent is not null
 or job.status<>'quoted' or q.checklist_revision is null or prices.id is null or not prices.active or prices.is_example or prices.activated_at is null
 or not exists(select 1 from public.profiles where id=new.prepared_by and role='calculator')
 or jsonb_typeof(new.proposal) is distinct from 'object' or octet_length(new.proposal::text)>65536
 or new.proposal->>'schemaVersion' is distinct from '1' or new.proposal->>'mode' is distinct from 'commercial'
 or new.proposal->>'orderId' is distinct from job.id::text or new.proposal->>'processId' is distinct from job.process_id::text
 or new.proposal->>'checklistRevision' is distinct from q.checklist_revision::text
 or new.proposal->>'priceTableId' is distinct from prices.id::text or new.proposal->>'priceVersion' is distinct from prices.version::text
 or new.proposal->'priceParameters' is distinct from prices.parameters
 or new.proposal->>'settingsRevision' is distinct from cfg.revision::text
 or new.proposal->'professional' is distinct from jsonb_build_object('name',cfg.technical_name,'crcNumber',cfg.crc_number,'crcState',cfg.crc_state,'category',cfg.crc_category,'email',cfg.contact_email,'phone',cfg.contact_phone)
 or cfg.technical_name is null or cfg.crc_number is null or cfg.crc_state is null or cfg.crc_category is null or cfg.contact_email is null or cfg.contact_phone is null
 or new.proposal->>'conditions' is distinct from btrim(cfg.default_texts->>'conditions')
 or new.proposal#>>'{period,basis}' is distinct from 'reviewed' or new.proposal#>>'{calendar,basis}' is distinct from 'reviewed'
 or new.proposal#>>'{capacity,basis}' is distinct from 'reviewed'
 or new.proposal->'items' is distinct from q.items or jsonb_typeof(new.proposal->'items') is distinct from 'array'
 or jsonb_array_length(new.proposal->'items') not between 1 and 10
 or new.proposal->>'conditions' is null or length(btrim(new.proposal->>'conditions')) not between 1 and 4000
 or new.proposal->>'validityRule' is distinct from 'civil-days-sp-v1'
 or (new.proposal->>'validUntil')::timestamptz is distinct from q.valid_until
 or cfg.id is null or new.terms_version is distinct from cfg.approved_terms_version or new.privacy_version is distinct from cfg.approved_privacy_version
 or length(new.terms_version) not between 1 and 200 or new.terms_version ~* '^(rascunho|fixture)'
 or length(new.privacy_version) not between 1 and 200 or new.privacy_version ~* '^(rascunho|fixture)'
 or length(btrim(new.terms_text)) not between 1 and 64000 or length(btrim(new.privacy_text)) not between 1 and 64000 then
  raise exception 'Preparação contratual indisponível';
 end if;
 for item in select value from jsonb_array_elements(new.proposal->'items') loop
  if item->>'quantity' is null or item->>'quantity' !~ '^[0-9]+$' or (item->>'quantity')::numeric<1
   or item->>'unitCents' is null or item->>'unitCents' !~ '^[0-9]+$'
   or item->>'amountCents' is null or item->>'amountCents' !~ '^[0-9]+$'
   or (item->>'quantity')::numeric*(item->>'unitCents')::numeric<>(item->>'amountCents')::numeric then raise exception 'Valores inválidos'; end if;
  total:=total+(item->>'amountCents')::numeric;
 end loop;
 if total is distinct from (new.proposal->>'totalCents')::numeric or total<>q.total_cents or total<>job.total_cents
 or total not between 0 and 9007199254740991 or (new.proposal->>'depositCents')::numeric is distinct from ceil(total/2)
 or (new.proposal->>'balanceCents')::numeric is distinct from total-ceil(total/2) or job.deposit_cents<>ceil(total/2)
 or (new.proposal->>'deliveryDate')::date is distinct from job.delivery_date
 or (new.proposal->>'internalDueDate')::date is distinct from job.internal_due_date
 or job.delivery_date is null or job.internal_due_date is null
 or job.delivery_date>job.internal_due_date or job.internal_due_date>(new.proposal->>'dueDate')::date
 or (new.proposal->>'validUntil')::timestamptz<=(new.proposal->>'issuedAt')::timestamptz then raise exception 'Valores ou datas inválidos'; end if;
 new.terms_sha256:=encode(sha256(convert_to(new.terms_text,'UTF8')),'hex');
 new.privacy_sha256:=encode(sha256(convert_to(new.privacy_text,'UTF8')),'hex');
 new.context_hash:=encode(sha256(convert_to(jsonb_build_object('quoteId',q.id,'number',q.number,'proposal',new.proposal,
  'termsVersion',new.terms_version,'termsText',new.terms_text,'privacyVersion',new.privacy_version,'privacyText',new.privacy_text)::text,'UTF8')),'hex');
 return new;
end;
$$;
revoke all on function private.prepare_quote_contract_context() from public,anon,authenticated,service_role;
create trigger quote_contract_context_prepare before insert on private.quote_contract_contexts for each row execute function private.prepare_quote_contract_context();

create function private.quote_acceptance_result(receipt private.quote_acceptances) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('quoteId',receipt.quote_id,'number',receipt.number,'acceptedAt',receipt.accepted_at,
  'contextHash',receipt.context_hash,'status',receipt.order_status,'hasContract',receipt.has_contract,
  'minimumDocumentPresent',receipt.minimum_document_present,'depositCents',receipt.deposit_cents);
$$;
revoke all on function private.quote_acceptance_result(private.quote_acceptances) from public,anon,authenticated,service_role;

create function private.preserve_quote_contract_projection() returns trigger
language plpgsql security definer set search_path='' as $$
declare receipt private.quote_acceptances%rowtype;
begin
 if not exists(select 1 from private.quote_contract_contexts where quote_id=old.id) then return new; end if;
 if (to_jsonb(new)-array['updated_at','accepted_at','accepted_ip','accepted_user_agent','accepted_by']) is distinct from
   (to_jsonb(old)-array['updated_at','accepted_at','accepted_ip','accepted_user_agent','accepted_by']) then raise exception 'Proposta contratual imutável'; end if;
 select * into receipt from private.quote_acceptances where quote_id=old.id;
 if receipt.quote_id is null then
  if new.accepted_at is not null or new.accepted_by is not null or new.accepted_ip is not null or new.accepted_user_agent is not null then raise exception 'Aceite não registrado'; end if;
 elsif (new.accepted_at,new.accepted_by,new.accepted_ip,new.accepted_user_agent) is distinct from
   (receipt.accepted_at,receipt.actor_id,receipt.accepted_ip,receipt.accepted_user_agent) then raise exception 'Aceite imutável'; end if;
 return new;
end;
$$;
revoke all on function private.preserve_quote_contract_projection() from public,anon,authenticated,service_role;
create trigger quotes_preserve_contract before update on public.quotes for each row execute function private.preserve_quote_contract_projection();

create function public.get_quote_contract_context(target_quote uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q public.quotes%rowtype; ctx private.quote_contract_contexts%rowtype;
 job public.orders%rowtype; cfg public.settings%rowtype; receipt private.quote_acceptances%rowtype; problem text;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in ('client','calculator')) then raise exception 'Proposta indisponível'; end if;
 select * into q from public.quotes where id=target_quote and private.can_read_order(order_id);
 if q.id is null then raise exception 'Proposta indisponível'; end if;
 select * into ctx from private.quote_contract_contexts where quote_id=q.id;
 if ctx.quote_id is null then return null; end if;
 select * into job from public.orders where id=q.order_id;
 select * into cfg from public.settings where singleton;
 select * into receipt from private.quote_acceptances where quote_id=q.id;
 if receipt.quote_id is not null then problem:='Proposta já aceita.';
 elsif q.is_simulation then problem:='Ensaio fictício não permite contratação.';
 elsif q.valid_until<=statement_timestamp() then problem:='A validade desta proposta terminou. Solicite uma nova proposta.';
 elsif job.status<>'quoted' then problem:='Este pedido mudou de situação. Confira a pasta do processo.';
 elsif cfg.approved_terms_version is distinct from ctx.terms_version or cfg.approved_privacy_version is distinct from ctx.privacy_version then problem:='Os documentos legais precisam ser reconferidos antes da contratação.';
 end if;
 return jsonb_build_object('proposal',ctx.proposal,'contextHash',ctx.context_hash,
  'termsVersion',ctx.terms_version,'termsText',ctx.terms_text,'privacyVersion',ctx.privacy_version,'privacyText',ctx.privacy_text,
  'canAccept',problem is null,'blockMessage',problem,'status',job.status,
  'receipt',case when receipt.quote_id is null then null else private.quote_acceptance_result(receipt) end);
end;
$$;
revoke all on function public.get_quote_contract_context(uuid) from public,anon,service_role;
grant execute on function public.get_quote_contract_context(uuid) to authenticated;

create function public.accept_quote_system(actor uuid,target_quote uuid,expected_context text,request_id uuid,confirmed boolean,ip_address text,user_agent text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare customer public.clients%rowtype; job public.orders%rowtype; q public.quotes%rowtype;
 ctx private.quote_contract_contexts%rowtype; receipt private.quote_acceptances%rowtype;
 retry private.quote_acceptance_requests%rowtype; cfg public.settings%rowtype;
 document_id uuid; recipient uuid; customer_email text; at_time timestamptz; next_status text; captured_ip inet;
begin
 if actor is null or target_quote is null or request_id is null or confirmed is distinct from true
 or expected_context is null or expected_context !~ '^[0-9a-f]{64}$' then raise exception 'Aceite inválido'; end if;
 perform id from public.profiles where id=actor and role='client' for share;
 if not found then raise exception 'Acesso não autorizado'; end if;
 select * into customer from public.clients where owner_id=actor for update;
 select o.* into job from public.orders o join public.quotes proposal on proposal.order_id=o.id
  where proposal.id=target_quote and o.client_id=customer.id for update of o;
 if job.id is null then raise exception 'Proposta indisponível'; end if;
 select * into q from public.quotes where id=target_quote for update;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('accept:'||request_id::text,0));
 select * into retry from private.quote_acceptance_requests where quote_acceptance_requests.request_id=accept_quote_system.request_id;
 if retry.request_id is not null and (retry.actor_id,retry.quote_id,retry.context_hash) is distinct from (actor,target_quote,expected_context) then raise exception 'Solicitação já registrada com outros dados'; end if;
 select * into receipt from private.quote_acceptances where quote_id=target_quote;
 if receipt.quote_id is not null then
  if receipt.actor_id<>actor or receipt.context_hash<>expected_context then raise exception 'Aceite já registrado com outros dados'; end if;
  insert into private.quote_acceptance_requests(request_id,quote_id,actor_id,context_hash) values(request_id,target_quote,actor,expected_context) on conflict(request_id) do nothing;
  return private.quote_acceptance_result(receipt);
 end if;
 select * into ctx from private.quote_contract_contexts where quote_id=target_quote for share;
 if q.is_simulation or ctx.quote_id is null or ctx.proposal->>'mode' is distinct from 'commercial' then raise exception 'Proposta sem preparação contratual'; end if;
 if ctx.context_hash is distinct from expected_context then raise exception 'Proposta atualizada. Reconfira o conteúdo'; end if;
 if q.valid_until<=clock_timestamp() then raise exception 'Proposta vencida'; end if;
 if job.status<>'quoted' or q.accepted_at is not null then raise exception 'Pedido atualizado em outra sessão' using errcode='PT409'; end if;
 select * into cfg from public.settings where singleton for share;
 if cfg.id is null or cfg.approved_terms_version is distinct from ctx.terms_version or cfg.approved_privacy_version is distinct from ctx.privacy_version then raise exception 'Documentos legais indisponíveis'; end if;
 if job.total_cents is distinct from (ctx.proposal->>'totalCents')::bigint or job.deposit_cents is distinct from (ctx.proposal->>'depositCents')::bigint
 or job.delivery_date is distinct from (ctx.proposal->>'deliveryDate')::date or job.internal_due_date is distinct from (ctx.proposal->>'internalDueDate')::date then raise exception 'Pedido atualizado em outra sessão' using errcode='PT409'; end if;
 if ip_address is null or ip_address='' or length(ip_address)>45 or user_agent is null or length(user_agent)>512 then raise exception 'Metadados de aceite indisponíveis'; end if;
 captured_ip:=ip_address::inet;
 if masklen(captured_ip)<>(case family(captured_ip) when 4 then 32 else 128 end) then raise exception 'IP inválido'; end if;
 select id into document_id from public.files where process_id=job.process_id and (order_id is null or order_id=job.id)
  and folder in ('case','client') and upload_status='uploaded' and size_bytes>0 and sha256 is not null and sha256=expected_sha256
  order by id limit 1 for share;
 next_status:=case when customer.has_contract and document_id is not null then 'queued' when customer.has_contract then 'awaiting_documents' else 'awaiting_payment' end;
 at_time:=clock_timestamp();
 insert into private.quote_acceptances(quote_id,actor_id,context_hash,number,accepted_at,accepted_ip,accepted_user_agent,terms_version,terms_sha256,privacy_version,privacy_sha256,order_status,has_contract,minimum_document_present,deposit_cents)
 values(q.id,actor,ctx.context_hash,q.number,at_time,captured_ip,user_agent,ctx.terms_version,ctx.terms_sha256,ctx.privacy_version,ctx.privacy_sha256,next_status,customer.has_contract,document_id is not null,job.deposit_cents) returning * into receipt;
 insert into private.quote_acceptance_requests(request_id,quote_id,actor_id,context_hash) values(request_id,q.id,actor,ctx.context_hash);
 update public.quotes set accepted_at=at_time,accepted_by=actor,accepted_ip=captured_ip,accepted_user_agent=user_agent where id=q.id;
 update public.orders set status=next_status where id=job.id;
 perform private.record_event(job.process_id,'quote_accepted',jsonb_build_object('quote_id',q.id,'number',q.number,'status',next_status),actor,job.id);
 if next_status='queued' then perform private.record_event(job.process_id,'order_queued',jsonb_build_object('code',job.code),actor,job.id); end if;
 insert into public.audit_log(actor_id,action,target_type,target_id,ip) values(actor,'quote_accepted','quote',q.id,captured_ip);
 select email into customer_email from auth.users where id=actor;
 if nullif(btrim(customer_email),'') is null then raise exception 'Contato do cliente indisponível'; end if;
 insert into public.notifications(channel,recipient,template,data,dedup_key) values('email',customer_email,'quote_accepted_client',
  jsonb_build_object('quote_id',q.id,'number',q.number,'order_id',job.id,'code',job.code,'process_id',job.process_id,'status',next_status,'deposit_cents',job.deposit_cents,'path','/app/orcamentos/'||q.id::text),
  'accept:'||q.id::text||':client:email');
 select r.profile_id into recipient from private.calculator_notification_recipient r join public.profiles p on p.id=r.profile_id and p.role='calculator' where r.singleton for share of r,p;
 if recipient is not null then
  perform private.notify_calculator('quote_accepted',jsonb_build_object('quote_id',q.id,'number',q.number,'order_id',job.id,'code',job.code,'process_id',job.process_id,'status',next_status,'path','/painel/processos/'||job.process_id::text),'accept:'||q.id::text||':calculator');
  if next_status='queued' then perform private.notify_calculator('order_queued',jsonb_build_object('order_id',job.id,'code',job.code,'process_id',job.process_id,'internal_due_date',job.internal_due_date,'path','/painel/processos/'||job.process_id::text),'queued:'||job.id::text); end if;
 end if;
 return private.quote_acceptance_result(receipt);
end;
$$;
revoke all on function public.accept_quote_system(uuid,uuid,text,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.accept_quote_system(uuid,uuid,text,uuid,boolean,text,text) to service_role;

create or replace function public.get_quote_pdf_export(target_quote uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); q public.quotes%rowtype; snapshot jsonb;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role in ('client','calculator')) then raise exception 'Proposta indisponível'; end if;
 select * into q from public.quotes where id=target_quote and private.can_read_order(order_id) for share;
 if q.id is null then raise exception 'Proposta indisponível'; end if;
 snapshot:=q.proposal_snapshot;
 if snapshot is null then select proposal into snapshot from private.quote_contract_contexts where quote_id=q.id; end if;
 if snapshot is null then raise exception 'Proposta indisponível'; end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'quote_pdf_requested','quote',q.id);
 return jsonb_build_object('id',q.id,'number',q.number,'proposal',snapshot);
end;
$$;
