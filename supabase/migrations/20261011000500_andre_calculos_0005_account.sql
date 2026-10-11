-- Perfil próprio e pedido de exclusão auditados; não apaga conta nem conteúdo.
alter table public.profiles add column city text;
alter table public.clients add column deletion_requested_at timestamptz;
revoke update(full_name,phone,oab_number,oab_state) on public.profiles from authenticated;
revoke update(kind,document,legal_name) on public.clients from authenticated;
create function private.notify_calculator(event text, payload jsonb, dedup text) returns void
language plpgsql security definer set search_path = '' as $$
declare cfg public.settings%rowtype;
begin
 select * into cfg from public.settings where singleton;
 if cfg.contact_email is not null and exists(select 1 from public.profiles p where p.role='calculator' and not exists(select 1 from public.notification_preferences n where n.profile_id=p.id and n.event=notify_calculator.event and n.channel='email' and not n.enabled)) then
  insert into public.notifications(channel,recipient,template,data,dedup_key) values('email',cfg.contact_email,event,payload,dedup||':email') on conflict(dedup_key) do nothing;
 end if;
 if cfg.contact_phone is not null and exists(select 1 from public.profiles p where p.role='calculator' and exists(select 1 from public.notification_preferences n where n.profile_id=p.id and n.event=notify_calculator.event and n.channel='whatsapp' and n.enabled)) then
  insert into public.notifications(channel,recipient,template,data,dedup_key) values('whatsapp',cfg.contact_phone,event,payload,dedup||':whatsapp') on conflict(dedup_key) do nothing;
 end if;
end;
$$;
revoke all on function private.notify_calculator(text,jsonb,text) from public, anon, authenticated;
create function public.update_own_profile(full_name text,phone text,oab_number text,oab_state text,city text,legal_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='client') then raise exception 'Acesso não autorizado'; end if;
 if full_name is null or length(trim(full_name)) not between 3 and 200 or phone is null or phone !~ '^\+55[1-9][0-9]9[0-9]{8}$' or legal_name is null or length(trim(legal_name)) not between 3 and 200 or city is null or length(city)>120 or oab_number is null or oab_state is null or length(oab_number)>30 or oab_number !~ '^[0-9A-Za-z/.-]*$' or (oab_number='' and oab_state<>'') or (oab_number<>'' and oab_state not in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')) then raise exception 'Dados inválidos'; end if;
 update public.profiles p set full_name=trim(update_own_profile.full_name),phone=update_own_profile.phone,oab_number=nullif(update_own_profile.oab_number,''),oab_state=nullif(update_own_profile.oab_state,''),city=nullif(trim(update_own_profile.city),'') where p.id=actor;
 update public.clients c set legal_name=trim(update_own_profile.legal_name) where c.owner_id=actor;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'profile_updated','profile',actor);
end;
$$;
revoke all on function public.update_own_profile(text,text,text,text,text,text) from public, anon;
grant execute on function public.update_own_profile(text,text,text,text,text,text) to authenticated;
create function public.request_account_deletion() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); c public.clients%rowtype; requested timestamptz;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='client') then raise exception 'Acesso não autorizado'; end if;
 select * into c from public.clients where owner_id=actor for update;
 if not found then raise exception 'Conta indisponível'; end if;
 if c.deletion_requested_at is not null then return c.deletion_requested_at; end if;
 requested := now();
 update public.clients set deletion_requested_at=requested where id=c.id;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'account_deletion_requested','client',c.id);
 perform private.notify_calculator('account_deletion_requested',jsonb_build_object('profile_id',actor),'deletion:'||actor::text);
 return requested;
end;
$$;
revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
