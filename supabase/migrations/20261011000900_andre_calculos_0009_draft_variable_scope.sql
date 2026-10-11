-- Qualificação explícita das variáveis locais para revisão da identificação do processo.
create or replace function public.save_checklist_draft(payload jsonb, completed_step integer, draft_id uuid default null, expected_revision integer default null)
returns table(order_id uuid,order_code text,process_id uuid,revision integer,saved_step integer)
language plpgsql security definer set search_path = '' as $$
<<draft_save>>
declare actor uuid:=auth.uid(); owner uuid; cnj text; proc public.processes%rowtype; ord public.orders%rowtype; saved public.checklists%rowtype; calc text; side text; chamber text; trt text; claimant_count integer;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and role='client') then raise exception 'Acesso não autorizado'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>65536 or payload->>'schemaVersion' is distinct from '1' or completed_step is null or completed_step not between 0 and 8 then raise exception 'Checklist inválido'; end if;
 select id into owner from public.clients where owner_id=actor for update;
 if owner is null then raise exception 'Conta indisponível'; end if;
 cnj:=regexp_replace(trim(payload->>'processNumber'),'[-.]','','g'); calc:=payload->>'calculationType'; chamber:=trim(payload->>'court'); trt:='TRT-'||substring(cnj,15,2); side:=case payload->>'side' when 'claimant' then 'claimant' when 'respondent' then 'defendant' else null end;
 if not private.valid_labor_cnj(cnj) or calc is null or calc not in ('initial','liquidation','challenge','update') or side is null or chamber is null or length(chamber) not between 1 and 160 or payload->>'claimants' is null or payload->>'claimants' !~ '^[0-9]{1,4}$' or payload->>'tribunal' is distinct from substring(cnj,15,2)::integer::text then raise exception 'Processo inválido'; end if;
 claimant_count:=(payload->>'claimants')::integer;
 if claimant_count not between 1 and 1000 then raise exception 'Processo inválido'; end if;
 if draft_id is null then
  if expected_revision is not null then raise exception 'Revisão inválida'; end if;
  insert into public.processes(client_id,cnj_number,court,chamber,side,claimants_count) values(owner,cnj,trt,chamber,side,claimant_count) on conflict(client_id,cnj_number) do nothing;
  select * into proc from public.processes where client_id=owner and cnj_number=cnj for update;
  if (proc.chamber,proc.side,proc.claimants_count) is distinct from (chamber,side,claimant_count) then raise exception 'Confira a identificação do processo já cadastrado'; end if;
  insert into public.orders(process_id,client_id,calc_type,status) values(proc.id,owner,calc,'draft') returning * into ord;
  insert into public.checklists(order_id,schema_version,answers,completed_step) values(ord.id,1,payload,completed_step) returning * into saved;
 else
  select * into ord from public.orders where id=draft_id and client_id=owner and status='draft' for update;
  if not found then raise exception 'Rascunho indisponível'; end if;
  select * into saved from public.checklists where checklists.order_id=ord.id for update;
  if not found or expected_revision is null or saved.revision<>expected_revision then raise exception 'Rascunho atualizado em outra sessão'; end if;
  select * into proc from public.processes where id=ord.process_id and client_id=owner for update;
  if (proc.cnj_number,proc.chamber,proc.side,proc.claimants_count) is distinct from (cnj,chamber,side,claimant_count) then
   if exists(select 1 from public.orders o where o.process_id=proc.id and o.id<>ord.id) or exists(select 1 from public.files f where f.process_id=proc.id) then raise exception 'Processo já vinculado a outros pedidos ou documentos'; end if;
   update public.processes p set cnj_number=cnj,court=trt,chamber=draft_save.chamber,side=draft_save.side,claimants_count=claimant_count where p.id=proc.id;
  end if;
  update public.orders o set calc_type=calc where o.id=ord.id;
  update public.checklists c set answers=payload,completed_step=greatest(c.completed_step,save_checklist_draft.completed_step),revision=c.revision+1 where c.id=saved.id returning * into saved;
 end if;
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'checklist_draft_saved','order',ord.id);
 insert into public.timeline_events(process_id,order_id,kind,data,actor_id) values(proc.id,ord.id,'checklist_draft_saved',jsonb_build_object('step',completed_step,'revision',saved.revision),actor);
 return query select ord.id,ord.code,proc.id,saved.revision,saved.completed_step;
end;
$$;
revoke all on function public.save_checklist_draft(jsonb,integer,uuid,integer) from public,anon;
grant execute on function public.save_checklist_draft(jsonb,integer,uuid,integer) to authenticated;
