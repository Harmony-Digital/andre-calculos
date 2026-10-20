-- Consulta superada exige run novo; identidade inclui os conflitos recebidos.
create or replace function private.webhook_pending_sources(target_scope uuid,payment text) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('eventId',e.id,'revision',q.revision,'bodyHash',e.minimal_body_hash,
  'customer',e.minimal_body::jsonb->'payment'->'customer','reference',e.minimal_body::jsonb->'payment'->'externalReference',
  'conflicts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'bodyHash',c.minimal_body_hash,'customer',c.minimal_body::jsonb->'payment'->'customer','reference',c.minimal_body::jsonb->'payment'->'externalReference') order by c.id) from private.payment_webhook_conflicts c where c.event_id=e.id),'[]'::jsonb)) order by e.id),'[]'::jsonb)
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
  state:=case when exists(select 1 from (select x->'customer' customer,x->'reference' reference from jsonb_array_elements(sources) x union all select z->'customer',z->'reference' from jsonb_array_elements(sources) x cross join lateral jsonb_array_elements(x->'conflicts') z) identities where (customer<>'null'::jsonb and customer is distinct from c.expectation->'customerId') or (reference<>'null'::jsonb and (reference#>>'{}')::uuid is distinct from c.intent_id)) then 'identity_mismatch' else 'claimed' end;
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
