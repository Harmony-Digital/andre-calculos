-- Replace exige composicao; hold/conferencia preserva ultimo credito.
create or replace function public.apply_financial_observation(target_observation uuid,request_id uuid,expected_position_revision bigint,expected_charge_revision bigint,expected_journal_fingerprint text,decision_action text,position_value jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.payment_financial_charges%rowtype;o private.payment_financial_observations%rowtype;run private.payment_execution_runs%rowtype;
 binding private.payment_provider_customers%rowtype;scope jsonb;intent private.payment_intents%rowtype;captured private.payment_obligation_contexts%rowtype;p private.payment_financial_positions%rowtype;
 receipt private.payment_financial_applications%rowtype;source jsonb;before_value jsonb;actual_value jsonb;next_revision bigint;can_write boolean;
 recipient uuid;owner_before uuid;job public.orders%rowtype;effects text[]:='{}';effect text;template text;payload jsonb;contact text;at_time timestamptz;
 next_status text;result jsonb;basis uuid;prior_gross numeric;prior_done numeric;prior_cb numeric;unknown_after boolean;
begin
 if auth.role() is distinct from 'service_role' or target_observation is null or request_id is null then raise exception 'Aplicacao ficticia indisponivel'; end if;
 result:=public.get_financial_application_receipt(target_observation,request_id);
 if result is not null then return result; end if;
 select * into o from private.payment_financial_observations where id=target_observation;
 select * into c from private.payment_financial_charges where id=o.charge_id;
 select r.* into run from private.payment_execution_runs r join private.payment_execution_observations origin on origin.run_id=r.id where origin.id=c.origin_id;
 if c.id is null or run.intent_id is distinct from c.intent_id or run.scope_id is distinct from c.scope_id or run.client_id is distinct from c.client_id or run.selected_payment_id is distinct from c.provider_payment_id then raise exception 'Origem financeira indisponivel'; end if;
 select profile_id into recipient from private.calculator_notification_recipient where singleton for share;
 select * into intent from private.payment_intents where id=c.intent_id;
 select * into captured from private.payment_obligation_contexts where id=intent.context_id;
 select owner_id into owner_before from public.clients where id=c.client_id;
 perform id from public.profiles where id in(recipient,owner_before,intent.created_by,captured.actor_id,(captured.snapshot->>'ownerId')::uuid) order by id for share;
 if recipient is not null and not exists(select 1 from public.profiles where id=recipient and role='calculator') then raise exception 'Responsavel pelos avisos indisponivel'; end if;
 intent:=private.lock_payment_execution(run.request_id);
 if intent.id is distinct from c.intent_id or intent.order_id is distinct from c.order_id or captured.client_id is distinct from c.client_id
  or (captured.snapshot->'binding'->>'scopeId')::uuid is distinct from c.scope_id then raise exception 'Vinculo financeiro indisponivel'; end if;
 select * into binding from private.payment_provider_customers where id=captured.binding_id;
 scope:=private.require_payment_fixture_system(c.scope_id,c.client_id);
 if captured.order_id is distinct from intent.order_id or captured.client_id is distinct from c.client_id
  or captured.snapshot->>'orderId' is distinct from captured.order_id::text or captured.snapshot->>'clientId' is distinct from captured.client_id::text
  or captured.snapshot->>'phase' is distinct from captured.phase or captured.snapshot->>'quoteId' is distinct from captured.quote_id::text
  or captured.snapshot->>'contextHash' is distinct from captured.context_hash
  or (captured.snapshot->>'remainingCents')::numeric is distinct from captured.remaining_cents
  or captured.snapshot->>'billingType' is distinct from captured.billing_type or captured.snapshot->>'dueDate' is distinct from captured.due_date::text
  or captured.snapshot->'binding'->>'id' is distinct from binding.id::text or binding.client_id is distinct from c.client_id or binding.scope_id is distinct from c.scope_id
  or captured.snapshot->'binding'->>'clientId' is distinct from binding.client_id::text
  or captured.snapshot->'binding'->>'customerId' is distinct from binding.customer_id
  or captured.snapshot->'binding'->'scope' is distinct from scope
  or run.snapshot->'obligation' is distinct from captured.snapshot
  or c.expectation is distinct from jsonb_build_object('phase','observation','scope',scope,'paymentId',c.provider_payment_id,'customerId',binding.customer_id,
   'reference',intent.id::text,'contractedCents',captured.remaining_cents,'billingType',captured.billing_type,'dueDate',captured.due_date::text)
  then raise exception 'Contexto financeiro sem origem'; end if;
 select * into job from public.orders where id=c.order_id;
 if (select owner_id from public.clients where id=c.client_id) is distinct from owner_before or not exists(select 1 from public.profiles where id=owner_before and role='client') then raise sqlstate 'PT409' using message='Dono do pedido atualizado'; end if;
 perform id from private.payment_execution_runs where id=run.id for update;
 perform id from private.payment_financial_charges where order_id=c.order_id order by id for update;
 perform q.id from private.payment_financial_queries q join private.payment_financial_charges x on x.id=q.charge_id where x.order_id=c.order_id order by q.charge_id,q.revision for update of q;
 perform x.charge_id from private.payment_financial_positions x join private.payment_financial_charges d on d.id=x.charge_id where d.order_id=c.order_id order by x.charge_id for update of x;
 perform id from public.settings where singleton for share;
 perform pg_advisory_xact_lock(hashtextextended('financial-application:'||request_id::text,0));
 result:=public.get_financial_application_receipt(target_observation,request_id);
 if result is not null then return result; end if;
 source:=public.get_financial_projection_source(target_observation);
 if expected_position_revision is null or expected_charge_revision is null or expected_journal_fingerprint is null
  or (source->>'revision')::bigint is distinct from expected_position_revision or (source->>'chargeRevision')::bigint is distinct from expected_charge_revision
  or source->>'journalFingerprint' is distinct from expected_journal_fingerprint then raise sqlstate 'PT412' using message='Fonte financeira mudou'; end if;
 if decision_action is null or decision_action not in('replace','hold','same','ignore_old') or jsonb_typeof(position_value) is distinct from 'object' then raise exception 'Decisao financeira indisponivel'; end if;
 select * into p from private.payment_financial_positions where charge_id=c.id;
 before_value:=p.value;actual_value:=p.value;next_revision:=coalesce(p.revision,0);
 if decision_action='same' and (before_value is null or position_value is distinct from before_value or position_value->>'certainty' is distinct from 'known') then raise exception 'Replay financeiro divergente'; end if;
 if decision_action='ignore_old' and before_value is not null and position_value is distinct from before_value then raise exception 'Fonte antiga divergente'; end if;
 if decision_action='replace' and (position_value->'creditCents' is null or jsonb_typeof(position_value->'creditCents') is distinct from 'number') then raise exception 'Posicao nao calculada'; end if;
 if decision_action='replace' and position_value->>'certainty'='known' and source->'captureIsCurrent' is distinct from 'true'::jsonb then raise exception 'Fonte superseded nao confirma credito'; end if;
 if decision_action='replace' and position_value->>'observationId' is distinct from target_observation::text then raise exception 'Base financeira divergente'; end if;
 if decision_action in('hold','replace') and position_value->>'certainty'='reconcile' and position_value->'lastKnownCreditCents' is distinct from coalesce(case when before_value->>'certainty'='known' then before_value->'creditCents' else before_value->'lastKnownCreditCents' end,'null'::jsonb) then raise exception 'Ultimo credito divergente'; end if;
 if decision_action='hold' then
  if position_value->>'certainty' is distinct from 'reconcile' or position_value->'resolutionCandidate' is distinct from 'null'::jsonb then raise exception 'Conferencia financeira invalida'; end if;
  if before_value is not null and position_value-array['certainty','lastKnownCreditCents','reasons','resolutionCandidate'] is distinct from before_value-array['certainty','lastKnownCreditCents','reasons','resolutionCandidate'] then raise exception 'Conferencia alterou valores'; end if;
  if before_value is null and (position_value->>'observationId' is distinct from target_observation::text
   or exists(select 1 from unnest(array['receivedGrossCents','completedRefundCents','pendingRefundCents','chargebackOutstandingCents','creditCents','lastKnownCreditCents','remainingCents','excessCents']) k where position_value->k is distinct from 'null'::jsonb)) then raise exception 'Conferencia inventou valores'; end if;
 end if;
 can_write:=decision_action in('replace','hold') or(decision_action='same' and source->'captureIsCurrent'='true'::jsonb and source->'sourceConflictCount'='0'::jsonb
  and(p.journal_fingerprint is distinct from source->>'journalFingerprint' or p.charge_revision is distinct from (source->>'chargeRevision')::bigint));
 if decision_action='hold' and position_value=before_value and p.journal_fingerprint=source->>'journalFingerprint' and p.charge_revision=(source->>'chargeRevision')::bigint then can_write:=false; end if;
 if can_write then
  if decision_action in('replace','same') then perform private.validate_known_financial_history(c.id,position_value); end if;
  next_revision:=next_revision+1;
  insert into private.payment_financial_positions(charge_id,observation_id,revision,value)
   values(c.id,(position_value->>'observationId')::uuid,next_revision,position_value)
   on conflict(charge_id) do update set observation_id=excluded.observation_id,revision=excluded.revision,value=excluded.value;
  actual_value:=position_value;
  -- Componentes comprovados geram movimentos mesmo durante conciliacao.
  if decision_action='replace' and position_value->'creditCents'<>'null'::jsonb then
   prior_gross:=coalesce((before_value->>'receivedGrossCents')::numeric,0);prior_done:=coalesce((before_value->>'completedRefundCents')::numeric,0);prior_cb:=coalesce((before_value->>'chargebackOutstandingCents')::numeric,0);
   if (position_value->>'receivedGrossCents')::numeric>prior_gross then effects:=array_append(effects,'received'); end if;
   if (position_value->>'completedRefundCents')::numeric>prior_done or (position_value->>'chargebackOutstandingCents')::numeric>prior_cb then effects:=array_append(effects,'debited'); end if;
   if before_value is not null and (position_value->>'chargebackOutstandingCents')::numeric<prior_cb then effects:=array_append(effects,'restored'); end if;
  end if;
  if position_value->>'certainty'='known' then
   select exists(select 1 from private.payment_financial_observations h join private.payment_financial_queries q on q.id=h.source_id and h.source_kind='query'
    where h.charge_id=c.id and h.facts is null and q.revision>coalesce(p.charge_revision,0)) into unknown_after;
   if before_value is not null and cardinality(effects)=0 and (before_value->>'certainty'='reconcile' or unknown_after) then effects:=array_append(effects,'reconciled'); end if;
  elsif before_value is null or before_value->>'certainty' is distinct from 'reconcile' then effects:=array_append(effects,'reconcile'); end if;
 end if;
 if cardinality(effects)>0 then
  if recipient is null or not exists(select 1 from public.settings where singleton) then raise exception 'Responsavel pelos avisos indisponivel'; end if;
  if exists(select 1 from public.settings cfg where cfg.singleton and
   ((coalesce((select enabled from public.notification_preferences where profile_id=recipient and event='payment_updated' and channel='email'),true)
     and nullif(btrim(cfg.contact_email),'') is null)
    or(coalesce((select enabled from public.notification_preferences where profile_id=recipient and event='payment_updated' and channel='whatsapp'),false)
     and nullif(btrim(cfg.contact_phone),'') is null))) then raise exception 'Contato do responsavel indisponivel'; end if;
 end if;
 at_time:=clock_timestamp();
 foreach effect in array effects loop
  payload:=jsonb_build_object('application_id',request_id,'observation_id',target_observation,'charge_id',c.id,'order_id',job.id,'process_id',job.process_id,'code',job.code,'phase',captured.phase,'effect',effect,'position_revision',next_revision);
  perform private.record_event(job.process_id,case when effect='received' then 'payment_confirmed' else 'payment_updated' end,payload,null,job.id);
  template:=case effect when 'received' then 'payment_confirmed' when 'debited' then 'payment_debited' when 'restored' then 'payment_restored' when 'reconciled' then 'payment_reconciled' else 'payment_reconciliation' end;
  select u.email into contact from auth.users u join public.profiles d on d.id=u.id and d.role='client' where u.id=owner_before;
  if nullif(btrim(contact),'') is null then raise exception 'Contato do cliente indisponivel'; end if;
  insert into public.notifications(channel,recipient,template,data,dedup_key) values('email',contact,template,payload,'financial:'||request_id::text||':'||effect||':client:email');
  perform private.notify_calculator('payment_updated',payload,'financial:'||request_id::text||':'||effect||':calculator');
 end loop;
 next_status:=job.status;
 if can_write and actual_value->>'certainty'='known' then next_status:=private.queue_after_deposit_or_contract(job.id,null); end if;
 basis:=(actual_value->>'observationId')::uuid;
 result:=jsonb_build_object('schemaVersion',1,'semantics','financial_application_receipt','mode','fixture','requestId',request_id,'observationId',target_observation,'chargeId',c.id,'orderId',job.id,'intentId',intent.id,
  'action',decision_action,'position',actual_value,'positionRevision',next_revision,'chargeRevision',(source->>'chargeRevision')::bigint,'journalFingerprint',source->>'journalFingerprint','effects',to_jsonb(effects),'orderStatus',next_status,'appliedAt',at_time);
 insert into private.payment_financial_applications(request_id,charge_id,observation_id,order_id,intent_id,basis_observation_id,position_revision,charge_revision,journal_fingerprint,applied_at,result)
 values(request_id,c.id,target_observation,job.id,intent.id,basis,next_revision,(source->>'chargeRevision')::bigint,source->>'journalFingerprint',at_time,result);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_financial_applied','financial_application',request_id);
 return result;
end; $$;
revoke all on function public.apply_financial_observation(uuid,uuid,bigint,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_financial_observation(uuid,uuid,bigint,bigint,text,text,jsonb) to service_role;
