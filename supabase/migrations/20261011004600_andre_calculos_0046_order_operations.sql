-- Etapas operacionais reais, sem alterações comerciais ou de prazo.
alter table public.orders add column status_revision integer not null default 0 check(status_revision>=0);
alter table public.orders add column resume_status text;
alter table public.orders add constraint orders_resume_status check(resume_status is null or
 (status='awaiting_client' and resume_status in ('in_analysis','in_calculation','in_review')));

-- Todas as mudanças de status incrementam a revisão, inclusive outras RPCs.
-- Legados aguardando cliente sem origem continuam legíveis, mas não retomam.
create function private.revise_order_status() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.status,new.resume_status) is distinct from (old.status,old.resume_status) then
  if old.status_revision=2147483647 then raise exception 'Limite de revisão atingido'; end if;
  new.status_revision:=old.status_revision+1;
 elsif new.status_revision is distinct from old.status_revision then
  raise exception 'Revisão de situação é controlada pelo servidor';
 end if;
 return new;
end;
$$;
revoke all on function private.revise_order_status() from public,anon,authenticated,service_role;
create trigger orders_revise_status before update on public.orders for each row execute function private.revise_order_status();

create table private.order_operation_receipts (
 id uuid primary key,order_id uuid not null,process_id uuid not null,
 actor_id uuid not null references public.profiles(id),payload jsonb not null check(jsonb_typeof(payload)='object'),
 from_status text not null,to_status text not null,resume_status text,
 applied_revision integer not null check(applied_revision>0),created_at timestamptz not null default clock_timestamp(),
 foreign key(order_id,process_id) references public.orders(id,process_id) on delete cascade
);
create index order_operation_receipts_order_idx on private.order_operation_receipts(order_id);
create index order_operation_receipts_process_idx on private.order_operation_receipts(process_id);
create index order_operation_receipts_actor_idx on private.order_operation_receipts(actor_id);
alter table private.order_operation_receipts enable row level security;
revoke all on private.order_operation_receipts from public,anon,authenticated,service_role;
create trigger order_operation_receipts_immutable before update on private.order_operation_receipts
 for each row execute function private.preserve_quote_contract_record();

create function private.order_operation_result(receipt private.order_operation_receipts) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',receipt.id,'orderId',receipt.order_id,'processId',receipt.process_id,
  'from',receipt.from_status,'to',receipt.to_status,'resumeStatus',receipt.resume_status,
  'revision',receipt.applied_revision,'createdAt',receipt.created_at)
$$;
revoke all on function private.order_operation_result(private.order_operation_receipts) from public,anon,authenticated,service_role;

create function public.operate_order(target_process uuid,target_order uuid,request_id uuid,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); initial_client uuid; initial_owner uuid; customer public.clients%rowtype;
 job public.orders%rowtype; receipt private.order_operation_receipts%rowtype;
 operation text; expected text; revision integer; reason text; canonical jsonb; next_status text; next_resume text;
begin
 if actor is null or target_process is null or target_order is null or request_id is null then raise exception 'Acesso não autorizado'; end if;
 if payload is null or jsonb_typeof(payload) is distinct from 'object' or
  payload-array['event','expectedState','expectedRevision','reason']<>'{}'::jsonb or
  (select count(*) from jsonb_object_keys(payload))<>4 then raise exception 'Operação inválida'; end if;
 if jsonb_typeof(payload->'event') is distinct from 'string' or jsonb_typeof(payload->'expectedState') is distinct from 'string' or
  jsonb_typeof(payload->'expectedRevision') is distinct from 'number' or (payload->>'expectedRevision') !~ '^(0|[1-9][0-9]{0,9})$' or
  jsonb_typeof(payload->'reason') is distinct from 'string' then raise exception 'Operação inválida'; end if;
 operation:=payload->>'event'; expected:=payload->>'expectedState';
 if (payload->>'expectedRevision')::numeric>2147483646 then raise exception 'Revisão inválida'; end if;
 revision:=(payload->>'expectedRevision')::integer;
 reason:=private.trim_client_contract_reason(payload->>'reason');
 if operation not in ('start_analysis','start_calculation','submit_review','return_calculation','request_information','receive_information') or
  expected not in ('queued','in_analysis','in_calculation','in_review','in_adjustment','awaiting_client') or
  length(reason)>1000 or (operation in ('request_information','return_calculation') and length(reason)<3) then raise exception 'Confira a etapa e o motivo'; end if;
 canonical:=jsonb_build_object('event',operation,'expectedState',expected,'expectedRevision',revision,'reason',reason);
 select o.client_id,c.owner_id into initial_client,initial_owner from public.orders o join public.clients c on c.id=o.client_id
  where o.id=target_order and o.process_id=target_process;
 perform p.id from public.profiles p where p.id in (actor,initial_owner) order by p.id for share;
 if not exists(select 1 from public.profiles where id=actor and role='calculator') or
  not exists(select 1 from public.profiles where id=initial_owner and role='client') then raise exception 'Acesso não autorizado'; end if;
 select * into customer from public.clients where id=initial_client for update;
 if customer.id is null or customer.owner_id is distinct from initial_owner then raise exception 'Pedido indisponível'; end if;
 select * into job from public.orders where id=target_order and process_id=target_process and client_id=customer.id for update;
 if job.id is null then raise exception 'Pedido indisponível'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('order-operation:'||request_id::text,0));
 select * into receipt from private.order_operation_receipts r where r.id=request_id;
 if receipt.id is not null then
  if (receipt.order_id,receipt.process_id,receipt.actor_id,receipt.payload) is distinct from
   (target_order,target_process,actor,canonical) then raise sqlstate 'PT409' using message='Tentativa já registrada com outros dados'; end if;
  return private.order_operation_result(receipt);
 end if;
 if job.status is distinct from expected or job.status_revision<>revision then raise sqlstate 'PT409' using message='Pedido atualizado em outra sessão'; end if;
 next_status:=case
  when operation='start_analysis' and job.status='queued' then 'in_analysis'
  when operation='start_calculation' and job.status='in_analysis' then 'in_calculation'
  when operation='submit_review' and job.status in ('in_calculation','in_adjustment') then 'in_review'
  when operation='return_calculation' and job.status='in_review' then 'in_calculation'
  when operation='request_information' and job.status in ('in_analysis','in_calculation','in_review') then 'awaiting_client'
  when operation='receive_information' and job.status='awaiting_client' and job.resume_status in ('in_analysis','in_calculation','in_review') then job.resume_status
  else null end;
 if next_status is null then raise sqlstate 'PT409' using message='Ação indisponível nesta etapa'; end if;
 next_resume:=case when operation='request_information' then job.status else null end;
 update public.orders set status=next_status,resume_status=next_resume where id=job.id;
 insert into private.order_operation_receipts(id,order_id,process_id,actor_id,payload,from_status,to_status,resume_status,applied_revision)
  values(request_id,job.id,job.process_id,actor,canonical,job.status,next_status,next_resume,job.status_revision+1) returning * into receipt;
 perform private.record_event(job.process_id,'status_changed',jsonb_build_object('from',job.status,'to',next_status,'code',job.code,'operation',operation,'note',nullif(reason,'')),actor,job.id,request_id);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'order_'||operation,'order_operation',request_id);
 return private.order_operation_result(receipt);
end;
$$;
revoke all on function public.operate_order(uuid,uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.operate_order(uuid,uuid,uuid,jsonb) to authenticated;
