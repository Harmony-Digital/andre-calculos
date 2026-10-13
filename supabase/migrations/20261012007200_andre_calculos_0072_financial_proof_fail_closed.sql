-- Referência ausente/null também recusa DTO proven divergente da fonte.
create or replace function private.record_financial_observation(target_charge uuid,kind text,source_id uuid,receipt_id uuid,
 body_hash text,facts jsonb,proof jsonb,source_order bigint,problem text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare charge private.payment_financial_charges%rowtype;prior private.payment_financial_observations%rowtype;
 n private.payment_fixture_requests%rowtype;candidate jsonb;scope jsonb;digest text;conflict uuid;v jsonb;raw jsonb; item jsonb;total numeric:=0;
begin
 select * into charge from private.payment_financial_charges where id=target_charge for update;
 scope:=private.require_payment_fixture_system(charge.scope_id,charge.client_id);
 select * into prior from private.payment_financial_observations o where o.charge_id=charge.id and o.source_kind=kind and o.source_id=record_financial_observation.source_id;
 if prior.id is not null then
  if(prior.receipt_id,prior.body_hash,prior.facts,prior.proof,prior.source_order,prior.reason) is not distinct from(receipt_id,body_hash,facts,proof,source_order,problem)
   then return private.financial_observation_result(prior,'replay'); end if;
  digest:=encode(sha256(convert_to(jsonb_build_array(receipt_id,body_hash,facts,proof,source_order,problem)::text,'UTF8')),'hex');
  insert into private.payment_financial_conflicts(observation_id,attempt_hash) values(prior.id,digest)
   on conflict(observation_id,attempt_hash) do nothing;
  select id into conflict from private.payment_financial_conflicts where observation_id=prior.id and attempt_hash=digest;
  return private.financial_observation_result(prior,'conflict',conflict);
 end if;
 if proof is null or jsonb_typeof(proof)<>'object' or octet_length(proof::text)>65536 or proof->>'kind' is null or proof->>'kind' not in('unknown','invalid','proven')
  or(facts is null and (problem is null or body_hash is not null or source_order is not null or proof<>'{"kind":"unknown"}'::jsonb)) then raise exception 'Fatos indisponíveis'; end if;
 if facts is not null then
  select * into n from private.payment_fixture_requests where id=receipt_id;
  if n.scope_id is distinct from charge.scope_id or n.client_id is distinct from charge.client_id or n.outcome->'scope' is distinct from scope
   or n.outcome->>'kind' is distinct from 'response' or n.outcome->'status' is distinct from '200'::jsonb then raise exception 'Fonte indisponível'; end if;
  digest:=encode(sha256(convert_to(n.outcome->>'bodyText','UTF8')),'hex');
  begin candidate:=(n.outcome->>'bodyText')::jsonb; exception when others then raise exception 'Fonte indisponível'; end;
  if n.operation='payment_find' then
   if candidate->'hasMore' is distinct from 'false'::jsonb or candidate->'totalCount' is distinct from '1'::jsonb or jsonb_array_length(candidate->'data')<>1 then raise exception 'Fonte ambígua'; end if;
   candidate:=candidate->'data'->0;
  end if;
  if body_hash is distinct from digest or facts->>'semantics' is distinct from 'cumulative_snapshot' or facts->>'effects' is distinct from 'none'
   or facts->>'identityProof' is distinct from 'declared_unverified' or facts->'scope' is distinct from scope
   or facts->>'paymentId' is distinct from charge.provider_payment_id or facts->'paymentId' is distinct from candidate->'id'
   or facts->'customerId' is distinct from candidate->'customer' or facts->'customerId' is distinct from charge.expectation->'customerId'
   or facts->'reference' is distinct from candidate->'externalReference' or facts->>'reference' is distinct from charge.intent_id::text
   or facts->'expectedBillingType' is distinct from charge.expectation->'billingType'
   or facts->'billingType' is distinct from candidate->'billingType' or facts->'status' is distinct from candidate->'status'
   or facts->'deleted' is distinct from candidate->'deleted' or facts->'dueDate' is distinct from charge.expectation->'dueDate'
   or facts->'dueDate' is distinct from candidate->'dueDate' or facts->'amounts'->'contractedCents' is distinct from charge.expectation->'contractedCents'
   or facts->'amounts'->'currentValueCents' is distinct from to_jsonb((candidate->>'value')::numeric*100)
   or facts->'amounts'->'providerOriginalCents' is distinct from (case when jsonb_typeof(candidate->'originalValue')='number' then to_jsonb((candidate->>'originalValue')::numeric*100) else 'null'::jsonb end)
   or facts->'amounts'->'netCents' is distinct from (case when jsonb_typeof(candidate->'netValue')='number' then to_jsonb((candidate->>'netValue')::numeric*100) else 'null'::jsonb end)
   or facts-array['semantics','effects','identityProof','disposition','reasons','classification','scope','paymentId','customerId','reference','expectedBillingType','billingType','status','deleted','dueDate','presence','amounts','refunds','chargeback']<>'{}'::jsonb
   or source_order is distinct from private.fixture_financial_source_order(candidate->'fixtureStateRevision') then raise exception 'Fatos indisponíveis'; end if;
  if proof->>'kind'='proven' then
   raw:=candidate->'chargeback'->'fixtureProof';
   if raw->>'semantics' is distinct from 'fixture_chargeback_cumulative' or raw->'schemaVersion' is distinct from '1'::jsonb
    or raw->>'paymentId' is distinct from charge.provider_payment_id or private.payment_fixture_reference_matches(raw->>'reference',charge.intent_id) is not true
    or proof->'caseId' is distinct from raw->'caseId' or proof->'debit'->'id' is distinct from raw->'debit'->'id'
    or proof->'debit'->'effectedAt' is distinct from raw->'debit'->'effectedAt'
    or proof->'debitedCents' is distinct from to_jsonb((raw->'debit'->>'value')::numeric*100)
    or proof->'debit'->'amountCents' is distinct from proof->'debitedCents'
    or jsonb_array_length(proof->'reversals')<>jsonb_array_length(raw->'reversals')
    or exists(select 1 from jsonb_array_elements(raw->'reversals') r group by r->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(proof->'reversals') r group by r->>'id' having count(*)>1)
    or (select count(*) from jsonb_array_elements(proof->'reversals') a(value) join jsonb_array_elements(raw->'reversals') b(value) on a.value->'id'=b.value->'id')<>jsonb_array_length(proof->'reversals') then raise exception 'Prova indisponível'; end if;
   for v,item in select a.value,b.value from jsonb_array_elements(proof->'reversals') a(value)
    join jsonb_array_elements(raw->'reversals') b(value) on a.value->'id'=b.value->'id' loop
    if v->'id' is distinct from item->'id' or v->'reversesDebitId' is distinct from item->'reversesDebitId'
     or v->'reversesDebitId' is distinct from proof->'debit'->'id' or v->'effectedAt' is distinct from item->'effectedAt'
     or v->'amountCents' is distinct from to_jsonb((item->>'value')::numeric*100) then raise exception 'Prova indisponível'; end if;
    total:=total+(v->>'amountCents')::numeric;
   end loop;
   if proof->'reversedCents' is distinct from to_jsonb(total) or proof->'outstandingCents' is distinct from to_jsonb((proof->>'debitedCents')::numeric-total)
    or total>(proof->>'debitedCents')::numeric then raise exception 'Prova indisponível'; end if;
  end if;
 end if;
 insert into private.payment_financial_observations(charge_id,source_kind,source_id,receipt_id,body_hash,normalizer_version,source_order,facts,proof,reason)
 values(charge.id,kind,source_id,receipt_id,body_hash,1,source_order,facts,proof,problem) returning * into prior;
 return private.financial_observation_result(prior);
end; $$;
