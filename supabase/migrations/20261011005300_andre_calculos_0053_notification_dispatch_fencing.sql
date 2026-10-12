-- Correções encontradas na revisão independente da 0052 já aplicada localmente.
-- Separar o resultado solicitado do efetivo preserva replay na expiração.
alter table private.notification_dispatch_receipts
 add column requested_outcome text check(requested_outcome in ('accepted','retryable','rejected','unknown')),
 add column automatic boolean not null default false;

-- Snapshot/conteúdo não muda entre tentativas. Cancelamento e estado continuam
-- disponíveis aos produtores transacionais sem tomar locks adicionais.
create function private.preserve_reserved_notification_content() returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from private.notification_dispatch_requests where notification_id=old.id and disposition='reserved') then
  raise exception 'Conteúdo reservado não pode ser alterado';
 end if;
 return new;
end;
$$;
revoke all on function private.preserve_reserved_notification_content() from public,anon,authenticated,service_role;
create trigger notification_reserved_content_immutable before update of channel,recipient,template,data,dedup_key on public.notifications
 for each row when((old.channel,old.recipient,old.template,old.data,old.dedup_key) is distinct from
 (new.channel,new.recipient,new.template,new.data,new.dedup_key)) execute function private.preserve_reserved_notification_content();

drop function private.expire_notification_dispatch(private.notification_dispatch_requests,public.notifications);


create function private.expire_notification_dispatch(r private.notification_dispatch_requests,n public.notifications,requested_outcome text default null) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb;
begin
 if n.status='pending' and n.attempts=r.attempt then
  update public.notifications set status='failed',last_error='dispatch_outcome_unknown' where id=n.id;
 end if;
 result:=jsonb_build_object('status',case when n.status='cancelled' then 'cancelled' else 'held' end,
  'requestId',r.request_id,'notificationId',n.id,'attempt',r.attempt,'mode','simulation',
  'code',case when n.status='cancelled' then 'notification_cancelled' else 'dispatch_outcome_unknown' end);
 insert into private.notification_dispatch_receipts(request_id,outcome,requested_outcome,automatic,result)
  values(r.request_id,'unknown',requested_outcome,requested_outcome is null,result);
 return result;
end;
$$;

revoke all on function private.expire_notification_dispatch(private.notification_dispatch_requests,public.notifications,text) from public,anon,authenticated,service_role;

create or replace function public.claim_notification_local_system(request_id uuid,channel text,target_notification uuid default null)
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
  -- Revalidação sob lock: a seleção anterior pode ter visto outra versão.
  if active.expires_at>clock_timestamp() then
   insert into private.notification_dispatch_requests(request_id,channel,requested_notification,disposition)
    values(request_id,channel,target_notification,'empty') returning * into r;
   return private.notification_dispatch_reservation(r);
  end if;
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

create or replace function public.validate_notification_local_claim(request_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.notification_dispatch_requests%rowtype; n public.notifications%rowtype; job public.orders%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Acesso não autorizado'; end if;
 if request_id is null then raise exception 'Reserva inválida'; end if;
 select * into r from private.notification_dispatch_requests x where x.request_id=validate_notification_local_claim.request_id;
 if r.request_id is null or r.disposition<>'reserved' then return false; end if;
 if r.snapshot->>'template' in ('deadline_two_days','deadline_one_day','deadline_overdue') then
  if r.snapshot->'data'->>'order_id' is null or r.snapshot->'data'->>'order_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  select * into job from public.orders where id=(r.snapshot->'data'->>'order_id')::uuid for update;
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
 if (n.channel,n.recipient,n.template,n.data) is distinct from
  (r.snapshot->>'channel',r.snapshot->>'recipient',r.snapshot->>'template',r.snapshot->'data') then return false; end if;
 if job.id is not null and (job.status not in ('queued','in_analysis','awaiting_client','in_calculation','in_review','in_adjustment')
  or job.internal_due_date::text is distinct from r.snapshot->'data'->>'internal_due_date') then return false; end if;
 if clock_timestamp()>=r.expires_at then
  perform private.expire_notification_dispatch(r,n);
  return false;
 end if;
 return true;
end;
$$;

create or replace function public.complete_notification_local_system(request_id uuid,outcome text)
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
  if not receipt.automatic and coalesce(receipt.requested_outcome,receipt.outcome)<>outcome then raise sqlstate 'PT409' using message='Resultado já registrado com outros dados'; end if;
  return receipt.result;
 end if;
 if n.id is null or n.attempts<>r.attempt then raise sqlstate 'PT409' using message='Reserva desatualizada'; end if;
 captured_at:=clock_timestamp();
 if n.status='cancelled' then
  result:=jsonb_build_object('status','cancelled','requestId',r.request_id,'notificationId',n.id,'attempt',r.attempt,'mode','simulation','code','notification_cancelled');
 elsif n.status<>'pending' then
  raise sqlstate 'PT409' using message='Aviso indisponível';
 elsif captured_at>=r.expires_at then
  return private.expire_notification_dispatch(r,n,outcome);
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
 insert into private.notification_dispatch_receipts(request_id,outcome,requested_outcome,result) values(r.request_id,outcome,outcome,result);
 return result;
end;
$$;
