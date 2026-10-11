-- Ensaio do parser instalado identificou contagem por pontos de código.
-- Preservar 0049 já aplicada; corrigir o limite sem rejeitar texto válido.
create or replace function private.valid_signup_payload(payload jsonb) returns boolean
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
  -- Zod 4.6.5 mede pontos de código, como char_length em PostgreSQL UTF-8.
  size := char_length(value);
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
drop function private.signup_utf16_length(text);
