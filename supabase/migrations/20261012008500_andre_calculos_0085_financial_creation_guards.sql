-- Guardas locais ficticias; terminal/liberacao pertencem a AC.
create function private.lock_order_financial_sources(target_order uuid) returns void
language plpgsql volatile set search_path='' as $$
begin
 if target_order is null then raise exception 'Fontes financeiras indisponiveis'; end if;
 -- Caller ja possui profiles/client/order/payments; todos os produtores T
 -- travam a charge antes de query/journal e Y usa a mesma ordem interna.
 perform id from private.payment_financial_charges where order_id=target_order order by id for update;
 perform q.id from private.payment_financial_queries q join private.payment_financial_charges c on c.id=q.charge_id where c.order_id=target_order order by q.charge_id,q.revision for update of q;
 perform p.charge_id from private.payment_financial_positions p join private.payment_financial_charges c on c.id=p.charge_id where c.order_id=target_order order by p.charge_id for update of p;
end; $$;
revoke all on function private.lock_order_financial_sources(uuid) from public,anon,authenticated,service_role;
create or replace function private.payment_obligation_preview(target_order uuid,target_phase text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare job public.orders%rowtype; customer public.clients%rowtype; accepted record;
 binding private.payment_provider_customers%rowtype; scope private.payment_provider_scopes%rowtype;
 projection jsonb;paid numeric; signal numeric; required bigint; remaining bigint; state text:='ready'; problem text;
begin
 if target_phase is null or target_phase not in ('deposit','balance') then raise exception 'Finalidade inválida'; end if;
 select * into job from public.orders where id=target_order;
 select * into customer from public.clients where id=job.client_id;
 select * into accepted from private.accepted_order_deposit(job.id);
 if not found then
  return jsonb_build_object('mode','fixture','identityProof','fixture_declared','status','blocked','reason','contract_missing',
   'orderId',job.id,'phase',target_phase,'quoteId',null,'contextHash',null,'processId',job.process_id,
   'clientId',job.client_id,'ownerId',customer.owner_id,'orderStatus',job.status,'hasContract',customer.has_contract,
   'contractRevision',customer.contract_revision,'totalCents',null,'requiredCents',null,'creditedCents',null,
   'totalCreditedCents',null,'remainingCents',null,'binding',null);
 end if;
 projection:=private.order_payment_credit(job.id);
 paid:=(projection->>'totalCreditCents')::numeric;signal:=(projection->>'depositCreditCents')::numeric;
 required:=case when target_phase='deposit' then accepted.required_cents else accepted.total_cents end;
 if accepted.total_cents not between 0 and 9007199254740991 or required not between 0 and 9007199254740991
  or projection->'unsafeAmount'='true'::jsonb or paid>9007199254740991 or signal>9007199254740991 then
  state:='blocked'; problem:='unsafe_amount'; paid:=null; signal:=null;
 elsif (projection->>'unlinkedLegacyCount')::numeric>0 then
  state:='blocked'; problem:='legacy_provider_reconciliation';
 elsif projection->'depositUncertain' is distinct from 'false'::jsonb or projection->'uncertain' is distinct from 'false'::jsonb or paid is null or signal is null then
  state:='blocked';problem:='financial_reconciliation';
 elsif paid>accepted.total_cents or signal>accepted.required_cents then
  state:='blocked'; problem:='credit_excess';
 elsif job.status in ('cancelled','refunded') then
  state:='blocked'; problem:='order_closed';
 elsif target_phase='deposit' and customer.has_contract then
  state:='waived'; remaining:=0;
 elsif (case when target_phase='deposit' then signal else paid end)>=required then
  state:='settled'; remaining:=0;
 elsif target_phase='deposit' and job.status not in ('awaiting_payment','awaiting_documents') then
  state:='blocked'; problem:='phase_unavailable';
 elsif target_phase='balance' and (job.status not in ('delivered','completed')
  or not exists(select 1 from public.deliveries d where d.order_id=job.id and d.process_id=job.process_id)) then
  state:='blocked'; problem:='phase_unavailable';
 else
  remaining:=required-(case when target_phase='deposit' then signal else paid end)::bigint;
 end if;
 select s.* into scope from private.payment_provider_configuration cfg
  join private.payment_provider_scopes s on s.id=cfg.scope_id where cfg.singleton;
 if scope.id is not null then
  select * into binding from private.payment_provider_customers b where b.scope_id=scope.id and b.client_id=job.client_id;
 end if;
 if state='ready' then
  if scope.id is null then state:='blocked';problem:='scope_unconfigured';remaining:=null;
  elsif binding.id is null then state:='blocked';problem:='customer_unbound';remaining:=null;
  elsif binding.kind<>customer.kind or binding.document is distinct from customer.document then
   state:='blocked';problem:='customer_changed';remaining:=null;
  end if;
 end if;
 return jsonb_build_object('mode','fixture','identityProof','fixture_declared','status',state,'reason',problem,
  'orderId',job.id,'phase',target_phase,'quoteId',accepted.quote_id,'contextHash',accepted.context_hash,
  'processId',job.process_id,'clientId',job.client_id,'ownerId',customer.owner_id,'orderStatus',job.status,
  'hasContract',customer.has_contract,'contractRevision',customer.contract_revision,
  'totalCents',case when accepted.total_cents<=9007199254740991 then accepted.total_cents else null end,
  'requiredCents',case when required<=9007199254740991 then required else null end,
  'creditedCents',case when target_phase='deposit' then signal else paid end,'totalCreditedCents',paid,'remainingCents',remaining,
  'binding',case when binding.id is null then null else jsonb_build_object('id',binding.id,'scopeId',scope.id,
   'clientId',binding.client_id,'customerId',binding.customer_id,'scope',jsonb_strip_nulls(jsonb_build_object(
    'provider',scope.provider,'environment',scope.environment,'accountId',scope.account_id,'walletId',scope.wallet_id))) end);
end;
$$;

create or replace function public.confirm_manual_deposit(target_quote uuid,expected_context text,expected_remaining_cents bigint,request_id uuid,confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); customer public.clients%rowtype; job public.orders%rowtype; accepted record;
 intent private.manual_deposit_requests%rowtype; receipt private.manual_deposit_receipts%rowtype;
 projection jsonb;paid numeric; remaining bigint; payment_id uuid; at_time timestamptz; next_status text; customer_email text; owner_before uuid;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='calculator') then raise exception 'Acesso não autorizado'; end if;
 if target_quote is null or request_id is null or confirmed is distinct from true or expected_context is null or expected_context !~ '^[0-9a-f]{64}$'
  or expected_remaining_cents is null or expected_remaining_cents not between 0 and 9007199254740991 then raise exception 'Confira o recebimento do sinal'; end if;
 -- A edição do perfil trava profiles antes de clients. Usar a mesma ordem.
 -- A pré-leitura não valida contato: replay/conciliação zero conservam seu caminho.
 select c.owner_id into owner_before from public.clients c join public.orders o on o.client_id=c.id
  join public.quotes q on q.order_id=o.id where q.id=target_quote;
 perform p.id from public.profiles p where p.id in(actor,owner_before) order by p.id for share;
 if not exists(select 1 from public.profiles where id=actor and role='calculator') then raise exception 'Acesso não autorizado'; end if;
 select c.* into customer from public.clients c join public.orders o on o.client_id=c.id join public.quotes q on q.order_id=o.id
  where q.id=target_quote for update of c;
 if customer.id is null then raise exception 'Proposta indisponível'; end if;
 if customer.owner_id is distinct from owner_before then raise sqlstate 'PT409' using message='Cliente atualizado em outra sessão'; end if;
 select o.* into job from public.orders o join public.quotes q on q.order_id=o.id where q.id=target_quote for update of o;
 -- A intenção original é recuperada antes de reavaliar saldo/estado atuais.
 select * into intent from private.manual_deposit_requests x where x.request_id=confirm_manual_deposit.request_id;
 if intent.request_id is not null then
  if intent.quote_id is distinct from target_quote or intent.actor_id is distinct from actor or intent.context_hash is distinct from expected_context
   or intent.expected_remaining_cents is distinct from expected_remaining_cents then raise sqlstate 'PT409' using message='Tentativa já registrada com outros dados'; end if;
  select * into receipt from private.manual_deposit_receipts where id=intent.receipt_id;
  return private.manual_deposit_result(receipt);
 end if;
 select * into accepted from private.accepted_order_deposit(job.id) a where a.quote_id=target_quote and a.context_hash=expected_context;
 if not found then raise exception 'Aceite da proposta indisponível'; end if;
 if accepted.has_contract then raise exception 'Contrato dispensa sinal'; end if;
 if accepted.required_cents<=0 then raise exception 'Confira os valores da proposta'; end if;
 -- Também trava pending/refunded: uma promoção concorrente não passa entre
 -- a soma e a gravação. Novas linhas aguardam o lock da FK do pedido.
 perform p.id from public.payments p where p.order_id=job.id order by p.id for update;
 perform private.lock_order_financial_sources(job.id);
 projection:=private.order_payment_credit(job.id);
 if projection->'unsafeAmount'='true'::jsonb or projection->'depositUncertain' is distinct from 'false'::jsonb or projection->'uncertain' is distinct from 'false'::jsonb
  or projection->'depositCreditCents'='null'::jsonb or projection->'totalCreditCents'='null'::jsonb then raise sqlstate 'PT409' using message='Sinal exige conciliacao financeira'; end if;
 paid:=(projection->>'depositCreditCents')::numeric;
 if paid>accepted.required_cents or (projection->>'totalCreditCents')::numeric>accepted.total_cents then raise sqlstate 'PT409' using message='Credito excede a proposta'; end if;
 if paid>=accepted.required_cents and (projection->>'manualDepositCents')::numeric<accepted.required_cents then raise sqlstate 'PT409' using message='Sinal recebido pelo provedor'; end if;
 remaining:=greatest(accepted.required_cents-paid,0)::bigint;
 if remaining=0 then
  select r.* into receipt from private.manual_deposit_receipts r left join public.payments p on p.id=r.payment_id
   where r.quote_id=target_quote and r.context_hash=expected_context and (r.payment_id is null or p.status='confirmed')
   order by r.confirmed_at desc,r.id desc limit 1;
  if receipt.id is not null then
   insert into private.manual_deposit_requests(request_id,receipt_id,quote_id,actor_id,context_hash,expected_remaining_cents)
    values(request_id,receipt.id,target_quote,actor,expected_context,expected_remaining_cents);
   return private.manual_deposit_result(receipt);
  end if;
 end if;
 if job.status not in ('awaiting_payment','awaiting_documents') then raise sqlstate 'PT409' using message='Pedido fora da confirmação de sinal'; end if;
 if remaining<>expected_remaining_cents then raise sqlstate 'PT409' using message='O sinal mudou em outra sessão'; end if;
 at_time:=clock_timestamp();
 if remaining>0 then
  -- A reserva independe de fase, conta e idade do despacho. Não a cancela.
  if exists(select 1 from private.payment_intent_reservations r where r.order_id=job.id) then
   raise sqlstate 'PT423' using message='Há uma cobrança pendente de resolução neste pedido'; end if;
  insert into public.payments(order_id,kind,method,amount_cents,status,confirmed_by,confirmed_at)
   values(job.id,'deposit','pix_manual',remaining,'confirmed',actor,at_time) returning id into payment_id;
 end if;
 next_status:=private.queue_after_deposit_or_contract(job.id,actor);
 insert into private.manual_deposit_receipts(order_id,quote_id,payment_id,context_hash,actor_id,required_cents,credited_before_cents,amount_cents,confirmed_at,order_status)
  values(job.id,target_quote,payment_id,expected_context,actor,accepted.required_cents,paid,remaining,at_time,next_status) returning * into receipt;
 insert into private.manual_deposit_requests(request_id,receipt_id,quote_id,actor_id,context_hash,expected_remaining_cents)
  values(request_id,receipt.id,target_quote,actor,expected_context,expected_remaining_cents);
 perform private.record_event(job.process_id,'payment_confirmed',jsonb_build_object('receipt_id',receipt.id,'payment_id',payment_id,
  'kind','deposit','amount_cents',remaining,'required_cents',accepted.required_cents,'code',job.code),actor,job.id);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'manual_deposit_confirmed','manual_deposit_receipt',receipt.id);
 -- Conciliação sem crédito não anuncia um novo pagamento. Replay retorna antes.
 if payment_id is not null and remaining>0 then
  select u.email into customer_email from auth.users u
   join public.profiles p on p.id=u.id and p.role='client'
   where u.id=customer.owner_id;
  if nullif(btrim(customer_email),'') is null then raise exception 'Contato do cliente indisponível'; end if;
  insert into public.notifications(channel,recipient,template,data,dedup_key)
   values('email',customer_email,'payment_confirmed',
    jsonb_build_object('order_id',job.id,'process_id',job.process_id,'code',job.code),
    'payment:'||payment_id::text||':client:email');
 end if;
 return private.manual_deposit_result(receipt);
end;
$$;

create or replace function public.prepare_payment_obligation(target_order uuid,target_phase text,expected_context text,
 expected_remaining_cents bigint,billing_type text,due_date date,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); initial_owner uuid; customer public.clients%rowtype;
 receipt private.payment_obligation_contexts%rowtype; preview jsonb;
begin
 if actor is null or request_id is null or expected_context is null or expected_context !~ '^[0-9a-f]{64}$'
  or expected_remaining_cents is null or expected_remaining_cents not between 1 and 9007199254740991
  or target_phase is null or target_phase not in ('deposit','balance')
  or billing_type is null or billing_type not in ('PIX','BOLETO','CREDIT_CARD','UNDEFINED')
  or due_date is null or not isfinite(due_date) or due_date not between date '1900-01-01' and date '9999-12-31'
  then raise exception 'Confira os dados da obrigação'; end if;
 select c.owner_id into initial_owner from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order;
 perform p.id from public.profiles p where p.id in (actor,initial_owner) order by p.id for share;
 actor:=private.authorize_payment_obligation(target_order);
 select c.* into customer from public.orders o join public.clients c on c.id=o.client_id where o.id=target_order for update of c;
 if customer.owner_id is distinct from initial_owner then raise exception 'Pedido indisponível'; end if;
 perform o.id from public.orders o where o.id=target_order and o.client_id=customer.id for update;
 if not found then raise exception 'Pedido indisponível'; end if;
 perform p.id from public.payments p where p.order_id=target_order order by p.id for update;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-obligation:'||request_id::text,0));
 select * into receipt from private.payment_obligation_contexts where id=request_id;
 if receipt.id is not null then
  if (receipt.order_id,receipt.actor_id,receipt.phase,receipt.context_hash,receipt.remaining_cents,receipt.billing_type,receipt.due_date)
   is distinct from (target_order,actor,target_phase,expected_context,expected_remaining_cents,billing_type,due_date)
   then raise sqlstate 'PT409' using message='Tentativa já registrada com outros dados'; end if;
  return jsonb_build_object('id',receipt.id,'createdBy',receipt.actor_id,'createdAt',receipt.created_at,'snapshot',receipt.snapshot);
 end if;
 perform private.lock_order_financial_sources(target_order);
 perform cfg.singleton from private.payment_provider_configuration cfg where cfg.singleton for share;
 preview:=private.payment_obligation_preview(target_order,target_phase);
 if preview->>'status'<>'ready' then raise sqlstate 'PT409' using message='Obrigação indisponível para preparo'; end if;
 if preview->>'contextHash'<>expected_context or (preview->>'remainingCents')::bigint<>expected_remaining_cents
  then raise sqlstate 'PT409' using message='A obrigação mudou em outra sessão'; end if;
 insert into private.payment_obligation_contexts(id,order_id,quote_id,client_id,binding_id,actor_id,phase,context_hash,
  remaining_cents,billing_type,due_date,snapshot)
 values(request_id,target_order,(preview->>'quoteId')::uuid,customer.id,(preview->'binding'->>'id')::uuid,actor,
  target_phase,expected_context,expected_remaining_cents,billing_type,due_date,preview||jsonb_build_object('billingType',billing_type,'dueDate',due_date))
 returning * into receipt;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'payment_obligation_prepared','payment_obligation',receipt.id);
 return jsonb_build_object('id',receipt.id,'createdBy',receipt.actor_id,'createdAt',receipt.created_at,'snapshot',receipt.snapshot);
end;
$$;

create or replace function private.lock_payment_intent_order(target_order uuid,for_write boolean) returns uuid
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
 if for_write then perform p.id from public.payments p where p.order_id=target_order order by p.id for update; perform private.lock_order_financial_sources(target_order); end if;
 return actor;
end;
$$;

create or replace function private.lock_payment_execution(target_request uuid) returns private.payment_intents
language plpgsql security definer set search_path='' as $$
declare receipt private.payment_intent_requests%rowtype; intent private.payment_intents%rowtype;
 captured private.payment_obligation_contexts%rowtype; owner_before uuid; client public.clients%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Execução fictícia indisponível'; end if;
 select * into receipt from private.payment_intent_requests r where r.id=target_request and r.action='reserve';
 select * into intent from private.payment_intents i where i.id=receipt.intent_id and i.context_id=receipt.context_id;
 select * into captured from private.payment_obligation_contexts c where c.id=intent.context_id and c.order_id=intent.order_id;
 if intent.id is null or receipt.actor_id is distinct from intent.created_by
  or receipt.result->>'semantics' is distinct from 'receipt_snapshot' or receipt.result->>'action' is distinct from 'reserve'
  or receipt.result->>'requestId' is distinct from target_request::text
  or receipt.result->>'actorId' is distinct from intent.created_by::text
  or receipt.result->'snapshot'->'intent'->>'id' is distinct from intent.id::text
  or receipt.result->'snapshot'->'intent'->>'contextId' is distinct from captured.id::text
  or receipt.result->'snapshot'->'intent'->>'reference' is distinct from intent.reference
  or receipt.result->'snapshot'->'intent'->>'createdBy' is distinct from intent.created_by::text
  or receipt.result->'snapshot'->'intent'->'obligation' is distinct from captured.snapshot
  then raise exception 'Execução fictícia indisponível'; end if;
 perform private.require_payment_fixture_system((captured.snapshot->'binding'->>'scopeId')::uuid,captured.client_id);
 select c.owner_id into owner_before from public.clients c where c.id=captured.client_id;
 perform p.id from public.profiles p where p.id in(owner_before,intent.created_by,captured.actor_id,(captured.snapshot->>'ownerId')::uuid) order by p.id for share;
 select * into client from public.clients c where c.id=captured.client_id for update;
 if client.owner_id is distinct from owner_before then raise sqlstate 'PT409' using message='Cliente mudou em outra sessão'; end if;
 perform o.id from public.orders o where o.id=intent.order_id and o.client_id=client.id for update;
 if not found then raise exception 'Execução fictícia indisponível'; end if;
 perform p.id from public.payments p where p.order_id=intent.order_id order by p.id for update;
 perform private.lock_order_financial_sources(intent.order_id);
 perform cfg.singleton from private.payment_provider_configuration cfg where cfg.singleton for share;
 perform c.id from private.payment_obligation_contexts c where c.id=captured.id for share;
 perform b.id from private.payment_provider_customers b where b.id=captured.binding_id for share;
 select * into intent from private.payment_intents i where i.id=intent.id for update;
 perform r.order_id from private.payment_intent_reservations r where r.intent_id=intent.id for update;
 return intent;
end; $$;
-- O produtor anterior fica privado, sem entrada alternativa pelo service_role.
-- Replay conserva suas verificacoes e contabilizacao; request novo recebe
-- a guarda comum ANTES de faults/efeitos, alem da reconferencia do produtor.
alter function public.send_payment_fixture_request(uuid,uuid,uuid,uuid,text,text,jsonb) set schema private;
revoke all on function private.send_payment_fixture_request(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.send_payment_fixture_request(target_scope uuid,target_client uuid,slot_id uuid,request_id uuid,operation text,fingerprint text,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare intent private.payment_intents%rowtype; owner_before uuid; customer public.clients%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Provedor ficticio indisponivel'; end if;
 if exists(select 1 from private.payment_fixture_requests r where r.id=request_id) or operation is distinct from 'payment_create' then
  return private.send_payment_fixture_request(target_scope,target_client,slot_id,request_id,operation,fingerprint,payload);
 end if;
 perform private.require_payment_fixture_system(target_scope,target_client);
 select * into intent from private.payment_intents where id=(payload->>'reference')::uuid;
 select owner_id into owner_before from public.clients where id=target_client;
 perform id from public.profiles where id in(owner_before,intent.created_by) order by id for share;
 select * into customer from public.clients where id=target_client for update;
 if customer.owner_id is distinct from owner_before then raise sqlstate 'PT409' using message='Cliente atualizado em outra sessao'; end if;
 perform id from public.orders where id=intent.order_id and client_id=target_client for update;
 if not found then raise exception 'Intencao ficticia indisponivel'; end if;
 perform id from public.payments where order_id=intent.order_id order by id for update;
 perform private.lock_order_financial_sources(intent.order_id);
 perform singleton from private.payment_provider_configuration where singleton for share;
 -- Um receipt pode ter surgido enquanto aguardamos os locks de dominio.
 -- Serializar por request e reler antes da guarda preserva esse replay.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment-fixture-request:'||request_id::text,0));
 if exists(select 1 from private.payment_fixture_requests r where r.id=request_id) then
  return private.send_payment_fixture_request(target_scope,target_client,slot_id,request_id,operation,fingerprint,payload);
 end if;
 if private.payment_execution_context_current(intent.id) is not true then raise sqlstate 'PT409' using message='Contexto financeiro atualizado'; end if;
 return private.send_payment_fixture_request(target_scope,target_client,slot_id,request_id,operation,fingerprint,payload);
end; $$;
revoke all on function public.send_payment_fixture_request(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.send_payment_fixture_request(uuid,uuid,uuid,uuid,text,text,jsonb) to service_role;
