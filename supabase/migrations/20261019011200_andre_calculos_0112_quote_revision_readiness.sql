-- Revalidar insumos de emissão sem relaxar o trigger contratual existente.
create function private.quote_revision_ready(ctx private.quote_contract_contexts) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select ctx.quote_id is not null and ctx.proposal->>'settingsRevision'=cfg.revision::text
 and cfg.approved_terms_version=ctx.terms_version and cfg.approved_privacy_version=ctx.privacy_version
 and p.active and not p.is_example and p.activated_at is not null
 and (ctx.proposal#>>'{capacity,validUntil}')::timestamptz>statement_timestamp()
 and (ctx.proposal#>>'{capacity,startDate}')::date>=(statement_timestamp() at time zone 'America/Sao_Paulo')::date
 from public.settings cfg join public.price_tables p on p.id=(ctx.proposal->>'priceTableId')::uuid where cfg.singleton),false)
$$;
revoke all on function private.quote_revision_ready(private.quote_contract_contexts) from public,anon,authenticated,service_role;

create or replace function public.revise_quote_system(actor uuid,target_quote uuid,expected_context text,expected_version integer,
 expected_order_revision integer,request_id uuid,reason text,unit_prices jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare customer public.clients%rowtype; job public.orders%rowtype; q public.quotes%rowtype;
 ctx private.quote_contract_contexts%rowtype; retry private.quote_adjustments%rowtype;
 canonical jsonb; normalized text; items jsonb:='[]'; item jsonb; changed jsonb; price jsonb;
 total numeric:=0; unit numeric; amount numeric; idx integer:=0; body jsonb;
 created_id uuid:=gen_random_uuid(); serial bigint; quote_year integer; number text; issued timestamptz; result jsonb;
 customer_email text;
begin
 if auth.role() is distinct from 'service_role' or actor is null or target_quote is null or request_id is null then raise exception 'Acesso não autorizado'; end if;
 if expected_context is null or expected_context !~ '^[0-9a-f]{64}$' or expected_version is null or expected_version<1
 or expected_order_revision is null or expected_order_revision<0 or reason is null then raise exception 'Ajuste inválido'; end if;
 normalized:=private.trim_client_contract_reason(reason);
 if length(normalized) not between 1 and 1000 or jsonb_typeof(unit_prices) is distinct from 'array'
 or jsonb_array_length(unit_prices) not between 1 and 10 then raise exception 'Confira motivo e valores'; end if;
 perform id from public.profiles where id=actor and role='calculator' for share;
 if not found then raise exception 'Acesso não autorizado'; end if;
 select c.* into customer from public.clients c join public.orders o on o.client_id=c.id
 join public.quotes x on x.order_id=o.id where x.id=target_quote for update of c;
 select * into job from public.orders where id=(select order_id from public.quotes where id=target_quote) and client_id=customer.id for update;
 if job.id is null then raise exception 'Proposta indisponível'; end if;
 select * into q from public.quotes where id=target_quote for update;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quote-adjust:'||request_id::text,0));
 canonical:=jsonb_build_object('actor',actor,'quoteId',target_quote,'contextHash',expected_context,
  'version',expected_version,'orderRevision',expected_order_revision,'reason',normalized,'items',unit_prices);
 select * into retry from private.quote_adjustments x where x.request_id=revise_quote_system.request_id;
 if retry.request_id is not null then
  if retry.payload is distinct from canonical then raise sqlstate 'PT409' using message='Solicitação já registrada com outros dados'; end if;
  return retry.receipt;
 end if;
 issued:=clock_timestamp();
 select * into ctx from private.quote_contract_contexts where quote_id=q.id for share;
 if q.version<>expected_version or job.status_revision<>expected_order_revision or ctx.context_hash is distinct from expected_context
 or private.can_reject_quote(q,job,ctx) is not true then raise sqlstate 'PT409' using message='Proposta atualizada ou já decidida'; end if;
 if not private.quote_revision_ready(ctx) then raise sqlstate 'PT409' using message='Reconfira disponibilidade e configurações antes de ajustar'; end if;
 if jsonb_array_length(unit_prices)<>jsonb_array_length(ctx.proposal->'items')
 or (select count(distinct x->>'code') from jsonb_array_elements(unit_prices) x)<>jsonb_array_length(unit_prices) then raise exception 'Itens divergentes'; end if;
 for item in select value from jsonb_array_elements(ctx.proposal->'items') loop
  price:=unit_prices->idx;
  if jsonb_typeof(price) is distinct from 'object' or price-array['code','unitCents']<>'{}'::jsonb
   or price->>'code' is distinct from item->>'code' or jsonb_typeof(price->'unitCents') is distinct from 'number'
   or price->>'unitCents' !~ '^[0-9]+$' then raise exception 'Valor de serviço inválido'; end if;
  unit:=(price->>'unitCents')::numeric; amount:=unit*(item->>'quantity')::numeric;
  if unit not between 0 and 9007199254740991 or amount not between 0 and 9007199254740991 then raise exception 'Valor fora do limite'; end if;
  changed:=item||jsonb_build_object('unitCents',unit,'amountCents',amount);
  items:=items||jsonb_build_array(changed); total:=total+amount; idx:=idx+1;
 end loop;
 if total>9007199254740991 or items=ctx.proposal->'items' then raise exception 'Informe uma alteração de valor válida'; end if;
 body:=ctx.proposal||jsonb_build_object('items',items,'totalCents',total,'depositCents',ceil(total/2),'balanceCents',total-ceil(total/2),
  'issuedAt',to_char(issued at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'validUntil',to_char((issued+make_interval(days=>(ctx.proposal->>'validityDays')::integer)) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 quote_year:=extract(year from issued at time zone 'America/Sao_Paulo')::integer;
 insert into private.quote_counters(year,last_number) values(quote_year,1) on conflict(year) do update set last_number=quote_counters.last_number+1 returning last_number into serial;
 number:='ORC-'||quote_year::text||'-'||case when length(serial::text)<4 then lpad(serial::text,4,'0') else serial::text end;
 update public.orders set total_cents=total::bigint,deposit_cents=ceil(total/2)::bigint where id=job.id;
 insert into public.quotes(id,order_id,number,items,total_cents,valid_until,checklist_revision,price_table_id,is_simulation,version,supersedes_id)
 values(created_id,job.id,number,items,total::bigint,(body->>'validUntil')::timestamptz,q.checklist_revision,q.price_table_id,false,q.version+1,q.id);
 -- O trigger existente revalida tabela/configuração/termos/agenda e gera um novo hash.
 insert into private.quote_contract_contexts(quote_id,proposal,terms_version,terms_text,privacy_version,privacy_text,prepared_by)
 values(created_id,body,ctx.terms_version,ctx.terms_text,ctx.privacy_version,ctx.privacy_text,actor);
 result:=jsonb_build_object('quoteId',created_id,'previousQuoteId',q.id,'orderId',job.id,'processId',job.process_id,
  'number',number,'version',q.version+1,'previousTotalCents',q.total_cents,'totalCents',total,
  'reason',normalized,'createdAt',issued);
 insert into private.quote_adjustments(request_id,previous_quote_id,quote_id,actor_id,reason,payload,receipt)
 values(request_id,q.id,created_id,actor,normalized,canonical,result);
 perform private.record_event(job.process_id,'status_changed',jsonb_build_object('operation','revise_quote','quote_id',created_id,
  'previous_quote_id',q.id,'version',q.version+1,'number',number,'note',normalized),actor,job.id,request_id);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'quote_revised','quote',created_id);
 select email into customer_email from auth.users where id=customer.owner_id;
 if nullif(btrim(customer_email),'') is null then raise exception 'Contato indisponível'; end if;
 insert into public.notifications(channel,recipient,template,data,dedup_key)
 values('email',customer_email,'quote_created_client',jsonb_build_object('quote_id',created_id,'number',number,'order_id',job.id,
  'code',job.code,'process_id',job.process_id,'path','/app/orcamentos/'||created_id::text),'quote-revision:'||created_id::text||':client');
 return result;
end;
$$;
create or replace function public.get_quote_revision_context(target_quote uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q public.quotes%rowtype; job public.orders%rowtype; ctx private.quote_contract_contexts%rowtype; current_id uuid; history jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in('client','calculator')) then raise sqlstate 'PT404' using message='Proposta indisponível'; end if;
 select * into q from public.quotes where id=target_quote and private.can_read_order(order_id);
 if q.id is null then raise sqlstate 'PT404' using message='Proposta indisponível'; end if;
 select * into job from public.orders where id=q.order_id;
 select * into ctx from private.quote_contract_contexts where quote_id=q.id;
 select id into current_id from public.quotes where order_id=job.id and private.is_current_quote(id);
 select jsonb_agg(jsonb_build_object('id',x.id,'number',x.number,'version',x.version,'previousQuoteId',x.supersedes_id,
  'totalCents',x.total_cents,'createdAt',coalesce(a.created_at,x.created_at),'reason',a.reason) order by x.version desc,x.created_at desc,x.id)
 into history from public.quotes x left join private.quote_adjustments a on a.quote_id=x.id where x.order_id=job.id;
 return jsonb_build_object('version',q.version,'currentQuoteId',current_id,'isCurrent',coalesce(current_id=q.id,false),
  'blockMessage',case when private.can_reject_quote(q,job,ctx) and not private.quote_revision_ready(ctx) then 'A disponibilidade ou a configuração mudou. Reconfira os insumos da proposta antes de ajustar.' else null end,
  'canRevise',private.can_reject_quote(q,job,ctx) and private.quote_revision_ready(ctx) and exists(select 1 from public.profiles where id=auth.uid() and role='calculator'),
  'history',coalesce(history,'[]'::jsonb));
end;
$$;
