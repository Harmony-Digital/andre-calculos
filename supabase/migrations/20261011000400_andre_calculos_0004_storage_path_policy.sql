-- Qualificar o caminho externo para evitar colisão com files.name na subconsulta.
alter policy processos_upload on storage.objects with check (
  bucket_id = 'processos' and exists (
    select 1 from public.files f
    where f.path = storage.objects.name and f.bucket = storage.objects.bucket_id
      and f.uploaded_by = (select auth.uid()) and f.upload_status = 'pending'
      and private.can_read_process(f.process_id)
      and (f.folder <> 'deliverables' or (select public.is_calculator()))
  )
);
