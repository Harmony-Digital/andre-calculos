-- Mantém papel/vínculo/preferências estáveis entre a conferência e o enqueue.
-- set_my_notification_preference já serializa pelo mesmo vínculo com FOR UPDATE.
create or replace function private.enqueue_deadline_reminder_at(target_order uuid,expected_due date,reminder_event text,reference_date date,one_day date,two_days date,run_at timestamptz)
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
 select r.profile_id into recipient from private.calculator_notification_recipient r join public.profiles p on p.id=r.profile_id and p.role='calculator' where r.singleton for share of r,p;
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
