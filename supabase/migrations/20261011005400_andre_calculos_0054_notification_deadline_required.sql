-- Deadline reservado exige prazo explícito; NULL de ambos os lados não valida.
create or replace function public.validate_notification_local_claim(request_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.notification_dispatch_requests%rowtype; n public.notifications%rowtype; job public.orders%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Acesso não autorizado'; end if;
 if request_id is null then raise exception 'Reserva inválida'; end if;
 select * into r from private.notification_dispatch_requests x where x.request_id=validate_notification_local_claim.request_id;
 if r.request_id is null or r.disposition<>'reserved' then return false; end if;
 if r.snapshot->>'template' in ('deadline_two_days','deadline_one_day','deadline_overdue') then
  if r.snapshot->'data'->>'internal_due_date' is null or r.snapshot->'data'->>'internal_due_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
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
