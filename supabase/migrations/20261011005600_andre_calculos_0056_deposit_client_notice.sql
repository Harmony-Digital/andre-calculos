-- Aviso do cliente na mesma transação do recebimento manual.
-- Migration preparada/verificada somente localmente; nenhum transporte ativado.
create or replace function public.confirm_manual_deposit(target_quote uuid,expected_context text,expected_remaining_cents bigint,request_id uuid,confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); customer public.clients%rowtype; job public.orders%rowtype; accepted record;
 intent private.manual_deposit_requests%rowtype; receipt private.manual_deposit_receipts%rowtype;
 paid numeric; remaining bigint; payment_id uuid; at_time timestamptz; next_status text; customer_email text;
begin
 perform id from public.profiles where id=actor and role='calculator' for share;
 if actor is null or not found then raise exception 'Acesso não autorizado'; end if;
 if target_quote is null or request_id is null or confirmed is distinct from true or expected_context is null or expected_context !~ '^[0-9a-f]{64}$'
  or expected_remaining_cents is null or expected_remaining_cents not between 0 and 9007199254740991 then raise exception 'Confira o recebimento do sinal'; end if;
 select c.* into customer from public.clients c join public.orders o on o.client_id=c.id join public.quotes q on q.order_id=o.id
  where q.id=target_quote for update of c;
 if customer.id is null then raise exception 'Proposta indisponível'; end if;
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
   where u.id=customer.owner_id for share of u,p;
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
