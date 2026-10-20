-- Projeção preparada localmente. Escritor transacional/efeitos pertencem a X.
create table private.payment_financial_positions (
 charge_id uuid primary key references private.payment_financial_charges(id),
 observation_id uuid not null references private.payment_financial_observations(id),
 revision bigint not null check(revision between 1 and 9007199254740991),
 value jsonb not null check(jsonb_typeof(value)='object' and octet_length(value::text)<=1048576),
 created_at timestamptz not null default clock_timestamp()
);
create index payment_financial_positions_observation_idx on private.payment_financial_positions(observation_id);
create table private.payment_legacy_bindings (
 payment_id uuid primary key references public.payments(id),charge_id uuid not null references private.payment_financial_charges(id),
 scope_id uuid not null references private.payment_provider_scopes(id),observation_id uuid not null references private.payment_financial_observations(id),
 identity_proof text not null check(identity_proof='fixture_explicit_source'),created_at timestamptz not null default clock_timestamp()
);
create index payment_legacy_bindings_charge_idx on private.payment_legacy_bindings(charge_id);
create index payment_legacy_bindings_scope_idx on private.payment_legacy_bindings(scope_id);
create index payment_legacy_bindings_observation_idx on private.payment_legacy_bindings(observation_id);
alter table private.payment_financial_positions enable row level security;
alter table private.payment_legacy_bindings enable row level security;
revoke all on private.payment_financial_positions,private.payment_legacy_bindings from public,anon,authenticated,service_role;
create trigger payment_legacy_binding_immutable before update on private.payment_legacy_bindings for each row execute function private.preserve_quote_contract_record();
create function private.guard_financial_position() returns trigger language plpgsql set search_path='' as $$
declare c private.payment_financial_charges%rowtype;o private.payment_financial_observations%rowtype;key text;number numeric;
begin
 if tg_op='UPDATE' and(new.charge_id is distinct from old.charge_id or new.created_at is distinct from old.created_at or new.revision<>old.revision+1) then raise exception 'Revisão financeira indisponível'; end if;
 select * into c from private.payment_financial_charges where id=new.charge_id;
 select * into o from private.payment_financial_observations where id=new.observation_id and charge_id=c.id;
 if o.id is null or new.value->'schemaVersion' is distinct from '1'::jsonb or new.value->>'semantics' is distinct from 'cumulative_position'
  or new.value->>'certainty' is null or new.value->>'certainty' not in('known','reconcile') or new.value->>'observationId' is distinct from o.id::text
  or new.value->'snapshot' is distinct from coalesce(o.facts,'null'::jsonb) or new.value->'proof' is distinct from o.proof
  or new.value->'sourceOrder' is distinct from coalesce(to_jsonb(o.source_order),'null'::jsonb)
  or new.value-array['schemaVersion','semantics','certainty','observationId','sourceOrder','snapshot','proof','receivedGrossCents','completedRefundCents','pendingRefundCents','chargebackOutstandingCents','creditCents','lastKnownCreditCents','remainingCents','excessCents','feeCents','reasons','resolutionCandidate']<>'{}'::jsonb
  then raise exception 'Posição financeira sem origem'; end if;
 foreach key in array array['receivedGrossCents','completedRefundCents','pendingRefundCents','chargebackOutstandingCents','creditCents','lastKnownCreditCents','remainingCents','excessCents','feeCents'] loop
  if new.value->key is null then raise exception 'Campo financeiro ausente'; end if;
  if new.value->key<>'null'::jsonb then
   if jsonb_typeof(new.value->key)<>'number' then raise exception 'Valor financeiro inválido'; end if;
   number:=(new.value->>key)::numeric;
   if number<0 or number>9007199254740991 or trunc(number)<>number then raise exception 'Valor financeiro inválido'; end if;
  end if;
 end loop;
 if new.value->'receivedGrossCents'<>'null'::jsonb and not exists(select 1 from private.payment_financial_observations h where h.charge_id=c.id
  and h.facts->>'status'='RECEIVED' and h.facts->>'classification'='received' and h.facts->'deleted'='false'::jsonb
  and h.facts->'amounts'->'receivedCents'=new.value->'receivedGrossCents') then raise exception 'Bruto sem prova de recebimento'; end if;
 if new.value->>'certainty'='known' then
  if new.value->'creditCents'='null'::jsonb or jsonb_typeof(new.value->'creditCents') is distinct from 'number'
   or (new.value->>'creditCents')::numeric not between 0 and 9007199254740991 then raise exception 'Crédito financeiro inválido'; end if;
 end if;
 return new;
end; $$;
create trigger payment_financial_position_guard before insert or update on private.payment_financial_positions for each row execute function private.guard_financial_position();
create function private.guard_legacy_payment_binding() returns trigger language plpgsql set search_path='' as $$
declare c private.payment_financial_charges%rowtype;o private.payment_financial_observations%rowtype;p public.payments%rowtype;phase text;
begin
 select * into c from private.payment_financial_charges where id=new.charge_id;
 select * into o from private.payment_financial_observations where id=new.observation_id and charge_id=c.id;
 select * into p from public.payments where id=new.payment_id;
 select x.phase into phase from private.payment_intents i join private.payment_obligation_contexts x on x.id=i.context_id where i.id=c.intent_id;
 if o.id is null or p.id is null or new.scope_id is distinct from c.scope_id or p.order_id is distinct from c.order_id
  or p.kind::text is distinct from phase or p.method::text is distinct from 'asaas' or p.provider_ref is distinct from c.provider_payment_id
  or o.facts->>'paymentId' is distinct from c.provider_payment_id or o.facts->>'status' is distinct from 'RECEIVED'
  or o.facts->>'classification' is distinct from 'received' or o.facts->'deleted' is distinct from 'false'::jsonb
  or jsonb_typeof(o.facts->'amounts'->'receivedCents') is distinct from 'number'
  or p.amount_cents>(o.facts->'amounts'->>'receivedCents')::numeric then raise exception 'Legado sem vínculo inequívoco'; end if;
 return new;
end; $$;
create trigger payment_legacy_binding_guard before insert on private.payment_legacy_bindings for each row execute function private.guard_legacy_payment_binding();
revoke all on function private.guard_financial_position(),private.guard_legacy_payment_binding() from public,anon,authenticated,service_role;

create function private.order_payment_credit(target_order uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare accepted record;manual_deposit numeric;manual_total numeric;provider_deposit numeric;provider_total numeric;
 dep_uncertain boolean:=false;total_uncertain boolean:=false;unsafe boolean:=false;dep numeric;total numeric;
 required bigint;contract_total bigint;legacy_count bigint;missing_count bigint;legacy_deposit boolean;
begin
 if not exists(select 1 from public.orders where id=target_order) then raise exception 'Pedido indisponível'; end if;
 select * into accepted from private.accepted_order_deposit(target_order);
 if found then required:=accepted.required_cents;contract_total:=accepted.total_cents; end if;
 select coalesce(sum(amount_cents) filter(where kind='deposit'),0),coalesce(sum(amount_cents),0) into manual_deposit,manual_total
 from public.payments where order_id=target_order and method='pix_manual' and status='confirmed' and kind in('deposit','balance');
 select coalesce(sum((p.value->>'creditCents')::numeric) filter(where x.phase='deposit'),0),coalesce(sum((p.value->>'creditCents')::numeric),0),
  coalesce(bool_or(x.phase='deposit' and(p.charge_id is null or p.value->>'certainty' is distinct from 'known')),false),
  coalesce(bool_or(p.charge_id is null or p.value->>'certainty' is distinct from 'known'),false),count(*) filter(where p.charge_id is null)
 into provider_deposit,provider_total,dep_uncertain,total_uncertain,missing_count
 from private.payment_financial_charges c join private.payment_intents i on i.id=c.intent_id
 join private.payment_obligation_contexts x on x.id=i.context_id left join private.payment_financial_positions p on p.charge_id=c.id where c.order_id=target_order;
 select count(*),coalesce(bool_or(p.kind='deposit'),false) into legacy_count,legacy_deposit
 from public.payments p left join private.payment_legacy_bindings b on b.payment_id=p.id
 where p.order_id=target_order and p.method='asaas' and p.kind in('deposit','balance') and b.payment_id is null;
 -- Legado não prova conta por provider_ref: conserva incerteza e não soma.
 dep_uncertain:=dep_uncertain or legacy_deposit;
 total_uncertain:=total_uncertain or legacy_count>0;
 dep:=manual_deposit+provider_deposit;total:=manual_total+provider_total;
 unsafe:=manual_deposit>9007199254740991 or manual_total>9007199254740991 or provider_deposit>9007199254740991 or provider_total>9007199254740991
  or dep>9007199254740991 or total>9007199254740991 or required not between 0 and 9007199254740991 or contract_total not between 0 and 9007199254740991;
 if unsafe or required is null or contract_total is null then dep_uncertain:=true;total_uncertain:=true; end if;
 return jsonb_build_object('schemaVersion',1,'semantics','credit_projection','orderId',target_order,'effects','none',
  'requiredDepositCents',required,'totalCents',contract_total,
  'manualDepositCents',case when manual_deposit<=9007199254740991 then manual_deposit else null end,
  'manualTotalCents',case when manual_total<=9007199254740991 then manual_total else null end,
  'providerObservedDepositCents',case when provider_deposit<=9007199254740991 then provider_deposit else null end,
  'providerObservedTotalCents',case when provider_total<=9007199254740991 then provider_total else null end,
  'depositCreditCents',case when dep_uncertain then null else dep end,'totalCreditCents',case when total_uncertain then null else total end,
  'depositUncertain',dep_uncertain,'uncertain',total_uncertain,'unsafeAmount',coalesce(unsafe,false),
  'partial',case when dep_uncertain then null else dep<required end,
  'remainingDepositCents',case when dep_uncertain then null else greatest(required-dep,0) end,
  'remainingTotalCents',case when total_uncertain then null else greatest(contract_total-total,0) end,
  'depositExcessCents',case when dep_uncertain then null else greatest(dep-required,0) end,
  'totalExcessCents',case when total_uncertain then null else greatest(total-contract_total,0) end,
  'unlinkedLegacyCount',legacy_count,'missingPositionCount',missing_count);
end; $$;
revoke all on function private.order_payment_credit(uuid) from public,anon,authenticated,service_role;
create function public.get_order_financial_projection(target_order uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;result jsonb;
begin
 actor:=private.authorize_payment_obligation(target_order);
 result:=private.order_payment_credit(target_order);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'payment_projection_read','order',target_order);
 return result;
end; $$;
revoke all on function public.get_order_financial_projection(uuid) from public,anon,service_role;
grant execute on function public.get_order_financial_projection(uuid) to authenticated;

create function public.get_financial_projection_source(target_observation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.payment_financial_charges%rowtype;o private.payment_financial_observations%rowtype;p private.payment_financial_positions%rowtype;
 phase text;history jsonb;fresh boolean;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Projeção fictícia indisponível'; end if;
 select * into o from private.payment_financial_observations where id=target_observation;
 select * into c from private.payment_financial_charges where id=o.charge_id;
 perform private.require_payment_fixture_system(c.scope_id,c.client_id);
 select x.phase into phase from private.payment_intents i join private.payment_obligation_contexts x on x.id=i.context_id where i.id=c.intent_id;
 select * into p from private.payment_financial_positions where charge_id=c.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'sourceOrder',source_order,'facts',facts,'proof',proof) order by id),'[]'::jsonb) into history
 from(select min(id::text)::uuid id,source_order,facts,proof from private.payment_financial_observations
  where charge_id=c.id and id<>o.id and facts is not null group by source_order,facts,proof) h;
 fresh:=case when o.source_kind='query' then exists(select 1 from private.payment_financial_queries q where q.id=o.source_id and q.charge_id=c.id and q.revision=c.revision) else c.revision=0 end;
 return jsonb_build_object('chargeId',c.id,'orderId',c.order_id,'intentId',c.intent_id,'phase',phase,'expectation',c.expectation,
  'revision',coalesce(p.revision,0),'observation',jsonb_build_object('id',o.id,'sourceOrder',o.source_order,'facts',o.facts,'proof',o.proof),
  'previous',p.value,'history',history,'captureIsCurrent',fresh);
end; $$;
revoke all on function public.get_financial_projection_source(uuid) from public,anon,authenticated;
grant execute on function public.get_financial_projection_source(uuid) to service_role;
