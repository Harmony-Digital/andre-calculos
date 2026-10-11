-- Ordem estável da paginação, com e sem filtro por tipo de atividade.
create index timeline_process_created_id_idx on public.timeline_events(process_id,created_at desc,id desc);
create index timeline_process_kind_created_id_idx on public.timeline_events(process_id,kind,created_at desc,id desc);
