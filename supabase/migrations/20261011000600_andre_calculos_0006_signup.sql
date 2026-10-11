-- Dados de cadastro são transporte; role nunca vem de metadata, consentimentos são append-only.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare cfg public.settings%rowtype; profile_name text := left(coalesce(new.raw_user_meta_data->>'full_name',''),200);
begin
 select * into cfg from public.settings where singleton for share;
 if new.raw_user_meta_data->>'accepted_legal' = 'true' and (cfg.approved_terms_version is null or cfg.approved_privacy_version is null or new.raw_user_meta_data->>'terms_version' is distinct from cfg.approved_terms_version or new.raw_user_meta_data->>'privacy_version' is distinct from cfg.approved_privacy_version) then raise exception 'Documentos legais indisponíveis'; end if;
 insert into public.profiles(id,full_name,phone,oab_number,oab_state,city)
 values(new.id,profile_name,left(new.raw_user_meta_data->>'phone',30),nullif(left(new.raw_user_meta_data->>'oab_number',30),''),nullif(left(new.raw_user_meta_data->>'oab_state',2),''),left(new.raw_user_meta_data->>'city',120));
 insert into public.clients(owner_id,kind,document,legal_name) values(new.id,case when new.raw_user_meta_data->>'kind'='company' then 'company' else 'person' end,left(new.raw_user_meta_data->>'document',14),left(coalesce(new.raw_user_meta_data->>'legal_name',profile_name),200));
 if new.raw_user_meta_data->>'accepted_legal'='true' then
  insert into public.consents(profile_id,document,version) values(new.id,'terms',cfg.approved_terms_version),(new.id,'privacy',cfg.approved_privacy_version);
 end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(new.id,'signup','profile',new.id);
 perform private.notify_calculator('new_signup',jsonb_build_object('name',profile_name,'oab_number',left(new.raw_user_meta_data->>'oab_number',30),'oab_state',left(new.raw_user_meta_data->>'oab_state',2),'city',left(new.raw_user_meta_data->>'city',120)),'signup:'||new.id::text);
 return new;
end;
$$;
