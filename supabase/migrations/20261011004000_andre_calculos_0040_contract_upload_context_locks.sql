-- Revalidar vínculo/metadados e manter contatos/preferências estáveis no upload.
create or replace function public.complete_file_system(target_file uuid,actor uuid,observed_hash text,observed_size bigint)
returns void language plpgsql security definer set search_path='' as $$
declare initial public.files%rowtype; f public.files%rowtype; customer public.clients%rowtype; job public.orders%rowtype;
begin
 if actor is null or target_file is null then raise exception 'Acesso não autorizado'; end if;
 perform id from public.profiles where id=actor and role in ('client','calculator') for share;
 if not found then raise exception 'Acesso não autorizado'; end if;
 select * into initial from public.files where id=target_file;
 if initial.id is null or initial.uploaded_by is distinct from actor then raise exception 'Acesso não autorizado'; end if;
 select c.* into customer from public.clients c join public.processes p on p.client_id=c.id where p.id=initial.process_id for update of c;
 if customer.id is null or (customer.owner_id is distinct from actor and not exists(select 1 from public.profiles where id=actor and role='calculator')) then raise exception 'Acesso não autorizado'; end if;
 perform o.id from public.orders o where o.process_id=initial.process_id and o.client_id=customer.id and o.status='awaiting_documents'
  and (initial.order_id is null or o.id=initial.order_id) order by o.id for update;
 select * into f from public.files where id=target_file for update;
 if f.id is null or (f.process_id,f.order_id,f.uploaded_by,f.expected_sha256,f.size_bytes,f.path) is distinct from (initial.process_id,initial.order_id,actor,initial.expected_sha256,initial.size_bytes,initial.path)
 or not exists(select 1 from public.processes p where p.id=f.process_id and p.client_id=customer.id) then raise exception 'Arquivo atualizado em outra sessão'; end if;
 if observed_hash is null or observed_hash !~ '^[0-9a-f]{64}$' or observed_size is null or observed_size<=0 or f.expected_sha256 is null
 or f.expected_sha256 is distinct from observed_hash or f.size_bytes is distinct from observed_size then raise exception 'Integridade não conferida'; end if;
 if f.upload_status='uploaded' and f.sha256=observed_hash then return; end if;
 if f.upload_status is distinct from 'pending' then raise exception 'Integridade não conferida'; end if;
 update public.files set upload_status='uploaded',sha256=observed_hash where id=f.id;
 perform private.record_event(f.process_id,'file_uploaded',jsonb_build_object('file_id',f.id),actor,f.order_id);
 insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'upload_verified','file',f.id);
 if customer.has_contract and f.folder in ('case','client') then
  perform id from public.settings where singleton for share;
  perform r.profile_id from private.calculator_notification_recipient r join public.profiles p on p.id=r.profile_id and p.role='calculator' where r.singleton for share of r,p;
  for job in select o.* from public.orders o where o.process_id=f.process_id and o.client_id=customer.id and o.status='awaiting_documents'
   and (f.order_id is null or o.id=f.order_id) and exists(select 1 from public.quotes q join private.quote_acceptances receipt on receipt.quote_id=q.id
    join private.quote_contract_contexts ctx on ctx.quote_id=q.id where q.order_id=o.id and not q.is_simulation and q.accepted_at=receipt.accepted_at and q.accepted_by=receipt.actor_id
    and ctx.context_hash=receipt.context_hash and receipt.actor_id=customer.owner_id and receipt.has_contract and receipt.order_status='awaiting_documents')
   order by o.id loop
   update public.orders set status='queued' where id=job.id;
   perform private.record_event(job.process_id,'status_changed',jsonb_build_object('from','awaiting_documents','to','queued','code',job.code),actor,job.id);
   insert into public.audit_log(actor_id,action,target_type,target_id) values(actor,'order_queued','order',job.id);
   perform private.notify_calculator('order_queued',jsonb_build_object('order_id',job.id,'code',job.code,'process_id',job.process_id,'internal_due_date',job.internal_due_date,'path','/painel/processos/'||job.process_id::text),'queued:'||job.id::text);
  end loop;
 end if;
end;
$$;
