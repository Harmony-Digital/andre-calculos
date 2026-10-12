-- Executor somente fictício. Nenhum endpoint, cron ou transporte externo.
create table private.notification_local_runs (
 run_id uuid primary key,
 channel text not null check(channel in ('email','whatsapp')),
 batch_limit integer not null check(batch_limit between 1 and 25),
 target_notifications uuid[],
 request_ids uuid[] not null,
 schema_version integer not null default 1 check(schema_version=1),
 execution_mode text not null default 'simulation' check(execution_mode='simulation'),
 created_at timestamptz not null default clock_timestamp(),
 check(cardinality(request_ids)=coalesce(cardinality(target_notifications),batch_limit)),
 check(target_notifications is null or cardinality(target_notifications) between 1 and batch_limit)
);
create table private.notification_local_calls (
 request_id uuid primary key references private.notification_dispatch_requests(request_id),
 notification_id uuid not null references public.notifications(id),
 snapshot_hash text not null check(snapshot_hash ~ '^[0-9a-f]{64}$'),
 outcome text not null default 'accepted' check(outcome in ('accepted','retryable','rejected','unknown')),
 execution_mode text not null default 'simulation' check(execution_mode='simulation'),
 created_at timestamptz not null default clock_timestamp()
);
create index notification_local_calls_notification on private.notification_local_calls(notification_id);
create table private.notification_local_deliveries (
 notification_id uuid primary key references public.notifications(id),
 idempotency_key text not null unique,
 snapshot_hash text not null check(snapshot_hash ~ '^[0-9a-f]{64}$'),
 execution_mode text not null default 'simulation' check(execution_mode='simulation'),
 accepted_at timestamptz not null default clock_timestamp(),
 check(idempotency_key='notification:'||notification_id::text)
);
alter table private.notification_local_runs enable row level security;
alter table private.notification_local_calls enable row level security;
alter table private.notification_local_deliveries enable row level security;
revoke all on private.notification_local_runs,private.notification_local_calls,private.notification_local_deliveries from public,anon,authenticated,service_role;
create trigger notification_local_run_immutable before update on private.notification_local_runs
 for each row execute function private.preserve_notification_dispatch_record();
create trigger notification_local_call_immutable before update on private.notification_local_calls
 for each row execute function private.preserve_notification_dispatch_record();
create trigger notification_local_delivery_immutable before update on private.notification_local_deliveries
 for each row execute function private.preserve_notification_dispatch_record();

create function public.begin_notification_local_run(run_id uuid,channel text,batch_limit integer,target_notifications uuid[] default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.notification_local_runs%rowtype; slots uuid[]; amount integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Acesso não autorizado'; end if;
 if run_id is null or channel is null or channel not in ('email','whatsapp') or batch_limit is null or batch_limit not between 1 and 25 then
  raise exception 'Execução inválida';
 end if;
 if target_notifications is not null and (cardinality(target_notifications) not between 1 and batch_limit
  or array_ndims(target_notifications)<>1 or array_lower(target_notifications,1)<>1
  or exists(select 1 from unnest(target_notifications) x where x is null)
  or (select count(distinct x) from unnest(target_notifications) x)<>cardinality(target_notifications)) then
  raise exception 'Alvos inválidos';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('notification-run:'||run_id::text,0));
 select * into r from private.notification_local_runs x where x.run_id=begin_notification_local_run.run_id;
 if r.run_id is not null then
  if (r.channel,r.batch_limit,r.target_notifications) is distinct from (channel,batch_limit,target_notifications) then
   raise sqlstate 'PT409' using message='Execução já registrada com outros dados';
  end if;
 else
  amount:=coalesce(cardinality(target_notifications),batch_limit);
  select array_agg(pg_catalog.gen_random_uuid() order by i) into slots from generate_series(1,amount) i;
  insert into private.notification_local_runs(run_id,channel,batch_limit,target_notifications,request_ids)
   values(run_id,channel,batch_limit,target_notifications,slots) returning * into r;
 end if;
 return jsonb_build_object('runId',r.run_id,'channel',r.channel,'limit',r.batch_limit,'targets',r.target_notifications,
  'requestIds',r.request_ids,'schemaVersion',r.schema_version,'mode',r.execution_mode);
end;
$$;
revoke all on function public.begin_notification_local_run(uuid,text,integer,uuid[]) from public,anon,authenticated;
grant execute on function public.begin_notification_local_run(uuid,text,integer,uuid[]) to service_role;

-- Consulta não fabrica resultado nem muda estado; retorna só metadados fixos.
create function public.get_notification_local_receipt(request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Acesso não autorizado'; end if;
 if request_id is null then raise exception 'Reserva inválida'; end if;
 select x.result into result from private.notification_dispatch_receipts x where x.request_id=get_notification_local_receipt.request_id;
 return result;
end;
$$;
revoke all on function public.get_notification_local_receipt(uuid) from public,anon,authenticated;
grant execute on function public.get_notification_local_receipt(uuid) to service_role;

create function public.get_notification_local_transport_result(request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.notification_local_calls%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Acesso não autorizado'; end if;
 if request_id is null then raise exception 'Reserva inválida'; end if;
 select * into c from private.notification_local_calls x where x.request_id=get_notification_local_transport_result.request_id;
 if c.request_id is null then return null; end if;
 return jsonb_build_object('status','result','requestId',c.request_id,'notificationId',c.notification_id,
  'outcome',c.outcome,'mode',c.execution_mode);
end;
$$;
revoke all on function public.get_notification_local_transport_result(uuid) from public,anon,authenticated;
grant execute on function public.get_notification_local_transport_result(uuid) to service_role;

create function public.simulate_notification_local_transport(request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.notification_dispatch_requests%rowtype; c private.notification_local_calls%rowtype;
 delivery private.notification_local_deliveries%rowtype; valid boolean;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Acesso não autorizado'; end if;
 if request_id is null then raise exception 'Reserva inválida'; end if;
 select * into r from private.notification_dispatch_requests x where x.request_id=simulate_notification_local_transport.request_id;
 select * into c from private.notification_local_calls x where x.request_id=simulate_notification_local_transport.request_id;
 if c.request_id is null then
  -- validate toma pedido -> notification. O efeito é gravado sob esses locks.
  -- Retorno normal conserva recibos automáticos de cancelamento/expiração.
  valid:=public.validate_notification_local_claim(request_id);
  -- A conclusão concorrente pode tornar validate=false enquanto grava call.
  select * into c from private.notification_local_calls x where x.request_id=simulate_notification_local_transport.request_id;
  if not valid and c.request_id is null then
   return jsonb_build_object('status','blocked','requestId',request_id,'mode','simulation');
  end if;
  if c.request_id is null then
   select * into delivery from private.notification_local_deliveries x where x.notification_id=r.notification_id;
   if delivery.notification_id is not null and delivery.snapshot_hash is distinct from r.snapshot->>'snapshotHash' then
    raise sqlstate 'PT409' using message='Identidade fictícia divergente';
   end if;
   insert into private.notification_local_calls(request_id,notification_id,snapshot_hash)
    values(r.request_id,r.notification_id,r.snapshot->>'snapshotHash') returning * into c;
   if c.outcome='accepted' then
    insert into private.notification_local_deliveries(notification_id,idempotency_key,snapshot_hash)
     values(r.notification_id,r.snapshot->>'idempotencyKey',r.snapshot->>'snapshotHash')
     on conflict(notification_id) do nothing;
   end if;
  end if;
 end if;
 return jsonb_build_object('status','result','requestId',c.request_id,'notificationId',c.notification_id,
  'outcome',c.outcome,'mode',c.execution_mode);
end;
$$;
revoke all on function public.simulate_notification_local_transport(uuid) from public,anon,authenticated;
grant execute on function public.simulate_notification_local_transport(uuid) to service_role;
