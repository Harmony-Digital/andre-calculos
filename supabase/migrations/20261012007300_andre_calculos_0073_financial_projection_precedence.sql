-- Agrupar a projeção JSON antes de remover os campos permitidos.
create or replace function private.validate_financial_journal_projection() returns trigger language plpgsql set search_path='' as $$
declare item jsonb;
begin
 if new.facts is not null then
  if (new.facts->'amounts')-array['contractedCents','currentValueCents','providerOriginalCents','netCents','feeCents','receivedCents','relationToContract','grossLessCompletedRefundsCents']<>'{}'::jsonb
   or (new.facts->'refunds')-array['items','completedCents','pendingCents','cancelledCents','unknownCents']<>'{}'::jsonb
   or (new.facts->'presence')-array['originalValue','netValue','refunds','chargeback']<>'{}'::jsonb
   or (new.facts->'chargeback'<>'null'::jsonb and (new.facts->'chargeback')-array['status']<>'{}'::jsonb) then raise exception 'Projeção financeira inválida'; end if;
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
   or (new.proof->'debit')-array['id','amountCents','effectedAt']<>'{}'::jsonb
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
