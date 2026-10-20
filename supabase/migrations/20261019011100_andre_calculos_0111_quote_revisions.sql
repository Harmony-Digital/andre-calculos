-- M3.07: sucessão explícita; snapshots e recibos anteriores permanecem intactos.
alter table public.quotes add column version integer not null default 1 check(version>0),
 add column supersedes_id uuid references public.quotes(id),
 add constraint quotes_version_parent check((version=1 and supersedes_id is null) or (version>1 and supersedes_id is not null));
create unique index quotes_one_successor on public.quotes(supersedes_id) where supersedes_id is not null;
drop index public.quotes_initial_checklist_version;
create unique index quotes_initial_checklist_version on public.quotes(order_id,checklist_revision) where checklist_revision is not null and version=1;

create table private.quote_adjustments (
 request_id uuid primary key, previous_quote_id uuid not null unique references public.quotes(id),
 quote_id uuid not null unique references public.quotes(id), actor_id uuid not null references public.profiles(id),
 reason text not null check(length(reason) between 1 and 1000 and reason=private.trim_client_contract_reason(reason)),
 payload jsonb not null, receipt jsonb not null, created_at timestamptz not null default clock_timestamp(),
 check(previous_quote_id<>quote_id)
);
create index quote_adjustments_actor_idx on private.quote_adjustments(actor_id);
alter table private.quote_adjustments enable row level security;
revoke all on private.quote_adjustments from public,anon,authenticated,service_role;
create trigger quote_adjustment_immutable before update on private.quote_adjustments for each row execute function private.preserve_quote_contract_record();

create function private.is_current_quote(target_quote uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select not exists(select 1 from public.quotes child where child.supersedes_id=q.id)
 and 1=(select count(*) from public.quotes candidate where candidate.order_id=q.order_id
  and not exists(select 1 from public.quotes child where child.supersedes_id=candidate.id))
 from public.quotes q where q.id=target_quote),false)
$$;
revoke all on function private.is_current_quote(uuid) from public,anon,authenticated,service_role;
create function private.guard_quote_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare parent public.quotes%rowtype;
begin
 if TG_OP='UPDATE' then
  if (new.version,new.supersedes_id) is distinct from (old.version,old.supersedes_id) then raise exception 'Versão imutável'; end if;
 elsif new.supersedes_id is not null then
  select * into parent from public.quotes where id=new.supersedes_id;
  if parent.id is null or parent.order_id<>new.order_id or parent.version+1<>new.version
   or private.is_current_quote(parent.id) is not true then raise exception 'Sucessão inválida'; end if;
 end if;
 return new;
end;
$$;
revoke all on function private.guard_quote_version() from public,anon,authenticated,service_role;
create trigger quotes_guard_version before insert or update on public.quotes for each row execute function private.guard_quote_version();

-- Replay da emissão inicial não escolhe uma sucessora arbitrária.
create or replace function public.create_checklist_quote_system(
 actor uuid,target_order uuid,expected_checklist_revision integer,request_id uuid,
 expected_settings_revision integer default null,expected_price_table uuid default null,
 proposal jsonb default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare owner uuid; ord public.orders%rowtype; chk public.checklists%rowtype;
 cfg public.settings%rowtype; prices public.price_tables%rowtype;
 receipt private.quote_requests%rowtype; existing public.quotes%rowtype;
 item jsonb; sum_cents numeric:=0; total numeric; deposit numeric; balance numeric;
 issued timestamptz; expires timestamptz; delivery date; internal_due date; due date;
 serial bigint; quote_year integer; quote_number text; created_id uuid;
begin
 if actor is null or target_order is null or request_id is null or expected_checklist_revision is null or expected_checklist_revision<1
 or not exists(select 1 from public.profiles where id=actor and role='client') then raise exception 'Acesso não autorizado'; end if;
 -- A mesma ordem de locks de save_checklist_draft evita corrida com a edição.
 select id into owner from public.clients where owner_id=actor for update;
 select * into ord from public.orders where id=target_order and client_id=owner for update;
 if ord.id is null then raise exception 'Pedido indisponível'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quote:'||request_id::text,0));
 select * into receipt from private.quote_requests r where r.request_id=create_checklist_quote_system.request_id;
 if receipt.request_id is not null then
  if (receipt.actor_id,receipt.order_id,receipt.checklist_revision) is distinct from (actor,target_order,expected_checklist_revision) then raise exception 'Solicitação já registrada com outros dados'; end if;
  return receipt.quote_id;
 end if;
 select * into existing from public.quotes where order_id=target_order and checklist_revision=expected_checklist_revision and version=1;
 if existing.id is not null then
  if proposal is not null then
   insert into private.quote_requests(request_id,actor_id,order_id,checklist_revision,quote_id) values(request_id,actor,target_order,expected_checklist_revision,existing.id);
  end if;
  return existing.id;
 end if;
 if proposal is null then return null; end if;
 if ord.status<>'draft' then raise exception 'Pedido indisponível'; end if;
 select * into chk from public.checklists where order_id=target_order for update;
 if chk.id is null or chk.completed_step<>8 or chk.revision<>expected_checklist_revision or chk.schema_version<>1 then raise exception 'Checklist atualizado em outra sessão'; end if;
 perform id from public.processes where id=ord.process_id for update;
 select * into cfg from public.settings where singleton for share;
 select * into prices from public.price_tables where id=expected_price_table and active for share;
 if cfg.id is null or expected_settings_revision is null or cfg.quote_valid_days is null or cfg.revision is distinct from expected_settings_revision or prices.id is null then raise exception 'Configurações atualizadas em outra sessão'; end if;
 if jsonb_typeof(proposal) is distinct from 'object' or octet_length(proposal::text)>65536
 or proposal->>'schemaVersion' is distinct from '1' or proposal->>'mode' is distinct from 'fixture'
 or proposal->>'orderId' is distinct from ord.id::text or proposal->>'processId' is distinct from ord.process_id::text
 or proposal->>'checklistRevision' is distinct from chk.revision::text or proposal->>'settingsRevision' is distinct from cfg.revision::text
 or proposal->>'priceTableId' is distinct from prices.id::text or proposal->>'priceVersion' is distinct from prices.version::text
 or proposal->'priceParameters' is distinct from prices.parameters
 or proposal->'professional' is distinct from jsonb_build_object('name',cfg.technical_name,'crcNumber',cfg.crc_number,'crcState',cfg.crc_state,'category',cfg.crc_category,'email',cfg.contact_email,'phone',cfg.contact_phone)
 or proposal->>'conditions' is distinct from btrim(cfg.default_texts->>'conditions')
 or proposal->'complexityLimits' is distinct from jsonb_build_object('wageThreshold',(cfg.complexity_limits->>'wages')::integer,'pageThreshold',(cfg.complexity_limits->>'pages')::integer,'claimantThreshold',(cfg.complexity_limits->>'claimants')::integer)
 or proposal->>'validityDays' is distinct from cfg.quote_valid_days::text or proposal->>'slackDays' is distinct from cfg.slack_days::text
 or proposal->>'validityRule' is distinct from 'civil-days-sp-v1'
 or proposal#>>'{period,basis}' is distinct from 'fixture' or proposal#>>'{calendar,basis}' is distinct from 'fixture' or proposal#>>'{capacity,basis}' is distinct from 'fixture'
 or jsonb_typeof(proposal->'items') is distinct from 'array' or jsonb_array_length(proposal->'items') not between 1 and 10 then raise exception 'Proposta inválida'; end if;
 for item in select value from jsonb_array_elements(proposal->'items') loop
  if jsonb_typeof(item) is distinct from 'object' or item->>'quantity' is null or item->>'quantity' !~ '^[0-9]+$'
   or item->>'unitCents' is null or item->>'unitCents' !~ '^[0-9]+$' or item->>'amountCents' is null or item->>'amountCents' !~ '^[0-9]+$'
   or (item->>'quantity')::numeric<1 or (item->>'quantity')::numeric*(item->>'unitCents')::numeric<>(item->>'amountCents')::numeric then raise exception 'Valores inválidos'; end if;
  sum_cents:=sum_cents+(item->>'amountCents')::numeric;
 end loop;
 total:=(proposal->>'totalCents')::numeric; deposit:=(proposal->>'depositCents')::numeric; balance:=(proposal->>'balanceCents')::numeric;
 if total is null or deposit is null or balance is null or total<>sum_cents or total not between 0 and 9007199254740991
 or deposit<>ceil(total/2) or balance<>total-deposit or trunc(total)<>total then raise exception 'Valores inválidos'; end if;
 issued:=(proposal->>'issuedAt')::timestamptz; expires:=(proposal->>'validUntil')::timestamptz;
 delivery:=(proposal->>'deliveryDate')::date; internal_due:=(proposal->>'internalDueDate')::date; due:=(proposal->>'dueDate')::date;
 if issued is null or expires is null or delivery is null or internal_due is null or due is null
 or issued>clock_timestamp()+interval '5 seconds' or issued<clock_timestamp()-interval '5 minutes'
 or expires<>issued+make_interval(days=>cfg.quote_valid_days)
 or delivery<=(issued at time zone 'America/Sao_Paulo')::date or delivery>internal_due or internal_due>due then raise exception 'Datas inválidas'; end if;
 quote_year:=extract(year from issued at time zone 'America/Sao_Paulo')::integer;
 insert into private.quote_counters(year,last_number) values(quote_year,1)
 on conflict(year) do update set last_number=quote_counters.last_number+1 returning last_number into serial;
 quote_number:='ORC-'||quote_year::text||'-'||case when length(serial::text)<4 then lpad(serial::text,4,'0') else serial::text end;
 insert into public.quotes(order_id,number,items,total_cents,valid_until,proposal_snapshot,checklist_revision,price_table_id,is_simulation)
 values(ord.id,quote_number,proposal->'items',total::bigint,expires,proposal,chk.revision,prices.id,true) returning id into created_id;
 insert into private.quote_requests(request_id,actor_id,order_id,checklist_revision,quote_id) values(request_id,actor,target_order,expected_checklist_revision,created_id);
 update public.orders set status='quoted',total_cents=total::bigint,deposit_cents=deposit::bigint,price_table_id=prices.id,
 delivery_date=delivery,internal_due_date=internal_due,complexity=proposal->>'complexity',urgent=(chk.answers->>'urgency')::boolean where id=ord.id;
 perform private.record_event(ord.process_id,'quote_created',jsonb_build_object('quote_id',created_id,'simulation',true),actor,ord.id);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'quote_created','quote',created_id);
 return created_id;
end;
$$;
revoke all on function public.create_checklist_quote_system(uuid,uuid,integer,uuid,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_checklist_quote_system(uuid,uuid,integer,uuid,integer,uuid,jsonb) to service_role;

create or replace function private.can_reject_quote(q public.quotes,job public.orders,ctx private.quote_contract_contexts) returns boolean
language sql stable set search_path='' as $$
 select (q.id is not null and job.id is not null and ctx.quote_id=q.id and q.order_id=job.id and not q.is_simulation
 and job.status='quoted' and ctx.proposal->>'mode'='commercial'
 and ctx.proposal->>'orderId'=job.id::text and ctx.proposal->>'processId'=job.process_id::text
 and ctx.context_hash=encode(sha256(convert_to(jsonb_build_object('quoteId',q.id,'number',q.number,'proposal',ctx.proposal,
  'termsVersion',ctx.terms_version,'termsText',ctx.terms_text,'privacyVersion',ctx.privacy_version,'privacyText',ctx.privacy_text)::text,'UTF8')),'hex')
 and job.price_table_id::text=ctx.proposal->>'priceTableId' and job.total_cents::text=ctx.proposal->>'totalCents'
 and job.deposit_cents::text=ctx.proposal->>'depositCents' and job.delivery_date::text=ctx.proposal->>'deliveryDate'
 and job.internal_due_date::text=ctx.proposal->>'internalDueDate'
 and private.is_current_quote(q.id)
 and not exists(select 1 from public.quotes x where x.order_id=job.id and
  (x.accepted_at is not null or x.accepted_by is not null or x.accepted_ip is not null or x.accepted_user_agent is not null))
 and not exists(select 1 from private.quote_acceptances a join public.quotes x on x.id=a.quote_id where x.order_id=job.id)
 and not exists(select 1 from private.quote_rejections where order_id=job.id)
 and not exists(select 1 from public.payments where order_id=job.id)) is true
$$;

create or replace function public.accept_quote_system(actor uuid,target_quote uuid,expected_context text,request_id uuid,confirmed boolean,ip_address text,user_agent text)
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
 if private.is_current_quote(target_quote) is not true then raise sqlstate 'PT409' using message='Esta versão foi substituída'; end if;
 if exists(select 1 from private.quote_rejections where order_id=job.id) then raise sqlstate 'PT409' using message='Proposta já recusada'; end if;
 return private.accept_quote_system(actor,target_quote,expected_context,request_id,confirmed,ip_address,user_agent);
end;
$$;

create or replace function public.get_quote_contract_context(target_quote uuid) returns jsonb
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
 return result || jsonb_build_object('canAccept',(result->>'canAccept')::boolean and r.quote_id is null and private.is_current_quote(q.id),
 'blockMessage',case when not private.is_current_quote(q.id) then 'Esta versão foi substituída. Abra a proposta vigente.' when r.quote_id is not null then 'Proposta recusada pelo cliente.' else result->>'blockMessage' end,
 'canReject',eligible,'rejectionBlockMessage',case when eligible or r.quote_id is not null then null else 'A recusa está indisponível nesta situação. Confira a pasta do processo.' end,
 'statusRevision',job.status_revision,'rejectionReceipt',case when r.quote_id is null or r.quote_id<>q.id then null else private.quote_rejection_result(r) end);
end;
$$;

create function public.revise_quote_system(actor uuid,target_quote uuid,expected_context text,expected_version integer,
 expected_order_revision integer,request_id uuid,reason text,unit_prices jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare customer public.clients%rowtype; job public.orders%rowtype; q public.quotes%rowtype;
 ctx private.quote_contract_contexts%rowtype; retry private.quote_adjustments%rowtype;
 canonical jsonb; normalized text; items jsonb:='[]'; item jsonb; changed jsonb; price jsonb;
 total numeric:=0; unit numeric; amount numeric; idx integer:=0; body jsonb;
 created_id uuid:=gen_random_uuid(); serial bigint; quote_year integer; number text; issued timestamptz:=clock_timestamp(); result jsonb;
 customer_email text;
begin
 if auth.role() is distinct from 'service_role' or actor is null or target_quote is null or request_id is null then raise exception 'Acesso não autorizado'; end if;
 if expected_context is null or expected_context !~ '^[0-9a-f]{64}$' or expected_version is null or expected_version<1
 or expected_order_revision is null or expected_order_revision<0 or reason is null then raise exception 'Ajuste inválido'; end if;
 normalized:=private.trim_client_contract_reason(reason);
 if length(normalized) not between 1 and 1000 or jsonb_typeof(unit_prices) is distinct from 'array'
 or jsonb_array_length(unit_prices) not between 1 and 10 then raise exception 'Confira motivo e valores'; end if;
 perform id from public.profiles where id=actor and role='calculator' for share;
 if not found then raise exception 'Acesso não autorizado'; end if;
 select c.* into customer from public.clients c join public.orders o on o.client_id=c.id
 join public.quotes x on x.order_id=o.id where x.id=target_quote for update of c;
 select * into job from public.orders where id=(select order_id from public.quotes where id=target_quote) and client_id=customer.id for update;
 if job.id is null then raise exception 'Proposta indisponível'; end if;
 select * into q from public.quotes where id=target_quote for update;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quote-adjust:'||request_id::text,0));
 canonical:=jsonb_build_object('actor',actor,'quoteId',target_quote,'contextHash',expected_context,
  'version',expected_version,'orderRevision',expected_order_revision,'reason',normalized,'items',unit_prices);
 select * into retry from private.quote_adjustments x where x.request_id=revise_quote_system.request_id;
 if retry.request_id is not null then
  if retry.payload is distinct from canonical then raise sqlstate 'PT409' using message='Solicitação já registrada com outros dados'; end if;
  return retry.receipt;
 end if;
 select * into ctx from private.quote_contract_contexts where quote_id=q.id for share;
 if q.version<>expected_version or job.status_revision<>expected_order_revision or ctx.context_hash is distinct from expected_context
 or private.can_reject_quote(q,job,ctx) is not true then raise sqlstate 'PT409' using message='Proposta atualizada ou já decidida'; end if;
 if jsonb_array_length(unit_prices)<>jsonb_array_length(ctx.proposal->'items')
 or (select count(distinct x->>'code') from jsonb_array_elements(unit_prices) x)<>jsonb_array_length(unit_prices) then raise exception 'Itens divergentes'; end if;
 for item in select value from jsonb_array_elements(ctx.proposal->'items') loop
  price:=unit_prices->idx;
  if jsonb_typeof(price) is distinct from 'object' or price-array['code','unitCents']<>'{}'::jsonb
   or price->>'code' is distinct from item->>'code' or jsonb_typeof(price->'unitCents') is distinct from 'number'
   or price->>'unitCents' !~ '^[0-9]+$' then raise exception 'Valor de serviço inválido'; end if;
  unit:=(price->>'unitCents')::numeric; amount:=unit*(item->>'quantity')::numeric;
  if unit not between 0 and 9007199254740991 or amount not between 0 and 9007199254740991 then raise exception 'Valor fora do limite'; end if;
  changed:=item||jsonb_build_object('unitCents',unit,'amountCents',amount);
  items:=items||jsonb_build_array(changed); total:=total+amount; idx:=idx+1;
 end loop;
 if total>9007199254740991 or items=ctx.proposal->'items' then raise exception 'Informe uma alteração de valor válida'; end if;
 body:=ctx.proposal||jsonb_build_object('items',items,'totalCents',total,'depositCents',ceil(total/2),'balanceCents',total-ceil(total/2),
  'issuedAt',to_char(issued at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'validUntil',to_char((issued+make_interval(days=>(ctx.proposal->>'validityDays')::integer)) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 quote_year:=extract(year from issued at time zone 'America/Sao_Paulo')::integer;
 insert into private.quote_counters(year,last_number) values(quote_year,1) on conflict(year) do update set last_number=quote_counters.last_number+1 returning last_number into serial;
 number:='ORC-'||quote_year::text||'-'||case when length(serial::text)<4 then lpad(serial::text,4,'0') else serial::text end;
 update public.orders set total_cents=total::bigint,deposit_cents=ceil(total/2)::bigint where id=job.id;
 insert into public.quotes(id,order_id,number,items,total_cents,valid_until,checklist_revision,price_table_id,is_simulation,version,supersedes_id)
 values(created_id,job.id,number,items,total::bigint,(body->>'validUntil')::timestamptz,q.checklist_revision,q.price_table_id,false,q.version+1,q.id);
 -- O trigger existente revalida tabela/configuração/termos/agenda e gera um novo hash.
 insert into private.quote_contract_contexts(quote_id,proposal,terms_version,terms_text,privacy_version,privacy_text,prepared_by)
 values(created_id,body,ctx.terms_version,ctx.terms_text,ctx.privacy_version,ctx.privacy_text,actor);
 result:=jsonb_build_object('quoteId',created_id,'previousQuoteId',q.id,'orderId',job.id,'processId',job.process_id,
  'number',number,'version',q.version+1,'previousTotalCents',q.total_cents,'totalCents',total,
  'reason',normalized,'createdAt',issued);
 insert into private.quote_adjustments(request_id,previous_quote_id,quote_id,actor_id,reason,payload,receipt)
 values(request_id,q.id,created_id,actor,normalized,canonical,result);
 perform private.record_event(job.process_id,'status_changed',jsonb_build_object('operation','revise_quote','quote_id',created_id,
  'previous_quote_id',q.id,'version',q.version+1,'number',number,'note',normalized),actor,job.id,request_id);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'quote_revised','quote',created_id);
 select email into customer_email from auth.users where id=customer.owner_id;
 if nullif(btrim(customer_email),'') is null then raise exception 'Contato indisponível'; end if;
 insert into public.notifications(channel,recipient,template,data,dedup_key)
 values('email',customer_email,'quote_created_client',jsonb_build_object('quote_id',created_id,'number',number,'order_id',job.id,
  'code',job.code,'process_id',job.process_id,'path','/app/orcamentos/'||created_id::text),'quote-revision:'||created_id::text||':client');
 return result;
end;
$$;
revoke all on function public.revise_quote_system(uuid,uuid,text,integer,integer,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.revise_quote_system(uuid,uuid,text,integer,integer,uuid,text,jsonb) to service_role;

create function public.get_quote_revision_context(target_quote uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q public.quotes%rowtype; job public.orders%rowtype; ctx private.quote_contract_contexts%rowtype; current_id uuid; history jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in('client','calculator')) then raise sqlstate 'PT404' using message='Proposta indisponível'; end if;
 select * into q from public.quotes where id=target_quote and private.can_read_order(order_id);
 if q.id is null then raise sqlstate 'PT404' using message='Proposta indisponível'; end if;
 select * into job from public.orders where id=q.order_id;
 select * into ctx from private.quote_contract_contexts where quote_id=q.id;
 select id into current_id from public.quotes where order_id=job.id and private.is_current_quote(id);
 select jsonb_agg(jsonb_build_object('id',x.id,'number',x.number,'version',x.version,'previousQuoteId',x.supersedes_id,
  'totalCents',x.total_cents,'createdAt',coalesce(a.created_at,x.created_at),'reason',a.reason) order by x.version desc,x.created_at desc,x.id)
 into history from public.quotes x left join private.quote_adjustments a on a.quote_id=x.id where x.order_id=job.id;
 return jsonb_build_object('version',q.version,'currentQuoteId',current_id,'isCurrent',coalesce(current_id=q.id,false),
  'canRevise',private.can_reject_quote(q,job,ctx) and exists(select 1 from public.profiles where id=auth.uid() and role='calculator'),
  'history',coalesce(history,'[]'::jsonb));
end;
$$;
revoke all on function public.get_quote_revision_context(uuid) from public,anon,service_role;
grant execute on function public.get_quote_revision_context(uuid) to authenticated;
