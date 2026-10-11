-- D6 permanece pendente até a escolha explícita do responsável técnico.
-- Aprovar uma política é distinto de confirmar pagamento ou emitir acesso aos bytes.
create table public.delivery_policy_approvals (
 id uuid primary key,
 policy text not null check(policy in ('before_balance','after_balance')),
 prior_policy text check(prior_policy in ('before_balance','after_balance')),
 settings_revision integer not null check(settings_revision>1),
 approved_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.delivery_policy_approvals enable row level security;
revoke all on public.delivery_policy_approvals from anon,authenticated;
grant select on public.delivery_policy_approvals to authenticated;
grant all on public.delivery_policy_approvals to service_role;
create policy delivery_policy_approvals_read on public.delivery_policy_approvals for select to authenticated using((select public.is_calculator()) or (select public.is_admin()));
create index delivery_policy_approvals_actor_idx on public.delivery_policy_approvals(approved_by);
create trigger delivery_policy_approvals_immutable before update on public.delivery_policy_approvals for each row execute function private.preserve_delivery_record();
alter table public.delivery_releases add column request_id uuid not null default gen_random_uuid();
alter table public.delivery_releases add constraint delivery_releases_request_key unique(request_id);

create function public.approve_future_delivery_policy(policy text,expected_revision integer,approved boolean,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); receipt public.delivery_policy_approvals%rowtype; cfg public.settings%rowtype;
begin
 if actor is null or public.is_calculator() is not true then raise exception 'Acesso não autorizado'; end if;
 if request_id is null or expected_revision is null or expected_revision<1 or approved is distinct from true or policy is null or policy not in ('before_balance','after_balance') then raise exception 'Confira a aprovação da regra'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delivery-policy:'||request_id::text,0));
 select * into receipt from public.delivery_policy_approvals a where a.id=request_id;
 if receipt.id is not null then
  if receipt.approved_by is distinct from actor or receipt.policy is distinct from policy or receipt.settings_revision-1 is distinct from expected_revision then raise sqlstate 'PT409' using message='Aprovação já registrada com outros dados'; end if;
  return jsonb_build_object('id',receipt.id,'policy',receipt.policy,'revision',receipt.settings_revision);
 end if;
 select * into cfg from public.settings where singleton for update;
 if cfg.id is null or cfg.revision<>expected_revision then raise sqlstate 'PT409' using message='As configurações mudaram em outra sessão'; end if;
 insert into public.delivery_policy_approvals(id,policy,prior_policy,settings_revision,approved_by)
  values(request_id,policy,cfg.delivery_release_policy,cfg.revision+1,actor);
 update public.settings s set delivery_release_policy=policy,revision=cfg.revision+1 where s.id=cfg.id;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'delivery_policy_approved','delivery_policy_approval',request_id);
 return jsonb_build_object('id',request_id,'policy',policy,'revision',cfg.revision+1);
end;
$$;
revoke all on function public.approve_future_delivery_policy(text,integer,boolean,uuid) from public,anon,service_role;
grant execute on function public.approve_future_delivery_policy(text,integer,boolean,uuid) to authenticated;

create function public.approve_existing_delivery_release(target_delivery uuid,policy text,approved boolean,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); d public.deliveries%rowtype; o public.orders%rowtype; receipt public.delivery_releases%rowtype;
begin
 if actor is null or public.is_calculator() is not true then raise exception 'Acesso não autorizado'; end if;
 if target_delivery is null or request_id is null or approved is distinct from true or policy is null or policy not in ('before_balance','after_balance') then raise exception 'Confira a aprovação da regra'; end if;
 select * into d from public.deliveries where id=target_delivery;
 if d.id is null or private.can_read_process(d.process_id) is not true then raise exception 'Entrega indisponível'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('delivery-release:'||request_id::text,0));
 select * into receipt from public.delivery_releases r where r.request_id=approve_existing_delivery_release.request_id;
 if receipt.delivery_id is not null then
  if receipt.delivery_id is distinct from target_delivery or receipt.approved_by is distinct from actor or receipt.policy is distinct from policy then raise sqlstate 'PT409' using message='Aprovação já registrada com outros dados'; end if;
  return jsonb_build_object('delivery_id',receipt.delivery_id,'request_id',receipt.request_id,'policy',receipt.policy);
 end if;
 select * into o from public.orders where id=d.order_id and process_id=d.process_id for update;
 select * into d from public.deliveries where id=target_delivery for update;
 if d.id is null or o.id is null or o.status not in ('delivered','completed') then raise sqlstate 'PT409' using message='Entrega precisa estar confirmada'; end if;
 if exists(select 1 from public.delivery_releases r where r.delivery_id=target_delivery) then raise sqlstate 'PT409' using message='A regra desta entrega já foi aprovada'; end if;
 insert into public.delivery_releases(delivery_id,policy,approved_by,request_id) values(target_delivery,policy,actor,request_id);
 perform private.record_event(d.process_id,'status_changed',jsonb_build_object('delivery_id',target_delivery,'release_policy',policy),actor,d.order_id);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'delivery_release_approved','delivery',target_delivery);
 return jsonb_build_object('delivery_id',target_delivery,'request_id',request_id,'policy',policy);
end;
$$;
revoke all on function public.approve_existing_delivery_release(uuid,text,boolean,uuid) from public,anon,service_role;
grant execute on function public.approve_existing_delivery_release(uuid,text,boolean,uuid) to authenticated;

-- Pix só aparece para participantes autorizados de uma entrega que exige saldo.
create function public.get_delivery_payment_instructions(target_process uuid,target_deliveries uuid[])
returns table(delivery_id uuid,pix_key text,remaining_cents bigint,order_code text)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or public.is_admin() or private.can_read_process(target_process) is not true then raise exception 'Acesso não autorizado'; end if;
 if target_deliveries is null or cardinality(target_deliveries)>50 or coalesce(array_ndims(target_deliveries),1)<>1 or array_position(target_deliveries,null) is not null then raise exception 'Entregas inválidas'; end if;
 return query select d.id,nullif(btrim(s.pix_key),''),greatest(o.total_cents-coalesce(paid.amount,0),0)::bigint,o.code
  from public.deliveries d join public.delivery_releases r on r.delivery_id=d.id
   join public.orders o on o.id=d.order_id and o.process_id=d.process_id cross join public.settings s
   left join lateral(select sum(p.amount_cents) amount from public.payments p where p.order_id=o.id and p.status='confirmed' and p.kind in ('deposit','balance')) paid on true
  where d.process_id=target_process and d.id=any(target_deliveries) and s.singleton
   and r.policy='after_balance' and o.status in ('delivered','completed') and coalesce(paid.amount,0)<o.total_cents;
end;
$$;
revoke all on function public.get_delivery_payment_instructions(uuid,uuid[]) from public,anon,service_role;
grant execute on function public.get_delivery_payment_instructions(uuid,uuid[]) to authenticated;
