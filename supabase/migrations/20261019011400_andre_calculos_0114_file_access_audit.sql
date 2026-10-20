-- M3.20: consulta de autorizações de arquivos, exclusiva do calculista.
-- A autorização antecede a transferência; não representa recebimento dos bytes.
alter policy audit_log_read on public.audit_log to authenticated using (
  (select public.is_calculator()) or
  ((select public.is_admin()) and target_type <> 'file')
);

create index audit_log_file_access_page_idx on public.audit_log(created_at desc,id desc)
  where target_type='file' and action in ('file_view','file_download') and target_id is not null;

create function public.get_file_access_audit(
  target_file uuid default null,
  file_search text default null,
  target_actor uuid default null,
  actor_search text default null,
  start_date date default null,
  end_date date default null,
  access_action text default null,
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size integer default 50
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or public.is_calculator() is not true then
    raise exception 'Acesso não autorizado';
  end if;
  if page_size is null or page_size not between 1 and 50
    or (cursor_created_at is null) <> (cursor_id is null)
    or (cursor_created_at is not null and not isfinite(cursor_created_at))
    or (start_date is not null and (not isfinite(start_date) or start_date < date '1900-01-01' or start_date > date '9999-12-31'))
    or (end_date is not null and (not isfinite(end_date) or end_date < date '1900-01-01' or end_date > date '9999-12-31'))
    or start_date > end_date
    or (access_action is not null and access_action not in ('file_view','file_download'))
    or length(file_search)>255 or length(actor_search)>255
    or (target_file is not null and file_search is not null)
    or (target_actor is not null and actor_search is not null) then
    raise exception 'Filtros de acesso inválidos';
  end if;
  with candidates as materialized (
    select a.id,a.created_at,a.action,a.actor_id,p.full_name as actor_name,
      a.target_id as file_id,f.name as file_name,f.version as file_version
    from public.audit_log a
    left join public.profiles p on p.id=a.actor_id
    left join public.files f on f.id=a.target_id
    where a.target_type='file' and a.action in ('file_view','file_download') and a.target_id is not null
      and (target_file is null or a.target_id=target_file)
      and (file_search is null or strpos(lower(f.name),lower(btrim(file_search)))>0)
      and (target_actor is null or a.actor_id=target_actor)
      and (actor_search is null or strpos(lower(p.full_name),lower(btrim(actor_search)))>0)
      and (start_date is null or a.created_at >= (start_date::timestamp at time zone 'America/Sao_Paulo'))
      and (end_date is null or a.created_at < ((end_date+1)::timestamp at time zone 'America/Sao_Paulo'))
      and (access_action is null or a.action=access_action)
      and (cursor_created_at is null or (a.created_at,a.id)<(cursor_created_at,cursor_id))
    order by a.created_at desc,a.id desc limit page_size+1
  ), page as (
    select * from candidates order by created_at desc,id desc limit page_size
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc) from page p),'[]'::jsonb),
    'has_more',(select count(*)>page_size from candidates)
  ) into result;
  return result;
end; $$;
revoke all on function public.get_file_access_audit(uuid,text,uuid,text,date,date,text,timestamptz,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_file_access_audit(uuid,text,uuid,text,date,date,text,timestamptz,uuid,integer)
  to authenticated;
