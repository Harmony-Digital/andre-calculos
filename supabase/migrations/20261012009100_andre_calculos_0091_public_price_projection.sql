-- Estimativa pública: nenhum prazo, identificador privado ou configuração completa.
create function public.get_public_price_table() returns jsonb
language sql stable security definer set search_path='' as $$
 with active as(select * from public.price_tables where active)
 select jsonb_build_object(
  'version',t.version::text,'isExample',t.is_example,
  'base',jsonb_build_object('initial',t.parameters->'base'->'initial','liquidation',t.parameters->'base'->'liquidation',
   'challenge',t.parameters->'base'->'challenge','update',t.parameters->'base'->'update'),
  'perWage',t.parameters->'perWage','includedWages',t.parameters->'includedWages',
  'perContractMonth',t.parameters->'perContractMonth','includedContractMonths',t.parameters->'includedContractMonths',
  'perTimecardUnit',t.parameters->'perTimecardUnit','timecardUnit',t.parameters->'timecardUnit',
  'perExtraClaimant',t.parameters->'perExtraClaimant','urgencyBasisPoints',t.parameters->'urgencyBasisPoints')
 from active t where(select count(*) from active)=1 and not t.is_example and private.valid_price_parameters(t.parameters);
$$;
revoke all on function public.get_public_price_table() from public,anon,authenticated,service_role;
grant execute on function public.get_public_price_table() to anon,authenticated;
