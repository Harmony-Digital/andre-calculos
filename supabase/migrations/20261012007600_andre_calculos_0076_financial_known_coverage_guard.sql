-- Protege cobertura conhecida contra replay antigo depois de consulta incerta.
create or replace function private.guard_financial_position() returns trigger language plpgsql set search_path='' as $$
declare c private.payment_financial_charges%rowtype;o private.payment_financial_observations%rowtype;key text;number numeric;gross numeric;done numeric;pending numeric;cb numeric;credit numeric;contracted numeric;candidate text;
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
 if jsonb_typeof(new.value->'reasons') is distinct from 'array' or not(new.value ? 'resolutionCandidate')
  or exists(select 1 from jsonb_array_elements(new.value->'reasons') r where jsonb_typeof(r)<>'string' or r#>>'{}' !~ '^[a-z_]{1,100}$') then raise exception 'Posicao financeira invalida'; end if;
 if new.value->>'certainty'='reconcile' and new.value->'resolutionCandidate' is distinct from 'null'::jsonb then raise exception 'Resolucao financeira invalida'; end if;
 if new.value->>'certainty'='known' then
  -- Mesmo replay so confirma cobertura depois de consulta atual equivalente.
  -- Uma consulta aberta, UNKNOWN posterior ou conflito nao pode ser encoberto.
  if c.current_query is not null or exists(select 1 from private.payment_financial_conflicts f join private.payment_financial_observations h on h.id=f.observation_id where h.charge_id=c.id)
   or (c.revision>0 and not exists(select 1 from private.payment_financial_queries q join private.payment_financial_observations h on h.charge_id=q.charge_id and h.source_kind='query' and h.source_id=q.id
    where q.charge_id=c.id and q.revision=c.revision and q.finished_at is not null and h.facts is not null and h.source_order=o.source_order
    and private.financial_canonical_facts(h.facts)=private.financial_canonical_facts(o.facts) and private.financial_canonical_proof(h.proof)=private.financial_canonical_proof(o.proof)))
   then raise exception 'Cobertura financeira ainda incerta'; end if;
  if o.facts is null or o.source_order is null or o.facts->'deleted' is distinct from 'false'::jsonb
   or exists(select 1 from jsonb_array_elements_text(new.value->'reasons') r where r<>'fee_unknown')
   or new.value->'lastKnownCreditCents' is distinct from new.value->'creditCents'
   or new.value->'pendingRefundCents' is distinct from '0'::jsonb
   or o.facts->'chargeback'->>'status' in('REQUESTED','IN_DISPUTE') then raise exception 'Posicao conhecida invalida'; end if;
  foreach key in array array['receivedGrossCents','completedRefundCents','pendingRefundCents','chargebackOutstandingCents','creditCents','lastKnownCreditCents','remainingCents','excessCents'] loop
   if new.value->key='null'::jsonb then raise exception 'Posicao conhecida incompleta'; end if;
  end loop;
 end if;
 if new.value->'creditCents'<>'null'::jsonb then
  gross:=(new.value->>'receivedGrossCents')::numeric;done:=(new.value->>'completedRefundCents')::numeric;
  pending:=(new.value->>'pendingRefundCents')::numeric;cb:=(new.value->>'chargebackOutstandingCents')::numeric;
  credit:=(new.value->>'creditCents')::numeric;contracted:=(o.facts->'amounts'->>'contractedCents')::numeric;
  if gross is null or gross<=0 or done is null or pending is null or cb is null or contracted is null
   or credit is distinct from gross-done-cb or new.value->'completedRefundCents' is distinct from o.facts->'refunds'->'completedCents'
   or new.value->'pendingRefundCents' is distinct from o.facts->'refunds'->'pendingCents'
   or new.value->'feeCents' is distinct from o.facts->'amounts'->'feeCents'
   or (new.value->>'remainingCents')::numeric is distinct from greatest(contracted-credit,0)
   or (new.value->>'excessCents')::numeric is distinct from greatest(credit-contracted,0) then raise exception 'Credito sem composicao financeira'; end if;
  if o.facts->'chargeback'='null'::jsonb then
   if o.facts->'presence'->>'chargeback' is distinct from 'null' or cb<>0 then raise exception 'Debito financeiro invalido'; end if;
  elsif new.value->'proof'->>'kind' is distinct from 'proven' or new.value->'chargebackOutstandingCents' is distinct from new.value->'proof'->'outstandingCents' then raise exception 'Debito sem prova'; end if;
  candidate:=case when new.value->>'certainty'<>'known' then null when credit>=contracted and done=0 and cb=0 then 'received' when done=gross and cb=0 and credit=0 then 'refunded' else null end;
  if new.value->'resolutionCandidate' is distinct from coalesce(to_jsonb(candidate),'null'::jsonb) then raise exception 'Resolucao financeira invalida'; end if;
 end if;
 -- Apenas o futuro escritor X, sob locks e rederivacao, podera confirmar cobertura.
 new.journal_fingerprint:=private.financial_journal_fingerprint(c.id);
 new.charge_revision:=c.revision;
 return new;
end; $$;
