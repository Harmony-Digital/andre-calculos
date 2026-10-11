-- Preparação local M2.30. O calendário continua provisório; nenhum cron real é ativado.
alter table public.settings add column deadline_window_start time not null default '07:00';
alter table public.settings add column deadline_window_end time not null default '21:00';
alter table public.settings add constraint settings_deadline_window check(deadline_window_start<deadline_window_end);
alter table public.notifications drop constraint notifications_status_check;
alter table public.notifications add constraint notifications_status_check check(status in ('pending','sent','failed','cancelled'));
alter table public.notifications add column cancelled_at timestamptz;
alter table public.notifications add column cancellation_reason text;
alter table public.notifications add constraint notifications_cancellation check(
 (status='cancelled' and cancelled_at is not null and cancellation_reason in ('deadline_changed','order_ineligible'))
 or (status<>'cancelled' and cancelled_at is null and cancellation_reason is null));
create table private.deadline_reminder_receipts(
 order_id uuid not null references public.orders(id),
 event text not null check(event in ('deadline_two_days','deadline_one_day','deadline_overdue')),
 due_date date not null, reference_date date not null,
 calendar_version text not null, consumed_at timestamptz not null,
 primary key(order_id,event,due_date));
alter table private.deadline_reminder_receipts enable row level security;
revoke all on private.deadline_reminder_receipts from public,anon,authenticated,service_role;

create function private.cancel_pending_deadline_reminders() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.internal_due_date is distinct from new.internal_due_date or new.status not in ('queued','in_analysis','awaiting_client','in_calculation','in_review','in_adjustment') then
  update public.notifications set status='cancelled',cancelled_at=clock_timestamp(),
   cancellation_reason=case when old.internal_due_date is distinct from new.internal_due_date then 'deadline_changed' else 'order_ineligible' end
   where status='pending' and template in ('deadline_two_days','deadline_one_day','deadline_overdue')
    and data->>'order_id'=new.id::text and dedup_key like 'deadline:'||new.id::text||':%';
 end if;
 return new;
end;
$$;
create trigger cancel_obsolete_deadline_reminders after update of internal_due_date,status on public.orders
 for each row when(old.internal_due_date is distinct from new.internal_due_date or old.status is distinct from new.status)
 execute function private.cancel_pending_deadline_reminders();
revoke all on function private.cancel_pending_deadline_reminders() from public,anon,authenticated,service_role;

-- run_at só é injetável pelo proprietário em ensaios locais; a RPC pública passa NULL.
-- O calendário é calculado no servidor. O banco confere dia/janela/prazo/estado sob lock.
create function private.enqueue_deadline_reminder_at(target_order uuid,expected_due date,reminder_event text,reference_date date,one_day date,two_days date,run_at timestamptz)
returns text language plpgsql security definer set search_path='' as $$
declare job public.orders%rowtype; cfg public.settings%rowtype; local_now timestamp; recipient uuid; email_on boolean; whatsapp_on boolean;
begin
 if target_order is null or expected_due is null or reference_date is null or reminder_event is null
  or reminder_event not in ('deadline_two_days','deadline_one_day','deadline_overdue') then raise exception 'Lembrete inválido'; end if;
 select * into job from public.orders where id=target_order for update;
 if not found or job.internal_due_date is distinct from expected_due or job.status not in ('queued','in_analysis','awaiting_client','in_calculation','in_review','in_adjustment') then return 'stale'; end if;
 select * into cfg from public.settings where singleton for share;
 if not found then raise exception 'Configurações indisponíveis'; end if;
 local_now:=coalesce(run_at,clock_timestamp()) at time zone 'America/Sao_Paulo';
 if local_now::date<>reference_date then return 'stale_day'; end if;
 if local_now::time<cfg.deadline_window_start or local_now::time>=cfg.deadline_window_end then return 'outside_window'; end if;
 if (one_day is null)<>(two_days is null) or (one_day is not null and (one_day<=reference_date or two_days<=one_day or two_days>reference_date+93)) then raise exception 'Calendário inválido'; end if;
 if not ((reminder_event='deadline_overdue' and expected_due<reference_date)
  or (reminder_event='deadline_one_day' and one_day is not null and expected_due=one_day)
  or (reminder_event='deadline_two_days' and two_days is not null and expected_due=two_days)) then return 'stale'; end if;
 select r.profile_id into recipient from private.calculator_notification_recipient r join public.profiles p on p.id=r.profile_id and p.role='calculator' where r.singleton;
 if recipient is null then return 'unconfigured'; end if;
 select not exists(select 1 from public.notification_preferences n where n.profile_id=recipient and n.event=reminder_event and n.channel='email' and not n.enabled),
  exists(select 1 from public.notification_preferences n where n.profile_id=recipient and n.event=reminder_event and n.channel='whatsapp' and n.enabled) into email_on,whatsapp_on;
 if (email_on and cfg.contact_email is null) or (whatsapp_on and cfg.contact_phone is null) then return 'unconfigured'; end if;
 insert into private.deadline_reminder_receipts(order_id,event,due_date,reference_date,calendar_version,consumed_at)
  values(target_order,reminder_event,expected_due,reference_date,'br-processual-provisorio-v1',coalesce(run_at,clock_timestamp()))
  on conflict(order_id,event,due_date) do nothing;
 if not found then return 'duplicate'; end if;
 perform private.notify_calculator(reminder_event,jsonb_build_object('order_id',job.id,'code',job.code,'internal_due_date',expected_due,'calendar_version','br-processual-provisorio-v1'),
  'deadline:'||job.id::text||':'||reminder_event||':'||expected_due::text);
 insert into public.audit_log(action,target_type,target_id) values('deadline_reminder_consumed','order',job.id);
 return 'consumed';
end;
$$;
revoke all on function private.enqueue_deadline_reminder_at(uuid,date,text,date,date,date,timestamptz) from public,anon,authenticated,service_role;
create function public.enqueue_deadline_reminder(target_order uuid,expected_due date,reminder_event text,reference_date date,one_day date default null,two_days date default null)
returns text language sql security definer set search_path='' as $$
 select private.enqueue_deadline_reminder_at(target_order,expected_due,reminder_event,reference_date,one_day,two_days,null);
$$;
revoke all on function public.enqueue_deadline_reminder(uuid,date,text,date,date,date) from public,anon,authenticated;
grant execute on function public.enqueue_deadline_reminder(uuid,date,text,date,date,date) to service_role;

create or replace function public.save_service_settings(payload jsonb,expected_revision integer) returns integer language plpgsql security definer set search_path='' as $$
declare cfg public.settings%rowtype; actor uuid:=auth.uid(); field text; n numeric; has_identity boolean;
begin
 if actor is null or not (public.is_calculator() or public.is_admin()) then raise exception 'Acesso não autorizado'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or expected_revision is null or expected_revision<1 or octet_length(payload::text)>20000 then raise exception 'Confira as configurações'; end if;
 foreach field in array array['technicalName','crcNumber','crcState','crcCategory','contactEmail','contactPhone','pixKey','conditions','guarantee','morningTime','eveningTime'] loop
  if jsonb_typeof(payload->field) is distinct from 'string' then raise exception 'Confira as configurações'; end if;
 end loop;
 foreach field in array array['slackDays','quoteValidDays','wageThreshold','pageThreshold','claimantThreshold'] loop
  if jsonb_typeof(payload->field) is distinct from 'number' then raise exception 'Confira as configurações'; end if;
  n:=(payload->>field)::numeric; if n<>trunc(n) or n<0 or n>100000 then raise exception 'Confira os limites'; end if;
 end loop;
 if (payload->>'slackDays')::integer>365 or (payload->>'quoteValidDays')::integer not between 1 and 365 or (payload->>'wageThreshold')::integer not between 1 and 1000 or (payload->>'claimantThreshold')::integer not between 1 and 1000 then raise exception 'Confira os limites'; end if;
 has_identity:=length(btrim(payload->>'technicalName')||btrim(payload->>'crcNumber')||btrim(payload->>'crcState')||btrim(payload->>'crcCategory'))>0;
 if has_identity and (length(btrim(payload->>'technicalName')) not between 3 and 200 or payload->>'crcNumber' !~ '^[0-9A-Za-z/.-]{3,30}$' or payload->>'crcState' not in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') or payload->>'crcCategory' not in ('Contador','Técnico em Contabilidade')) then raise exception 'Preencha a identificação profissional completa'; end if;
 if length(payload->>'pixKey')>200 or length(payload->>'conditions')>4000 or length(payload->>'guarantee')>4000 or length(payload->>'contactEmail')>254 or (payload->>'contactEmail'<>'' and payload->>'contactEmail' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (payload->>'contactPhone'<>'' and payload->>'contactPhone' !~ '^\+55[0-9]{11}$') then raise exception 'Confira os contatos e textos'; end if;
 if payload->>'morningTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or payload->>'eveningTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Confira os horários'; end if;
 if payload ? 'deadlineWindowStart' or payload ? 'deadlineWindowEnd' then
  if jsonb_typeof(payload->'deadlineWindowStart') is distinct from 'string' or jsonb_typeof(payload->'deadlineWindowEnd') is distinct from 'string'
   or payload->>'deadlineWindowStart' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or payload->>'deadlineWindowEnd' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or payload->>'deadlineWindowStart'>=payload->>'deadlineWindowEnd' then raise exception 'Confira a janela dos lembretes'; end if;
 end if;
 select * into cfg from public.settings where singleton for update;
 if not found or cfg.revision<>expected_revision then raise exception 'As configurações mudaram em outra sessão'; end if;
 update public.settings set
 technical_name=nullif(btrim(payload->>'technicalName'),''),crc_number=nullif(payload->>'crcNumber',''),crc_state=nullif(payload->>'crcState',''),crc_category=nullif(payload->>'crcCategory',''),
 contact_email=nullif(lower(btrim(payload->>'contactEmail')),''),contact_phone=nullif(payload->>'contactPhone',''),pix_key=nullif(btrim(payload->>'pixKey'),''),
 slack_days=(payload->>'slackDays')::integer,quote_valid_days=(payload->>'quoteValidDays')::integer,
 complexity_limits=jsonb_build_object('wages',(payload->>'wageThreshold')::integer,'pages',(payload->>'pageThreshold')::integer,'claimants',(payload->>'claimantThreshold')::integer),
 deadline_window_start=coalesce((payload->>'deadlineWindowStart')::time,cfg.deadline_window_start),deadline_window_end=coalesce((payload->>'deadlineWindowEnd')::time,cfg.deadline_window_end),
 notification_times=jsonb_build_array(payload->>'morningTime',payload->>'eveningTime'),
 default_texts=jsonb_build_object('conditions',btrim(payload->>'conditions'),'guarantee',btrim(payload->>'guarantee')),revision=revision+1 where id=cfg.id;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'service_settings_saved','settings',cfg.id);
 return cfg.revision+1;
end;
$$;
revoke all on function public.save_service_settings(jsonb,integer) from public,anon;
grant execute on function public.save_service_settings(jsonb,integer) to authenticated;
