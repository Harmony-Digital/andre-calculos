-- Conflitos preservam vínculo e barreira do pagamento original.
create or replace function private.webhook_pending_sources(target_scope uuid,payment text) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('eventId',e.id,'revision',q.revision,'bodyHash',e.minimal_body_hash,
  'payment',e.provider_payment_id,'customer',e.minimal_body::jsonb->'payment'->'customer','reference',e.minimal_body::jsonb->'payment'->'externalReference',
  'conflicts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'bodyHash',c.minimal_body_hash,'payment',c.minimal_body::jsonb->'payment'->>'id','customer',c.minimal_body::jsonb->'payment'->'customer','reference',c.minimal_body::jsonb->'payment'->'externalReference') order by c.id) from private.payment_webhook_conflicts c where c.event_id=e.id),'[]'::jsonb)) order by e.id),'[]'::jsonb)
 from private.payment_webhook_events e join private.payment_webhook_queue q on q.event_id=e.id
 where e.scope_id=target_scope and e.provider_payment_id=payment and q.state<>'done';
$$;

create or replace function public.claim_fixture_payment_webhook(target_event uuid,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.payment_webhook_events%rowtype;c private.payment_financial_charges%rowtype;r private.payment_webhook_runs%rowtype;
 prior private.payment_webhook_claims%rowtype;sources jsonb;fingerprint text;scope jsonb;result jsonb;state text;query_old boolean:=false;at_time timestamptz:=clock_timestamp();
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from private.payment_fixture_environment where singleton and enabled)
  or target_event is null or request_id is null then raise exception 'Worker de webhook indisponível'; end if;
 select * into e from private.payment_webhook_events where id=target_event;
 if e.id is null then raise exception 'Worker de webhook indisponível'; end if;
 perform private.lock_webhook_payment(e.scope_id,e.provider_payment_id);
 perform pg_advisory_xact_lock(hashtextextended('webhook_claim:'||request_id::text,0));
 select * into prior from private.payment_webhook_claims where payment_webhook_claims.request_id=claim_fixture_payment_webhook.request_id;
 if prior.request_id is not null then
  if prior.target_event is distinct from target_event then raise exception 'Solicitação de webhook divergente'; end if;
  select * into r from private.payment_webhook_runs where id=prior.run_id;
  if r.charge_id is not null then perform private.require_payment_fixture_system(r.scope_id,(select client_id from private.payment_financial_charges where id=r.charge_id)); end if;
  return prior.result;
 end if;
 at_time:=clock_timestamp();
 sources:=private.webhook_pending_sources(e.scope_id,e.provider_payment_id);
 if jsonb_array_length(sources)=0 then return jsonb_build_object('schemaVersion',1,'mode','fixture','identityProof','fixture_declared','state','already_processed','eventId',e.id); end if;
 fingerprint:=encode(sha256(convert_to(sources::text,'UTF8')),'hex');
 select * into c from private.payment_financial_charges where scope_id=e.scope_id and provider_payment_id=e.provider_payment_id;
 state:='unmatched';
 if c.id is not null then
  scope:=private.require_payment_fixture_system(c.scope_id,c.client_id);
  if not exists(select 1 from private.payment_execution_observations o join private.payment_execution_runs x on x.id=o.run_id
    where o.id=c.origin_id and x.intent_id=c.intent_id and x.scope_id=c.scope_id and x.client_id=c.client_id and x.selected_payment_id=c.provider_payment_id)
   or c.expectation->'scope' is distinct from scope or c.expectation->>'reference' is distinct from c.intent_id::text then raise exception 'Origem de webhook indisponível'; end if;
  state:=case when exists(select 1 from (select x->'customer' customer,x->'reference' reference from jsonb_array_elements(sources) x union all select z->'payment',z->'customer',z->'reference' from jsonb_array_elements(sources) x cross join lateral jsonb_array_elements(x->'conflicts') z) identities where payment is distinct from to_jsonb(c.provider_payment_id) or (customer<>'null'::jsonb and customer is distinct from c.expectation->'customerId') or (reference<>'null'::jsonb and (reference#>>'{}')::uuid is distinct from c.intent_id)) then 'identity_mismatch' else 'claimed' end;
 end if;
 select * into r from private.payment_webhook_runs where scope_id=e.scope_id and provider_payment_id=e.provider_payment_id and stage in('claimed','queried') for update;
 query_old:=r.id is not null and exists(select 1 from private.payment_financial_queries q where q.id=r.query_id and q.revision is distinct from c.revision);
 if r.id is not null and not query_old and r.source_fingerprint=fingerprint and r.lease_until>at_time then
  return jsonb_build_object('schemaVersion',1,'mode','fixture','identityProof','fixture_declared','state','busy','eventId',e.id);
 end if;
 if r.id is not null and (query_old or r.source_fingerprint<>fingerprint) then
  update private.payment_webhook_runs set stage='superseded' where id=r.id;
  update private.payment_webhook_queue set state='pending',worker_id=null,lease_until=null where worker_id=r.worker_id and event_id in(select (x->>'eventId')::uuid from jsonb_array_elements(r.source_snapshot) x);
  r:=null;
 end if;
 if r.id is null then
  insert into private.payment_webhook_runs(id,trigger_event_id,scope_id,provider_payment_id,charge_id,source_snapshot,source_fingerprint,lease_until,stage)
   values(request_id,e.id,e.scope_id,e.provider_payment_id,c.id,sources,fingerprint,at_time+interval '2 minutes',state) returning * into r;
 else
  update private.payment_webhook_runs set worker_id=gen_random_uuid(),epoch=epoch+1,lease_until=at_time+interval '2 minutes' where id=r.id returning * into r;
 end if;
 if r.stage in('claimed','queried') then
  update private.payment_webhook_queue set state='processing',worker_id=r.worker_id,lease_until=r.lease_until,attempts=attempts+1
   where event_id in(select (x->>'eventId')::uuid from jsonb_array_elements(sources) x);
 else
  update private.payment_webhook_queue set state='needs_reconciliation',worker_id=null,lease_until=null
   where event_id in(select (x->>'eventId')::uuid from jsonb_array_elements(sources) x);
 end if;
 result:=private.webhook_run_result(r);
 insert into private.payment_webhook_claims(request_id,run_id,target_event,result) values(request_id,r.id,e.id,result);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_webhook_claimed','payment_webhook_claim',request_id);
 return result;
end; $$;

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
 -- O mutex de evento estabiliza a identidade original, inclusive quando o conflito muda payment.id.
 -- Claim/consulta/finalização nunca tomam esse mutex, evitando ordem inversa.
 perform pg_advisory_xact_lock(hashtextextended('payment_webhook:'||scope.id::text||':'||(body->>'id'),0));
 select * into prior from private.payment_webhook_events where scope_id=scope.id and provider_event_id=body->>'id';
 perform private.lock_webhook_payment(scope.id,coalesce(prior.provider_payment_id,body->'payment'->>'id'));
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
