-- Autorização local de sistema; não executa HTTP nem concede crédito.
create table private.payment_execution_runs (
 id uuid primary key, intent_id uuid not null unique references private.payment_intents(id),
 request_id uuid not null, scope_id uuid not null references private.payment_provider_scopes(id),
 client_id uuid not null references public.clients(id), snapshot jsonb not null,
 state text not null default 'pending' check(state in('pending','held','stopped')),
 reason text, revision bigint not null default 0 check(revision between 0 and 9007199254740991),
 current_step uuid, created_at timestamptz not null default clock_timestamp(),
 foreign key(request_id,intent_id) references private.payment_intent_requests(id,intent_id),
 check(jsonb_typeof(snapshot)='object')
);
create index payment_execution_runs_request_idx on private.payment_execution_runs(request_id,intent_id);
create index payment_execution_runs_scope_idx on private.payment_execution_runs(scope_id);
create index payment_execution_runs_client_idx on private.payment_execution_runs(client_id);
create table private.payment_execution_steps (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references private.payment_execution_runs(id),
 worker_id uuid not null, action text not null check(action in('create','find')),
 revision bigint not null, started boolean not null default false,
 created_at timestamptz not null default clock_timestamp(), unique(id,run_id)
);
create index payment_execution_steps_run_idx on private.payment_execution_steps(run_id);
alter table private.payment_execution_runs add foreign key(current_step,id) references private.payment_execution_steps(id,run_id);
create index payment_execution_runs_step_idx on private.payment_execution_runs(current_step,id);
alter table private.payment_execution_runs enable row level security;
alter table private.payment_execution_steps enable row level security;
revoke all on private.payment_execution_runs,private.payment_execution_steps from public,anon,authenticated,service_role;
create function private.preserve_payment_execution_run() returns trigger language plpgsql set search_path='' as $$
begin
 if(new.id,new.intent_id,new.request_id,new.scope_id,new.client_id,new.snapshot,new.created_at)
  is distinct from(old.id,old.intent_id,old.request_id,old.scope_id,old.client_id,old.snapshot,old.created_at)
  or new.revision<old.revision then raise exception 'Execução imutável'; end if;
 return new;
end; $$;
create function private.preserve_payment_execution_step() returns trigger language plpgsql set search_path='' as $$
begin
 if(new.id,new.run_id,new.worker_id,new.action,new.revision,new.created_at)
  is distinct from(old.id,old.run_id,old.worker_id,old.action,old.revision,old.created_at)
  or(old.started and not new.started) then raise exception 'Etapa imutável'; end if;
 return new;
end; $$;
create trigger payment_execution_run_preserve before update on private.payment_execution_runs for each row execute function private.preserve_payment_execution_run();
create trigger payment_execution_step_preserve before update on private.payment_execution_steps for each row execute function private.preserve_payment_execution_step();
revoke all on function private.preserve_payment_execution_run(),private.preserve_payment_execution_step() from public,anon,authenticated,service_role;

create function private.lock_payment_execution(target_request uuid) returns private.payment_intents
language plpgsql security definer set search_path='' as $$
declare receipt private.payment_intent_requests%rowtype; intent private.payment_intents%rowtype;
 captured private.payment_obligation_contexts%rowtype; owner_before uuid; client public.clients%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Execução fictícia indisponível'; end if;
 select * into receipt from private.payment_intent_requests r where r.id=target_request and r.action='reserve';
 select * into intent from private.payment_intents i where i.id=receipt.intent_id and i.context_id=receipt.context_id;
 select * into captured from private.payment_obligation_contexts c where c.id=intent.context_id and c.order_id=intent.order_id;
 if intent.id is null or receipt.actor_id is distinct from intent.created_by
  or receipt.result->>'semantics' is distinct from 'receipt_snapshot' or receipt.result->>'action' is distinct from 'reserve'
  or receipt.result->>'requestId' is distinct from target_request::text
  or receipt.result->>'actorId' is distinct from intent.created_by::text
  or receipt.result->'snapshot'->'intent'->>'id' is distinct from intent.id::text
  or receipt.result->'snapshot'->'intent'->>'contextId' is distinct from captured.id::text
  or receipt.result->'snapshot'->'intent'->>'reference' is distinct from intent.reference
  or receipt.result->'snapshot'->'intent'->>'createdBy' is distinct from intent.created_by::text
  or receipt.result->'snapshot'->'intent'->'obligation' is distinct from captured.snapshot
  then raise exception 'Execução fictícia indisponível'; end if;
 perform private.require_payment_fixture_system((captured.snapshot->'binding'->>'scopeId')::uuid,captured.client_id);
 select c.owner_id into owner_before from public.clients c where c.id=captured.client_id;
 perform p.id from public.profiles p where p.id in(owner_before,intent.created_by,captured.actor_id,(captured.snapshot->>'ownerId')::uuid) order by p.id for share;
 select * into client from public.clients c where c.id=captured.client_id for update;
 if client.owner_id is distinct from owner_before then raise sqlstate 'PT409' using message='Cliente mudou em outra sessão'; end if;
 perform o.id from public.orders o where o.id=intent.order_id and o.client_id=client.id for update;
 if not found then raise exception 'Execução fictícia indisponível'; end if;
 perform p.id from public.payments p where p.order_id=intent.order_id order by p.id for update;
 perform cfg.singleton from private.payment_provider_configuration cfg where cfg.singleton for share;
 perform c.id from private.payment_obligation_contexts c where c.id=captured.id for share;
 perform b.id from private.payment_provider_customers b where b.id=captured.binding_id for share;
 select * into intent from private.payment_intents i where i.id=intent.id for update;
 perform r.order_id from private.payment_intent_reservations r where r.intent_id=intent.id for update;
 return intent;
end; $$;
create function private.payment_execution_context_current(target_intent uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare intent private.payment_intents%rowtype; captured private.payment_obligation_contexts%rowtype;
 preview jsonb;
begin
 select * into intent from private.payment_intents i where i.id=target_intent;
 select * into captured from private.payment_obligation_contexts c where c.id=intent.context_id;
 preview:=private.payment_obligation_preview(intent.order_id,captured.phase);
 return preview->>'status'='ready' and preview=(captured.snapshot-array['billingType','dueDate'])
  and exists(select 1 from public.profiles p where p.id=(captured.snapshot->>'ownerId')::uuid and p.role='client')
  and exists(select 1 from public.profiles p where p.id=intent.created_by and (p.role='calculator'
   or(p.role='client' and p.id=(captured.snapshot->>'ownerId')::uuid)));
end; $$;
create function private.payment_execution_view(target_intent uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('mode','fixture','identityProof','fixture_declared','intentId',i.id,
 'runId',run.id,'createdBy',i.created_by,'currentOwnerId',c.owner_id,'createdAt',run.created_at,
 'state',coalesce(run.state,'unstarted'),'reason',run.reason,'revision',coalesce(run.revision,0),
 'dispatchClaimed',exists(select 1 from private.payment_intent_dispatch_claims d where d.intent_id=i.id),
 'reservationActive',exists(select 1 from private.payment_intent_reservations r where r.intent_id=i.id))
 from private.payment_intents i join public.orders o on o.id=i.order_id join public.clients c on c.id=o.client_id
 left join private.payment_execution_runs run on run.intent_id=i.id where i.id=target_intent;
$$;
revoke all on function private.lock_payment_execution(uuid),private.payment_execution_context_current(uuid),private.payment_execution_view(uuid) from public,anon,authenticated,service_role;

create function public.claim_payment_execution_step(target_request uuid,worker_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare intent private.payment_intents%rowtype; captured private.payment_obligation_contexts%rowtype;
 binding private.payment_provider_customers%rowtype; run private.payment_execution_runs%rowtype;
 step private.payment_execution_steps%rowtype; prior_claim private.payment_intent_dispatch_claims%rowtype;
 selected_action text; scope jsonb;
begin
 if worker_id is null then raise exception 'Execução fictícia indisponível'; end if;
 intent:=private.lock_payment_execution(target_request);
 select * into captured from private.payment_obligation_contexts c where c.id=intent.context_id;
 select * into binding from private.payment_provider_customers b where b.id=captured.binding_id;
 select * into prior_claim from private.payment_intent_dispatch_claims c where c.intent_id=intent.id;
 scope:=private.require_payment_fixture_system((captured.snapshot->'binding'->>'scopeId')::uuid,captured.client_id);
 insert into private.payment_execution_runs(id,intent_id,request_id,scope_id,client_id,snapshot)
 values(coalesce(prior_claim.run_id,gen_random_uuid()),intent.id,target_request,(captured.snapshot->'binding'->>'scopeId')::uuid,captured.client_id,
  jsonb_build_object('obligation',captured.snapshot,'customer',jsonb_build_object('kind',binding.kind,'document',binding.document)))
 on conflict(intent_id) do nothing;
 select * into run from private.payment_execution_runs r where r.intent_id=intent.id for update;
 if run.request_id<>target_request or(prior_claim.intent_id is not null and prior_claim.run_id<>run.id) then raise exception 'Execução fictícia indisponível'; end if;
 if not exists(select 1 from private.payment_intent_reservations r where r.intent_id=intent.id and r.order_id=intent.order_id)
  or exists(select 1 from private.payment_intent_withdrawals w where w.intent_id=intent.id) then
  update private.payment_execution_runs r set state='stopped',reason='reservation_missing',current_step=null,revision=r.revision+1 where r.id=run.id;
  return jsonb_build_object('requestId',target_request,'view',private.payment_execution_view(intent.id),'step',null);
 end if;
 if prior_claim.intent_id is not null or exists(select 1 from private.payment_fixture_requests r where r.operation='payment_create'
  and r.scope_id=run.scope_id and r.client_id=run.client_id and r.payload->>'reference'=intent.reference) then selected_action:='find';
 elsif private.payment_execution_context_current(intent.id) then selected_action:='create';
 else
  update private.payment_execution_runs r set state='held',reason='context_changed',current_step=null,revision=r.revision+1 where r.id=run.id;
  return jsonb_build_object('requestId',target_request,'view',private.payment_execution_view(intent.id),'step',null);
 end if;
 insert into private.payment_execution_steps(run_id,worker_id,action,revision) values(run.id,worker_id,selected_action,run.revision+1) returning * into step;
 update private.payment_execution_runs r set state='pending',reason=null,current_step=step.id,revision=step.revision where r.id=run.id;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_execution_step_claimed','payment_execution_step',step.id);
 return jsonb_build_object('requestId',target_request,'view',private.payment_execution_view(intent.id),'step',jsonb_build_object(
  'id',step.id,'runId',run.id,'workerId',step.worker_id,'requestId',target_request,'intentId',intent.id,
  'action',step.action,'scopeId',run.scope_id,'clientId',run.client_id,'scope',scope,'snapshot',run.snapshot));
end; $$;
create function public.start_payment_execution_step(target_step uuid,worker_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare initial_step private.payment_execution_steps%rowtype; step private.payment_execution_steps%rowtype;
 run private.payment_execution_runs%rowtype; intent private.payment_intents%rowtype;
begin
 select * into initial_step from private.payment_execution_steps s where s.id=target_step;
 select * into run from private.payment_execution_runs r where r.id=initial_step.run_id;
 intent:=private.lock_payment_execution(run.request_id);
 select * into run from private.payment_execution_runs r where r.id=run.id for update;
 select * into step from private.payment_execution_steps s where s.id=target_step and s.run_id=run.id for update;
 if step.worker_id is distinct from worker_id or step.started or run.current_step is distinct from step.id
  or run.revision<>step.revision then return false; end if;
 if not exists(select 1 from private.payment_intent_reservations r where r.intent_id=intent.id and r.order_id=intent.order_id)
  or exists(select 1 from private.payment_intent_withdrawals w where w.intent_id=intent.id) then
  update private.payment_execution_runs r set state='stopped',reason='reservation_missing' where r.id=run.id; return false;
 end if;
 if step.action='create' then
  if exists(select 1 from private.payment_intent_dispatch_claims c where c.intent_id=intent.id)
   or exists(select 1 from private.payment_fixture_requests r where r.operation='payment_create' and r.scope_id=run.scope_id
    and r.client_id=run.client_id and r.payload->>'reference'=intent.reference)
   or private.payment_execution_context_current(intent.id) is not true then
   update private.payment_execution_runs r set state='held',reason='context_changed' where r.id=run.id; return false;
  end if;
  insert into private.payment_intent_dispatch_claims(intent_id,run_id) values(intent.id,run.id);
 else
  if exists(select 1 from private.payment_intent_dispatch_claims c where c.intent_id=intent.id and c.run_id<>run.id) then raise exception 'Execução fictícia indisponível'; end if;
 end if;
 update private.payment_execution_steps s set started=true where s.id=step.id;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_execution_step_started','payment_execution_step',step.id);
 return true;
end; $$;
revoke all on function public.claim_payment_execution_step(uuid,uuid),public.start_payment_execution_step(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_payment_execution_step(uuid,uuid),public.start_payment_execution_step(uuid,uuid) to service_role;
create function public.get_payment_execution(target_intent uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare order_id uuid; actor uuid;
begin
 select i.order_id into order_id from private.payment_intents i where i.id=target_intent;
 actor:=private.lock_payment_intent_order(order_id,false);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'payment_execution_viewed','payment_intent',target_intent);
 return private.payment_execution_view(target_intent);
end; $$;
revoke all on function public.get_payment_execution(uuid) from public,anon,service_role;
grant execute on function public.get_payment_execution(uuid) to authenticated;
