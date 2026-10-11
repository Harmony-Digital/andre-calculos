-- Somente fixtures fictícias. O seed-dev cria os usuários e executa este arquivo novamente.
insert into public.settings(singleton) values(true) on conflict(singleton) do nothing;
insert into public.price_tables(id,version,is_example,active)
values('00000000-0000-4000-8000-000000000001',1,true,false) on conflict(id) do nothing;
insert into public.processes(id,client_id,cnj_number,court,chamber,side)
select '00000000-0000-4000-8000-000000000101',c.id,'99999990620265109999','TRT-10','Unidade fictícia de teste','claimant'
from public.clients c join auth.users u on u.id=c.owner_id where u.email='clientea@exemplo.com'
on conflict(id) do nothing;
insert into public.orders(id,process_id,client_id,calc_type,code,price_table_id)
select '00000000-0000-4000-8000-000000000201',p.id,p.client_id,'liquidation','P-TESTE-0001','00000000-0000-4000-8000-000000000001'
from public.processes p where p.id='00000000-0000-4000-8000-000000000101' on conflict(id) do nothing;
insert into public.checklists(order_id,schema_version,answers)
select o.id,1,'{"fixture":true}' from public.orders o where o.id='00000000-0000-4000-8000-000000000201' on conflict(order_id) do nothing;
insert into public.quotes(id,order_id,number,items,total_cents,valid_until)
select '00000000-0000-4000-8000-000000000301',o.id,'TESTE-1','[]',25000,'2099-12-31'
from public.orders o where o.id='00000000-0000-4000-8000-000000000201' on conflict(id) do nothing;
insert into public.payments(id,order_id,kind,method,amount_cents)
select '00000000-0000-4000-8000-000000000401',o.id,'deposit','pix_manual',12500
from public.orders o where o.id='00000000-0000-4000-8000-000000000201' on conflict(id) do nothing;
insert into public.files(id,process_id,folder,path,name,mime,size_bytes,uploaded_by)
select '00000000-0000-4000-8000-000000000501',p.id,'case',p.client_id||'/'||p.id||'/case/arquivo-ficticio.pdf','arquivo-ficticio.pdf','application/pdf',100,c.owner_id
from public.processes p join public.clients c on c.id=p.client_id where p.id='00000000-0000-4000-8000-000000000101' on conflict(id) do nothing;
insert into public.messages(id,process_id,author_id,body)
select '00000000-0000-4000-8000-000000000601',p.id,c.owner_id,'Mensagem fictícia para testar isolamento.'
from public.processes p join public.clients c on c.id=p.client_id where p.id='00000000-0000-4000-8000-000000000101' on conflict(id) do nothing;
insert into public.decisions(id,process_id,parameter,value,source,rationale,recorded_by)
select '00000000-0000-4000-8000-000000000701',p.id,'fixture','valor fictício','calculator','Somente teste de isolamento.',c.owner_id
from public.processes p join public.clients c on c.id=p.client_id where p.id='00000000-0000-4000-8000-000000000101' on conflict(id) do nothing;
insert into public.timeline_events(id,process_id,kind,data)
select '00000000-0000-4000-8000-000000000801',p.id,'fixture','{"fixture":true}'
from public.processes p where p.id='00000000-0000-4000-8000-000000000101' on conflict(id) do nothing;
