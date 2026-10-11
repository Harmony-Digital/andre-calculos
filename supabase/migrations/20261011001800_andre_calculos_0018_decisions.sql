-- Decisões imutáveis e concordância explícita do dono do processo.
alter table public.decisions add column client_confirmed_by uuid references public.profiles(id);
alter table public.decisions add constraint decisions_confirmation_pair check ((client_confirmed_at is null)=(client_confirmed_by is null));
create index decisions_client_confirmed_by_idx on public.decisions(client_confirmed_by);
create index decisions_process_created_id_idx on public.decisions(process_id,created_at,id);

create function private.clean_decision_text(value text) returns text
language sql immutable set search_path='' as $$
 select btrim(regexp_replace(value,E'\r\n?',E'\n','g'), E' \t\n\r\v\f' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
revoke all on function private.clean_decision_text(text) from public,anon,authenticated,service_role;

create function public.record_process_decision(target_process uuid,decision_parameter text,decision_value text,decision_source text,decision_page integer,decision_rationale text,request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); chosen text; reason text; existing public.decisions%rowtype;
begin
 if actor is null or target_process is null or public.is_calculator() is not true or private.can_read_process(target_process) is not true then raise exception 'Acesso não autorizado'; end if;
 chosen:=private.clean_decision_text(decision_value); reason:=private.clean_decision_text(decision_rationale);
 if request_id is null or decision_parameter is null or decision_parameter not in ('correction_index','interest','start_date','period','wage','deduction','other') or decision_source is null or decision_source not in ('judgment','appeal','decision','lawyer','calculator') or chosen is null or length(chosen) not between 1 and 1000 or reason is null or length(reason) not between 1 and 2000 or (decision_page is not null and decision_page not between 1 and 100000) then raise exception 'Decisão inválida'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('decision:'||request_id::text,0));
 select * into existing from public.decisions where id=request_id;
 if existing.id is not null then
  if existing.process_id is distinct from target_process or existing.order_id is not null or existing.recorded_by is distinct from actor or existing.parameter is distinct from decision_parameter or existing.value is distinct from chosen or existing.source is distinct from decision_source or existing.page is distinct from decision_page or existing.rationale is distinct from reason then raise exception 'Decisão já registrada com outros dados'; end if;
  return request_id;
 end if;
 insert into public.decisions(id,process_id,order_id,parameter,value,source,page,rationale,recorded_by,client_confirmed_at,client_confirmed_by)
 values(request_id,target_process,null,decision_parameter,chosen,decision_source,decision_page,reason,actor,null,null);
 perform private.record_event(target_process,'decision_recorded',jsonb_build_object('decision_id',request_id,'parameter',decision_parameter),actor);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'decision_recorded','decision',request_id);
 return request_id;
end;
$$;
revoke all on function public.record_process_decision(uuid,text,text,text,integer,text,uuid) from public,anon,service_role;
grant execute on function public.record_process_decision(uuid,text,text,text,integer,text,uuid) to authenticated;

create function private.preserve_decision() returns trigger
language plpgsql set search_path='' as $$
begin
 if (to_jsonb(new)-array['updated_at','client_confirmed_at','client_confirmed_by']) is distinct from (to_jsonb(old)-array['updated_at','client_confirmed_at','client_confirmed_by']) then raise exception 'Decisão registrada não pode ser alterada'; end if;
 if (new.client_confirmed_at,new.client_confirmed_by) is distinct from (old.client_confirmed_at,old.client_confirmed_by) then
  if old.client_confirmed_at is not null or auth.uid() is null or new.client_confirmed_by is distinct from auth.uid() or new.client_confirmed_at is distinct from pg_catalog.now() or not exists(select 1 from public.processes p join public.clients c on c.id=p.client_id join public.profiles u on u.id=c.owner_id where p.id=old.process_id and c.owner_id=auth.uid() and u.role='client') then raise exception 'Confirmação não autorizada'; end if;
 end if;
 return new;
end;
$$;
revoke all on function private.preserve_decision() from public,anon,authenticated,service_role;
create trigger decisions_preserve_content before update on public.decisions for each row execute function private.preserve_decision();

create function public.confirm_process_decision(target_decision uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); chosen public.decisions%rowtype;
begin
 if actor is null or target_decision is null or not exists(select 1 from public.profiles where id=actor and role='client') then raise exception 'Acesso não autorizado'; end if;
 select d.* into chosen from public.decisions d join public.processes p on p.id=d.process_id join public.clients c on c.id=p.client_id where d.id=target_decision and c.owner_id=actor for update of d;
 if chosen.id is null then raise exception 'Acesso não autorizado'; end if;
 if chosen.client_confirmed_at is not null then
  if chosen.client_confirmed_by is distinct from actor then raise exception 'Confirmação indisponível'; end if;
  return chosen.id;
 end if;
 update public.decisions set client_confirmed_at=pg_catalog.now(),client_confirmed_by=actor where id=chosen.id;
 -- Não cria novo tipo de evento: o mesmo registro indica a concordância.
 perform private.record_event(chosen.process_id,'decision_recorded',jsonb_build_object('decision_id',chosen.id,'confirmation',true),actor);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'decision_confirmed','decision',chosen.id);
 return chosen.id;
end;
$$;
revoke all on function public.confirm_process_decision(uuid) from public,anon,service_role;
grant execute on function public.confirm_process_decision(uuid) to authenticated;

-- Snapshot único: evita limite de linhas da API e audita o acesso antes do render.
create function public.get_process_decision_export(target_process uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); proc public.processes%rowtype; cfg public.settings%rowtype; result jsonb;
begin
 if actor is null or target_process is null or private.can_read_process(target_process) is not true or not exists(select 1 from public.profiles where id=actor and role in ('client','calculator')) then raise exception 'Acesso não autorizado'; end if;
 select * into proc from public.processes where id=target_process;
 select * into cfg from public.settings where singleton;
 if proc.id is null then raise exception 'Acesso não autorizado'; end if;
 if cfg.technical_name is null or cfg.crc_number is null or cfg.crc_state is null or cfg.crc_category is null then raise exception 'Identificação profissional pendente'; end if;
 select jsonb_build_object('process',jsonb_build_object('id',proc.id,'cnj',proc.cnj_number,'court',proc.court,'chamber',proc.chamber),
 'professional',jsonb_build_object('name',cfg.technical_name,'crcNumber',cfg.crc_number,'crcState',cfg.crc_state,'category',cfg.crc_category),
 'generatedAt',pg_catalog.now(),'decisions',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'parameter',d.parameter,'value',d.value,'source',d.source,'page',d.page,'rationale',d.rationale,'recordedBy',coalesce(u.full_name,'Responsável'),'createdAt',d.created_at,'confirmedAt',d.client_confirmed_at,'confirmedBy',confirming.full_name) order by d.created_at,d.id) from public.decisions d join public.profiles u on u.id=d.recorded_by left join public.profiles confirming on confirming.id=d.client_confirmed_by where d.process_id=target_process),'[]'::jsonb)) into result;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'decisions_pdf_access','process',target_process);
 return result;
end;
$$;
revoke all on function public.get_process_decision_export(uuid) from public,anon,service_role;
grant execute on function public.get_process_decision_export(uuid) to authenticated;
