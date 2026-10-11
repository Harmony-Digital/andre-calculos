-- CHECK deve rejeitar campos ausentes: NULL não é uma aprovação.
alter table public.quotes drop constraint quotes_snapshot_mode;
alter table public.quotes add constraint quotes_snapshot_mode check(
 proposal_snapshot is null or coalesce(
 jsonb_typeof(proposal_snapshot)='object' and proposal_snapshot->>'schemaVersion'='1'
 and proposal_snapshot->>'mode'='fixture' and is_simulation
 and checklist_revision is not null and price_table_id is not null
 and proposal_snapshot->>'checklistRevision'=checklist_revision::text
 and proposal_snapshot->>'priceTableId'=price_table_id::text,false));
