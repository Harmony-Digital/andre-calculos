-- Fundação do projeto dedicado André. Não aplicar na instância compartilhada da Harmony.
-- Dinheiro em centavos; datas civis; todas as consultas da aplicação passam por RLS.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('client','calculator','admin')),
  full_name text not null default '', phone text, oab_number text, oab_state text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.clients (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references public.profiles(id),
  kind text not null default 'person' check (kind in ('person','company')),
  document text, legal_name text not null default '', has_contract boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.processes (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
  cnj_number text not null check (cnj_number ~ '^[0-9]{20}$'), court text not null, chamber text not null default '',
  side text not null check (side in ('claimant','defendant')), claimants_count integer not null default 1 check (claimants_count between 1 and 1000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, client_id), unique (client_id, cnj_number)
);
create table public.price_tables (
  id uuid primary key default gen_random_uuid(), version integer not null unique check (version > 0),
  active boolean not null default false, is_example boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index price_tables_one_active on public.price_tables(active) where active;
create table public.price_items (
  id uuid primary key default gen_random_uuid(), price_table_id uuid not null references public.price_tables(id),
  code text not null, label text not null, kind text not null check (kind in ('base','addon','percent')),
  amount_cents bigint check (amount_cents >= 0), percent_bp integer check (percent_bp between 0 and 100000), rule jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(price_table_id,code)
);
create sequence public.order_number_seq;
create function private.next_order_code() returns text language sql volatile set search_path = '' as $$
  select 'P-' || case when length(n) < 4 then lpad(n,4,'0') else n end
  from (select nextval('public.order_number_seq')::text n) numbered;
$$;
revoke all on function private.next_order_code() from public, anon;
grant execute on function private.next_order_code() to authenticated, service_role;
create table public.orders (
  id uuid primary key default gen_random_uuid(), process_id uuid not null, client_id uuid not null,
  calc_type text not null check (calc_type in ('initial','liquidation','challenge','update')),
  area text not null default 'labor' check (area in ('labor','civil','social_security')),
  status text not null default 'draft' check (status in ('draft','awaiting_triage','in_triage','quoted','awaiting_payment','queued','in_analysis','awaiting_client','in_calculation','in_review','delivered','completed','in_adjustment','cancelled','refunded')),
  urgent boolean not null default false, complexity text check (complexity in ('simple','medium','high')),
  total_cents bigint not null default 0 check (total_cents >= 0), deposit_cents bigint not null default 0 check (deposit_cents between 0 and total_cents),
  delivery_date date, internal_due_date date, price_table_id uuid references public.price_tables(id),
  code text not null unique default private.next_order_code(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (process_id,client_id) references public.processes(id,client_id), unique(id,process_id)
);
create table public.checklists (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id),
  schema_version integer not null check (schema_version > 0), answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.quotes (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id), number text not null unique,
  items jsonb not null check (jsonb_typeof(items) = 'array'), total_cents bigint not null check (total_cents >= 0), valid_until timestamptz not null,
  accepted_at timestamptz, accepted_ip inet, accepted_user_agent text, accepted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  kind text not null check (kind in ('deposit','balance','triage')), method text not null check (method in ('pix_manual','asaas')),
  amount_cents bigint not null check (amount_cents > 0), status text not null default 'pending' check (status in ('pending','confirmed','refunded')),
  confirmed_by uuid references public.profiles(id), confirmed_at timestamptz, provider_ref text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.files (
  id uuid primary key default gen_random_uuid(), process_id uuid not null references public.processes(id), order_id uuid,
  folder text not null check (folder in ('case','client','deliverables','triage')), bucket text not null default 'processos' check (bucket = 'processos'),
  path text not null unique, name text not null, mime text not null, size_bytes bigint not null check (size_bytes between 0 and 524288000),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'), version integer not null default 1 check (version > 0), pages integer check (pages > 0),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (order_id,process_id) references public.orders(id,process_id), unique(id,process_id)
);
create table public.page_index (
  id uuid primary key default gen_random_uuid(), process_id uuid not null references public.processes(id), file_id uuid not null,
  piece text not null, pages text not null, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(file_id,process_id) references public.files(id,process_id)
);
create table public.decisions (
  id uuid primary key default gen_random_uuid(), process_id uuid not null references public.processes(id), order_id uuid,
  parameter text not null, value text not null, source text not null check (source in ('judgment','appeal','decision','lawyer','calculator')),
  page integer check (page > 0), rationale text not null, recorded_by uuid not null references public.profiles(id), client_confirmed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(order_id,process_id) references public.orders(id,process_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), process_id uuid not null references public.processes(id), author_id uuid not null references public.profiles(id),
  body text not null check (length(body) between 1 and 10000), attachment_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.timeline_events (
  id uuid primary key default gen_random_uuid(), process_id uuid not null references public.processes(id), order_id uuid,
  kind text not null, data jsonb not null default '{}', actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(order_id,process_id) references public.orders(id,process_id)
);
create table public.deadlines (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id), notice_date date not null,
  act_type text not null, days integer not null check(days > 0), due_date date not null, slack_days integer not null check(slack_days >= 0),
  internal_due_date date not null, adjustments jsonb not null default '[]',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(internal_due_date <= due_date)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), channel text not null check(channel in ('email','whatsapp')), recipient text not null, template text not null,
  data jsonb not null default '{}', status text not null default 'pending' check(status in ('pending','sent','failed')),
  attempts integer not null default 0 check(attempts >= 0), last_error text, send_after timestamptz not null default now(), sent_at timestamptz, dedup_key text not null unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id), event text not null,
  channel text not null check(channel in ('email','whatsapp')), enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(profile_id,event,channel)
);
create table public.settings (
  id uuid primary key default gen_random_uuid(), singleton boolean not null default true unique check(singleton),
  technical_name text, crc_number text, crc_state text, crc_category text, pix_key text, contact_email text, contact_phone text,
  slack_days integer not null default 2 check(slack_days >= 0), urgency_bp integer not null default 3000 check(urgency_bp between 0 and 100000),
  quote_valid_days integer not null default 7 check(quote_valid_days between 1 and 365),
  complexity_limits jsonb not null default '{"claimants":1,"wages":6,"pages":1000}', default_texts jsonb not null default '{}',
  approved_terms_version text, approved_privacy_version text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id), profile_id uuid not null references public.profiles(id),
  rating integer not null check(rating between 1 and 5), body text not null default '', published boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id), action text not null, target_type text not null, target_id uuid, ip inet,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.consents (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id),
  document text not null check(document in ('terms','privacy')), version text not null, accepted_at timestamptz not null default now(), ip inet,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(profile_id,document,version)
);

create function public.is_calculator() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'calculator');
$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;
create function private.owns_client(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.clients where id = target and owner_id = (select auth.uid()));
$$;
create function private.can_read_process(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_calculator() or exists(select 1 from public.processes p join public.clients c on c.id = p.client_id where p.id = target and c.owner_id = (select auth.uid()));
$$;
create function private.can_read_order(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_calculator() or exists(select 1 from public.orders o join public.clients c on c.id = o.client_id where o.id = target and c.owner_id = (select auth.uid()));
$$;
create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare cfg public.settings%rowtype;
begin
  insert into public.profiles(id,full_name,phone,oab_number,oab_state)
  values(new.id, left(coalesce(new.raw_user_meta_data->>'full_name',''),200), left(new.raw_user_meta_data->>'phone',30), left(new.raw_user_meta_data->>'oab_number',30), left(new.raw_user_meta_data->>'oab_state',2));
  insert into public.clients(owner_id,legal_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),200));
  select * into cfg from public.settings where singleton;
  if cfg.approved_terms_version is not null and cfg.approved_privacy_version is not null
     and new.raw_user_meta_data->>'terms_version' = cfg.approved_terms_version
     and new.raw_user_meta_data->>'privacy_version' = cfg.approved_privacy_version
     and new.raw_user_meta_data->>'accepted_legal' = 'true' then
    insert into public.consents(profile_id,document,version) values
      (new.id,'terms',cfg.approved_terms_version),(new.id,'privacy',cfg.approved_privacy_version);
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

revoke execute on function public.is_calculator(), public.is_admin(), private.owns_client(uuid), private.can_read_process(uuid), private.can_read_order(uuid), private.touch_updated_at(), public.handle_new_user() from public, anon, authenticated;
grant execute on function public.is_calculator(), public.is_admin(), private.owns_client(uuid), private.can_read_process(uuid), private.can_read_order(uuid) to authenticated;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant all on public.profiles to service_role;
create trigger touch_updated_at before update on public.profiles for each row execute function private.touch_updated_at();
alter table public.clients enable row level security;
revoke all on public.clients from anon, authenticated;
grant all on public.clients to service_role;
create trigger touch_updated_at before update on public.clients for each row execute function private.touch_updated_at();
alter table public.processes enable row level security;
revoke all on public.processes from anon, authenticated;
grant all on public.processes to service_role;
create trigger touch_updated_at before update on public.processes for each row execute function private.touch_updated_at();
alter table public.price_tables enable row level security;
revoke all on public.price_tables from anon, authenticated;
grant all on public.price_tables to service_role;
create trigger touch_updated_at before update on public.price_tables for each row execute function private.touch_updated_at();
alter table public.price_items enable row level security;
revoke all on public.price_items from anon, authenticated;
grant all on public.price_items to service_role;
create trigger touch_updated_at before update on public.price_items for each row execute function private.touch_updated_at();
alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
grant all on public.orders to service_role;
create trigger touch_updated_at before update on public.orders for each row execute function private.touch_updated_at();
alter table public.checklists enable row level security;
revoke all on public.checklists from anon, authenticated;
grant all on public.checklists to service_role;
create trigger touch_updated_at before update on public.checklists for each row execute function private.touch_updated_at();
alter table public.quotes enable row level security;
revoke all on public.quotes from anon, authenticated;
grant all on public.quotes to service_role;
create trigger touch_updated_at before update on public.quotes for each row execute function private.touch_updated_at();
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant all on public.payments to service_role;
create trigger touch_updated_at before update on public.payments for each row execute function private.touch_updated_at();
alter table public.files enable row level security;
revoke all on public.files from anon, authenticated;
grant all on public.files to service_role;
create trigger touch_updated_at before update on public.files for each row execute function private.touch_updated_at();
alter table public.page_index enable row level security;
revoke all on public.page_index from anon, authenticated;
grant all on public.page_index to service_role;
create trigger touch_updated_at before update on public.page_index for each row execute function private.touch_updated_at();
alter table public.decisions enable row level security;
revoke all on public.decisions from anon, authenticated;
grant all on public.decisions to service_role;
create trigger touch_updated_at before update on public.decisions for each row execute function private.touch_updated_at();
alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
grant all on public.messages to service_role;
create trigger touch_updated_at before update on public.messages for each row execute function private.touch_updated_at();
alter table public.timeline_events enable row level security;
revoke all on public.timeline_events from anon, authenticated;
grant all on public.timeline_events to service_role;
create trigger touch_updated_at before update on public.timeline_events for each row execute function private.touch_updated_at();
alter table public.deadlines enable row level security;
revoke all on public.deadlines from anon, authenticated;
grant all on public.deadlines to service_role;
create trigger touch_updated_at before update on public.deadlines for each row execute function private.touch_updated_at();
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant all on public.notifications to service_role;
create trigger touch_updated_at before update on public.notifications for each row execute function private.touch_updated_at();
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant all on public.notification_preferences to service_role;
create trigger touch_updated_at before update on public.notification_preferences for each row execute function private.touch_updated_at();
alter table public.settings enable row level security;
revoke all on public.settings from anon, authenticated;
grant all on public.settings to service_role;
create trigger touch_updated_at before update on public.settings for each row execute function private.touch_updated_at();
alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant all on public.reviews to service_role;
create trigger touch_updated_at before update on public.reviews for each row execute function private.touch_updated_at();
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant all on public.audit_log to service_role;
create trigger touch_updated_at before update on public.audit_log for each row execute function private.touch_updated_at();
alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated;
grant all on public.consents to service_role;
create trigger touch_updated_at before update on public.consents for each row execute function private.touch_updated_at();
grant usage, select on sequence public.order_number_seq to authenticated, service_role;

grant select on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_calculator()) or (select public.is_admin()));
grant select on public.clients to authenticated;
create policy clients_read on public.clients for select to authenticated using (owner_id = (select auth.uid()) or (select public.is_calculator()) or (select public.is_admin()));
grant select on public.processes to authenticated;
create policy processes_read on public.processes for select to authenticated using (private.can_read_process(id));
grant select on public.orders to authenticated;
create policy orders_read on public.orders for select to authenticated using (private.can_read_order(id) or (select public.is_admin()));
grant select on public.checklists to authenticated;
create policy checklists_read on public.checklists for select to authenticated using (private.can_read_order(order_id));
grant select on public.price_tables to authenticated;
create policy price_tables_read on public.price_tables for select to authenticated using (active or (select public.is_calculator()) or (select public.is_admin()));
grant select on public.price_items to authenticated;
create policy price_items_read on public.price_items for select to authenticated using (exists(select 1 from public.price_tables t where t.id = price_table_id and t.active) or (select public.is_calculator()) or (select public.is_admin()));
grant select on public.quotes to authenticated;
create policy quotes_read on public.quotes for select to authenticated using (private.can_read_order(order_id) or (select public.is_admin()));
grant select on public.payments to authenticated;
create policy payments_read on public.payments for select to authenticated using (private.can_read_order(order_id) or (select public.is_admin()));
grant select on public.files to authenticated;
create policy files_read on public.files for select to authenticated using (private.can_read_process(process_id) and (folder <> 'deliverables' or (select public.is_calculator()) or exists(select 1 from public.orders o where o.id = order_id and o.status in ('delivered','completed'))));
grant select on public.page_index to authenticated;
create policy page_index_read on public.page_index for select to authenticated using (private.can_read_process(process_id));
grant select on public.decisions to authenticated;
create policy decisions_read on public.decisions for select to authenticated using (private.can_read_process(process_id));
grant select on public.messages to authenticated;
create policy messages_read on public.messages for select to authenticated using (private.can_read_process(process_id));
grant select on public.deadlines to authenticated;
create policy deadlines_read on public.deadlines for select to authenticated using (private.can_read_order(order_id));
grant select on public.timeline_events to authenticated;
create policy timeline_events_read on public.timeline_events for select to authenticated using (private.can_read_process(process_id));
grant select on public.notification_preferences to authenticated;
create policy notification_preferences_read on public.notification_preferences for select to authenticated using (profile_id = (select auth.uid()));
grant select on public.settings to authenticated;
create policy settings_read on public.settings for select to authenticated using ((select public.is_calculator()) or (select public.is_admin()));
grant select on public.reviews to authenticated;
create policy reviews_read on public.reviews for select to authenticated using (profile_id = (select auth.uid()) or (select public.is_calculator()));
grant select on public.audit_log to authenticated;
create policy audit_log_read on public.audit_log for select to authenticated using ((select public.is_calculator()) or (select public.is_admin()));
grant select on public.consents to authenticated;
create policy consents_read on public.consents for select to authenticated using (profile_id = (select auth.uid()) or (select public.is_calculator()) or (select public.is_admin()));

-- Modificação de identidade limitada por coluna: o usuário nunca altera role/owner_id/has_contract.
grant update(full_name,phone,oab_number,oab_state) on public.profiles to authenticated;
create policy profiles_update on public.profiles for update to authenticated using(id = (select auth.uid())) with check(id = (select auth.uid()));
grant update(kind,document,legal_name) on public.clients to authenticated;
create policy clients_update on public.clients for update to authenticated using(owner_id = (select auth.uid())) with check(owner_id = (select auth.uid()));
-- Escritas de pedidos, propostas, pagamentos, arquivos e auditoria são feitas por RPCs com autorização explícita.
-- Não se concedem UPDATE/INSERT globais para authenticated nem políticas permissivas de sistema.
create index processes_client_id_idx on public.processes(client_id);
create index orders_process_id_idx on public.orders(process_id);
create index orders_client_id_idx on public.orders(client_id);
create index orders_price_table_id_idx on public.orders(price_table_id);
create index quotes_order_id_idx on public.quotes(order_id);
create index quotes_accepted_by_idx on public.quotes(accepted_by);
create index payments_order_id_idx on public.payments(order_id);
create index payments_confirmed_by_idx on public.payments(confirmed_by);
create index files_process_id_idx on public.files(process_id);
create index files_order_id_idx on public.files(order_id);
create index files_uploaded_by_idx on public.files(uploaded_by);
create index page_index_process_id_idx on public.page_index(process_id);
create index page_index_file_id_idx on public.page_index(file_id);
create index decisions_process_id_idx on public.decisions(process_id);
create index decisions_order_id_idx on public.decisions(order_id);
create index decisions_recorded_by_idx on public.decisions(recorded_by);
create index messages_process_id_idx on public.messages(process_id);
create index messages_author_id_idx on public.messages(author_id);
create index timeline_events_process_id_idx on public.timeline_events(process_id);
create index timeline_events_order_id_idx on public.timeline_events(order_id);
create index timeline_events_actor_id_idx on public.timeline_events(actor_id);
create index reviews_profile_id_idx on public.reviews(profile_id);
create index audit_log_actor_id_idx on public.audit_log(actor_id);
create index orders_queue_idx on public.orders(internal_due_date,created_at) where status in ('queued','in_analysis','in_calculation','in_review');
create index notifications_pending_idx on public.notifications(send_after) where status = 'pending';

-- Só as versões aprovadas são públicas; dados técnicos/financeiros de settings continuam privados.
create function public.get_legal_versions() returns table(terms_version text, privacy_version text)
language sql stable security definer set search_path = '' as $$
  select approved_terms_version, approved_privacy_version from public.settings where singleton;
$$;
revoke all on function public.get_legal_versions() from public;
grant execute on function public.get_legal_versions() to anon, authenticated;

create function public.record_auth_audit(event text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or event not in ('login','logout') then raise exception 'Acesso não autorizado'; end if;
  insert into public.audit_log(actor_id,action,target_type,target_id) values(auth.uid(),event,'profile',auth.uid());
end;
$$;
revoke all on function public.record_auth_audit(text) from public, anon;
grant execute on function public.record_auth_audit(text) to authenticated;
