-- Um envio posterior tem proveniência diferente da entrega anterior.
create function private.guard_update_pjc_provenance() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.order_id,new.process_id,new.source_order_id,new.request_id,new.actor_id,new.source_checklist,new.source_revision,new.source_index,new.source_decisions,new.missing_requested,new.created_at)
 is distinct from(old.order_id,old.process_id,old.source_order_id,old.request_id,old.actor_id,old.source_checklist,old.source_revision,old.source_index,old.source_decisions,old.missing_requested,old.created_at) then raise exception 'Origem registrada é imutável'; end if;
 if (new.source_file_id,new.file_snapshot) is distinct from(old.source_file_id,old.file_snapshot) then
  if old.source_file_id is not null or new.file_snapshot->>'origin' is distinct from 'client_upload'
  or not exists(select 1 from public.files f where f.id=new.source_file_id and f.process_id=old.process_id
   and f.folder='client' and f.order_id is null and f.uploaded_by=old.actor_id and f.created_at>=old.created_at
   and new.file_snapshot=jsonb_build_object('id',f.id,'name',f.name,'sha256',f.sha256,'sizeBytes',f.size_bytes,'origin','client_upload')) then raise exception 'Envie o PJC para esta atualização'; end if;
 end if;
 return new;
end; $$;
revoke all on function private.guard_update_pjc_provenance() from public,anon,authenticated,service_role;
create trigger calculation_updates_preserve_origin before update on private.calculation_updates for each row execute function private.guard_update_pjc_provenance();
