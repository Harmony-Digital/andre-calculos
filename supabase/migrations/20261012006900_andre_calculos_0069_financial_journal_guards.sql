-- Projeção mínima, versões fixas e auditoria; não aplica crédito.
create function private.validate_financial_journal_projection() returns trigger language plpgsql set search_path='' as $$
declare item jsonb;
begin
 if new.facts is not null then
  if new.facts->'amounts'-array['contractedCents','currentValueCents','providerOriginalCents','netCents','feeCents','receivedCents','relationToContract','grossLessCompletedRefundsCents']<>'{}'::jsonb
   or new.facts->'refunds'-array['items','completedCents','pendingCents','cancelledCents','unknownCents']<>'{}'::jsonb
   or new.facts->'presence'-array['originalValue','netValue','refunds','chargeback']<>'{}'::jsonb
   or (new.facts->'chargeback'<>'null'::jsonb and new.facts->'chargeback'-array['status']<>'{}'::jsonb) then raise exception 'Projeção financeira inválida'; end if;
  if jsonb_typeof(new.facts->'refunds'->'items')='array' then
   for item in select value from jsonb_array_elements(new.facts->'refunds'->'items') loop
    if item-array['valueCents','status','providerCreatedAt']<>'{}'::jsonb then raise exception 'Projeção financeira inválida'; end if;
   end loop;
  end if;
 end if;
 if new.proof->>'kind' in('unknown','invalid') then
  if new.proof-array['kind']<>'{}'::jsonb then raise exception 'Prova financeira inválida'; end if;
 elsif new.proof->>'kind'='proven' then
  if new.proof-array['kind','caseId','debit','reversals','debitedCents','reversedCents','outstandingCents']<>'{}'::jsonb
   or new.proof->'debit'-array['id','amountCents','effectedAt']<>'{}'::jsonb
   or (new.proof->>'debitedCents')::numeric not between 1 and 9007199254740991
   or (new.proof->>'reversedCents')::numeric not between 0 and (new.proof->>'debitedCents')::numeric
   or (new.proof->>'outstandingCents')::numeric<>(new.proof->>'debitedCents')::numeric-(new.proof->>'reversedCents')::numeric
   or exists(select 1 from jsonb_array_elements(new.proof->'reversals') r group by r->>'id' having count(*)>1) then raise exception 'Prova financeira inválida'; end if;
  for item in select value from jsonb_array_elements(new.proof->'reversals') loop
   if item-array['id','reversesDebitId','amountCents','effectedAt']<>'{}'::jsonb
    or item->'id'=new.proof->'debit'->'id' or item->'reversesDebitId' is distinct from new.proof->'debit'->'id'
    or (item->>'amountCents')::numeric not between 1 and 9007199254740991 then raise exception 'Prova financeira inválida'; end if;
  end loop;
 else raise exception 'Prova financeira inválida'; end if;
 return new;
end; $$;
create trigger payment_financial_projection_guard before insert on private.payment_financial_observations for each row execute function private.validate_financial_journal_projection();
create function private.audit_financial_journal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(actor_id,action,target_type,target_id)
 values(null,case when tg_table_name='payment_financial_observations' then 'payment_financial_observed' else 'payment_financial_conflict' end,'payment_financial_journal',new.id);
 return new;
end; $$;
create trigger payment_financial_observation_audit after insert on private.payment_financial_observations for each row execute function private.audit_financial_journal();
create trigger payment_financial_conflict_audit after insert on private.payment_financial_conflicts for each row execute function private.audit_financial_journal();
revoke all on function private.validate_financial_journal_projection(),private.audit_financial_journal() from public,anon,authenticated,service_role;

-- Replay após fechamento devolve current=false, nunca null.
create or replace function public.finish_financial_query(target_query uuid,worker_id uuid,body_hash text,facts jsonb,proof jsonb,source_order bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q private.payment_financial_queries%rowtype;c private.payment_financial_charges%rowtype;n private.payment_fixture_requests%rowtype;
 result jsonb;problem text;
begin
 select * into q from private.payment_financial_queries where id=target_query;
 select * into c from private.payment_financial_charges where id=q.charge_id for update;
 perform private.require_payment_fixture_system(c.scope_id,c.client_id);
 select * into q from private.payment_financial_queries where id=target_query for update;
 if q.worker_id is distinct from worker_id or not q.started then raise exception 'Consulta indisponível'; end if;
 select * into n from private.payment_fixture_requests where id=(q.protocol->>'requestId')::uuid;
 if n.id is not null and(n.slot_id,n.scope_id,n.client_id,n.operation,n.fingerprint,n.payload,n.outcome->'scope')
  is distinct from(q.id,c.scope_id,c.client_id,'payment_get',q.protocol->>'fingerprint',q.protocol->'payload',c.expectation->'scope') then raise exception 'Fonte indisponível'; end if;
 if facts is null then
  problem:=case when n.id is null then 'unavailable' when n.outcome->>'kind'='indeterminate' then 'indeterminate'
   when n.outcome->>'kind'='not_dispatched' then 'not_dispatched' when n.outcome->'status'='404'::jsonb then 'not_located' else 'invalid_observation' end;
 end if;
 result:=private.record_financial_observation(c.id,'query',q.id,n.id,body_hash,facts,proof,source_order,problem);
 if result->>'kind' <> 'conflict' and q.finished_at is null then update private.payment_financial_queries set finished_at=clock_timestamp() where id=q.id; end if;
 -- Fencing da coordenação; não declara vencedor financeiro.
 if result->>'kind' <> 'conflict' and c.current_query=q.id and c.revision=q.revision then update private.payment_financial_charges set current_query=null where id=c.id; end if;
 return result||jsonb_build_object('current',coalesce(c.current_query=q.id and c.revision=q.revision,false));
end; $$;
