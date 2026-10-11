-- Os contatos do serviço pertencem a um responsável persistente, não a qualquer
-- perfil calculista. Acrescentar outro profissional não muda esse vínculo.
create table private.calculator_notification_recipient (
 singleton boolean primary key default true check(singleton),
 profile_id uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table private.calculator_notification_recipient enable row level security;
revoke all on private.calculator_notification_recipient from public,anon,authenticated;
grant all on private.calculator_notification_recipient to service_role;
create index calculator_notification_recipient_profile_idx on private.calculator_notification_recipient(profile_id);
insert into private.calculator_notification_recipient(singleton,profile_id)
 select true,case when count(*)=1 then min(id::text)::uuid else null end
 from public.profiles where role='calculator';

alter table public.notification_preferences add column revision integer not null default 1 check(revision>0);
create table private.notification_preference_changes (
 id uuid primary key,
 profile_id uuid not null references public.profiles(id),
 event text not null,
 channel text not null check(channel in ('email','whatsapp')),
 enabled boolean not null,
 prior_enabled boolean not null,
 expected_revision integer not null check(expected_revision>=0),
 applied_revision integer not null check(applied_revision=expected_revision+1),
 created_at timestamptz not null default now()
);
alter table private.notification_preference_changes enable row level security;
revoke all on private.notification_preference_changes from public,anon,authenticated;
grant all on private.notification_preference_changes to service_role;
create index notification_preference_changes_profile_idx on private.notification_preference_changes(profile_id);
create function private.preserve_notification_preference_change() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'O recibo da preferência é imutável'; end;
$$;
revoke all on function private.preserve_notification_preference_change() from public,anon,authenticated;
create trigger notification_preference_change_immutable before update on private.notification_preference_changes
 for each row execute function private.preserve_notification_preference_change();

create function public.get_calculator_notification_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); recipient uuid; count_calculators integer;
begin
 if actor is null or public.is_calculator() is not true then raise exception 'Acesso não autorizado'; end if;
 select profile_id into recipient from private.calculator_notification_recipient where singleton;
 if not found then return jsonb_build_object('isRecipient',false,'canClaim',false); end if;
 select count(*) into count_calculators from public.profiles where role='calculator';
 return jsonb_build_object('isRecipient',coalesce(recipient=actor,false),
  'canClaim',recipient is null and count_calculators=1);
end;
$$;
revoke all on function public.get_calculator_notification_context() from public,anon,service_role;
grant execute on function public.get_calculator_notification_context() to authenticated;

create function public.set_my_notification_preference(event text,channel text,enabled boolean,expected_revision integer,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); recipient uuid; pref public.notification_preferences%rowtype;
 receipt private.notification_preference_changes%rowtype; old_enabled boolean; next_revision integer;
begin
 if actor is null or public.is_calculator() is not true then raise exception 'Acesso não autorizado'; end if;
 if request_id is null or expected_revision is null or expected_revision not between 0 and 2147483646 or enabled is null
  or event is null or event not in ('new_signup','quote_created','quote_accepted','order_queued','new_message','deadline_two_days','deadline_one_day','deadline_overdue','account_deletion_requested')
  or channel is null or channel not in ('email','whatsapp') then raise exception 'Confira o evento e o canal'; end if;
 -- A linha existe mesmo quando ainda não há preferência: serializa a primeira
 -- gravação e a vinculação, além de alterações concorrentes.
 select profile_id into recipient from private.calculator_notification_recipient where singleton for update;
 if not found then raise exception 'Responsável pelos avisos pendente'; end if;
 if recipient is null then
  if (select count(*) from public.profiles where role='calculator')<>1 then raise exception 'Responsável pelos avisos pendente'; end if;
  update private.calculator_notification_recipient set profile_id=actor where singleton;
  recipient:=actor;
  insert into public.audit_log(actor_id,action,target_type,target_id)
   values(actor,'notification_recipient_confirmed','profile',actor);
 end if;
 if recipient<>actor then raise exception 'Acesso não autorizado'; end if;
 select * into receipt from private.notification_preference_changes c where c.id=request_id;
 if receipt.id is not null then
  if receipt.profile_id is distinct from actor or receipt.event is distinct from event or receipt.channel is distinct from channel
   or receipt.enabled is distinct from enabled or receipt.expected_revision is distinct from expected_revision
   then raise sqlstate 'PT409' using message='Tentativa já registrada com outros dados'; end if;
  return jsonb_build_object('id',receipt.id,'enabled',receipt.enabled,'revision',receipt.applied_revision);
 end if;
 select * into pref from public.notification_preferences p
  where p.profile_id=actor and p.event=set_my_notification_preference.event and p.channel=set_my_notification_preference.channel;
 if coalesce(pref.revision,0)<>expected_revision then raise sqlstate 'PT409' using message='A preferência mudou em outra sessão'; end if;
 old_enabled:=coalesce(pref.enabled,channel='email');
 next_revision:=expected_revision+1;
 insert into public.notification_preferences(profile_id,event,channel,enabled,revision)
  values(actor,event,channel,enabled,next_revision)
  on conflict on constraint notification_preferences_profile_id_event_channel_key do update set enabled=excluded.enabled,revision=excluded.revision;
 insert into private.notification_preference_changes(id,profile_id,event,channel,enabled,prior_enabled,expected_revision,applied_revision)
  values(request_id,actor,event,channel,enabled,old_enabled,expected_revision,next_revision);
 insert into public.audit_log(actor_id,action,target_type,target_id)
  values(actor,'notification_preference_saved','notification_preference_change',request_id);
 return jsonb_build_object('id',request_id,'enabled',enabled,'revision',next_revision);
end;
$$;
revoke all on function public.set_my_notification_preference(text,text,boolean,integer,uuid) from public,anon,service_role;
grant execute on function public.set_my_notification_preference(text,text,boolean,integer,uuid) to authenticated;

create or replace function private.notify_calculator(event text,payload jsonb,dedup text) returns void
language plpgsql security definer set search_path='' as $$
declare cfg public.settings%rowtype; recipient uuid;
begin
 select r.profile_id into recipient from private.calculator_notification_recipient r
  join public.profiles p on p.id=r.profile_id and p.role='calculator' where r.singleton;
 if recipient is null then return; end if;
 select * into cfg from public.settings where singleton;
 if cfg.contact_email is not null and not exists(select 1 from public.notification_preferences n
  where n.profile_id=recipient and n.event=notify_calculator.event and n.channel='email' and not n.enabled) then
  insert into public.notifications(channel,recipient,template,data,dedup_key)
   values('email',cfg.contact_email,event,payload,dedup||':email') on conflict(dedup_key) do nothing;
 end if;
 if cfg.contact_phone is not null and exists(select 1 from public.notification_preferences n
  where n.profile_id=recipient and n.event=notify_calculator.event and n.channel='whatsapp' and n.enabled) then
  insert into public.notifications(channel,recipient,template,data,dedup_key)
   values('whatsapp',cfg.contact_phone,event,payload,dedup||':whatsapp') on conflict(dedup_key) do nothing;
 end if;
end;
$$;
revoke all on function private.notify_calculator(text,jsonb,text) from public,anon,authenticated;
