-- Configurações e versões comerciais. Aplicação dedicada; dados locais de teste são fictícios.
alter table public.settings add column revision integer not null default 1 check (revision > 0);
alter table public.settings add column notification_times jsonb not null default '["09:00","17:00"]';
alter table public.price_tables add column parameters jsonb not null default '{}';
alter table public.price_tables add column activated_at timestamptz;
alter table public.price_tables add column created_by uuid references public.profiles(id);
alter table public.price_tables add constraint price_tables_activation check (not active or (not is_example and activated_at is not null));
create index price_tables_created_by_idx on public.price_tables(created_by);

create function private.valid_price_parameters(data jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare field text; n numeric;
begin
 if data is null or jsonb_typeof(data)<>'object' or jsonb_typeof(data->'base')<>'object' or jsonb_typeof(data->'businessDays')<>'object' then return false; end if;
 foreach field in array array['initial','liquidation','challenge','update'] loop
  if jsonb_typeof(data->'base'->field) is distinct from 'number' then return false; end if;
  n:=(data->'base'->>field)::numeric; if n<>trunc(n) or n<0 or n>1000000000 then return false; end if;
 end loop;
 foreach field in array array['perWage','perContractMonth','perTimecardUnit','perExtraClaimant','urgencyBasisPoints','includedWages','includedContractMonths'] loop
  if jsonb_typeof(data->field) is distinct from 'number' then return false; end if;
  n:=(data->>field)::numeric; if n<>trunc(n) or n<0 or n>1000000000 then return false; end if;
 end loop;
 if (data->>'urgencyBasisPoints')::integer>100000 or (data->>'includedWages')::integer>1000 or (data->>'includedContractMonths')::integer>1200 or data->>'timecardUnit' is null or data->>'timecardUnit' not in ('month','page') then return false; end if;
 foreach field in array array['simple','medium','high'] loop
  if jsonb_typeof(data->'businessDays'->field) is distinct from 'number' then return false; end if;
  n:=(data->'businessDays'->>field)::numeric; if n<>trunc(n) or n<1 or n>365 then return false; end if;
 end loop;
 return true;
end;
$$;

create function private.guard_activated_price_table() returns trigger language plpgsql set search_path='' as $$
begin
 if old.activated_at is not null then
  if tg_op='DELETE' then raise exception 'Uma versão ativada deve permanecer no histórico'; end if;
  if (to_jsonb(new)-'active'-'updated_at') is distinct from (to_jsonb(old)-'active'-'updated_at') then raise exception 'A versão de preços ativada é imutável'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
create trigger price_table_immutable before update or delete on public.price_tables for each row execute function private.guard_activated_price_table();
create function private.guard_activated_price_item() returns trigger language plpgsql set search_path='' as $$
declare parent uuid; activated timestamptz;
begin
 parent:=case when tg_op='DELETE' then old.price_table_id else new.price_table_id end;
 select activated_at into activated from public.price_tables where id=parent for update;
 if activated is not null then raise exception 'Os itens de uma versão ativada são imutáveis'; end if;
 if tg_op='UPDATE' and old.price_table_id<>new.price_table_id then
  select activated_at into activated from public.price_tables where id=old.price_table_id for update;
  if activated is not null then raise exception 'Os itens de uma versão ativada são imutáveis'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
create trigger price_item_immutable before insert or update or delete on public.price_items for each row execute function private.guard_activated_price_item();
revoke all on function private.valid_price_parameters(jsonb),private.guard_activated_price_table(),private.guard_activated_price_item() from public,anon,authenticated;

create function public.save_price_version(payload jsonb,example boolean,expected_version integer,approved boolean default false)
returns table(table_id uuid,table_version integer,is_active boolean) language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); newest integer; created uuid; code text;
begin
 if actor is null or not (public.is_calculator() or public.is_admin()) then raise exception 'Acesso não autorizado'; end if;
 if example is null or expected_version is null or expected_version<0 or not private.valid_price_parameters(payload) or (not example and approved is distinct from true) then raise exception 'Confira os preços, prazos e a validação do André'; end if;
 perform 1 from public.settings where singleton for update;
 if not found then raise exception 'Configurações indisponíveis'; end if;
 select coalesce(max(version),0) into newest from public.price_tables;
 if newest<>expected_version then raise exception 'A tabela mudou em outra sessão'; end if;
 if not example then update public.price_tables set active=false where active; end if;
 insert into public.price_tables(version,is_example,parameters,created_by) values(newest+1,example,payload,actor) returning id into created;
 foreach code in array array['initial','liquidation','challenge','update'] loop
  insert into public.price_items(price_table_id,code,label,kind,amount_cents) values(created,'base_'||code,case code when 'initial' then 'Cálculo inicial' when 'liquidation' then 'Liquidação' when 'challenge' then 'Impugnação' else 'Atualização' end,'base',(payload->'base'->>code)::bigint);
 end loop;
 insert into public.price_items(price_table_id,code,label,kind,amount_cents,rule) values
  (created,'wages','Verba adicional','addon',(payload->>'perWage')::bigint,jsonb_build_object('included',(payload->>'includedWages')::integer)),
  (created,'period','Mês contratual adicional','addon',(payload->>'perContractMonth')::bigint,jsonb_build_object('included',(payload->>'includedContractMonths')::integer)),
  (created,'timecards','Digitação de cartões','addon',(payload->>'perTimecardUnit')::bigint,jsonb_build_object('unit',payload->>'timecardUnit')),
  (created,'claimants','Reclamante adicional','addon',(payload->>'perExtraClaimant')::bigint,'{}');
 insert into public.price_items(price_table_id,code,label,kind,percent_bp) values(created,'urgency','Urgência','percent',(payload->>'urgencyBasisPoints')::integer);
 if not example then
  update public.price_tables set active=true,activated_at=now() where id=created;
  update public.settings set urgency_bp=(payload->>'urgencyBasisPoints')::integer,revision=revision+1 where singleton;
 end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,case when example then 'price_example_saved' else 'price_version_activated' end,'price_table',created);
 return query select created,newest+1,not example;
end;
$$;
revoke all on function public.save_price_version(jsonb,boolean,integer,boolean) from public,anon;
grant execute on function public.save_price_version(jsonb,boolean,integer,boolean) to authenticated;

create function public.save_service_settings(payload jsonb,expected_revision integer) returns integer language plpgsql security definer set search_path='' as $$
declare cfg public.settings%rowtype; actor uuid:=auth.uid(); field text; n numeric; has_identity boolean;
begin
 if actor is null or not (public.is_calculator() or public.is_admin()) then raise exception 'Acesso não autorizado'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or expected_revision is null or expected_revision<1 or octet_length(payload::text)>20000 then raise exception 'Confira as configurações'; end if;
 foreach field in array array['technicalName','crcNumber','crcState','crcCategory','contactEmail','contactPhone','pixKey','conditions','guarantee','morningTime','eveningTime'] loop
  if jsonb_typeof(payload->field) is distinct from 'string' then raise exception 'Confira as configurações'; end if;
 end loop;
 foreach field in array array['slackDays','quoteValidDays','wageThreshold','pageThreshold','claimantThreshold'] loop
  if jsonb_typeof(payload->field) is distinct from 'number' then raise exception 'Confira as configurações'; end if;
  n:=(payload->>field)::numeric; if n<>trunc(n) or n<0 or n>100000 then raise exception 'Confira os limites'; end if;
 end loop;
 if (payload->>'slackDays')::integer>365 or (payload->>'quoteValidDays')::integer not between 1 and 365 or (payload->>'wageThreshold')::integer not between 1 and 1000 or (payload->>'claimantThreshold')::integer not between 1 and 1000 then raise exception 'Confira os limites'; end if;
 has_identity:=length(btrim(payload->>'technicalName')||btrim(payload->>'crcNumber')||btrim(payload->>'crcState')||btrim(payload->>'crcCategory'))>0;
 if has_identity and (length(btrim(payload->>'technicalName')) not between 3 and 200 or payload->>'crcNumber' !~ '^[0-9A-Za-z/.-]{3,30}$' or payload->>'crcState' not in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') or payload->>'crcCategory' not in ('Contador','Técnico em Contabilidade')) then raise exception 'Preencha a identificação profissional completa'; end if;
 if length(payload->>'pixKey')>200 or length(payload->>'conditions')>4000 or length(payload->>'guarantee')>4000 or length(payload->>'contactEmail')>254 or (payload->>'contactEmail'<>'' and payload->>'contactEmail' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (payload->>'contactPhone'<>'' and payload->>'contactPhone' !~ '^\+55[0-9]{11}$') then raise exception 'Confira os contatos e textos'; end if;
 if payload->>'morningTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or payload->>'eveningTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Confira os horários'; end if;
 select * into cfg from public.settings where singleton for update;
 if not found or cfg.revision<>expected_revision then raise exception 'As configurações mudaram em outra sessão'; end if;
 update public.settings set
 technical_name=nullif(btrim(payload->>'technicalName'),''),crc_number=nullif(payload->>'crcNumber',''),crc_state=nullif(payload->>'crcState',''),crc_category=nullif(payload->>'crcCategory',''),
 contact_email=nullif(lower(btrim(payload->>'contactEmail')),''),contact_phone=nullif(payload->>'contactPhone',''),pix_key=nullif(btrim(payload->>'pixKey'),''),
 slack_days=(payload->>'slackDays')::integer,quote_valid_days=(payload->>'quoteValidDays')::integer,
 complexity_limits=jsonb_build_object('wages',(payload->>'wageThreshold')::integer,'pages',(payload->>'pageThreshold')::integer,'claimants',(payload->>'claimantThreshold')::integer),
 notification_times=jsonb_build_array(payload->>'morningTime',payload->>'eveningTime'),
 default_texts=jsonb_build_object('conditions',btrim(payload->>'conditions'),'guarantee',btrim(payload->>'guarantee')),revision=revision+1 where id=cfg.id;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'service_settings_saved','settings',cfg.id);
 return cfg.revision+1;
end;
$$;
revoke all on function public.save_service_settings(jsonb,integer) from public,anon;
grant execute on function public.save_service_settings(jsonb,integer) to authenticated;

-- Projeção pública explícita: nunca expõe Pix, preferências internas ou textos de contratação.
create function public.get_public_service_info() returns table(technical_name text,crc_number text,crc_state text,crc_category text,contact_email text,contact_phone text,guarantee text)
language sql stable security definer set search_path='' as $$
 select s.technical_name,s.crc_number,s.crc_state,s.crc_category,s.contact_email,s.contact_phone,s.default_texts->>'guarantee' from public.settings s where s.singleton;
$$;
revoke all on function public.get_public_service_info() from public;
grant execute on function public.get_public_service_info() to anon,authenticated;
