-- Aplicacao local por origem duravel; terminal/liberacao pertencem a Z.
create table private.payment_financial_applications (
 request_id uuid primary key,charge_id uuid not null references private.payment_financial_charges(id),
 observation_id uuid not null references private.payment_financial_observations(id),
 order_id uuid not null references public.orders(id),intent_id uuid not null references private.payment_intents(id),
 basis_observation_id uuid references private.payment_financial_observations(id),
 position_revision bigint not null check(position_revision between 0 and 9007199254740991),
 charge_revision bigint not null check(charge_revision between 0 and 9007199254740991),
 journal_fingerprint text not null check(journal_fingerprint ~ '^[0-9a-f]{64}$'),
 applied_at timestamptz not null,result jsonb not null check(jsonb_typeof(result)='object')
);
create index payment_financial_applications_charge_idx on private.payment_financial_applications(charge_id);
create index payment_financial_applications_observation_idx on private.payment_financial_applications(observation_id);
create index payment_financial_applications_order_idx on private.payment_financial_applications(order_id);
create index payment_financial_applications_intent_idx on private.payment_financial_applications(intent_id);
create index payment_financial_applications_basis_idx on private.payment_financial_applications(basis_observation_id);
alter table private.payment_financial_applications enable row level security;
revoke all on private.payment_financial_applications from public,anon,authenticated,service_role;
create trigger payment_financial_application_immutable before update on private.payment_financial_applications for each row execute function private.preserve_quote_contract_record();

create function public.get_financial_application_receipt(target_observation uuid,request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r private.payment_financial_applications%rowtype;
begin
 if auth.role() is distinct from 'service_role' or target_observation is null or request_id is null then raise exception 'Aplicacao ficticia indisponivel'; end if;
 select * into r from private.payment_financial_applications a where a.request_id=get_financial_application_receipt.request_id;
 if r.request_id is null then return null; end if;
 if r.observation_id is distinct from target_observation then raise sqlstate 'PT409' using message='Tentativa ja vinculada'; end if;
 return r.result;
end; $$;
revoke all on function public.get_financial_application_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_financial_application_receipt(uuid,uuid) to service_role;

-- Invariantes de prefixo sobre fatos T normalizados; nao interpreta body/provedor.
create function private.validate_known_financial_history(target_charge uuid,position_value jsonb) returns void
language plpgsql stable set search_path='' as $$
declare h record;prior jsonb;next_f jsonb:=position_value->'snapshot';item record;
begin
 if position_value->>'certainty' is distinct from 'known' then return; end if;
 for h in select source_order,facts,proof from private.payment_financial_observations where charge_id=target_charge and facts is not null loop
  prior:=h.facts;
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

create function public.apply_financial_observation(target_observation uuid,request_id uuid,expected_position_revision bigint,expected_charge_revision bigint,expected_journal_fingerprint text,decision_action text,position_value jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.payment_financial_charges%rowtype;o private.payment_financial_observations%rowtype;run private.payment_execution_runs%rowtype;
 intent private.payment_intents%rowtype;captured private.payment_obligation_contexts%rowtype;p private.payment_financial_positions%rowtype;
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
 if decision_action='replace' and position_value->>'certainty'='known' and source->'captureIsCurrent' is distinct from 'true'::jsonb then raise exception 'Fonte superseded nao confirma credito'; end if;
 if decision_action='replace' and position_value->>'observationId' is distinct from target_observation::text then raise exception 'Base financeira divergente'; end if;
 if decision_action='hold' then
  if position_value->>'certainty' is distinct from 'reconcile' or position_value->'resolutionCandidate' is distinct from 'null'::jsonb then raise exception 'Conferencia financeira invalida'; end if;
  if before_value is not null and position_value-array['certainty','lastKnownCreditCents','reasons','resolutionCandidate'] is distinct from before_value-array['certainty','lastKnownCreditCents','reasons','resolutionCandidate'] then raise exception 'Conferencia alterou valores'; end if;
  if before_value is null and position_value->>'observationId' is distinct from target_observation::text then raise exception 'Base financeira divergente'; end if;
 end if;
 can_write:=decision_action in('replace','hold') or(decision_action='same' and source->'captureIsCurrent'='true'::jsonb and source->'sourceConflictCount'='0'::jsonb);
 if can_write then
  perform private.validate_known_financial_history(c.id,position_value);
  next_revision:=next_revision+1;
  insert into private.payment_financial_positions(charge_id,observation_id,revision,value)
   values(c.id,(position_value->>'observationId')::uuid,next_revision,position_value)
   on conflict(charge_id) do update set observation_id=excluded.observation_id,revision=excluded.revision,value=excluded.value;
  actual_value:=position_value;
  if position_value->>'certainty'='known' then
   prior_gross:=coalesce((before_value->>'receivedGrossCents')::numeric,0);prior_done:=coalesce((before_value->>'completedRefundCents')::numeric,0);prior_cb:=coalesce((before_value->>'chargebackOutstandingCents')::numeric,0);
   if (position_value->>'receivedGrossCents')::numeric>prior_gross then effects:=array_append(effects,'received'); end if;
   if (position_value->>'completedRefundCents')::numeric>prior_done or (position_value->>'chargebackOutstandingCents')::numeric>prior_cb then effects:=array_append(effects,'debited'); end if;
   if before_value is not null and (position_value->>'chargebackOutstandingCents')::numeric<prior_cb then effects:=array_append(effects,'restored'); end if;
   select exists(select 1 from private.payment_financial_observations h join private.payment_financial_queries q on q.id=h.source_id and h.source_kind='query'
    where h.charge_id=c.id and h.facts is null and q.revision>coalesce(p.charge_revision,0)) into unknown_after;
   if before_value is not null and cardinality(effects)=0 and (before_value->>'certainty'='reconcile' or unknown_after) then effects:=array_append(effects,'reconciled'); end if;
  elsif before_value is null or before_value->>'certainty' is distinct from 'reconcile' then effects:=array_append(effects,'reconcile'); end if;
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
create or replace function private.record_event(target_process uuid,event_kind text,event_data jsonb,event_actor uuid,target_order uuid default null,event_id uuid default pg_catalog.gen_random_uuid())
returns uuid language plpgsql volatile set search_path='' as $$
begin
 if target_process is null or event_id is null or event_kind is null or event_kind not in ('draft_created','draft_updated','checklist_draft_saved','file_uploaded','message_sent','note_added','decision_recorded','index_updated','quote_created','quote_accepted','payment_confirmed','payment_updated','status_changed','delivered') or event_data is null or jsonb_typeof(event_data)<>'object' then raise exception 'Evento inválido'; end if;
 insert into public.timeline_events(id,process_id,order_id,kind,data,actor_id) values(event_id,target_process,target_order,event_kind,event_data,event_actor);
 return event_id;
end;
$$;

create or replace function public.set_my_notification_preference(event text,channel text,enabled boolean,expected_revision integer,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); recipient uuid; pref public.notification_preferences%rowtype;
 receipt private.notification_preference_changes%rowtype; old_enabled boolean; next_revision integer;
begin
 if actor is null or public.is_calculator() is not true then raise exception 'Acesso não autorizado'; end if;
 if request_id is null or expected_revision is null or expected_revision not between 0 and 2147483646 or enabled is null
  or event is null or event not in ('new_signup','quote_created','quote_accepted','order_queued','payment_updated','new_message','deadline_two_days','deadline_one_day','deadline_overdue','account_deletion_requested')
  or channel is null or channel not in ('email','whatsapp') then raise exception 'Confira o evento e o canal'; end if;
 -- A linha existe mesmo quando ainda não há preferência: serializa a primeira
 -- gravação e a vinculação, além de alterações concorrentes.
 select profile_id into recipient from private.calculator_notification_recipient where singleton for update;
 if not found then raise exception 'Responsável pelos avisos pendente'; end if;
 if recipient is null then
  if (select count(*) from public.profiles where role='calculator')<>1 then raise exception 'Responsável pelos avisos pendente'; end if;
  update private.calculator_notification_recipient set profile_id=actor where singleton;
  recipient:=actor;
  insert into public.audit_log(actor_id,action,target_type,target_id)
   values(actor,'notification_recipient_confirmed','profile',actor);
 end if;
 if recipient<>actor then raise exception 'Acesso não autorizado'; end if;
 select * into receipt from private.notification_preference_changes c where c.id=request_id;
 if receipt.id is not null then
  if receipt.profile_id is distinct from actor or receipt.event is distinct from event or receipt.channel is distinct from channel
   or receipt.enabled is distinct from enabled or receipt.expected_revision is distinct from expected_revision
   then raise sqlstate 'PT409' using message='Tentativa já registrada com outros dados'; end if;
  return jsonb_build_object('id',receipt.id,'enabled',receipt.enabled,'revision',receipt.applied_revision);
 end if;
 select * into pref from public.notification_preferences p
  where p.profile_id=actor and p.event=set_my_notification_preference.event and p.channel=set_my_notification_preference.channel;
 if coalesce(pref.revision,0)<>expected_revision then raise sqlstate 'PT409' using message='A preferência mudou em outra sessão'; end if;
 old_enabled:=coalesce(pref.enabled,channel='email');
 next_revision:=expected_revision+1;
 insert into public.notification_preferences(profile_id,event,channel,enabled,revision)
  values(actor,event,channel,enabled,next_revision)
  on conflict on constraint notification_preferences_profile_id_event_channel_key do update set enabled=excluded.enabled,revision=excluded.revision;
 insert into private.notification_preference_changes(id,profile_id,event,channel,enabled,prior_enabled,expected_revision,applied_revision)
  values(request_id,actor,event,channel,enabled,old_enabled,expected_revision,next_revision);
 insert into public.audit_log(actor_id,action,target_type,target_id)
  values(actor,'notification_preference_saved','notification_preference_change',request_id);
 return jsonb_build_object('id',request_id,'enabled',enabled,'revision',next_revision);
end;
$$;
revoke all on function public.set_my_notification_preference(text,text,boolean,integer,uuid) from public,anon,service_role;
grant execute on function public.set_my_notification_preference(text,text,boolean,integer,uuid) to authenticated;

create or replace function private.queue_after_deposit_or_contract(target_order uuid,actor uuid) returns text
language plpgsql security definer set search_path='' as $$
declare job public.orders%rowtype; accepted record; projection jsonb; document_id uuid;
begin
 select * into job from public.orders where id=target_order;
 if job.id is null or job.status not in ('awaiting_payment','awaiting_documents') then return job.status; end if;
 select * into accepted from private.accepted_order_deposit(job.id);
 if not found then return job.status; end if;
 projection:=private.order_payment_credit(job.id);
 if not accepted.has_contract and (accepted.required_cents<=0 or projection->'depositUncertain' is distinct from 'false'::jsonb or (projection->>'depositCreditCents')::numeric<accepted.required_cents) then return job.status; end if;
 select id into document_id from public.files where process_id=job.process_id and (order_id is null or order_id=job.id)
  and folder in ('case','client') and upload_status='uploaded' and size_bytes>0 and sha256 is not null and sha256=expected_sha256
  order by id limit 1 for share;
 if document_id is null then
  if job.status='awaiting_payment' then
   update public.orders set status='awaiting_documents' where id=job.id;
   perform private.record_event(job.process_id,'status_changed',jsonb_build_object('from',job.status,'to','awaiting_documents','code',job.code),actor,job.id);
  end if;
  return 'awaiting_documents';
 end if;
 perform id from public.settings where singleton for share;
 perform r.profile_id from private.calculator_notification_recipient r join public.profiles p on p.id=r.profile_id and p.role='calculator' where r.singleton for share of r,p;
 update public.orders set status='queued' where id=job.id;
 perform private.record_event(job.process_id,'status_changed',jsonb_build_object('from',job.status,'to','queued','code',job.code),actor,job.id);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'order_queued','order',job.id);
 perform private.notify_calculator('order_queued',jsonb_build_object('order_id',job.id,'code',job.code,'process_id',job.process_id,
  'delivery_date',job.delivery_date,'internal_due_date',job.internal_due_date,'path','/painel/processos/'||job.process_id::text),'queued:'||job.id::text);
 return 'queued';
end;
$$;
revoke all on function private.queue_after_deposit_or_contract(uuid,uuid) from public,anon,authenticated,service_role;
