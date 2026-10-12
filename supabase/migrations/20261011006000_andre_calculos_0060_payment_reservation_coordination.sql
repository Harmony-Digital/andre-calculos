-- Coordena reservas duráveis com Pix manual e condição contratual.
-- Evolui0057/0044: replay e conciliação zero precedem as novas guardas.
create or replace function public.confirm_manual_deposit(target_quote uuid,expected_context text,expected_remaining_cents bigint,request_id uuid,confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); customer public.clients%rowtype; job public.orders%rowtype; accepted record;
 intent private.manual_deposit_requests%rowtype; receipt private.manual_deposit_receipts%rowtype;
 paid numeric; remaining bigint; payment_id uuid; at_time timestamptz; next_status text; customer_email text; owner_before uuid;
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
 select coalesce(sum(p.amount_cents),0) into paid from public.payments p where p.order_id=job.id and p.kind='deposit' and p.status='confirmed';
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
revoke all on function public.confirm_manual_deposit(uuid,text,bigint,uuid,boolean) from public,anon,service_role;
grant execute on function public.confirm_manual_deposit(uuid,text,bigint,uuid,boolean) to authenticated;

create or replace function public.set_client_contract(target_client uuid,has_contract boolean,reason text,expected_revision integer,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); initial_owner uuid; customer public.clients%rowtype;
 receipt private.client_contract_changes%rowtype; job public.orders%rowtype; accepted record;
 next_status text; paid numeric; effects jsonb:='[]'::jsonb; actor_name text; normalized_reason text;
begin
 if actor is null or target_client is null or request_id is null or has_contract is null or reason is null
  or expected_revision is null or expected_revision not between 0 and 2147483646 then raise exception 'Confira a condição e o motivo'; end if;
 normalized_reason:=private.trim_client_contract_reason(reason);
 if length(normalized_reason) not between 3 and 1000 then raise exception 'Informe o motivo da alteração'; end if;
 select owner_id into initial_owner from public.clients where id=target_client;
 -- Ordem compartilhada com edição do perfil: nunca trancar o perfil do dono
 -- depois do cliente. Também impede transferência de identidade no meio.
 perform p.id from public.profiles p where p.id in (actor,initial_owner) order by p.id for share;
 select full_name into actor_name from public.profiles where id=actor and role='calculator';
 if not found or not exists(select 1 from public.profiles where id=initial_owner and role='client') then raise exception 'Acesso não autorizado'; end if;
 select * into customer from public.clients where id=target_client for update;
 if customer.id is null or customer.owner_id is distinct from initial_owner then raise exception 'Cliente indisponível'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client-contract:'||request_id::text,0));
 select * into receipt from private.client_contract_changes r where r.id=request_id;
 if receipt.id is not null then
  if (receipt.client_id,receipt.actor_id,receipt.has_contract,receipt.reason,receipt.expected_revision)
   is distinct from (target_client,actor,has_contract,normalized_reason,expected_revision) then
   raise sqlstate 'PT409' using message='Tentativa já registrada com outros dados'; end if;
  return private.client_contract_result(receipt);
 end if;
 if customer.contract_revision<>expected_revision then raise sqlstate 'PT409' using message='A condição mudou em outra sessão'; end if;
 if customer.has_contract=has_contract then raise sqlstate 'PT409' using message='Esta condição já está cadastrada'; end if;
 perform o.id from public.orders o where o.client_id=customer.id order by o.id for update;
 perform p.id from public.payments p join public.orders o on o.id=p.order_id where o.client_id=customer.id order by p.order_id,p.id for update of p;
 -- Inclui pedidos concluídos e reservas de contas anteriores, sem resolver provedor.
 if exists(select 1 from private.payment_intent_reservations r join public.orders o on o.id=r.order_id where o.client_id=customer.id) then
  raise sqlstate 'PT423' using message='Há uma cobrança pendente de resolução para este cliente'; end if;
 if not has_contract and private.client_contract_in_use(customer.id) then raise sqlstate 'PT409' using message='Há pedidos em andamento com esta condição'; end if;
 update public.clients c set has_contract=set_client_contract.has_contract,contract_revision=c.contract_revision+1 where c.id=customer.id;
 for job in select o.* from public.orders o where o.client_id=customer.id and o.status in ('awaiting_payment','awaiting_documents') order by o.id loop
  select * into accepted from private.accepted_order_deposit(job.id);
  if not found then continue; end if;
  if has_contract then
   next_status:=private.queue_after_deposit_or_contract(job.id,actor);
  else
   select coalesce(sum(p.amount_cents),0) into paid from public.payments p where p.order_id=job.id and p.kind='deposit' and p.status='confirmed';
   if accepted.required_cents<=0 or paid<accepted.required_cents then
    next_status:='awaiting_payment';
    if job.status<>next_status then
     update public.orders set status=next_status where id=job.id;
     perform private.record_event(job.process_id,'status_changed',jsonb_build_object('from',job.status,'to',next_status,'code',job.code),actor,job.id);
    end if;
   else
    next_status:=private.queue_after_deposit_or_contract(job.id,actor);
   end if;
  end if;
  if next_status<>job.status then effects:=effects||jsonb_build_array(jsonb_build_object('orderId',job.id,'processId',job.process_id,'from',job.status,'to',next_status)); end if;
 end loop;
 insert into private.client_contract_changes(id,client_id,actor_id,actor_name,has_contract,prior_has_contract,reason,expected_revision,applied_revision,changed_at,effects)
  values(request_id,customer.id,actor,actor_name,has_contract,customer.has_contract,normalized_reason,expected_revision,expected_revision+1,clock_timestamp(),effects) returning * into receipt;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'client_contract_changed','client_contract_change',request_id);
 return private.client_contract_result(receipt);
end;
$$;
revoke all on function public.set_client_contract(uuid,boolean,text,integer,uuid) from public,anon,service_role;
grant execute on function public.set_client_contract(uuid,boolean,text,integer,uuid) to authenticated;
