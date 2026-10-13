-- Contrato histórico: captura na mesma transação do aceite, sem gerar PDF aqui.
create table private.quote_contract_snapshots (
 quote_id uuid primary key references private.quote_acceptances(quote_id) on delete cascade,
 snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=262144),
 snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'
  and snapshot_sha256=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')),
 captured_at timestamptz not null default clock_timestamp(),
 unique(quote_id,snapshot_sha256)
);
create table private.quote_contract_generation_intents (
 quote_id uuid primary key,
 snapshot_sha256 text not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(quote_id,snapshot_sha256) references private.quote_contract_snapshots(quote_id,snapshot_sha256) on delete cascade
);
create index quote_contract_generation_snapshot_idx on private.quote_contract_generation_intents(quote_id,snapshot_sha256);
alter table private.quote_contract_snapshots enable row level security;
alter table private.quote_contract_generation_intents enable row level security;
revoke all on private.quote_contract_snapshots,private.quote_contract_generation_intents from public,anon,authenticated,service_role;
create trigger quote_contract_snapshot_immutable before update on private.quote_contract_snapshots
 for each row execute function private.preserve_quote_contract_record();
create trigger quote_contract_generation_intent_immutable before update on private.quote_contract_generation_intents
 for each row execute function private.preserve_quote_contract_record();

create function private.freeze_quote_contract(target_quote uuid,legacy boolean) returns void
language plpgsql security definer set search_path='' as $$
declare r private.quote_acceptances%rowtype; ctx private.quote_contract_contexts%rowtype;
 q public.quotes%rowtype; customer public.clients%rowtype; profile public.profiles%rowtype;
 identity jsonb; body jsonb; email text; digest text;
begin
 if legacy is null then raise exception 'Origem contratual indisponível'; end if;
 select * into r from private.quote_acceptances where quote_id=target_quote;
 select * into ctx from private.quote_contract_contexts where quote_id=target_quote;
 select * into q from public.quotes where id=target_quote;
 if r.quote_id is null or ctx.quote_id is null or q.id is null or q.is_simulation
 or r.context_hash is distinct from ctx.context_hash or ctx.proposal->>'mode' is distinct from 'commercial'
 or r.number is distinct from q.number or r.terms_sha256 is distinct from ctx.terms_sha256
 or r.privacy_sha256 is distinct from ctx.privacy_sha256
 or r.terms_version is distinct from ctx.terms_version or r.privacy_version is distinct from ctx.privacy_version then
  raise exception 'Dados históricos do contrato indisponíveis';
 end if;
 if exists(select 1 from private.quote_contract_snapshots where quote_id=target_quote) then return; end if;
 if legacy then
  -- Não consultar o perfil ou a conta de hoje para completar um aceite anterior.
  identity:=jsonb_build_object('source','legacy','actorId',r.actor_id,
   'kind',null,'fullName',null,'legalName',null,'document',null,'email',null,
   'phone',null,'oabNumber',null,'oabState',null);
 else
  select * into profile from public.profiles where id=r.actor_id and role='client' for share;
  select c.* into customer from public.clients c join public.orders o on o.client_id=c.id
   where o.id=q.order_id and c.owner_id=r.actor_id for share of c;
  select u.email into email from auth.users u where u.id=r.actor_id for share;
  if profile.id is null or customer.id is null then raise exception 'Contratante indisponível'; end if;
  identity:=jsonb_build_object('source','acceptance','actorId',r.actor_id,'kind',customer.kind,
   'fullName',nullif(profile.full_name,''),'legalName',nullif(customer.legal_name,''),
   'document',customer.document,'email',email,'phone',profile.phone,
   'oabNumber',profile.oab_number,'oabState',profile.oab_state);
 end if;
 if exists(select 1 from jsonb_each(identity) field where jsonb_typeof(field.value)='string' and length(field.value#>>'{}')>64000) then
  raise exception 'Identificação contratual excede o limite';
 end if;
 body:=jsonb_build_object('schemaVersion',1,'quoteId',r.quote_id,'number',r.number,
  'proposal',ctx.proposal,'contractant',identity,
  'terms',jsonb_build_object('version',ctx.terms_version,'text',ctx.terms_text,'sha256',ctx.terms_sha256),
  'privacy',jsonb_build_object('version',ctx.privacy_version,'text',ctx.privacy_text,'sha256',ctx.privacy_sha256),
  'acceptance',jsonb_build_object('actorId',r.actor_id,'acceptedAt',r.accepted_at,'contextHash',r.context_hash));
 digest:=encode(sha256(convert_to(body::text,'UTF8')),'hex');
 insert into private.quote_contract_snapshots(quote_id,snapshot,snapshot_sha256) values(r.quote_id,body,digest);
 insert into private.quote_contract_generation_intents(quote_id,snapshot_sha256) values(r.quote_id,digest);
end;
$$;
revoke all on function private.freeze_quote_contract(uuid,boolean) from public,anon,authenticated,service_role;

create function private.capture_accepted_quote_contract() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.freeze_quote_contract(new.quote_id,false); return new; end;
$$;
revoke all on function private.capture_accepted_quote_contract() from public,anon,authenticated,service_role;
create trigger quote_acceptance_capture_contract after insert on private.quote_acceptances
 for each row execute function private.capture_accepted_quote_contract();

-- O preenchimento histórico usa somente recibo e contexto anteriormente congelados.
do $$declare accepted record; begin
 for accepted in select quote_id from private.quote_acceptances loop
  perform private.freeze_quote_contract(accepted.quote_id,true);
 end loop;
end;$$;

create function public.get_quote_contract_snapshot(target_quote uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q public.quotes%rowtype; archive private.quote_contract_snapshots%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in('client','calculator')) then
  raise exception 'Contrato indisponível' using errcode='PT404';
 end if;
 select * into q from public.quotes where id=target_quote and not is_simulation and private.can_read_order(order_id);
 if q.id is null then raise exception 'Contrato indisponível' using errcode='PT404'; end if;
 select * into archive from private.quote_contract_snapshots where quote_id=q.id;
 if archive.quote_id is null then raise exception 'Contrato indisponível' using errcode='PT404'; end if;
 return jsonb_build_object('snapshotHash',archive.snapshot_sha256,'snapshot',archive.snapshot);
end;
$$;
revoke all on function public.get_quote_contract_snapshot(uuid) from public,anon,service_role;
grant execute on function public.get_quote_contract_snapshot(uuid) to authenticated;
