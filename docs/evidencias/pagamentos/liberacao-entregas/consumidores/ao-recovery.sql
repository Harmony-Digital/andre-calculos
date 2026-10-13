begin;
create temporary table ao_fixtures(id uuid primary key) on commit drop;
insert into ao_fixtures values ('024557b6-2851-4ba4-b6b8-470ae06a4832'::uuid),('15d7946b-feca-4fb0-97f9-e00213a758cc'::uuid),('2036469d-a2b6-41bc-bb39-291229c29235'::uuid),('2bef931e-fb91-4081-98dc-573785eeb8e9'::uuid),('2fd193cc-f565-4b24-b9a0-edc7cd364b93'::uuid),('339445de-6b51-4179-a291-e833549d2f7d'::uuid),('89925a56-867e-4fb9-ba44-7b6c51810a5a'::uuid),('a3f386ac-3da7-4ce3-99d0-52a3c0222a21'::uuid),('bc114ad3-966b-4006-9581-c2eb516cd5c2'::uuid),('bd7e11ed-ea04-4d3f-a2a9-f4f240577b4d'::uuid),('daeccde7-3ac6-44e5-ab8e-7dee61156232'::uuid),('f41dfd24-13bb-4b92-8b7e-539b3518be50'::uuid);
do $$
begin
 if (select count(*) from public.processes p join ao_fixtures a on a.id=p.id where p.chamber='Vara de teste' and p.cnj_number ~ '^9[0-9]{8}20265109999$') <> 12 then raise exception 'Identidade dos processos fictícios divergiu'; end if;
 if (select count(*) from public.orders o join ao_fixtures a on a.id=o.process_id where o.status='draft') <> 12 then raise exception 'Pedidos fictícios divergiram'; end if;
 if (select count(*) from public.files f join ao_fixtures a on a.id=f.process_id) <> 36 or (select count(*) from public.files f join ao_fixtures a on a.id=f.process_id where f.name in('Calculo aceito fictício.pdf','Parecer aceito fictício.pdf','Projeto aceito fictício.pjc') and f.upload_status='uploaded' and f.folder='deliverables' and f.path='f1c6fc07-ec2e-4334-bd4b-44fd8e5bb3e8/'||f.process_id||'/'||f.id||'/ficticio' and f.uploaded_by='f1c6fc07-ec2e-4334-bd4b-44fd8e5bb3e8' and f.created_at between '2026-10-12 17:54:00+00' and '2026-10-12 18:03:00+00') <> 36 then raise exception 'Arquivos fictícios divergiram'; end if;
 if exists(select 1 from storage.objects s join public.files f on s.name=f.path join ao_fixtures a on a.id=f.process_id where s.bucket_id='processos') then raise exception 'Objeto precisa de limpeza pela API de Storage'; end if;
 if (select count(*) from public.deliveries d join ao_fixtures a on a.id=d.process_id)<>12 then raise exception 'Entregas fictícias divergiram'; end if;
 if exists(select 1 from public.quotes q join public.orders o on o.id=q.order_id join ao_fixtures a on a.id=o.process_id) or exists(select 1 from public.payments q join public.orders o on o.id=q.order_id join ao_fixtures a on a.id=o.process_id) then raise exception 'Recuperação contratual não foi concluída'; end if;
end $$;
delete from public.audit_log where target_id in(select id from ao_fixtures union select f.id from public.files f join ao_fixtures a on a.id=f.process_id union select d.id from public.deliveries d join ao_fixtures a on a.id=d.process_id union select o.id from public.orders o join ao_fixtures a on a.id=o.process_id union select t.id from public.timeline_events t join ao_fixtures a on a.id=t.process_id);
delete from public.notifications n using ao_fixtures a where n.data->>'process_id'=a.id::text;
delete from public.deliveries d using ao_fixtures a where d.process_id=a.id;
delete from public.timeline_events t using ao_fixtures a where t.process_id=a.id;
delete from public.files f using ao_fixtures a where f.process_id=a.id;
delete from public.checklists c using public.orders o,ao_fixtures a where c.order_id=o.id and o.process_id=a.id;
delete from public.orders o using ao_fixtures a where o.process_id=a.id;
delete from public.processes p using ao_fixtures a where p.id=a.id;
select json_build_object('scopedProcessesRemaining',(select count(*) from public.processes p join ao_fixtures a on a.id=p.id),'processes',(select count(*) from public.processes),'orders',(select count(*) from public.orders),'uploadedFiles',(select count(*) from public.files where upload_status='uploaded'),'pendingFiles',(select count(*) from public.files where upload_status='pending'),'storageObjects',(select count(*) from storage.objects where bucket_id='processos'));
commit;
