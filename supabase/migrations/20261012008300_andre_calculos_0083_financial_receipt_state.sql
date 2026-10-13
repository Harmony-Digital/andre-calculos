-- Composicao calculada nao usa autorizacao/obrigacao como recebimento.
create or replace function private.validate_known_financial_history(target_charge uuid,position_value jsonb) returns void
language plpgsql stable set search_path='' as $$
declare h record;prior jsonb;next_f jsonb:=position_value->'snapshot';item record;gross numeric:=(position_value->>'receivedGrossCents')::numeric;done numeric:=(position_value->>'completedRefundCents')::numeric;
begin
 if position_value->'creditCents' is null or position_value->'creditCents'='null'::jsonb then return; end if;
 if position_value->'sourceOrder'='null'::jsonb or next_f->'deleted' is distinct from 'false'::jsonb
  or next_f->>'status' is null or next_f->>'status' not in('RECEIVED','REFUNDED','REFUND_REQUESTED','REFUND_IN_PROGRESS','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL') then raise exception 'Estado nao confirma composicao financeira'; end if;
 if (next_f->>'status'='RECEIVED' and next_f->'amounts'->'receivedCents' is distinct from position_value->'receivedGrossCents'
  and not(done>0 and (next_f->'amounts'->>'currentValueCents')::numeric+done=gross))
  or (next_f->>'status' in('REFUNDED','REFUND_REQUESTED','REFUND_IN_PROGRESS','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL')
   and (next_f->'amounts'->>'currentValueCents')::numeric>gross) then raise exception 'Bruto historico nao confirma valor atual'; end if;
 for h in select source_order,facts,proof from private.payment_financial_observations where charge_id=target_charge and facts is not null loop
  prior:=h.facts;
  if prior->>'status' in('RECEIVED','CONFIRMED','REFUNDED','REFUND_REQUESTED','REFUND_IN_PROGRESS')
   and (next_f->'amounts'->>'currentValueCents')::numeric<(prior->'amounts'->>'currentValueCents')::numeric
   and not(done>0 and (next_f->'amounts'->>'currentValueCents')::numeric+done=gross) then raise exception 'Valor recebido regrediu sem prova'; end if;
  if h.source_order=(position_value->>'sourceOrder')::numeric and
   (private.financial_canonical_facts(prior) is distinct from private.financial_canonical_facts(next_f)
    or private.financial_canonical_proof(h.proof) is distinct from private.financial_canonical_proof(position_value->'proof')) then raise exception 'Ordem financeira divergente'; end if;
  if prior->'chargeback'<>'null'::jsonb and next_f->'chargeback'='null'::jsonb then raise exception 'Disputa anterior desapareceu'; end if;
  if (h.source_order is null and (prior->'amounts'->'receivedCents'<>'null'::jsonb or (prior->'refunds'->>'completedCents')::numeric>0 or h.proof->>'kind'='proven'))
   or h.source_order>(position_value->>'sourceOrder')::numeric
   or (prior->'amounts'->>'receivedCents')::numeric>(position_value->>'receivedGrossCents')::numeric
   or (prior->'refunds'->>'completedCents')::numeric>(position_value->>'completedRefundCents')::numeric then raise exception 'Historico financeiro incompleto'; end if;
  if prior->'refunds'->'items'='null'::jsonb and prior->'amounts'->'receivedCents'<>'null'::jsonb then raise exception 'Historico de devolucao desconhecido'; end if;
  if jsonb_typeof(prior->'refunds'->'items')='array' then
   for item in select v,count(*) n from jsonb_array_elements(prior->'refunds'->'items') v where v->>'status'='DONE' group by v loop
    if (select count(*) from jsonb_array_elements(next_f->'refunds'->'items') v where v=item.v)<item.n then raise exception 'Devolucao anterior desapareceu'; end if;
   end loop;
  end if;
  if h.proof->>'kind'='proven' then
   if position_value->'proof'->>'kind' is distinct from 'proven' or position_value->'proof'->'caseId' is distinct from h.proof->'caseId'
    or position_value->'proof'->'debit' is distinct from h.proof->'debit' then raise exception 'Debito anterior desapareceu'; end if;
   for item in select v from jsonb_array_elements(h.proof->'reversals') v loop
    if not exists(select 1 from jsonb_array_elements(position_value->'proof'->'reversals') v where v=item.v) then raise exception 'Reversao anterior desapareceu'; end if;
   end loop;
  end if;
 end loop;
end; $$;
revoke all on function private.validate_known_financial_history(uuid,jsonb) from public,anon,authenticated,service_role;
