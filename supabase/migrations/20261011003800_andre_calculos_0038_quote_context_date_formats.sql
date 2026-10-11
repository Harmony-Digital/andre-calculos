-- Datas civis e instantes com offset, equivalentes ao parser da proposta.
create or replace function private.prepare_quote_contract_context() returns trigger
language plpgsql security definer set search_path='' as $$
declare q public.quotes%rowtype; job public.orders%rowtype; cfg public.settings%rowtype;
 prices public.price_tables%rowtype; item jsonb; total numeric:=0; field text; block jsonb; numeric_value numeric;
begin
 -- Campos ausentes não podem transformar os predicados em NULL e liberar o contexto.
 if jsonb_typeof(new.proposal) is distinct from 'object' then raise exception 'Snapshot contratual incompleto'; end if;
 foreach field in array array['issuedAt','validUntil','deliveryDate','internalDueDate','dueDate','complexity','priceVersion'] loop
  if jsonb_typeof(new.proposal->field) is distinct from 'string' then raise exception 'Snapshot contratual incompleto'; end if;
 end loop;
 if new.proposal->>'complexity' not in ('simple','medium','high') then raise exception 'Classificação inválida'; end if;
 foreach field in array array['checklistRevision','settingsRevision','schemaVersion','totalCents','depositCents','balanceCents','validityDays','slackDays','businessDays','proceduralDays'] loop
  if jsonb_typeof(new.proposal->field) is distinct from 'number' then raise exception 'Snapshot contratual incompleto'; end if;
  numeric_value:=(new.proposal->>field)::numeric;
  if numeric_value<>trunc(numeric_value) or numeric_value not between 0 and 9007199254740991 then raise exception 'Número inválido'; end if;
 end loop;
 if (new.proposal->>'validityDays')::numeric not between 1 and 365 or (new.proposal->>'slackDays')::numeric not between 0 and 365
 or (new.proposal->>'businessDays')::numeric not between 1 and 365 or (new.proposal->>'proceduralDays')::numeric not between 1 and 365 then raise exception 'Prazo inválido'; end if;
 foreach field in array array['deliveryDate','internalDueDate','dueDate'] loop
  if new.proposal->>field !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida'; end if;
  perform (new.proposal->>field)::date;
 end loop;
 foreach field in array array['issuedAt','validUntil'] loop
  if new.proposal->>field !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Instante inválido'; end if;
  perform (new.proposal->>field)::timestamptz;
 end loop;
 foreach field in array array['period','calendar','capacity','complexityLimits'] loop
  if jsonb_typeof(new.proposal->field) is distinct from 'object' then raise exception 'Fonte contratual incompleta'; end if;
 end loop;
 foreach field in array array['period','capacity'] loop
  block:=new.proposal->field;
  if not coalesce(block->>'startDate' ~ '^\d{4}-\d{2}-\d{2}$',false) then raise exception 'Data civil inválida'; end if;
 end loop;
 if not coalesce(new.proposal#>>'{period,endDate}' ~ '^\d{4}-\d{2}-\d{2}$',false) then raise exception 'Data civil inválida'; end if;
 block:=new.proposal->'capacity';
 foreach field in array array['asOf','validUntil'] loop
  if not coalesce(block->>field ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$',false) then raise exception 'Instante inválido'; end if;
 end loop;
 foreach field in array array['period','calendar','capacity'] loop
  block:=new.proposal->field;
  if jsonb_typeof(block->'version') is distinct from 'string' or length(btrim(block->>'version')) not between 1 and 200 then raise exception 'Versão da fonte indisponível'; end if;
 end loop;
 block:=new.proposal->'period';
 if jsonb_typeof(block->'months') is distinct from 'number' or not coalesce((block->>'months')::numeric between 1 and 1200 and (block->>'months')::numeric=trunc((block->>'months')::numeric),false)
 or jsonb_typeof(block->'startDate') is distinct from 'string' or jsonb_typeof(block->'endDate') is distinct from 'string'
 or not coalesce((block->>'startDate')::date<=(block->>'endDate')::date,false) then raise exception 'Período inválido'; end if;
 block:=new.proposal->'calendar';
 if jsonb_typeof(block->'tribunal') is distinct from 'number' or not coalesce((block->>'tribunal')::numeric between 1 and 24 and (block->>'tribunal')::numeric=trunc((block->>'tribunal')::numeric),false)
 or jsonb_typeof(block->'suspensions') is distinct from 'array' then raise exception 'Calendário inválido'; end if;
 if jsonb_array_length(block->'suspensions')>500 then raise exception 'Calendário inválido'; end if;
 for item in select value from jsonb_array_elements(block->'suspensions') loop
  if not coalesce(item->>'start' ~ '^\d{4}-\d{2}-\d{2}$',false) or not coalesce(item->>'end' ~ '^\d{4}-\d{2}-\d{2}$',false)
  or jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'start') is distinct from 'string' or jsonb_typeof(item->'end') is distinct from 'string'
  or jsonb_typeof(item->'reason') is distinct from 'string' or length(item->>'reason') not between 1 and 500
  or not coalesce((item->>'start')::date<=(item->>'end')::date,false) then raise exception 'Suspensão inválida'; end if;
 end loop;
 block:=new.proposal->'capacity';
 if jsonb_typeof(block->'asOf') is distinct from 'string' or jsonb_typeof(block->'validUntil') is distinct from 'string'
 or jsonb_typeof(block->'startDate') is distinct from 'string' or jsonb_typeof(block->'urgencyAvailable') is distinct from 'boolean'
 or jsonb_typeof(block->'availableBusinessDays') is distinct from 'number'
 or not coalesce((block->>'availableBusinessDays')::numeric between 1 and 365 and (block->>'availableBusinessDays')::numeric=trunc((block->>'availableBusinessDays')::numeric),false)
 or not coalesce((block->>'asOf')::timestamptz<=(new.proposal->>'issuedAt')::timestamptz and (block->>'validUntil')::timestamptz>(new.proposal->>'issuedAt')::timestamptz,false)
 or not coalesce((block->>'startDate')::date>=((new.proposal->>'issuedAt')::timestamptz at time zone 'America/Sao_Paulo')::date,false) then raise exception 'Disponibilidade inválida'; end if;
 foreach field in array array['wageThreshold','pageThreshold','claimantThreshold'] loop
  block:=new.proposal->'complexityLimits';
  if jsonb_typeof(block->field) is distinct from 'number' then raise exception 'Limites inválidos'; end if;
  numeric_value:=(block->>field)::numeric;
  if numeric_value<>trunc(numeric_value) or numeric_value<(case when field='pageThreshold' then 0 else 1 end) then raise exception 'Limites inválidos'; end if;
 end loop;
 select * into q from public.quotes where id=new.quote_id for update;
 select * into job from public.orders where id=q.order_id;
 select * into cfg from public.settings where singleton for share;
 select * into prices from public.price_tables where id=q.price_table_id for share;
 if q.id is null or q.is_simulation or q.proposal_snapshot is not null or q.accepted_at is not null
 or q.accepted_by is not null or q.accepted_ip is not null or q.accepted_user_agent is not null
 or job.price_table_id is distinct from q.price_table_id or job.status<>'quoted' or q.checklist_revision is null or prices.id is null or not prices.active or prices.is_example or prices.activated_at is null
 or not exists(select 1 from public.profiles where id=new.prepared_by and role='calculator')
 or jsonb_typeof(new.proposal) is distinct from 'object' or octet_length(new.proposal::text)>65536
 or new.proposal->>'schemaVersion' is distinct from '1' or new.proposal->>'mode' is distinct from 'commercial'
 or new.proposal->>'orderId' is distinct from job.id::text or new.proposal->>'processId' is distinct from job.process_id::text
 or new.proposal->>'checklistRevision' is distinct from q.checklist_revision::text
 or new.proposal->>'priceTableId' is distinct from prices.id::text or new.proposal->>'priceVersion' is distinct from prices.version::text
 or new.proposal->'priceParameters' is distinct from prices.parameters
 or (new.proposal->>'validityDays')::integer is distinct from cfg.quote_valid_days or (new.proposal->>'slackDays')::integer is distinct from cfg.slack_days
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
  if jsonb_typeof(item->'code') is distinct from 'string' or length(item->>'code') not between 1 and 50
   or jsonb_typeof(item->'description') is distinct from 'string' or length(item->>'description') not between 1 and 200
   or jsonb_typeof(item->'quantity') is distinct from 'number' or jsonb_typeof(item->'unitCents') is distinct from 'number' or jsonb_typeof(item->'amountCents') is distinct from 'number'
   or item->>'quantity' is null or item->>'quantity' !~ '^[0-9]+$' or (item->>'quantity')::numeric<1
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
 or (new.proposal->>'validUntil')::timestamptz is distinct from (new.proposal->>'issuedAt')::timestamptz + make_interval(days=>(new.proposal->>'validityDays')::integer)
 or (new.proposal->>'validUntil')::timestamptz<=(new.proposal->>'issuedAt')::timestamptz then raise exception 'Valores ou datas inválidos'; end if;
 new.terms_sha256:=encode(sha256(convert_to(new.terms_text,'UTF8')),'hex');
 new.privacy_sha256:=encode(sha256(convert_to(new.privacy_text,'UTF8')),'hex');
 new.context_hash:=encode(sha256(convert_to(jsonb_build_object('quoteId',q.id,'number',q.number,'proposal',new.proposal,
  'termsVersion',new.terms_version,'termsText',new.terms_text,'privacyVersion',new.privacy_version,'privacyText',new.privacy_text)::text,'UTF8')),'hex');
 return new;
end;
$$;
