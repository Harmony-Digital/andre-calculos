-- Recepção local fictícia, sem crédito ou ativação do Asaas real.
create function private.valid_payment_webhook_body(body jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare p jsonb; r jsonb; k text; v jsonb; t text;
begin
 if jsonb_typeof(body) is distinct from 'object' or body-array['id','event','dateCreated','account','payment']<>'{}'::jsonb
  or jsonb_typeof(body->'id') is distinct from 'string' or body->>'id' !~ '^[A-Za-z0-9_&-]{1,200}$'
  or jsonb_typeof(body->'event') is distinct from 'string' or body->>'event' !~ '^[A-Z0-9_]{1,100}$'
  or jsonb_typeof(body->'dateCreated') is distinct from 'string'
  or body->>'dateCreated' !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$'
  or not pg_input_is_valid(body->>'dateCreated','timestamp')
  or jsonb_typeof(body->'account') is distinct from 'object' or (body->'account')-array['id']<>'{}'::jsonb
  or jsonb_typeof(body->'account'->'id') is distinct from 'string' or body->'account'->>'id' !~ '^[A-Za-z0-9_-]{1,100}$'
  or jsonb_typeof(body->'payment') is distinct from 'object' then return false; end if;
 p:=body->'payment';
 if p-array['id','customer','externalReference','value','originalValue','netValue','status','billingType','dueDate','deleted','refunds','chargeback']<>'{}'::jsonb
  or jsonb_typeof(p->'id') is distinct from 'string' or p->>'id' !~ '^[A-Za-z0-9_-]{1,100}$' then return false; end if;
 foreach k in array array['value','originalValue','netValue'] loop
  if p?k and jsonb_typeof(p->k) not in('number','null') then return false; end if;
 end loop;
 foreach k in array array['status','billingType'] loop
  if p?k and jsonb_typeof(p->k)<>'null' and (jsonb_typeof(p->k)<>'string' or p->>k !~ '^[A-Z0-9_]{1,100}$') then return false; end if;
 end loop;
 if p?'customer' and jsonb_typeof(p->'customer')<>'null' and (jsonb_typeof(p->'customer')<>'string' or p->>'customer' !~ '^[A-Za-z0-9_-]{1,100}$') then return false; end if;
 if p?'externalReference' and jsonb_typeof(p->'externalReference')<>'null' and (jsonb_typeof(p->'externalReference')<>'string' or not pg_input_is_valid(p->>'externalReference','uuid')) then return false; end if;
 if p?'dueDate' and jsonb_typeof(p->'dueDate')<>'null' and (jsonb_typeof(p->'dueDate')<>'string' or p->>'dueDate' !~ '^\d{4}-\d{2}-\d{2}$' or not pg_input_is_valid(p->>'dueDate','date')) then return false; end if;
 if p?'deleted' and jsonb_typeof(p->'deleted') not in('boolean','null') then return false; end if;
 if p?'refunds' and jsonb_typeof(p->'refunds')<>'null' then
  if jsonb_typeof(p->'refunds')<>'array' or jsonb_array_length(p->'refunds')>1000 then return false; end if;
  for r in select value from jsonb_array_elements(p->'refunds') loop
   if jsonb_typeof(r)<>'object' or r-array['dateCreated','value','status']<>'{}'::jsonb then return false; end if;
   if r?'value' and jsonb_typeof(r->'value') not in('number','null') then return false; end if;
   if r?'status' and jsonb_typeof(r->'status')<>'null' and (jsonb_typeof(r->'status')<>'string' or r->>'status' !~ '^[A-Z0-9_]{1,100}$') then return false; end if;
   if r?'dateCreated' and jsonb_typeof(r->'dateCreated')<>'null' and (jsonb_typeof(r->'dateCreated')<>'string' or r->>'dateCreated' !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' or not pg_input_is_valid(r->>'dateCreated','timestamp')) then return false; end if;
  end loop;
 end if;
 if p?'chargeback' and jsonb_typeof(p->'chargeback')<>'null' then
  v:=p->'chargeback';t:=jsonb_typeof(v->'status');
  if jsonb_typeof(v)<>'object' or v-array['status']<>'{}'::jsonb or (v?'status' and t<>'null' and (t<>'string' or v->>'status' !~ '^[A-Z0-9_]{1,100}$')) then return false; end if;
 end if;
 return true;
end;
$$;
revoke all on function private.valid_payment_webhook_body(jsonb) from public,anon,authenticated,service_role;

create table private.payment_webhook_events (
 id uuid primary key default gen_random_uuid(), scope_id uuid not null references private.payment_provider_scopes(id),
 provider_event_id text not null, event_type text not null, provider_payment_id text not null,
 provider_created_at text not null, minimal_body text not null, minimal_body_hash text not null check(minimal_body_hash ~ '^[a-f0-9]{64}$'),
 source_body_hash text not null check(source_body_hash ~ '^[a-f0-9]{64}$'), recorded_at timestamptz not null default clock_timestamp(),
 unique(scope_id,provider_event_id),
 check(octet_length(minimal_body)<=1048576 and private.valid_payment_webhook_body(minimal_body::jsonb)),
 check((minimal_body::jsonb)->>'id'=provider_event_id and (minimal_body::jsonb)->>'event'=event_type
  and (minimal_body::jsonb)->'payment'->>'id'=provider_payment_id and (minimal_body::jsonb)->>'dateCreated'=provider_created_at)
);
create table private.payment_webhook_conflicts (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references private.payment_webhook_events(id),
 minimal_body text not null, minimal_body_hash text not null check(minimal_body_hash ~ '^[a-f0-9]{64}$'),
 source_body_hash text not null check(source_body_hash ~ '^[a-f0-9]{64}$'), recorded_at timestamptz not null default clock_timestamp(),
 unique(event_id,minimal_body_hash),
 check(octet_length(minimal_body)<=1048576 and private.valid_payment_webhook_body(minimal_body::jsonb))
);
create table private.payment_webhook_queue (
 event_id uuid primary key references private.payment_webhook_events(id),
 state text not null default 'pending' check(state in('pending','processing','needs_reconciliation','done')),
 revision bigint not null default 0 check(revision>=0), attempts integer not null default 0 check(attempts>=0),
 worker_id uuid, lease_until timestamptz, available_at timestamptz not null default clock_timestamp(),
 check((worker_id is null)=(lease_until is null)), check((state='processing')=(worker_id is not null))
);
create index payment_webhook_queue_available_idx on private.payment_webhook_queue(state,available_at,event_id);
alter table private.payment_webhook_events enable row level security;
alter table private.payment_webhook_conflicts enable row level security;
alter table private.payment_webhook_queue enable row level security;
revoke all on private.payment_webhook_events,private.payment_webhook_conflicts,private.payment_webhook_queue from public,anon,authenticated,service_role;

create function private.preserve_payment_webhook_event() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' and session_user='postgres' and exists(select 1 from private.payment_fixture_environment where singleton and enabled) then return old; end if;
 raise exception 'Notificação financeira imutável';
end;
$$;
revoke all on function private.preserve_payment_webhook_event() from public,anon,authenticated,service_role;
create trigger payment_webhook_event_immutable before update or delete on private.payment_webhook_events for each row execute function private.preserve_payment_webhook_event();
create trigger payment_webhook_conflict_immutable before update or delete on private.payment_webhook_conflicts for each row execute function private.preserve_payment_webhook_event();

create function public.receive_fixture_payment_webhook(target_scope uuid,body_text text,source_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope private.payment_provider_scopes%rowtype; body jsonb; prior private.payment_webhook_events%rowtype;
 conflict private.payment_webhook_conflicts%rowtype; fingerprint text; queue_state text;
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from private.payment_fixture_environment where singleton and enabled)
  then raise exception 'Notificação financeira indisponível'; end if;
 select * into scope from private.payment_provider_scopes where id=target_scope and mode='fixture' and environment='sandbox' for key share;
 if scope.id is null or body_text is null or octet_length(body_text)>1048576 or source_hash is null or source_hash !~ '^[a-f0-9]{64}$'
  then raise exception 'Notificação financeira indisponível'; end if;
 if (body_text is json object with unique keys) is distinct from true then raise exception 'Notificação financeira indisponível'; end if;
 begin body:=body_text::jsonb; exception when others then raise exception 'Notificação financeira indisponível'; end;
 if private.valid_payment_webhook_body(body) is distinct from true or body->'account'->>'id' is distinct from scope.account_id
  then raise exception 'Notificação financeira indisponível'; end if;
 -- Canonicalização no banco conserva números exatos e nunca arquiva texto não validado.
 body_text:=body::text;
 fingerprint:=encode(extensions.digest(convert_to(body_text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('payment_webhook:'||scope.id::text||':'||(body->>'id'),0));
 select * into prior from private.payment_webhook_events where scope_id=scope.id and provider_event_id=body->>'id';
 if prior.id is null then
  insert into private.payment_webhook_events(scope_id,provider_event_id,event_type,provider_payment_id,provider_created_at,minimal_body,minimal_body_hash,source_body_hash)
   values(scope.id,body->>'id',body->>'event',body->'payment'->>'id',body->>'dateCreated',body_text,fingerprint,source_hash) returning * into prior;
  insert into private.payment_webhook_queue(event_id) values(prior.id);
  insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_webhook_received','payment_webhook_event',prior.id);
  return jsonb_build_object('schemaVersion',1,'kind','recorded','eventId',prior.id,'conflictId',null,'queueState','pending');
 end if;
 if prior.minimal_body::jsonb=body then
  select state into queue_state from private.payment_webhook_queue where event_id=prior.id;
  if queue_state is null then raise exception 'Notificação financeira indisponível'; end if;
  return jsonb_build_object('schemaVersion',1,'kind','replay','eventId',prior.id,'conflictId',null,'queueState',queue_state);
 end if;
 select * into conflict from private.payment_webhook_conflicts where event_id=prior.id and minimal_body::jsonb=body;
 if conflict.id is null then
  insert into private.payment_webhook_conflicts(event_id,minimal_body,minimal_body_hash,source_body_hash)
   values(prior.id,body_text,fingerprint,source_hash) returning * into conflict;
  update private.payment_webhook_queue set state='needs_reconciliation',revision=revision+1,worker_id=null,lease_until=null where event_id=prior.id;
  if not found then raise exception 'Notificação financeira indisponível'; end if;
  insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_webhook_conflict','payment_webhook_conflict',conflict.id);
 end if;
 select state into queue_state from private.payment_webhook_queue where event_id=prior.id;
 if queue_state is null then raise exception 'Notificação financeira indisponível'; end if;
 return jsonb_build_object('schemaVersion',1,'kind','conflict','eventId',prior.id,'conflictId',conflict.id,'queueState',queue_state);
end;
$$;
revoke all on function public.receive_fixture_payment_webhook(uuid,text,text) from public,anon,authenticated;
grant execute on function public.receive_fixture_payment_webhook(uuid,text,text) to service_role;
