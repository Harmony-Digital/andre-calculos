-- Motivo local sem alias SQL: o label implicito cobre parametros, nao esta variavel.
create or replace function public.resolve_financial_execution(target_application uuid,request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare application private.payment_financial_applications%rowtype;
 charge private.payment_financial_charges%rowtype; origin private.payment_execution_observations%rowtype;
 run private.payment_execution_runs%rowtype; intent private.payment_intents%rowtype;
 captured private.payment_obligation_contexts%rowtype; binding private.payment_provider_customers%rowtype;
 position private.payment_financial_positions%rowtype; owner_before uuid;
 scope jsonb; source jsonb; result jsonb; candidate text; resolution_reason text;
 at_time timestamptz; released uuid; expected_run_revision bigint;
begin
 if auth.role() is distinct from 'service_role' or target_application is null or request_id is null then raise exception 'Resolucao financeira indisponivel'; end if;
 result:=public.get_financial_resolution_receipt(target_application,request_id);
 if result is not null then return result; end if;
 select * into application from private.payment_financial_applications a where a.request_id=target_application;
 select * into charge from private.payment_financial_charges where id=application.charge_id;
 select * into origin from private.payment_execution_observations where id=charge.origin_id;
 select * into run from private.payment_execution_runs where id=origin.run_id;
 if application.request_id is null or charge.id is null or run.id is null then raise exception 'Origem da resolucao indisponivel'; end if;
 select owner_id into owner_before from public.clients where id=charge.client_id;
 intent:=private.lock_payment_execution(run.request_id);
 perform pg_advisory_xact_lock(hashtextextended('financial-resolution:'||request_id::text,0));
 result:=public.get_financial_resolution_receipt(target_application,request_id);
 if result is not null then return result; end if;
 -- Fontes mutaveis sao relidas depois dos mesmos locks de AB/Y/T.
 select * into application from private.payment_financial_applications a where a.request_id=target_application;
 select * into charge from private.payment_financial_charges where id=application.charge_id;
 select * into run from private.payment_execution_runs where id=origin.run_id for update;
 select * into captured from private.payment_obligation_contexts where id=intent.context_id;
 select * into binding from private.payment_provider_customers where id=captured.binding_id;
 scope:=private.require_payment_fixture_system(charge.scope_id,charge.client_id);
 if intent.id is distinct from charge.intent_id or intent.order_id is distinct from charge.order_id
  or (application.charge_id,application.intent_id,application.order_id) is distinct from (charge.id,intent.id,intent.order_id)
  or not exists(select 1 from private.payment_financial_observations o where o.id=application.observation_id and o.charge_id=charge.id)
  or application.result->'schemaVersion' is distinct from '1'::jsonb or application.result->>'semantics' is distinct from 'financial_application_receipt'
  or application.result->>'requestId' is distinct from application.request_id::text
  or application.result->>'observationId' is distinct from application.observation_id::text
  or application.result->>'chargeId' is distinct from application.charge_id::text
  or application.result->>'orderId' is distinct from application.order_id::text
  or application.result->>'intentId' is distinct from application.intent_id::text
  or application.result->'positionRevision' is distinct from to_jsonb(application.position_revision)
  or application.result->'chargeRevision' is distinct from to_jsonb(application.charge_revision)
  or application.result->>'journalFingerprint' is distinct from application.journal_fingerprint
  or (run.intent_id,run.scope_id,run.client_id,run.selected_payment_id) is distinct from (intent.id,charge.scope_id,charge.client_id,charge.provider_payment_id)
  or origin.run_id is distinct from run.id
  or (select owner_id from public.clients where id=charge.client_id) is distinct from owner_before
  or not exists(select 1 from public.profiles where id=owner_before and role='client')
  or not exists(select 1 from public.profiles where id=intent.created_by and role in('client','calculator'))
  or captured.order_id is distinct from intent.order_id or captured.client_id is distinct from charge.client_id
  or captured.snapshot->>'orderId' is distinct from captured.order_id::text or captured.snapshot->>'clientId' is distinct from captured.client_id::text
  or captured.snapshot->>'phase' is distinct from captured.phase or captured.snapshot->>'quoteId' is distinct from captured.quote_id::text
  or captured.snapshot->>'contextHash' is distinct from captured.context_hash
  or (captured.snapshot->>'remainingCents')::numeric is distinct from captured.remaining_cents
  or captured.snapshot->>'billingType' is distinct from captured.billing_type or captured.snapshot->>'dueDate' is distinct from captured.due_date::text
  or captured.snapshot->'binding'->>'id' is distinct from binding.id::text or binding.client_id is distinct from charge.client_id or binding.scope_id is distinct from charge.scope_id
  or captured.snapshot->'binding'->>'clientId' is distinct from binding.client_id::text
  or captured.snapshot->'binding'->>'customerId' is distinct from binding.customer_id
  or captured.snapshot->'binding'->'scope' is distinct from scope
  or run.snapshot->'obligation' is distinct from captured.snapshot
  or charge.expectation is distinct from jsonb_build_object('phase','observation','scope',scope,'paymentId',charge.provider_payment_id,'customerId',binding.customer_id,
   'reference',intent.id::text,'contractedCents',captured.remaining_cents,'billingType',captured.billing_type,'dueDate',captured.due_date::text)
  then raise exception 'Resolucao financeira sem origem'; end if;
 if exists(select 1 from private.payment_financial_resolutions where intent_id=intent.id)
  or exists(select 1 from private.payment_intent_resolutions where intent_id=intent.id)
  then raise sqlstate 'PT409' using message='Intencao ja resolvida'; end if;
 if run.state='resolved' or exists(select 1 from private.payment_intent_withdrawals where intent_id=intent.id)
  or not exists(select 1 from private.payment_intent_dispatch_claims where intent_id=intent.id and run_id=run.id)
  then raise sqlstate 'PT409' using message='Protecao da execucao indisponivel'; end if;
 select * into position from private.payment_financial_positions where charge_id=charge.id;
 source:=public.get_financial_projection_source(application.observation_id);
 if application.result->>'action' is null or application.result->>'action' not in('replace','same')
  or source->'captureIsCurrent' is distinct from 'true'::jsonb
  or source->'sourceConflictCount' is distinct from '0'::jsonb
  or charge.current_query is not null
  or position.revision is distinct from application.position_revision
  or position.charge_revision is distinct from application.charge_revision
  or position.charge_revision is distinct from charge.revision
  or position.journal_fingerprint is distinct from application.journal_fingerprint
  or position.journal_fingerprint is distinct from private.financial_journal_fingerprint(charge.id)
  or position.value is distinct from application.result->'position'
  or position.observation_id is distinct from application.basis_observation_id
  or position.value->>'certainty' is distinct from 'known' then return null; end if;
 perform private.validate_known_financial_history(charge.id,position.value);
 candidate:=position.value->>'resolutionCandidate';
 if candidate is null or candidate not in('received','refunded') then return null; end if;
 if position.value->'pendingRefundCents' is distinct from '0'::jsonb
  or position.value->'chargebackOutstandingCents' is distinct from '0'::jsonb
  or (candidate='received' and ((position.value->>'creditCents')::numeric<captured.remaining_cents or position.value->'completedRefundCents' is distinct from '0'::jsonb))
  or (candidate='refunded' and (position.value->'completedRefundCents' is distinct from position.value->'receivedGrossCents' or position.value->'creditCents' is distinct from '0'::jsonb))
  then raise exception 'Candidato financeiro inconsistente'; end if;
 -- Zero ou outra reserva nao provam liberacao anterior. Replay ja retornou.
 if not exists(select 1 from private.payment_intent_reservations where order_id=intent.order_id and intent_id=intent.id)
  then raise sqlstate 'PT409' using message='Reserva propria indisponivel'; end if;
 expected_run_revision:=run.revision;
 if expected_run_revision not between 0 and 9007199254740990 then raise exception 'Revisao terminal indisponivel'; end if;
 resolution_reason:='financial_'||candidate;at_time:=clock_timestamp();
 update private.payment_execution_runs r set state='resolved',reason=resolution_reason,current_step=null,revision=r.revision+1
  where r.id=run.id and r.revision=expected_run_revision and r.state<>'resolved';
 if not found then raise sqlstate 'PT409' using message='Execucao mudou durante a resolucao'; end if;
 delete from private.payment_intent_reservations r where r.order_id=intent.order_id and r.intent_id=intent.id returning r.order_id into released;
 if released is distinct from intent.order_id then raise exception 'Reserva propria indisponivel'; end if;
 result:=jsonb_build_object('schemaVersion',1,'semantics','financial_resolution_receipt','mode','fixture','requestId',request_id,
  'applicationRequestId',target_application,'executionRequestId',run.request_id,'chargeId',charge.id,'orderId',intent.order_id,'intentId',intent.id,'runId',run.id,
  'observationId',application.observation_id,'basisObservationId',position.observation_id,'reason',resolution_reason,'recordedAt',at_time,
  'positionRevision',position.revision,'chargeRevision',position.charge_revision,'journalFingerprint',position.journal_fingerprint,
  'expectedRunRevision',expected_run_revision,'appliedRunRevision',expected_run_revision+1,
  'view',jsonb_build_object('mode','fixture','identityProof','fixture_declared','intentId',intent.id,'runId',run.id,'createdBy',intent.created_by,
   'currentOwnerId',owner_before,'createdAt',run.created_at,'state','resolved','reason',resolution_reason,'revision',expected_run_revision+1,'dispatchClaimed',true,'reservationActive',false));
 insert into private.payment_financial_resolutions(request_id,application_request_id,intent_id,run_id,execution_request_id,order_id,charge_id,observation_id,basis_observation_id,
  reason,position_revision,charge_revision,journal_fingerprint,expected_run_revision,applied_run_revision,recorded_at,result)
 values(request_id,target_application,intent.id,run.id,run.request_id,intent.order_id,charge.id,application.observation_id,position.observation_id,
  resolution_reason,position.revision,position.charge_revision,position.journal_fingerprint,expected_run_revision,expected_run_revision+1,at_time,result);
 if private.payment_execution_view(intent.id) is distinct from result->'view' then raise exception 'View terminal divergente'; end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(null,'payment_financial_resolved','payment_financial_resolution',request_id);
 return result;
end; $$;
revoke all on function public.resolve_financial_execution(uuid,uuid) from public,anon,authenticated;
grant execute on function public.resolve_financial_execution(uuid,uuid) to service_role;
