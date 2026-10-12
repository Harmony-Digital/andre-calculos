-- Formatos canônicos do formulário: somente texto validado antes de persistir.
create function private.signup_utf16_length(value text) returns integer
language sql immutable strict set search_path='' as $$
 select coalesce(sum(case when ascii(substr(value,i,1)) > 65535 then 2 else 1 end),0)::integer
 from generate_series(1,char_length(value)) as g(i);
$$;

create function private.valid_signup_cpf(value text) returns boolean
language plpgsql immutable set search_path='' as $$
declare total integer; remainder integer; digit integer; i integer; pass integer;
begin
 if value is null or value !~ '^[0-9]{11}$' or value ~ '^([0-9])\1{10}$' then return false; end if;
 for pass in 1..2 loop
  total := 0;
  for i in 1..(8+pass) loop total := total + (ascii(substr(value,i,1))-48)*(10+pass-i); end loop;
  remainder := total % 11;
  digit := case when remainder < 2 then 0 else 11-remainder end;
  if digit <> ascii(substr(value,9+pass,1))-48 then return false; end if;
 end loop;
 return true;
end;
$$;

create function private.valid_signup_cnpj(value text) returns boolean
language plpgsql immutable set search_path='' as $$
declare total integer; remainder integer; digit integer; i integer; pass integer;
 weights integer[];
begin
 if value is null or value !~ '^[0-9A-Z]{12}[0-9]{2}$' or value ~ '^([0-9])\1{13}$' then return false; end if;
 for pass in 1..2 loop
  weights := case when pass=1 then array[5,4,3,2,9,8,7,6,5,4,3,2] else array[6,5,4,3,2,9,8,7,6,5,4,3,2] end;
  total := 0;
  for i in 1..(11+pass) loop total := total + (ascii(substr(value,i,1))-48)*weights[i]; end loop;
  remainder := total % 11;
  digit := case when remainder < 2 then 0 else 11-remainder end;
  if digit <> ascii(substr(value,12+pass,1))-48 then return false; end if;
 end loop;
 return true;
end;
$$;

create function private.valid_signup_payload(payload jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare key text; value text; max_length integer; size integer;
 oab text := coalesce(payload->>'oab_number',''); state text := coalesce(payload->>'oab_state','');
begin
 if jsonb_typeof(payload) is distinct from 'object' then return false; end if;
 foreach key in array array['full_name','legal_name','phone','kind','document'] loop
  if jsonb_typeof(payload->key) is distinct from 'string' then return false; end if;
 end loop;
 foreach key in array array['oab_number','oab_state','city'] loop
  if payload ? key and jsonb_typeof(payload->key) is distinct from 'string' then return false; end if;
 end loop;
 foreach key in array array['full_name','legal_name','oab_number','oab_state','city'] loop
  value := coalesce(payload->>key,'');
  max_length := case key when 'oab_number' then 30 when 'oab_state' then 2 when 'city' then 120 else 200 end;
  -- String.length do parser usa unidades UTF-16, inclusive caracteres fora do BMP.
  if char_length(value)>max_length then return false; end if;
  size := private.signup_utf16_length(value);
  if size>max_length or (key in ('full_name','legal_name') and size<3)
   or value is distinct from private.trim_client_contract_reason(value) then return false; end if;
 end loop;
 if payload->>'phone' !~ '^\+55(11|12|13|14|15|16|17|18|19|21|22|24|27|28|31|32|33|34|35|37|38|41|42|43|44|45|46|47|48|49|51|53|54|55|61|62|63|64|65|66|67|68|69|71|73|74|75|77|79|81|82|83|84|85|86|87|88|89|91|92|93|94|95|96|97|98|99)9[0-9]{8}$' then return false; end if;
 if oab !~ '^[0-9A-Za-z/.-]*$' or (oab='') <> (state='') then return false; end if;
 if state<>'' and state not in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') then return false; end if;
 if payload->>'kind'='person' then return private.valid_signup_cpf(payload->>'document');
 elsif payload->>'kind'='company' then return private.valid_signup_cnpj(payload->>'document');
 end if;
 return false;
end;
$$;
revoke all on function private.signup_utf16_length(text),private.valid_signup_cpf(text),private.valid_signup_cnpj(text),private.valid_signup_payload(jsonb)
from public,anon,authenticated,service_role;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
 cfg public.settings%rowtype;
 profile_name text := left(coalesce(new.raw_user_meta_data->>'full_name',''),200);
 grant_record private.user_provisioning_grants%rowtype;
 provisioned boolean := false;
begin
 -- Conferir a expiração depois de obter o lock: a espera pode cruzar o TTL.
 -- O ID de auth.users é gerado pelo Auth, não por user_metadata do signup.
 select * into grant_record from private.user_provisioning_grants
 where user_id = new.id for update;
 if found and grant_record.expires_at > clock_timestamp() then
  delete from private.user_provisioning_grants where user_id = new.id;
  provisioned := true;
 end if;
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
  if not private.valid_signup_payload(new.raw_user_meta_data) then raise exception 'Campos de cadastro inválidos ou incompletos'; end if;
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
