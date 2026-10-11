-- O cadastro público nunca dispensa o aceite. O bootstrap administrativo é
-- reservado por UUID no banco privado, sem marcador fornecido pelo solicitante.
create table private.user_provisioning_grants (
 user_id uuid primary key,
 purpose text not null check (length(btrim(purpose)) between 3 and 200),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp() + interval '5 minutes'),
 check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);
alter table private.user_provisioning_grants enable row level security;
revoke all on private.user_provisioning_grants from public, anon, authenticated, service_role;

create function private.prevent_provisioning_grant_update() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Autorização de provisionamento imutável'; end;
$$;
revoke all on function private.prevent_provisioning_grant_update() from public, anon, authenticated, service_role;
create trigger provisioning_grant_immutable before update on private.user_provisioning_grants
for each row execute function private.prevent_provisioning_grant_update();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
 cfg public.settings%rowtype;
 profile_name text := left(coalesce(new.raw_user_meta_data->>'full_name',''),200);
 provisioned boolean := false;
begin
 -- DELETE com FOUND torna a concessão de uso único transacional.
 -- O ID de auth.users é gerado pelo Auth, não por user_metadata do signup.
 delete from private.user_provisioning_grants
 where user_id = new.id and expires_at > clock_timestamp();
 provisioned := found;
 if not provisioned then
  select * into cfg from public.settings where singleton for share;
  if cfg.id is null
   or new.raw_user_meta_data->'accepted_legal' is distinct from 'true'::jsonb
   or cfg.approved_terms_version is null or length(btrim(cfg.approved_terms_version)) not between 1 and 200
   or cfg.approved_privacy_version is null or length(btrim(cfg.approved_privacy_version)) not between 1 and 200
   or jsonb_typeof(new.raw_user_meta_data->'terms_version') is distinct from 'string'
   or jsonb_typeof(new.raw_user_meta_data->'privacy_version') is distinct from 'string'
   or new.raw_user_meta_data->>'terms_version' is distinct from cfg.approved_terms_version
   or new.raw_user_meta_data->>'privacy_version' is distinct from cfg.approved_privacy_version
  then raise exception 'Aceite e versões dos documentos legais indisponíveis'; end if;
 end if;

 -- Papel e contrato não são aceitos do transporte público, mesmo no bootstrap.
 insert into public.profiles(id,full_name,phone,oab_number,oab_state,city)
 values(new.id,profile_name,left(new.raw_user_meta_data->>'phone',30),nullif(left(new.raw_user_meta_data->>'oab_number',30),''),nullif(left(new.raw_user_meta_data->>'oab_state',2),''),left(new.raw_user_meta_data->>'city',120));
 insert into public.clients(owner_id,kind,document,legal_name)
 values(new.id,case when new.raw_user_meta_data->>'kind'='company' then 'company' else 'person' end,left(new.raw_user_meta_data->>'document',14),left(coalesce(new.raw_user_meta_data->>'legal_name',profile_name),200));

 if provisioned then
  insert into public.audit_log(actor_id,action,target_type,target_id)
  values(new.id,'admin_user_provisioned','profile',new.id);
 else
  insert into public.consents(profile_id,document,version)
  values(new.id,'terms',cfg.approved_terms_version),(new.id,'privacy',cfg.approved_privacy_version);
  insert into public.audit_log(actor_id,action,target_type,target_id)
  values(new.id,'signup','profile',new.id);
  perform private.notify_calculator('new_signup',jsonb_build_object('name',profile_name,'oab_number',left(new.raw_user_meta_data->>'oab_number',30),'oab_state',left(new.raw_user_meta_data->>'oab_state',2),'city',left(new.raw_user_meta_data->>'city',120)),'signup:'||new.id::text);
 end if;
 return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
