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
insert into public.checklists(order_id,schema_version,answers,completed_step)
select o.id,1,'{
  "schemaVersion":1,"processNumber":"9999999-06.2026.5.10.9999",
  "tribunal":10,"court":"Unidade fictícia de teste","side":"claimant","claimants":1,
  "calculationType":"liquidation","hasSentence":false,"hasAppeal":false,
  "hasInterlocutory":false,"correctionRule":"unspecified","correctionDetails":"",
  "strategy":"","admissionDate":"","dismissalDate":"","filingDate":"","baseDate":"",
  "wageItems":[],"otherWages":"","timecardFormat":"none","timecardMonths":0,
  "timecardPages":0,"documents":[],"deductInss":false,"deductIr":false,
  "processPages":0,"noticeDate":"","actType":"other","deadlineDays":8,
  "urgency":false,"instructions":"Rascunho fictício para testes de isolamento."
}',0 from public.orders o where o.id='00000000-0000-4000-8000-000000000201'
on conflict(order_id) do update set answers=excluded.answers,completed_step=excluded.completed_step;
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
-- Os códigos fictícios explícitos não podem colidir com o próximo pedido automático.
select setval('public.order_number_seq',greatest((select last_value from public.order_number_seq),coalesce((select max(substring(code,3)::bigint) from public.orders where code ~ '^P-[0-9]+$'),1)),true);
