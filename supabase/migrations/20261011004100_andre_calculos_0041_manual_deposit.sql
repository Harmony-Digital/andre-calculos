-- Recebimento manual local: fonte contratual imutável, parcelas e replay.
-- Não emite propostas, não confirma transferências externas e não despacha avisos.
create table private.manual_deposit_receipts (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 quote_id uuid not null references private.quote_acceptances(quote_id),
 payment_id uuid unique references public.payments(id),
 context_hash text not null check(context_hash ~ '^[0-9a-f]{64}$'),
 actor_id uuid not null references public.profiles(id),
 required_cents bigint not null check(required_cents>0),
 credited_before_cents bigint not null check(credited_before_cents>=0),
 amount_cents bigint not null check(amount_cents>=0),
 confirmed_at timestamptz not null,
 order_status text not null check(order_status in ('awaiting_documents','queued')),
 check((payment_id is null)=(amount_cents=0))
);
create index manual_deposit_receipts_order_idx on private.manual_deposit_receipts(order_id,confirmed_at desc,id desc);
create index manual_deposit_receipts_quote_idx on private.manual_deposit_receipts(quote_id);
create index manual_deposit_receipts_actor_idx on private.manual_deposit_receipts(actor_id);
create table private.manual_deposit_requests (
 request_id uuid primary key,receipt_id uuid not null references private.manual_deposit_receipts(id),
 quote_id uuid not null references public.quotes(id),actor_id uuid not null references public.profiles(id),
 context_hash text not null,expected_remaining_cents bigint not null check(expected_remaining_cents>=0),
 created_at timestamptz not null default now()
);
create index manual_deposit_requests_receipt_idx on private.manual_deposit_requests(receipt_id);
create index manual_deposit_requests_quote_idx on private.manual_deposit_requests(quote_id);
create index manual_deposit_requests_actor_idx on private.manual_deposit_requests(actor_id);
alter table private.manual_deposit_receipts enable row level security;
alter table private.manual_deposit_requests enable row level security;
revoke all on private.manual_deposit_receipts,private.manual_deposit_requests from public,anon,authenticated,service_role;
create trigger manual_deposit_receipt_immutable before update on private.manual_deposit_receipts
 for each row execute function private.preserve_quote_contract_record();
create trigger manual_deposit_request_immutable before update on private.manual_deposit_requests
 for each row execute function private.preserve_quote_contract_record();

-- O histórico financeiro conserva valor/autoria. Estorno integral continua
-- representado por status=refunded; replay nunca restaura confirmed.
create function private.preserve_manual_payment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.manual_deposit_receipts r where r.payment_id=old.id) then
  if tg_op='DELETE' then raise exception 'Pagamento registrado não pode ser removido'; end if;
  if (new.id,new.order_id,new.kind,new.method,new.amount_cents,new.confirmed_by,new.confirmed_at,new.provider_ref,new.created_at)
   is distinct from (old.id,old.order_id,old.kind,old.method,old.amount_cents,old.confirmed_by,old.confirmed_at,old.provider_ref,old.created_at)
   or new.status not in ('confirmed','refunded') or (old.status='refunded' and new.status<>'refunded')
   then raise exception 'Confirmação financeira imutável'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
revoke all on function private.preserve_manual_payment() from public,anon,authenticated,service_role;
create trigger manual_payment_immutable before update or delete on public.payments
 for each row execute function private.preserve_manual_payment();

-- Verifica a prova de aceite, sem exigir configurações/validade posteriores.
create function private.accepted_order_deposit(target_order uuid)
returns table(quote_id uuid,context_hash text,required_cents bigint,total_cents bigint,has_contract boolean)
language sql stable security definer set search_path='' as $$
 select q.id,ctx.context_hash,r.deposit_cents,o.total_cents,(c.has_contract or r.has_contract)
 from public.orders o join public.clients c on c.id=o.client_id
 join public.quotes q on q.order_id=o.id
 join private.quote_acceptances r on r.quote_id=q.id
 join private.quote_contract_contexts ctx on ctx.quote_id=q.id
 where o.id=target_order and not q.is_simulation
 and q.accepted_at=r.accepted_at and q.accepted_by=r.actor_id and r.actor_id=c.owner_id
 and 1=(select count(*) from public.quotes other join private.quote_acceptances ar on ar.quote_id=other.id where other.order_id=o.id and not other.is_simulation)
 and r.context_hash=ctx.context_hash and q.items=ctx.proposal->'items'
 and q.total_cents=o.total_cents and o.total_cents=(ctx.proposal->>'totalCents')::bigint
 and o.deposit_cents=r.deposit_cents and r.deposit_cents=(ctx.proposal->>'depositCents')::bigint
 and q.price_table_id::text=ctx.proposal->>'priceTableId' and o.price_table_id=q.price_table_id
 and ctx.proposal->>'orderId'=o.id::text and ctx.proposal->>'processId'=o.process_id::text
 and o.delivery_date=(ctx.proposal->>'deliveryDate')::date
 and o.internal_due_date=(ctx.proposal->>'internalDueDate')::date
$$;
revoke all on function private.accepted_order_deposit(uuid) from public,anon,authenticated,service_role;

create function private.manual_deposit_result(receipt private.manual_deposit_receipts) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',receipt.id,'orderId',receipt.order_id,'quoteId',receipt.quote_id,
 'paymentId',receipt.payment_id,'contextHash',receipt.context_hash,'confirmedBy',receipt.actor_id,
 'confirmedAt',receipt.confirmed_at,'amountCents',receipt.amount_cents,'creditedBeforeCents',receipt.credited_before_cents,
 'requiredCents',receipt.required_cents,'status',receipt.order_status)
$$;
revoke all on function private.manual_deposit_result(private.manual_deposit_receipts) from public,anon,authenticated,service_role;

-- Chamado somente por casos de uso que já trancaram cliente/pedido/pagamentos.
create function private.queue_after_deposit_or_contract(target_order uuid,actor uuid) returns text
language plpgsql security definer set search_path='' as $$
declare job public.orders%rowtype; accepted record; paid numeric; document_id uuid;
begin
 select * into job from public.orders where id=target_order;
 if job.id is null or job.status not in ('awaiting_payment','awaiting_documents') then return job.status; end if;
 select * into accepted from private.accepted_order_deposit(job.id);
 if not found then return job.status; end if;
 select coalesce(sum(p.amount_cents),0) into paid from public.payments p where p.order_id=job.id and p.kind='deposit' and p.status='confirmed';
 if not accepted.has_contract and (accepted.required_cents<=0 or paid<accepted.required_cents) then return job.status; end if;
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

create function public.confirm_manual_deposit(target_quote uuid,expected_context text,expected_remaining_cents bigint,request_id uuid,confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); customer public.clients%rowtype; job public.orders%rowtype; accepted record;
 intent private.manual_deposit_requests%rowtype; receipt private.manual_deposit_receipts%rowtype;
 paid numeric; remaining bigint; payment_id uuid; at_time timestamptz; next_status text;
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
 return private.manual_deposit_result(receipt);
end;
$$;
revoke all on function public.confirm_manual_deposit(uuid,text,bigint,uuid,boolean) from public,anon,service_role;
grant execute on function public.confirm_manual_deposit(uuid,text,bigint,uuid,boolean) to authenticated;

create function public.get_process_deposit_instructions(target_process uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); calc boolean; job record; paid numeric; receipt private.manual_deposit_receipts%rowtype;
 payment_status text; actor_name text; pix text; result jsonb:='[]'::jsonb;
begin
 select role='calculator' into calc from public.profiles where id=actor and role in ('client','calculator');
 if actor is null or calc is null or not private.can_read_process(target_process) then raise exception 'Acesso não autorizado'; end if;
 select pix_key into pix from public.settings where singleton;
 for job in select o.*,a.quote_id,a.context_hash,a.required_cents,a.has_contract from public.orders o
  cross join lateral private.accepted_order_deposit(o.id) a where o.process_id=target_process order by o.id loop
  select coalesce(sum(p.amount_cents),0) into paid from public.payments p where p.order_id=job.id and p.kind='deposit' and p.status='confirmed';
  receipt:=null; payment_status:=null; actor_name:=null;
  select * into receipt from private.manual_deposit_receipts r where r.order_id=job.id and r.quote_id=job.quote_id order by r.confirmed_at desc,r.id desc limit 1;
  if receipt.id is not null then
   select full_name into actor_name from public.profiles where id=receipt.actor_id;
   select status into payment_status from public.payments where id=receipt.payment_id;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('orderId',job.id,'quoteId',job.quote_id,'processId',job.process_id,'code',job.code,'status',job.status,
   'contextHash',job.context_hash,'requiredCents',job.required_cents,'confirmedCents',paid,'remainingCents',greatest(job.required_cents-paid,0),
   'hasContract',job.has_contract,'pixKey',case when not job.has_contract and job.required_cents>paid and job.status in ('awaiting_payment','awaiting_documents') then nullif(btrim(pix),'') else null end,
   'canConfirm',calc and not job.has_contract and job.required_cents>0 and job.status in ('awaiting_payment','awaiting_documents') and (paid<job.required_cents or receipt.id is null),
   'receipt',case when receipt.id is null then null else private.manual_deposit_result(receipt) end,'confirmedName',actor_name,'paymentStatus',payment_status));
 end loop;
 return result;
end;
$$;
revoke all on function public.get_process_deposit_instructions(uuid) from public,anon,service_role;
grant execute on function public.get_process_deposit_instructions(uuid) to authenticated;

-- Documento posterior ao recebimento usa a mesma guarda contratual/financeira.
create or replace function public.complete_file_system(target_file uuid,actor uuid,observed_hash text,observed_size bigint)
returns void language plpgsql security definer set search_path='' as $$
declare initial public.files%rowtype; f public.files%rowtype; customer public.clients%rowtype; job public.orders%rowtype;
begin
 if actor is null or target_file is null then raise exception 'Acesso não autorizado'; end if;
 perform id from public.profiles where id=actor and role in ('client','calculator') for share;
 if not found then raise exception 'Acesso não autorizado'; end if;
 select * into initial from public.files where id=target_file;
 if initial.id is null or initial.uploaded_by is distinct from actor then raise exception 'Acesso não autorizado'; end if;
 select c.* into customer from public.clients c join public.processes p on p.client_id=c.id where p.id=initial.process_id for update of c;
 if customer.id is null or (customer.owner_id is distinct from actor and not exists(select 1 from public.profiles where id=actor and role='calculator')) then raise exception 'Acesso não autorizado'; end if;
 perform o.id from public.orders o where o.process_id=initial.process_id and o.client_id=customer.id and o.status in ('awaiting_payment','awaiting_documents')
  and (initial.order_id is null or o.id=initial.order_id) order by o.id for update;
 for job in select o.* from public.orders o where o.process_id=initial.process_id and o.client_id=customer.id
  and o.status in ('awaiting_payment','awaiting_documents') and (initial.order_id is null or o.id=initial.order_id) order by o.id loop
  perform p.id from public.payments p where p.order_id=job.id order by p.id for update;
 end loop;
 select * into f from public.files where id=target_file for update;
 if f.id is null or (f.process_id,f.order_id,f.uploaded_by,f.expected_sha256,f.size_bytes,f.path) is distinct from (initial.process_id,initial.order_id,actor,initial.expected_sha256,initial.size_bytes,initial.path)
 or not exists(select 1 from public.processes p where p.id=f.process_id and p.client_id=customer.id) then raise exception 'Arquivo atualizado em outra sessão'; end if;
 if observed_hash is null or observed_hash !~ '^[0-9a-f]{64}$' or observed_size is null or observed_size<=0 or f.expected_sha256 is null
 or f.expected_sha256 is distinct from observed_hash or f.size_bytes is distinct from observed_size then raise exception 'Integridade não conferida'; end if;
 if f.upload_status='uploaded' and f.sha256=observed_hash then return; end if;
 if f.upload_status is distinct from 'pending' then raise exception 'Integridade não conferida'; end if;
 update public.files set upload_status='uploaded',sha256=observed_hash where id=f.id;
 perform private.record_event(f.process_id,'file_uploaded',jsonb_build_object('file_id',f.id),actor,f.order_id);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'upload_verified','file',f.id);
 if f.folder in ('case','client') then
  for job in select o.* from public.orders o where o.process_id=f.process_id and o.client_id=customer.id
   and o.status in ('awaiting_payment','awaiting_documents') and (f.order_id is null or o.id=f.order_id) order by o.id loop
   perform private.queue_after_deposit_or_contract(job.id,actor);
  end loop;
 end if;
end;
$$;
