-- Paginação da fila: nulos ao final e UUID como desempate estável.
create index orders_work_queue_due_id_idx on public.orders(internal_due_date,id) where status in ('queued','in_analysis','awaiting_client','in_calculation','in_review','in_adjustment');
create index orders_work_queue_status_due_id_idx on public.orders(status,internal_due_date,id) where status in ('queued','in_analysis','awaiting_client','in_calculation','in_review','in_adjustment');
