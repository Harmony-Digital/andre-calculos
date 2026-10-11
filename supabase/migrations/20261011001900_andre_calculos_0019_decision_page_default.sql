-- Página opcional: omissão é NULL; campos obrigatórios seguem validados na RPC.
create or replace function public.record_process_decision(target_process uuid,decision_parameter text,decision_value text,decision_source text,decision_page integer default null,decision_rationale text default null,request_id uuid default null)
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
