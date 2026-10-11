-- O probe de recuperação não grava recibos; configurações ausentes bloqueiam.
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
 select * into existing from public.quotes where order_id=target_order and checklist_revision=expected_checklist_revision;
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
