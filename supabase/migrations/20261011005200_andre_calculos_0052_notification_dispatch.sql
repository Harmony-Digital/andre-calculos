-- Núcleo preparado e ensaiado somente no banco local. Não ativa um transporte.
-- A fila permanece public.notifications; pending conserva o cancelamento 0030.
alter table public.notifications add constraint notifications_attempt_limit check(attempts<=5);

create table private.notification_dispatch_requests (
 request_id uuid primary key,
 channel text not null check(channel in ('email','whatsapp')),
 requested_notification uuid,
 disposition text not null check(disposition in ('reserved','empty','held')),
 notification_id uuid references public.notifications(id),
 attempt integer check(attempt between 1 and 5),
 expires_at timestamptz,
 snapshot jsonb,
 created_at timestamptz not null default clock_timestamp(),
 unique(notification_id,attempt),
 check((disposition='reserved' and notification_id is not null and attempt is not null and expires_at is not null and snapshot is not null)
  or (disposition='empty' and notification_id is null and attempt is null and expires_at is null and snapshot is null)
  or (disposition='held' and notification_id is not null and attempt is null and expires_at is null and snapshot is null))
);
create table private.notification_dispatch_receipts (
 request_id uuid primary key references private.notification_dispatch_requests(request_id),
 outcome text not null check(outcome in ('accepted','retryable','rejected','unknown')),
 execution_mode text not null default 'simulation' check(execution_mode='simulation'),
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table private.notification_dispatch_requests enable row level security;
alter table private.notification_dispatch_receipts enable row level security;
revoke all on private.notification_dispatch_requests,private.notification_dispatch_receipts from public,anon,authenticated,service_role;

create function private.preserve_notification_dispatch_record() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Registro da tentativa não pode ser alterado'; end;
$$;
revoke all on function private.preserve_notification_dispatch_record() from public,anon,authenticated,service_role;
create trigger notification_dispatch_request_immutable before update on private.notification_dispatch_requests
 for each row execute function private.preserve_notification_dispatch_record();
create trigger notification_dispatch_receipt_immutable before update on private.notification_dispatch_receipts
 for each row execute function private.preserve_notification_dispatch_record();

create function private.notification_dispatch_reservation(r private.notification_dispatch_requests) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('status',r.disposition,'requestId',r.request_id,'mode','simulation') ||
 case when r.disposition='reserved' then jsonb_build_object('notificationId',r.notification_id,'attempt',r.attempt,
 'expiresAt',r.expires_at,'message',r.snapshot)
 when r.disposition='held' then jsonb_build_object('notificationId',r.notification_id)
 else '{}'::jsonb end
$$;
revoke all on function private.notification_dispatch_reservation(private.notification_dispatch_requests) from public,anon,authenticated,service_role;

-- Uma tentativa sem resposta é indeterminada, não comprovadamente repetível.
-- O chamador já detém o lock da notificação. Nenhum lock de pedido é tomado aqui.
create function private.expire_notification_dispatch(r private.notification_dispatch_requests,n public.notifications) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb;
begin
 if n.status='pending' and n.attempts=r.attempt then
  update public.notifications set status='failed',last_error='dispatch_outcome_unknown' where id=n.id;
 end if;
 result:=jsonb_build_object('status',case when n.status='cancelled' then 'cancelled' else 'held' end,
  'requestId',r.request_id,'notificationId',n.id,'attempt',r.attempt,'mode','simulation',
  'code',case when n.status='cancelled' then 'notification_cancelled' else 'dispatch_outcome_unknown' end);
 insert into private.notification_dispatch_receipts(request_id,outcome,result) values(r.request_id,'unknown',result);
 return result;
end;
$$;
revoke all on function private.expire_notification_dispatch(private.notification_dispatch_requests,public.notifications) from public,anon,authenticated,service_role;

create function public.claim_notification_local_system(request_id uuid,channel text,target_notification uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.notification_dispatch_requests%rowtype; active private.notification_dispatch_requests%rowtype;
 n public.notifications%rowtype; frozen jsonb; captured_at timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Acesso não autorizado'; end if;
 if request_id is null or channel is null or channel not in ('email','whatsapp') then raise exception 'Reserva inválida'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('notification-claim:'||request_id::text,0));
 select * into r from private.notification_dispatch_requests x where x.request_id=claim_notification_local_system.request_id;
 if r.request_id is not null then
  if (r.channel,r.requested_notification) is distinct from (channel,target_notification) then
   raise sqlstate 'PT409' using message='Requisição já registrada com outros dados';
  end if;
  return private.notification_dispatch_reservation(r);
 end if;
 captured_at:=clock_timestamp();
 select x.* into n from public.notifications x where x.status='pending' and x.channel=claim_notification_local_system.channel
  and x.send_after<=captured_at and (target_notification is null or x.id=target_notification)
  and not exists(select 1 from private.notification_dispatch_requests a where a.notification_id=x.id and a.disposition='reserved'
   and a.expires_at>captured_at and not exists(select 1 from private.notification_dispatch_receipts z where z.request_id=a.request_id))
  order by x.send_after,x.id for update of x skip locked limit 1;
 if n.id is null then
  insert into private.notification_dispatch_requests(request_id,channel,requested_notification,disposition)
   values(request_id,channel,target_notification,'empty') returning * into r;
  return private.notification_dispatch_reservation(r);
 end if;
 select a.* into active from private.notification_dispatch_requests a where a.notification_id=n.id and a.disposition='reserved'
  and not exists(select 1 from private.notification_dispatch_receipts z where z.request_id=a.request_id)
  order by a.attempt desc limit 1;
 if active.request_id is not null then
  perform private.expire_notification_dispatch(active,n);
 elsif n.attempts>=5 then
  update public.notifications set status='failed',last_error='attempts_exhausted' where id=n.id;
 else
  select a.snapshot into frozen from private.notification_dispatch_requests a where a.notification_id=n.id and a.disposition='reserved'
   order by a.attempt limit 1;
  if frozen is null then
   frozen:=jsonb_build_object('id',n.id,'channel',n.channel,'recipient',n.recipient,'template',n.template,'data',n.data,
    'schemaVersion',1,'idempotencyKey','notification:'||n.id::text);
   frozen:=frozen||jsonb_build_object('snapshotHash',encode(sha256(convert_to(frozen::text,'UTF8')),'hex'));
  end if;
  update public.notifications set attempts=attempts+1,last_error=null where id=n.id returning * into n;
  insert into private.notification_dispatch_requests(request_id,channel,requested_notification,disposition,notification_id,attempt,expires_at,snapshot)
   values(request_id,channel,target_notification,'reserved',n.id,n.attempts,clock_timestamp()+interval '2 minutes',frozen) returning * into r;
  return private.notification_dispatch_reservation(r);
 end if;
 insert into private.notification_dispatch_requests(request_id,channel,requested_notification,disposition,notification_id)
  values(request_id,channel,target_notification,'held',n.id) returning * into r;
 return private.notification_dispatch_reservation(r);
end;
$$;
revoke all on function public.claim_notification_local_system(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_notification_local_system(uuid,text,uuid) to service_role;

-- Confirmação imediatamente antes do transporte futuro, sem enviar nada.
-- Deadline usa a ordem de locks do produtor/trigger: pedido antes de aviso.
create function public.validate_notification_local_claim(request_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.notification_dispatch_requests%rowtype; n public.notifications%rowtype; candidate public.notifications%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Acesso não autorizado'; end if;
 if request_id is null then raise exception 'Reserva inválida'; end if;
 select * into r from private.notification_dispatch_requests x where x.request_id=validate_notification_local_claim.request_id;
 if r.request_id is null or r.disposition<>'reserved' then return false; end if;
 select * into candidate from public.notifications where id=r.notification_id;
 if candidate.template in ('deadline_two_days','deadline_one_day','deadline_overdue') then
  if candidate.data->>'order_id' is null or candidate.data->>'order_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  perform id from public.orders where id=(candidate.data->>'order_id')::uuid for update;
  if not found then return false; end if;
 end if;
 select * into n from public.notifications where id=r.notification_id for update;
 if n.id is null or n.attempts<>r.attempt
  or exists(select 1 from private.notification_dispatch_receipts where notification_dispatch_receipts.request_id=r.request_id) then return false; end if;
 if n.status='cancelled' then
  perform private.expire_notification_dispatch(r,n);
  return false;
 end if;
 if n.status<>'pending' then return false; end if;
 if clock_timestamp()>=r.expires_at then
  perform private.expire_notification_dispatch(r,n);
  return false;
 end if;
 return true;
end;
$$;
revoke all on function public.validate_notification_local_claim(uuid) from public,anon,authenticated;
grant execute on function public.validate_notification_local_claim(uuid) to service_role;

create function public.complete_notification_local_system(request_id uuid,outcome text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.notification_dispatch_requests%rowtype; n public.notifications%rowtype;
 receipt private.notification_dispatch_receipts%rowtype; result jsonb; captured_at timestamptz; next_at timestamptz; code text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Acesso não autorizado'; end if;
 if request_id is null or outcome is null or outcome not in ('accepted','retryable','rejected','unknown') then raise exception 'Resultado inválido'; end if;
 select * into r from private.notification_dispatch_requests x where x.request_id=complete_notification_local_system.request_id;
 if r.request_id is null or r.disposition<>'reserved' then raise exception 'Reserva indisponível'; end if;
 select * into n from public.notifications where id=r.notification_id for update;
 select * into receipt from private.notification_dispatch_receipts x where x.request_id=r.request_id;
 if receipt.request_id is not null then
  if receipt.outcome<>outcome then raise sqlstate 'PT409' using message='Resultado já registrado com outros dados'; end if;
  return receipt.result;
 end if;
 if n.id is null or n.attempts<>r.attempt then raise sqlstate 'PT409' using message='Reserva desatualizada'; end if;
 captured_at:=clock_timestamp();
 if n.status='cancelled' then
  result:=jsonb_build_object('status','cancelled','requestId',r.request_id,'notificationId',n.id,'attempt',r.attempt,'mode','simulation','code','notification_cancelled');
 elsif n.status<>'pending' then
  raise sqlstate 'PT409' using message='Aviso indisponível';
 elsif captured_at>=r.expires_at then
  return private.expire_notification_dispatch(r,n);
 else
  code:=case outcome when 'accepted' then null when 'retryable' then case when n.attempts=5 then 'attempts_exhausted' else 'retryable_failure' end
   when 'rejected' then 'permanent_failure' else 'dispatch_outcome_unknown' end;
  if outcome='retryable' and n.attempts<5 then
   next_at:=captured_at+pg_catalog.make_interval(secs=>case n.attempts when 1 then 60 when 2 then 300 when 3 then 900 else 3600 end);
  end if;
  update public.notifications set status=case when outcome='accepted' then 'sent' when next_at is not null then 'pending' else 'failed' end,
   sent_at=case when outcome='accepted' then captured_at else null end,last_error=code,send_after=coalesce(next_at,send_after)
   where id=n.id returning * into n;
  result:=jsonb_build_object('status',case when n.status='failed' and outcome='unknown' then 'held' else n.status end,
   'requestId',r.request_id,'notificationId',n.id,'attempt',r.attempt,'mode','simulation','code',code,'nextAt',next_at);
 end if;
 insert into private.notification_dispatch_receipts(request_id,outcome,result) values(r.request_id,outcome,result);
 return result;
end;
$$;
revoke all on function public.complete_notification_local_system(uuid,text) from public,anon,authenticated;
grant execute on function public.complete_notification_local_system(uuid,text) to service_role;

-- O sistema usa RPC para avançar tentativas/estado. Os produtores transacionais
-- são SECURITY DEFINER; esta retirada não modifica seus INSERT/cancelamentos.
revoke update on public.notifications from service_role;
