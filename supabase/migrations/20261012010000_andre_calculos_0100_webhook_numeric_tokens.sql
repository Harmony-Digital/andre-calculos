-- Conservar tokens numéricos do envelope mínimo; JSONB apenas compara replay.
alter table private.payment_webhook_events add constraint payment_webhook_event_unique_json check(minimal_body is json object with unique keys);
alter table private.payment_webhook_conflicts add constraint payment_webhook_conflict_unique_json check(minimal_body is json object with unique keys);

create or replace function public.receive_fixture_payment_webhook(target_scope uuid,body_text text,source_hash text) returns jsonb
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
