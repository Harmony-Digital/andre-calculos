-- Intenções locais: referência durável antes de POST, reserva por pedido e replay.
-- Não despacha, credita ou cancela cobrança externa. O executor fica em i.
alter table private.payment_obligation_contexts add constraint payment_obligation_order_key unique(id,order_id);
create table private.payment_intents (
 id uuid primary key default gen_random_uuid(), context_id uuid not null, order_id uuid not null references public.orders(id),
 reference text generated always as (id::text) stored,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default clock_timestamp(),
 foreign key(context_id,order_id) references private.payment_obligation_contexts(id,order_id),
 unique(id,order_id), unique(id,context_id)
);
create index payment_intents_context_idx on private.payment_intents(context_id,order_id);
create index payment_intents_order_idx on private.payment_intents(order_id,created_at desc,id desc);
create index payment_intents_actor_idx on private.payment_intents(created_by);
create table private.payment_intent_reservations (
 order_id uuid primary key references public.orders(id), intent_id uuid not null unique,
 foreign key(intent_id,order_id) references private.payment_intents(id,order_id)
);
create table private.payment_intent_requests (
 id uuid primary key, action text not null check(action in ('reserve','withdraw')),
 context_id uuid not null, intent_id uuid not null, actor_id uuid not null references public.profiles(id),
 expected_revision integer check(expected_revision between 0 and 2147483646),
 result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),
 check((action='reserve' and expected_revision is null) or (action='withdraw' and expected_revision is not null)),
 foreign key(intent_id,context_id) references private.payment_intents(id,context_id), unique(id,intent_id)
);
create index payment_intent_reservations_binding_idx on private.payment_intent_reservations(intent_id,order_id);
create index payment_intent_requests_intent_idx on private.payment_intent_requests(intent_id,context_id);
create index payment_intent_requests_actor_idx on private.payment_intent_requests(actor_id);
create table private.payment_intent_withdrawals (
 intent_id uuid primary key references private.payment_intents(id), request_id uuid not null unique,
 withdrawn_at timestamptz not null,
 foreign key(request_id,intent_id) references private.payment_intent_requests(id,intent_id)
);
-- Marco monotônico: I persistirá o primeiro claim antes do POST. Sem RPC de despacho em L.
create table private.payment_intent_dispatch_claims (
 intent_id uuid primary key references private.payment_intents(id), run_id uuid not null unique,
 claimed_at timestamptz not null default clock_timestamp()
);
create index payment_intent_withdrawals_request_idx on private.payment_intent_withdrawals(request_id,intent_id);
alter table private.payment_intents enable row level security;
alter table private.payment_intent_reservations enable row level security;
alter table private.payment_intent_requests enable row level security;
alter table private.payment_intent_withdrawals enable row level security;
alter table private.payment_intent_dispatch_claims enable row level security;
revoke all on private.payment_intents,private.payment_intent_reservations,private.payment_intent_requests,
 private.payment_intent_withdrawals,private.payment_intent_dispatch_claims from public,anon,authenticated,service_role;
create trigger payment_intent_immutable before update on private.payment_intents for each row execute function private.preserve_quote_contract_record();
create trigger payment_intent_request_immutable before update on private.payment_intent_requests for each row execute function private.preserve_quote_contract_record();
create trigger payment_intent_withdrawal_immutable before update on private.payment_intent_withdrawals for each row execute function private.preserve_quote_contract_record();
create trigger payment_intent_claim_immutable before update on private.payment_intent_dispatch_claims for each row execute function private.preserve_quote_contract_record();
create trigger payment_intent_reservation_immutable before update on private.payment_intent_reservations for each row execute function private.preserve_quote_contract_record();

create function private.lock_payment_intent_order(target_order uuid,for_write boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner_before uuid; customer public.clients%rowtype;
begin
 select c.owner_id into owner_before from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order;
 perform p.id from public.profiles p where p.id in (actor,owner_before) order by p.id for share;
 if for_write then
  select c.* into customer from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order for update of c;
 else
  select c.* into customer from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order for share of c;
 end if;
 if customer.id is null or customer.owner_id is distinct from owner_before then raise exception 'Pedido indisponível'; end if;
 if for_write then
  perform o.id from public.orders o where o.id=target_order and o.client_id=customer.id for update;
 else
  perform o.id from public.orders o where o.id=target_order and o.client_id=customer.id for share;
 end if;
 if not found then raise exception 'Pedido indisponível'; end if;
 actor:=private.authorize_payment_obligation(target_order);
 if for_write then perform p.id from public.payments p where p.order_id=target_order order by p.id for update; end if;
 return actor;
end;
$$;
revoke all on function private.lock_payment_intent_order(uuid,boolean) from public,anon,authenticated,service_role;

create function private.payment_intent_view(target_intent uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare job private.payment_intents%rowtype; captured private.payment_obligation_contexts%rowtype;
 active boolean; claim_at timestamptz; withdrawal private.payment_intent_withdrawals%rowtype;
 state text; revision integer; withdrawn_by uuid; current_owner uuid;
begin
 select * into job from private.payment_intents where id=target_intent;
 if job.id is null then raise exception 'Intenção indisponível'; end if;
 select * into captured from private.payment_obligation_contexts where id=job.context_id and order_id=job.order_id;
 select c.owner_id into current_owner from public.orders o join public.clients c on c.id=o.client_id where o.id=job.order_id;
 select exists(select 1 from private.payment_intent_reservations where intent_id=job.id and order_id=job.order_id) into active;
 select claimed_at into claim_at from private.payment_intent_dispatch_claims where intent_id=job.id;
 select * into withdrawal from private.payment_intent_withdrawals where intent_id=job.id;
 if withdrawal.intent_id is not null then
  if claim_at is not null or active then raise exception 'Estado da intenção indisponível'; end if;
  state:='withdrawn'; revision:=1;
  select actor_id into withdrawn_by from private.payment_intent_requests where id=withdrawal.request_id and intent_id=job.id;
 elsif active and claim_at is not null then state:='dispatch_claimed';revision:=1;
 elsif active then state:='reserved';revision:=0;
 else raise exception 'Estado da intenção indisponível'; end if;
 return jsonb_build_object('intent',jsonb_build_object('schemaVersion',1,'mode','fixture','identityProof','fixture_declared',
  'id',job.id,'reference',job.reference,'contextId',job.context_id,'createdBy',job.created_by,'createdAt',job.created_at,'obligation',captured.snapshot),
  'currentOwnerId',current_owner,'state',state,'revision',revision,'reservationActive',active,
  'claimedAt',claim_at,'withdrawnAt',withdrawal.withdrawn_at,'withdrawnBy',withdrawn_by);
end;
$$;
revoke all on function private.payment_intent_view(uuid) from public,anon,authenticated,service_role;

create function public.reserve_payment_intent(target_context uuid,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare captured private.payment_obligation_contexts%rowtype; actor uuid; intent private.payment_intents%rowtype;
 prior private.payment_intent_requests%rowtype; preview jsonb; result jsonb; at_time timestamptz;
begin
 if target_context is null or request_id is null then raise exception 'Confira a intenção'; end if;
 select * into captured from private.payment_obligation_contexts where id=target_context;
 actor:=private.lock_payment_intent_order(captured.order_id,true);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-intent-request:'||request_id::text,0));
 select * into prior from private.payment_intent_requests where id=request_id;
 if prior.id is not null then
  if prior.action<>'reserve' or prior.context_id<>target_context or prior.actor_id<>actor
   then raise sqlstate 'PT409' using message='Tentativa já registrada com outros dados'; end if;
  return prior.result;
 end if;
 if exists(select 1 from private.payment_intent_reservations where order_id=captured.order_id)
  then raise sqlstate 'PT409' using message='Há uma reserva pendente para este pedido'; end if;
 perform cfg.singleton from private.payment_provider_configuration cfg where cfg.singleton for share;
 preview:=private.payment_obligation_preview(captured.order_id,captured.phase);
 if preview->>'status'<>'ready' or preview is distinct from (captured.snapshot-array['billingType','dueDate'])
  then raise sqlstate 'PT409' using message='Recarregue e prepare o contexto vigente'; end if;
 insert into private.payment_intents(context_id,order_id,created_by) values(captured.id,captured.order_id,actor) returning * into intent;
 insert into private.payment_intent_reservations(order_id,intent_id) values(intent.order_id,intent.id);
 at_time:=clock_timestamp();
 result:=jsonb_build_object('semantics','receipt_snapshot','requestId',request_id,'action','reserve','actorId',actor,
  'recordedAt',at_time,'expectedRevision',null,'appliedRevision',0,'snapshot',private.payment_intent_view(intent.id));
 insert into private.payment_intent_requests(id,action,context_id,intent_id,actor_id,result,recorded_at)
  values(request_id,'reserve',captured.id,intent.id,actor,result,at_time);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'payment_intent_reserved','payment_intent',intent.id);
 return result;
end;
$$;
revoke all on function public.reserve_payment_intent(uuid,uuid) from public,anon,service_role;
grant execute on function public.reserve_payment_intent(uuid,uuid) to authenticated;

create function public.withdraw_payment_intent(target_intent uuid,expected_revision integer,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare intent private.payment_intents%rowtype; actor uuid; prior private.payment_intent_requests%rowtype;
 result jsonb; at_time timestamptz; before_view jsonb;
begin
 if target_intent is null or request_id is null or expected_revision is null or expected_revision not between 0 and 2147483646
  then raise exception 'Confira a retirada local'; end if;
 select * into intent from private.payment_intents where id=target_intent;
 actor:=private.lock_payment_intent_order(intent.order_id,true);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-intent-request:'||request_id::text,0));
 select * into prior from private.payment_intent_requests where id=request_id;
 if prior.id is not null then
  if prior.action<>'withdraw' or prior.intent_id<>target_intent or prior.actor_id<>actor or prior.expected_revision<>expected_revision
   then raise sqlstate 'PT409' using message='Tentativa já registrada com outros dados'; end if;
  return prior.result;
 end if;
 before_view:=private.payment_intent_view(intent.id);
 if exists(select 1 from private.payment_intent_dispatch_claims where intent_id=intent.id)
  then raise sqlstate 'PT409' using message='Despacho registrado exige conciliação'; end if;
 if before_view->>'state'<>'reserved' or (before_view->>'revision')::integer<>expected_revision
  then raise sqlstate 'PT409' using message='A reserva mudou em outra sessão'; end if;
 at_time:=clock_timestamp();
 -- O recibo antecede a retirada para manter a FK; tudo faz parte da mesma transação.
 result:=jsonb_build_object('semantics','receipt_snapshot','requestId',request_id,'action','withdraw','actorId',actor,
  'recordedAt',at_time,'expectedRevision',expected_revision,'appliedRevision',1,'snapshot',
  before_view||jsonb_build_object('state','withdrawn','revision',1,'reservationActive',false,'withdrawnAt',at_time,'withdrawnBy',actor));
 insert into private.payment_intent_requests(id,action,context_id,intent_id,actor_id,expected_revision,result,recorded_at)
  values(request_id,'withdraw',intent.context_id,intent.id,actor,expected_revision,result,at_time);
 insert into private.payment_intent_withdrawals(intent_id,request_id,withdrawn_at) values(intent.id,request_id,at_time);
 delete from private.payment_intent_reservations where order_id=intent.order_id and intent_id=intent.id;
 if not found then raise sqlstate 'PT409' using message='A reserva mudou em outra sessão'; end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'payment_intent_withdrawn','payment_intent',intent.id);
 return result;
end;
$$;
revoke all on function public.withdraw_payment_intent(uuid,integer,uuid) from public,anon,service_role;
grant execute on function public.withdraw_payment_intent(uuid,integer,uuid) to authenticated;

create function public.get_payment_intent(target_intent uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare order_id uuid; actor uuid; result jsonb;
begin
 select i.order_id into order_id from private.payment_intents i where i.id=target_intent;
 actor:=private.lock_payment_intent_order(order_id,false);
 result:=private.payment_intent_view(target_intent)||jsonb_build_object('semantics','current_state');
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'payment_intent_viewed','payment_intent',target_intent);
 return result;
end;
$$;
revoke all on function public.get_payment_intent(uuid) from public,anon,service_role;
grant execute on function public.get_payment_intent(uuid) to authenticated;

create function public.get_order_payment_reservation(target_order uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; intent_id uuid; result jsonb;
begin
 actor:=private.lock_payment_intent_order(target_order,false);
 select r.intent_id into intent_id from private.payment_intent_reservations r where r.order_id=target_order;
 if intent_id is not null then result:=private.payment_intent_view(intent_id)||jsonb_build_object('semantics','current_state'); end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'payment_reservation_viewed','order',target_order);
 return result;
end;
$$;
revoke all on function public.get_order_payment_reservation(uuid) from public,anon,service_role;
grant execute on function public.get_order_payment_reservation(uuid) to authenticated;
